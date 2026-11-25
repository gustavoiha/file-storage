#!/usr/bin/env bash
# Sprint branches for the agent team. One sprint = branch sprint/S-NNN, cut from origin/main, with its own worktree
# at $REPO/.agent-local/worktrees/S-NNN. Task PRs target the sprint branch; the sprint PR targets main.
# Works from any working directory.
# Usage:
#   sprint.sh start S-NNN                        create sprint/S-NNN at origin/main, push it, add its worktree (orchestrator)
#   sprint.sh status S-NNN                       branch head, ahead/behind origin/main, open PRs into it (any role)
#   sprint.sh integrate S-NNN <PR#> [<PR#>...]   squash-merge task PRs into the sprint branch, in order; stops at the
#                                                first conflict; prints JSON {merged, conflicted, notAttempted} (testing)
#   sprint.sh rebase-main S-NNN                  rebase the sprint branch on origin/main and push with lease; on
#                                                conflict aborts and prints the files (deployment)
#   sprint.sh pr S-NNN <title> <body-file>       create or update the sprint PR into main; prints its number (deployment)
set -euo pipefail
REPO_SLUG=gustavoiha/file-storage; MARK='<!-- agent-team -->'
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"  # repo root, from this script's location
die() { echo "sprint: $*" >&2; exit 1; }
CMD="${1:-}"; SID="${2:-}"
[[ "$SID" =~ ^S-[0-9]{3}$ ]] || die "usage: sprint.sh start|status|integrate|rebase-main|pr S-NNN ... (got sprint id '$SID')"
BR="sprint/$SID"; WT="$ROOT/.agent-local/worktrees/$SID"
LOCK="$ROOT/.agent-local/sprint-$SID.lock"
for i in $(seq 1 120); do mkdir "$LOCK" 2>/dev/null && break; sleep 1; done
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

fetch() { git -C "$ROOT" fetch -q origin; }
worktree() {  # (re)create the sprint worktree and reset it to the remote sprint branch
  if [ ! -e "$WT/.git" ]; then git -C "$ROOT" worktree add -q -B "$BR" "$WT" "origin/$BR"; fi
  git -C "$WT" checkout -q -B "$BR" "origin/$BR"
  git -C "$WT" reset -q --hard "origin/$BR"
}

case "$CMD" in
  start)
    [ "$#" -eq 2 ] || die "usage: start S-NNN"
    fetch
    if git -C "$ROOT" rev-parse -q --verify "refs/remotes/origin/$BR" >/dev/null; then
      echo "sprint branch $BR already exists" >&2
    else
      git -C "$ROOT" push -q origin "origin/main:refs/heads/$BR"
      fetch
    fi
    worktree
    echo "$BR at $(git -C "$WT" rev-parse --short HEAD) (worktree \$LOCAL/worktrees/$SID)"
    ;;

  status)
    [ "$#" -eq 2 ] || die "usage: status S-NNN"
    fetch
    git -C "$ROOT" rev-parse -q --verify "refs/remotes/origin/$BR" >/dev/null || die "no branch $BR on origin"
    read -r behind ahead < <(git -C "$ROOT" rev-list --left-right --count "origin/main...origin/$BR")
    prs=$(gh pr list --repo "$REPO_SLUG" --base "$BR" --state open --json number,title,mergeable -q '[.[] | {number, title, mergeable}]')
    jq -n --arg b "$BR" --arg head "$(git -C "$ROOT" rev-parse --short "origin/$BR")" --argjson ahead "$ahead" \
      --argjson behind "$behind" --argjson prs "$prs" \
      '{branch:$b, head:$head, aheadOfMain:$ahead, behindMain:$behind, openPRs:$prs}'
    ;;

  integrate)
    [ "$#" -ge 3 ] || die "usage: integrate S-NNN <PR#> [<PR#>...]"
    shift 2
    for n in "$@"; do [[ "$n" =~ ^[0-9]+$ ]] || die "PR number expected, got '$n'"; done
    merged=(); conflicted=(); rest=(); errors=()
    stop=0
    for n in "$@"; do
      if [ "$stop" -eq 1 ]; then rest+=("$n"); continue; fi
      info=$(gh pr view "$n" --repo "$REPO_SLUG" --json baseRefName,state,mergeable,headRefName)
      [ "$(jq -r .baseRefName <<<"$info")" = "$BR" ] || die "PR #$n does not target $BR (base: $(jq -r .baseRefName <<<"$info")); refusing"
      [ "$(jq -r .state <<<"$info")" = "OPEN" ] || { echo "PR #$n is not open; skipped" >&2; continue; }
      m=$(jq -r .mergeable <<<"$info")
      for i in 1 2 3 4 5; do [ "$m" != "UNKNOWN" ] && break; sleep 3; m=$(gh pr view "$n" --repo "$REPO_SLUG" --json mergeable -q .mergeable); done
      if [ "$m" = "CONFLICTING" ]; then conflicted+=("$n"); errors+=("#$n: conflicts with $BR"); stop=1; continue; fi
      if ! err=$(gh pr merge "$n" --repo "$REPO_SLUG" --squash --delete-branch 2>&1 >/dev/null); then
        conflicted+=("$n"); errors+=("#$n: $(tr '\n' ' ' <<<"$err" | cut -c1-300)"); stop=1; continue
      fi
      merged+=("$n")
    done
    fetch; worktree
    jq -n --arg head "$(git -C "$WT" rev-parse --short HEAD)" \
      --argjson merged "$(printf '%s\n' "${merged[@]:-}" | jq -R 'select(length>0)|tonumber' | jq -s .)" \
      --argjson conflicted "$(printf '%s\n' "${conflicted[@]:-}" | jq -R 'select(length>0)|tonumber' | jq -s .)" \
      --argjson rest "$(printf '%s\n' "${rest[@]:-}" | jq -R 'select(length>0)|tonumber' | jq -s .)" \
      --argjson errors "$(printf '%s\n' "${errors[@]:-}" | jq -R 'select(length>0)' | jq -s .)" \
      '{sprintHead:$head, merged:$merged, conflicted:$conflicted, notAttempted:$rest, errors:$errors}'
    ;;

  rebase-main)
    [ "$#" -eq 2 ] || die "usage: rebase-main S-NNN"
    fetch; worktree
    old=$(git -C "$WT" rev-parse HEAD)
    if ! git -C "$WT" rebase -q origin/main >/dev/null 2>&1; then
      files=$(git -C "$WT" diff --name-only --diff-filter=U | jq -R . | jq -s .)
      git -C "$WT" rebase --abort
      jq -n --argjson files "$files" '{rebased:false, conflicts:$files}'
      exit 3
    fi
    git -C "$WT" push -q --force-with-lease="$BR:$old" origin "$BR"
    jq -n --arg old "$(git -C "$ROOT" rev-parse --short "$old")" --arg new "$(git -C "$WT" rev-parse --short HEAD)" \
      --argjson mainCommits "$(git -C "$WT" log --format='%h %s' "$old..origin/main" 2>/dev/null | jq -R . | jq -s .)" \
      '{rebased:true, oldHead:$old, newHead:$new, newMainCommits:$mainCommits}'
    ;;

  pr)
    [ "$#" -eq 4 ] || die "usage: pr S-NNN <title> <body-file>"
    title="$3"; body="$4"; [ -f "$body" ] || die "body file not found: $body"
    grep -q -- "$MARK" "$body" || { printf '\n%s\n' "$MARK" >> "$body"; }
    n=$(gh pr list --repo "$REPO_SLUG" --head "$BR" --base main --state open --json number -q '.[0].number // empty')
    if [ -z "$n" ]; then
      url=$(gh pr create --repo "$REPO_SLUG" --base main --head "$BR" --title "$SID: $title" --body-file "$body")
      n="${url##*/}"
    else
      gh pr edit "$n" --repo "$REPO_SLUG" --title "$SID: $title" --body-file "$body" >/dev/null
    fi
    echo "$n"
    ;;

  *) die "usage: sprint.sh start|status|integrate|rebase-main|pr S-NNN ..." ;;
esac
