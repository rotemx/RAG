#!/bin/bash
set -euo pipefail

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
LOG_FILE="automation_$(date +%Y%m%d_%H%M%S).log"
MAX_REVIEW_ITERATIONS=10

# ─────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

get_next_task() {
  grep -m1 '^\- \[ \]' "$TASKS_FILE" | sed 's/^- \[ \] //' || echo ""
}

update_status() {
  local task="$1" status="$2"
  # Escape special sed regex characters in task name (for matching)
  local escaped_task=$(printf '%s\n' "$task" | sed 's/[][\.*^$()+?{|/]/\\&/g')
  # Escape special sed replacement characters in status (& and /)
  local escaped_status=$(printf '%s\n' "$status" | sed 's/[&/]/\\&/g')
  # Escape task name for use in replacement string (& and /)
  local escaped_task_replacement=$(printf '%s\n' "$task" | sed 's/[&/]/\\&/g')
  # Use portable sed in-place edit (works on both macOS and Linux)
  sed -i.bak "s/^- \[.\].*${escaped_task}/- [${escaped_status}] ${escaped_task_replacement}/" "$TASKS_FILE"
  rm -f "${TASKS_FILE}.bak"
}

get_uncommitted_files() {
  # Handle files with spaces and newlines correctly using NUL-safe processing
  local files=""
  while IFS= read -r -d '' line; do
    # Extract filename (skip the 3-char status prefix)
    local filename="${line:3}"
    if [ -n "$filename" ]; then
      files="${files}${files:+$'\n'}${filename}"
    fi
  done < <(git status --porcelain -z)
  echo "$files"
}

get_git_diff() {
  local diff_output
  diff_output=$(git diff HEAD 2>/dev/null || git diff 2>/dev/null)
  echo "${diff_output:-No changes}"
}

# ─────────────────────────────────────────────────────────────────
# IMPLEMENT TASK (not a phase, just initial code generation)
# ─────────────────────────────────────────────────────────────────
implement_task() {
  local task="$1"

  log "IMPLEMENTING: $task"
  update_status "$task" "~"

  claude --dangerously-skip-permissions --print --verbose -p "
You are implementing a task from $TASKS_FILE.

TASK: $task

Instructions:
1. Read relevant existing code to understand the codebase
2. Implement the task completely
3. Ensure code follows existing patterns and style
4. Do NOT run tests yourself
" 2>&1 | tee -a "$LOG_FILE"

  local uncommitted=$(get_uncommitted_files)
  if [ -z "$uncommitted" ]; then
    log "IMPLEMENT: no files created/modified"
    return 1
  fi

  log "IMPLEMENT: files created/modified: $uncommitted"
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
  local git_diff=$(get_git_diff)

  if [ -z "$uncommitted_files" ]; then
    log "CLAUDE CR: no files to review"
    return 0  # No files means nothing to fix - clean state
  fi

  log "CLAUDE CR: reviewing $uncommitted_files"

  local output=$(claude --dangerously-skip-permissions --print --verbose -p "
You are performing a deep code review of ALL uncommitted files.

TASK: $task

UNCOMMITTED FILES TO REVIEW:
$uncommitted_files

GIT DIFF OF ALL CHANGES:
$git_diff

Instructions:
1. Review ALL uncommitted files listed above
2. Check for: bugs, security issues, performance problems, code style
3. Fix ALL critical and high severity issues
4. Report what you fixed
5. If no issues found, respond with exactly: NO_ISSUES_FOUND
" 2>&1 | tee -a "$LOG_FILE")

  if echo "$output" | grep -q "NO_ISSUES_FOUND"; then
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
# MAIN
# ─────────────────────────────────────────────────────────────────
main() {
  log "════════════════════════════════════════════════════════"
  log "AUTOMATION STARTED"
  log "════════════════════════════════════════════════════════"

  local completed=0 failed=0

  while true; do
    task=$(get_next_task)
    [ -z "$task" ] && break

    log "════════════════════════════════════════════════════════"
    log "TASK: $task"
    log "════════════════════════════════════════════════════════"

    # Step 1: Implement the task
    if ! implement_task "$task"; then
      update_status "$task" "!"
      log "TASK FAILED: $task (implementation failed)"
      ((failed++))
      continue
    fi

    # Step 2: Code Review Phase (Claude CR only)
    if run_code_review "$task"; then
      # Only commit after review passes with no issues
      log "════════════════════════════════════════════════════════"
      log "REVIEW PASSED - Committing..."
      git add -A
      git commit -m "feat: $task" || true
      git push || log "WARNING: git push failed, continuing..."

      update_status "$task" "x"
      log "TASK COMPLETED: $task"
      ((completed++))
    else
      update_status "$task" "!"
      log "TASK FAILED: $task (review phase failed)"
      ((failed++))
    fi
  done

  log "════════════════════════════════════════════════════════"
  log "AUTOMATION COMPLETE: $completed done, $failed failed"
  log "════════════════════════════════════════════════════════"
}

main "$@"
