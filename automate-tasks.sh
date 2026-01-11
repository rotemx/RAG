#!/bin/bash
set -uo pipefail
# Note: -e is NOT set because ((var++)) returns 1 when var is 0, causing premature exit
# We handle errors explicitly instead

# ─────────────────────────────────────────────────────────────────
# PREREQUISITES CHECK
# ─────────────────────────────────────────────────────────────────
for cmd in git claude; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: Required command '$cmd' not found. Please install it first."
    exit 1
  fi
done

# ─────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────
TASKS_FILE="documentation/TASKS.md"
LOGS_DIR="documentation/logs"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOGS_DIR/automation_${TIMESTAMP}.log"
MAX_REVIEW_ITERATIONS=10
CURRENT_TASK_LOG=""
CURRENT_TASK=""

# Rate limit handling
RATE_LIMIT_WAIT_SECONDS=60      # Initial wait time when rate limited
RATE_LIMIT_MAX_WAIT=3600        # Max wait time (1 hour)
RATE_LIMIT_BACKOFF_MULTIPLIER=2 # Exponential backoff multiplier

# Ensure logs directory exists
mkdir -p "$LOGS_DIR"

# Validate TASKS_FILE exists
if [ ! -f "$TASKS_FILE" ]; then
  echo "ERROR: Tasks file '$TASKS_FILE' not found."
  exit 1
fi

# ─────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────
sanitize_filename() {
  # Convert task name to safe filename: lowercase, replace spaces/special chars with underscores
  local result
  result=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/_/g' | sed 's/__*/_/g' | sed 's/^_//;s/_$//')

  # Handle empty result (task name was all special chars)
  if [ -z "$result" ]; then
    result="task_$(date +%s)"
  fi

  # Truncate to max 100 chars to avoid filesystem limits
  printf '%s' "${result:0:100}"
}

set_task_log() {
  local task="$1"
  # Extract task number (e.g., "1.2.3" from "**Task 1.2.3**: description")
  local task_num=$(echo "$task" | sed -n 's/.*Task \([0-9]*\.[0-9]*\.[0-9]*\).*/\1/p')
  if [ -z "$task_num" ]; then
    task_num="unknown"
  fi
  local timestamp=$(date +%Y%m%d_%H%M%S)
  CURRENT_TASK_LOG="$LOGS_DIR/task_${task_num}_${timestamp}.log"
}

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
  # Use printf to avoid issues with messages starting with -n, -e, etc.
  printf '%s\n' "$msg" | tee -a "$LOG_FILE"
  # Also write to task-specific log if set
  if [ -n "$CURRENT_TASK_LOG" ]; then
    printf '%s\n' "$msg" >> "$CURRENT_TASK_LOG"
  fi
}

# Check if output indicates rate limiting
is_rate_limited() {
  local output="$1"
  # Check for common rate limit messages
  if echo "$output" | grep -qiE "hit your limit|rate limit|too many requests|quota exceeded"; then
    return 0  # true, is rate limited
  fi
  return 1  # false, not rate limited
}

# Wait for rate limit to reset with countdown display
wait_for_rate_limit() {
  local wait_seconds="$1"
  log "RATE LIMIT: Waiting ${wait_seconds}s for rate limit to reset..."

  # Display countdown
  local remaining=$wait_seconds
  while [ $remaining -gt 0 ]; do
    printf "\r  ⏳ Waiting: %d seconds remaining..." "$remaining"
    sleep 1
    remaining=$((remaining - 1))
  done
  printf "\r  ✓ Wait complete, resuming...                    \n"
  log "RATE LIMIT: Wait complete, resuming..."
}

# Global variable to store Claude output (for Bash 3.2 compatibility)
CLAUDE_OUTPUT=""

# Run Claude command with rate limit retry
# Usage: run_claude_with_retry "prompt"
# Output is stored in global CLAUDE_OUTPUT variable
# Returns: 0 on success, 1 on failure (non-rate-limit)
run_claude_with_retry() {
  local prompt="$1"
  local wait_time=$RATE_LIMIT_WAIT_SECONDS
  CLAUDE_OUTPUT=""

  while true; do
    local tmpfile=$(mktemp)

    # Run Claude and capture output
    claude --dangerously-skip-permissions --print --verbose --output-format text -p "$prompt" 2>&1 | tee -a "$LOG_FILE" "$CURRENT_TASK_LOG" "$tmpfile"
    local claude_exit=${PIPESTATUS[0]}

    # Read output from temp file
    CLAUDE_OUTPUT=$(cat "$tmpfile")
    rm -f "$tmpfile"

    # Check for rate limiting
    if is_rate_limited "$CLAUDE_OUTPUT"; then
      if [ $wait_time -gt $RATE_LIMIT_MAX_WAIT ]; then
        log "RATE LIMIT: Max wait time exceeded, giving up"
        return 1
      fi

      wait_for_rate_limit $wait_time
      wait_time=$((wait_time * RATE_LIMIT_BACKOFF_MULTIPLIER))
      continue  # Retry
    fi

    # Not rate limited, return the exit code
    return $claude_exit
  done
}

get_next_task() {
  grep -m1 '^\- \[ \]' "$TASKS_FILE" | sed 's/^- \[ \] //' || echo ""
}

update_status() {
  local task="$1" status="$2"
  # Escape special sed regex characters in task name (for matching)
  # Note: ] must come first in the character class to be treated literally
  local escaped_task=$(printf '%s\n' "$task" | sed 's/[][\\.*^$()+?{|/]/\\&/g')
  # Escape special sed replacement characters in status (& and /)
  local escaped_status=$(printf '%s\n' "$status" | sed 's/[&/\\]/\\&/g')
  # Escape task name for use in replacement string (& and / and \)
  local escaped_task_replacement=$(printf '%s\n' "$task" | sed 's/[&/\\]/\\&/g')
  # Use [^]]* to match any status (including multi-char like C:1, C:20)
  # Use portable sed in-place edit (works on both macOS and Linux)
  sed -i.bak -E "s/^- \[[^]]*\].*${escaped_task}/- [${escaped_status}] ${escaped_task_replacement}/" "$TASKS_FILE"
  rm -f "${TASKS_FILE}.bak"
}

get_uncommitted_files() {
  # Handle files with spaces and newlines correctly using NUL-safe processing
  # Git porcelain -z format: XY filename\0 or XY oldname\0newname\0 for renames
  local files=""
  local expect_newname=false

  while IFS= read -r -d '' entry; do
    if [ "$expect_newname" = true ]; then
      # This is the new name after a rename, add it
      if [ -n "$entry" ]; then
        files="${files}${files:+$'\n'}${entry}"
      fi
      expect_newname=false
      continue
    fi

    # Check if this is a status line (has XY prefix)
    if [ ${#entry} -ge 3 ]; then
      local status="${entry:0:2}"
      local filename="${entry:3}"

      # For renames/copies (R or C in first position), the next entry is the new filename
      if [[ "$status" == R* ]] || [[ "$status" == C* ]]; then
        # Add the old filename
        if [ -n "$filename" ]; then
          files="${files}${files:+$'\n'}${filename}"
        fi
        expect_newname=true
      elif [ -n "$filename" ]; then
        files="${files}${files:+$'\n'}${filename}"
      fi
    fi
  done < <(git status --porcelain -z 2>/dev/null)

  printf '%s' "$files"
}

get_git_diff() {
  local diff_output
  diff_output=$(git diff HEAD 2>/dev/null || git diff 2>/dev/null)
  echo "${diff_output:-No changes}"
}

# ─────────────────────────────────────────────────────────────────
# STATUS SUMMARY
# Generates a summary of task, story, epic, and project status
# ─────────────────────────────────────────────────────────────────
generate_status_summary() {
  local current_epic=""
  local current_story=""
  local epic_completed=0 epic_pending=0 epic_failed=0 epic_in_progress=0
  local story_completed=0 story_pending=0 story_failed=0 story_in_progress=0
  local project_completed=0 project_pending=0 project_failed=0 project_in_progress=0

  # Helper to print story summary
  print_story_summary() {
    if [ -n "$current_story" ]; then
      log "     └─ Story Total: ✓$story_completed ○$story_pending ✗$story_failed ~$story_in_progress"
    fi
  }

  # Helper to print epic summary
  print_epic_summary() {
    if [ -n "$current_epic" ]; then
      log "  └─ Epic Total: ✓$epic_completed ○$epic_pending ✗$epic_failed ~$epic_in_progress"
      log ""
    fi
  }

  log ""
  log "╔════════════════════════════════════════════════════════════╗"
  log "║                    PROJECT STATUS SUMMARY                   ║"
  log "╚════════════════════════════════════════════════════════════╝"

  while IFS= read -r line; do
    # Detect EPIC header
    if [[ "$line" =~ ^#\ EPIC\ ([0-9]+):\ (.+)$ ]]; then
      # Print previous story summary first (before epic summary)
      print_story_summary
      # Print previous epic summary
      print_epic_summary

      current_epic="${BASH_REMATCH[1]}: ${BASH_REMATCH[2]}"
      log "📦 EPIC $current_epic"
      epic_completed=0 epic_pending=0 epic_failed=0 epic_in_progress=0
      # Reset story tracking when entering new epic
      current_story=""
      story_completed=0 story_pending=0 story_failed=0 story_in_progress=0
    fi

    # Detect Story header
    if [[ "$line" =~ ^##\ Story\ ([0-9]+\.[0-9]+):\ (.+)$ ]]; then
      # Print previous story summary if exists
      print_story_summary

      current_story="${BASH_REMATCH[1]}: ${BASH_REMATCH[2]}"
      log "  📖 Story $current_story"
      story_completed=0 story_pending=0 story_failed=0 story_in_progress=0
    fi

    # Count tasks by status (handles single char and multi-char like C:1, R:2)
    if [[ "$line" =~ ^-\ \[([^\]]+)\]\ \*\*Task ]]; then
      local status="${BASH_REMATCH[1]}"
      case "$status" in
        x|X)
          story_completed=$((story_completed + 1))
          epic_completed=$((epic_completed + 1))
          project_completed=$((project_completed + 1))
          ;;
        " ")
          story_pending=$((story_pending + 1))
          epic_pending=$((epic_pending + 1))
          project_pending=$((project_pending + 1))
          ;;
        "!")
          story_failed=$((story_failed + 1))
          epic_failed=$((epic_failed + 1))
          project_failed=$((project_failed + 1))
          ;;
        "~")
          story_in_progress=$((story_in_progress + 1))
          epic_in_progress=$((epic_in_progress + 1))
          project_in_progress=$((project_in_progress + 1))
          ;;
        C:*|R:*)
          # C:N or R:N status - count as in-progress
          story_in_progress=$((story_in_progress + 1))
          epic_in_progress=$((epic_in_progress + 1))
          project_in_progress=$((project_in_progress + 1))
          ;;
        *)
          # Unknown status - count as pending
          story_pending=$((story_pending + 1))
          epic_pending=$((epic_pending + 1))
          project_pending=$((project_pending + 1))
          ;;
      esac
    fi
  done < "$TASKS_FILE"

  # Print final story and epic summaries
  print_story_summary
  print_epic_summary

  log "────────────────────────────────────────────────────────────"
  log "📊 PROJECT TOTALS"
  log "   ✓ Completed:   $project_completed"
  log "   ○ Pending:     $project_pending"
  log "   ~ In Progress: $project_in_progress"
  log "   ✗ Failed:      $project_failed"
  local total=$((project_completed + project_pending + project_in_progress + project_failed))
  if [ "$total" -gt 0 ]; then
    local percent=$((project_completed * 100 / total))
    log "   Progress:      $percent% ($project_completed/$total)"
  fi
  log "────────────────────────────────────────────────────────────"
  log ""
}

# ─────────────────────────────────────────────────────────────────
# IMPLEMENT TASK (not a phase, just initial code generation)
# ─────────────────────────────────────────────────────────────────
implement_task() {
  local task="$1"

  log "IMPLEMENTING: $task"
  update_status "$task" "~"

  # Build the prompt
  local prompt="You are implementing a task from $TASKS_FILE.

TASK: $task

Instructions:
1. Read relevant existing code to understand the codebase
2. Implement the task completely
3. Ensure code follows existing patterns and style
4. Do NOT run tests yourself"

  # Run Claude with rate limit retry (output stored in CLAUDE_OUTPUT)
  if ! run_claude_with_retry "$prompt"; then
    log "IMPLEMENT: Claude failed"
    return 1
  fi

  local uncommitted=$(get_uncommitted_files)
  if [ -z "$uncommitted" ]; then
    log "IMPLEMENT: no files created/modified"
    return 1
  fi

  log "IMPLEMENT: files created/modified:"
  printf '%s\n' "$uncommitted" | while IFS= read -r file; do
    log "  - $file"
  done
  return 0
}

# ─────────────────────────────────────────────────────────────────
# CODE REVIEW PHASE
# Runs Claude CR until no issues found
# ─────────────────────────────────────────────────────────────────

# Claude Code Review - returns 0 if no issues, 1 if issues found/fixed
claude_review() {
  local task="$1"
  local uncommitted_files=$(get_uncommitted_files)

  if [ -z "$uncommitted_files" ]; then
    log "CLAUDE CR: no files to review"
    return 0  # No files means nothing to fix - clean state
  fi

  # Count files to review
  local file_count=$(echo "$uncommitted_files" | wc -l | tr -d ' ')
  log "CLAUDE CR: reviewing $file_count files"

  # Get truncated diff to avoid "Prompt is too long" error
  # Limit to first 500 lines of diff
  local git_diff=$(get_git_diff | head -500)
  local diff_lines=$(get_git_diff | wc -l | tr -d ' ')
  if [ "$diff_lines" -gt 500 ]; then
    git_diff="$git_diff

... (diff truncated, showing 500 of $diff_lines lines)"
  fi

  # Build the prompt
  local prompt="You are performing a code review of uncommitted files.

TASK: $task

UNCOMMITTED FILES ($file_count files):
$uncommitted_files

GIT DIFF (may be truncated for large changes):
$git_diff

Instructions:
1. Review the uncommitted files listed above
2. Check for: bugs, security issues, performance problems, code style
3. Fix ALL critical and high severity issues
4. Report what you fixed
5. If no issues found, respond with exactly: NO_ISSUES_FOUND"

  # Run Claude with rate limit retry (output stored in CLAUDE_OUTPUT)
  if ! run_claude_with_retry "$prompt"; then
    log "CLAUDE CR: Claude failed"
    return 1
  fi

  # Check if no issues were found
  if echo "$CLAUDE_OUTPUT" | grep -qF "NO_ISSUES_FOUND"; then
    return 0  # No issues
  fi
  return 1  # Issues found and fixed
}

# Main review phase - runs Claude CR until no issues found
run_code_review() {
  local task="$1"

  for iter in $(seq 1 $MAX_REVIEW_ITERATIONS); do
    log "────────────────────────────────────────"
    log "CLAUDE CR iteration $iter/$MAX_REVIEW_ITERATIONS"
    update_status "$task" "C:$iter"

    if claude_review "$task"; then
      log "CLAUDE CR: no issues found"
      return 0
    else
      log "CLAUDE CR: issues fixed, continuing..."
    fi
  done

  log "CLAUDE CR: max iterations ($MAX_REVIEW_ITERATIONS) reached without clean review"
  return 1
}

# ─────────────────────────────────────────────────────────────────
# UTILITY FUNCTIONS
# ─────────────────────────────────────────────────────────────────
format_duration() {
  local seconds=$1
  local hours=$((seconds / 3600))
  local minutes=$(((seconds % 3600) / 60))
  local secs=$((seconds % 60))

  if [ $hours -gt 0 ]; then
    printf '%dh %dm %ds' $hours $minutes $secs
  elif [ $minutes -gt 0 ]; then
    printf '%dm %ds' $minutes $secs
  else
    printf '%ds' $secs
  fi
}

# ─────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────
main() {
  local start_time=$(date +%s)

  log "════════════════════════════════════════════════════════"
  log "AUTOMATION STARTED"
  log "Log file: $LOG_FILE"
  log "════════════════════════════════════════════════════════"

  local completed=0 failed=0

  while true; do
    local task
    task=$(get_next_task)
    [ -z "$task" ] && break

    # Track current task for cleanup trap
    CURRENT_TASK="$task"

    # Set up task-specific log file
    set_task_log "$task"

    log "════════════════════════════════════════════════════════"
    log "TASK: $task"
    log "Task log: $CURRENT_TASK_LOG"
    log "════════════════════════════════════════════════════════"

    # Step 1: Implement the task
    if ! implement_task "$task"; then
      update_status "$task" "!"
      log "TASK FAILED: $task (implementation failed)"
      failed=$((failed + 1))
      CURRENT_TASK=""
      continue
    fi

    # Step 2: Code Review Phase (Claude CR only)
    if run_code_review "$task"; then
      # Only commit after review passes with no issues
      log "════════════════════════════════════════════════════════"
      log "REVIEW PASSED - Committing..."
      git add -A
      # Extract task description and convert to lowercase for commitlint compliance
      # Task format: **Task X.Y.Z**: Description -> extract "Description" and lowercase first char
      local task_desc=$(echo "$task" | sed 's/.*\*\*: //')
      local first_char=$(echo "$task_desc" | cut -c1 | tr '[:upper:]' '[:lower:]')
      local rest=$(echo "$task_desc" | cut -c2-)
      local commit_subject="${first_char}${rest}"
      # Use HEREDOC for safe commit message with special characters
      git commit -m "$(cat <<EOF
feat: $commit_subject

$task
EOF
)" || true
      git push || log "WARNING: git push failed, continuing..."

      update_status "$task" "x"
      log "TASK COMPLETED: $task"
      completed=$((completed + 1))

      # Generate and log status summary after each completed task
      generate_status_summary
    else
      update_status "$task" "!"
      log "TASK FAILED: $task (review phase failed)"
      failed=$((failed + 1))
    fi

    # Clear current task after processing
    CURRENT_TASK=""
  done

  local end_time=$(date +%s)
  local elapsed=$((end_time - start_time))
  local duration=$(format_duration $elapsed)

  log "════════════════════════════════════════════════════════"
  log "AUTOMATION COMPLETE"
  log "════════════════════════════════════════════════════════"
  log "  Tasks completed: $completed"
  log "  Tasks failed:    $failed"
  log "  Total processed: $((completed + failed))"
  log "  Elapsed time:    $duration"
  log "  Log file:        $LOG_FILE"
  log "════════════════════════════════════════════════════════"

  # Generate final project status summary
  generate_status_summary
}

# ─────────────────────────────────────────────────────────────────
# CLEANUP TRAP (defined after all functions to ensure update_status exists)
# ─────────────────────────────────────────────────────────────────
cleanup() {
  local exit_code=$?
  if [ -n "$CURRENT_TASK" ]; then
    printf '%s\n' "[$(date '+%Y-%m-%d %H:%M:%S')] Script interrupted while processing: $CURRENT_TASK" | tee -a "$LOG_FILE"
    # Mark task as failed if interrupted mid-processing
    update_status "$CURRENT_TASK" "!"
  fi
  exit $exit_code
}
trap cleanup SIGINT SIGTERM

# ─────────────────────────────────────────────────────────────────
# RUN
# ─────────────────────────────────────────────────────────────────
main "$@"
