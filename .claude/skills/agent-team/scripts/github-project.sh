#!/usr/bin/env bash
# GitHub Project board for the agent team (user-level Project "Dockspace Agent Team", linked to gustavoiha/file-storage).
# Needs the gh token scope "project" (gh auth refresh -s project).
# Usage:
#   github-project.sh ensure                         create/find the Project, link the repo, ensure the Stage field
#   github-project.sh stage <issue#> <Stage>         add the issue to the board (if needed) and set its Stage
#   github-project.sh task-issue <T-XXXX> <request-issue#> <title> <body-file>
#                                                    open the task's own issue, add it to the board as Triage,
#                                                    link it as a sub-issue of the request issue; prints its number
#   github-project.sh sprint-issue <S-NNN> <title> <body-file>
#                                                    open the sprint's issue (not on the board); prints its number
#   github-project.sh stages                         list valid Stage values
set -euo pipefail
OWNER=gustavoiha; REPO_SLUG=gustavoiha/file-storage; TITLE="Dockspace Agent Team"
STAGES=("Triage" "Backlog" "Ready" "Design" "Awaiting human" "Engineering" "Review" "Testing" "Filtering" "Deploying" "Done" "Cancelled")
MARK='<!-- agent-team -->'
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"  # repo root, from this script's location
CACHE=$ROOT/.agent-local/project.json

die() { echo "github-project: $*" >&2; exit 1; }
stages_csv() { local IFS=,; echo "${STAGES[*]}"; }

ensure() {
  local num pid fields fid
  num=$(gh project list --owner "$OWNER" --format json --limit 200 | jq -r --arg t "$TITLE" '[.projects[] | select(.title==$t and (.closed|not))][0].number // empty')
  if [ -z "$num" ]; then
    num=$(gh project create --owner "$OWNER" --title "$TITLE" --format json | jq -r .number)
    echo "created Project \"$TITLE\" #$num" >&2
  fi
  gh project link "$num" --owner "$OWNER" --repo "$REPO_SLUG" >/dev/null 2>&1 || true
  pid=$(gh project view "$num" --owner "$OWNER" --format json | jq -r .id)
  fields=$(gh project field-list "$num" --owner "$OWNER" --format json --limit 100)
  fid=$(jq -r '.fields[] | select(.name=="Stage") | .id' <<<"$fields")
  if [ -z "$fid" ]; then
    gh project field-create "$num" --owner "$OWNER" --name Stage --data-type SINGLE_SELECT --single-select-options "$(stages_csv)" >/dev/null
    fields=$(gh project field-list "$num" --owner "$OWNER" --format json --limit 100)
    fid=$(jq -r '.fields[] | select(.name=="Stage") | .id' <<<"$fields")
  fi
  local opts missing=()
  opts=$(jq -c '[.fields[] | select(.name=="Stage") | .options[] | {(.name): .id}] | add' <<<"$fields")
  for s in "${STAGES[@]}"; do jq -e --arg s "$s" 'has($s)' <<<"$opts" >/dev/null || missing+=("$s"); done
  [ "${#missing[@]}" -eq 0 ] || die "Stage field is missing options: ${missing[*]}. Ask the human to add them in the Project settings."
  mkdir -p "$(dirname "$CACHE")"
  jq -n --argjson num "$num" --arg pid "$pid" --arg fid "$fid" --argjson opts "$opts" \
    '{number:$num, projectId:$pid, stageFieldId:$fid, stageOptions:$opts}' > "$CACHE"
  echo "Project \"$TITLE\" #$num: https://github.com/users/$OWNER/projects/$num"
}

load() { [ -s "$CACHE" ] || ensure >/dev/null; }

stage() {
  local n="$1" s="$2" item opt
  [[ "$n" =~ ^[0-9]+$ ]] || die "issue number expected, got '$n'"
  load
  opt=$(jq -r --arg s "$s" '.stageOptions[$s] // empty' "$CACHE")
  [ -n "$opt" ] || die "unknown Stage '$s'. Valid: $(stages_csv)"
  item=$(gh project item-add "$(jq -r .number "$CACHE")" --owner "$OWNER" --url "https://github.com/$REPO_SLUG/issues/$n" --format json | jq -r .id)
  gh project item-edit --id "$item" --project-id "$(jq -r .projectId "$CACHE")" \
    --field-id "$(jq -r .stageFieldId "$CACHE")" --single-select-option-id "$opt" >/dev/null
  echo "#$n → $s"
}

task_issue() {
  local task="$1" req="$2" title="$3" bodyfile="$4" tmp url n parent child
  [[ "$task" =~ ^T-[0-9]{4}$ ]] || die "task id expected, got '$task'"
  [[ "$req" =~ ^[0-9]+$ ]] || die "request issue number expected, got '$req'"
  [ -f "$bodyfile" ] || die "body file not found: $bodyfile"
  existing=$(gh issue list --repo "$REPO_SLUG" --state all --search "\"$task:\" in:title" --json number,title -q ".[] | select(.title | startswith(\"$task:\")) | .number" | head -1)
  [ -z "$existing" ] || { echo "$existing"; echo "task issue already exists: #$existing" >&2; return 0; }
  tmp=$(mktemp)
  { cat "$bodyfile"; printf '\n\n---\nTask **%s** · requested in #%s · tracked on the Dockspace Agent Team board\n%s\n' "$task" "$req" "$MARK"; } > "$tmp"
  url=$(gh issue create --repo "$REPO_SLUG" --title "$task: $title" --body-file "$tmp")
  rm -f "$tmp"
  n="${url##*/}"
  parent=$(gh issue view "$req" --repo "$REPO_SLUG" --json id -q .id)
  child=$(gh issue view "$n" --repo "$REPO_SLUG" --json id -q .id)
  gh api graphql -f query='mutation($p:ID!,$c:ID!){addSubIssue(input:{issueId:$p,subIssueId:$c}){issue{number}}}' \
    -f p="$parent" -f c="$child" >/dev/null || echo "warning: could not link #$n as a sub-issue of #$req" >&2
  stage "$n" "Triage" >/dev/null
  echo "$n"
}

sprint_issue() {
  local sid="$1" title="$2" bodyfile="$3" tmp url existing
  [[ "$sid" =~ ^S-[0-9]{3}$ ]] || die "sprint id expected, got '$sid'"
  [ -f "$bodyfile" ] || die "body file not found: $bodyfile"
  existing=$(gh issue list --repo "$REPO_SLUG" --state all --search "\"$sid:\" in:title" --json number,title -q ".[] | select(.title | startswith(\"$sid:\")) | .number" | head -1)
  [ -z "$existing" ] || { echo "$existing"; echo "sprint issue already exists: #$existing" >&2; return 0; }
  tmp=$(mktemp)
  { cat "$bodyfile"; printf '\n\n---\nSprint **%s** · branch `sprint/%s` · run by the agent team\n%s\n' "$sid" "$sid" "$MARK"; } > "$tmp"
  url=$(gh issue create --repo "$REPO_SLUG" --title "$sid: $title" --body-file "$tmp")
  rm -f "$tmp"
  echo "${url##*/}"
}

case "${1:-}" in
  ensure) ensure ;;
  stage) [ "$#" -eq 3 ] || die "usage: stage <issue#> <Stage>"; stage "$2" "$3" ;;
  task-issue) [ "$#" -eq 5 ] || die "usage: task-issue <T-XXXX> <request-issue#> <title> <body-file>"; task_issue "$2" "$3" "$4" "$5" ;;
  sprint-issue) [ "$#" -eq 4 ] || die "usage: sprint-issue <S-NNN> <title> <body-file>"; sprint_issue "$2" "$3" "$4" ;;
  stages) printf '%s\n' "${STAGES[@]}" ;;
  *) die "usage: ensure | stage <issue#> <Stage> | task-issue <T-XXXX> <request#> <title> <body-file> | sprint-issue <S-NNN> <title> <body-file> | stages" ;;
esac
