#!/bin/bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────
TASKS_FILE="Tasks.md"
LOG_FILE="automation_$(date +%Y%m%d_%H%M%S).log"
MAX_IMPL_RETRIES=3
MAX_CR_ITERATIONS=3

# ─────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

validate() {
  log "Running validation..."
  npm run build && npm run lint && npm run typecheck && npm test
}

get_next_task() {
  grep -m1 '^\- \[ \]' "$TASKS_FILE" | sed 's/^- \[ \] //' || echo ""
}

update_status() {
  local task="$1" status="$2"
  # Escape special chars for sed
  local escaped_task=$(printf '%s\n' "$task" | sed 's/[[\.*^$()+?{|]/\\&/g')
  sed -i '' "s/^- \[.\].*${escaped_task}/- [${status}] ${task}/" "$TASKS_FILE"
}

# ─────────────────────────────────────────────────────────────────
# PHASE 1: IMPLEMENT
# ─────────────────────────────────────────────────────────────────
implement() {
  local task="$1"

  for attempt in $(seq 1 $MAX_IMPL_RETRIES); do
    log "IMPLEMENT [$task] attempt $attempt/$MAX_IMPL_RETRIES"
    update_status "$task" "~"

    claude --dangerously-skip-permissions --print -p "
You are implementing a task from $TASKS_FILE.

TASK: $task

Instructions:
1. Read relevant existing code to understand the codebase
2. Implement the task completely
3. Ensure code follows existing patterns and style
4. Do NOT run tests yourself - validation happens separately
" 2>&1 | tee -a "$LOG_FILE"

    if validate; then
      log "IMPLEMENT [$task] ✓ passed validation"
      return 0
    fi

    log "IMPLEMENT [$task] ✗ validation failed, retrying..."
  done

  return 1
}

# ─────────────────────────────────────────────────────────────────
# PHASE 2: CLAUDE CODE REVIEW
# ─────────────────────────────────────────────────────────────────
claude_cr() {
  local task="$1"

  for iter in $(seq 1 $MAX_CR_ITERATIONS); do
    log "CLAUDE CR [$task] iteration $iter/$MAX_CR_ITERATIONS"
    update_status "$task" "C:$iter"

    # Get all uncommitted files (staged + unstaged + untracked)
    local uncommitted_files=$(git status --porcelain | awk '{print $2}')
    local git_diff=$(git diff HEAD 2>/dev/null || git diff)

    output=$(claude --dangerously-skip-permissions --print -p "
You are performing a deep code review.

TASK IMPLEMENTED: $task

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

    if ! validate; then
      log "CLAUDE CR [$task] ✗ validation failed after fixes"
      continue
    fi

    if echo "$output" | grep -q "NO_ISSUES_FOUND"; then
      log "CLAUDE CR [$task] ✓ no issues found"
      return 0
    fi

    log "CLAUDE CR [$task] fixed issues, continuing..."
  done

  # After max iterations, proceed anyway if validation passes
  validate && return 0 || return 1
}

# ─────────────────────────────────────────────────────────────────
# PHASE 3: CODERABBIT CODE REVIEW
# ─────────────────────────────────────────────────────────────────
coderabbit_cr() {
  local task="$1"
  local cr_output_file="/tmp/cr_review_$$.txt"

  for iter in $(seq 1 $MAX_CR_ITERATIONS); do
    log "CODERABBIT CR [$task] iteration $iter/$MAX_CR_ITERATIONS"
    update_status "$task" "R:$iter"

    # Get all uncommitted files for review
    local uncommitted_files=$(git status --porcelain | awk '{print $2}')
    log "Uncommitted files to review: $uncommitted_files"

    # Run CodeRabbit CLI review on all uncommitted files
    log "Running CodeRabbit analysis on all uncommitted files..."
    if [ -n "$uncommitted_files" ]; then
      echo "$uncommitted_files" | xargs coderabbit review --output "$cr_output_file" 2>&1 | tee -a "$LOG_FILE" || true
    else
      coderabbit review --output "$cr_output_file" 2>&1 | tee -a "$LOG_FILE" || true
    fi

    # Check if any issues found
    if [ ! -s "$cr_output_file" ] || grep -q "No issues found" "$cr_output_file"; then
      log "CODERABBIT CR [$task] ✓ no issues found"
      rm -f "$cr_output_file"
      return 0
    fi

    # Get current uncommitted files for context
    local current_uncommitted=$(git status --porcelain | awk '{print $2}')
    local git_diff=$(git diff HEAD 2>/dev/null || git diff)

    # Claude fixes CodeRabbit issues
    claude --dangerously-skip-permissions --print -p "
You are fixing issues found by CodeRabbit code review.

TASK: $task

UNCOMMITTED FILES:
$current_uncommitted

GIT DIFF OF ALL CHANGES:
$git_diff

CODERABBIT REVIEW FINDINGS:
$(cat "$cr_output_file")

Instructions:
1. Fix ALL issues mentioned above in the uncommitted files
2. Maintain code quality and existing patterns
3. Do NOT introduce new features, only fix the issues
" 2>&1 | tee -a "$LOG_FILE"

    if ! validate; then
      log "CODERABBIT CR [$task] ✗ validation failed after fixes"
      continue
    fi
  done

  rm -f "$cr_output_file"
  validate && return 0 || return 1
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

    log "────────────────────────────────────────────────────────"
    log "TASK: $task"
    log "────────────────────────────────────────────────────────"

    if implement "$task" && claude_cr "$task" && coderabbit_cr "$task"; then
      # Commit and push changes
      git add -A
      git commit -m "feat: $task" || true
      git push || log "WARNING: git push failed, continuing..."

      update_status "$task" "x"
      log "TASK COMPLETED ✓: $task"
      ((completed++))
    else
      update_status "$task" "!"
      log "TASK FAILED ✗: $task"
      ((failed++))
    fi
  done

  log "════════════════════════════════════════════════════════"
  log "AUTOMATION COMPLETE: $completed done, $failed failed"
  log "════════════════════════════════════════════════════════"
}

main "$@"
