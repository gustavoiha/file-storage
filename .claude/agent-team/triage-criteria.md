# Triage criteria (Product Manager)

This file is the human's lever on what the agent team works on. The PM reads it at every run, so edits apply
from the next PM run with no relaunch. Keep each criterion short: a name, the question, and the rule.

The product: Dockspace, a self-hosted, single-tenant file storage app. The "user" is one person (the owner) on
desktop and phone, with real files from a real file picker. Judge every task by what that person meets in normal use.

## How to use them
Apply every criterion to every task in triage (`Status: new`): tasks the PM writes from a human request, and
backlog candidates written by the review judge, the test filter or the delivery orchestrator.
The hard gates (G) decide first; the scored criteria (S) then decide between `ready`, `backlog` and `cancelled`.
Record the result in the task file under `## Triage` as one line per criterion that mattered, then the decision:
`ready` · `backlog` · `bundle into T-XXXX` · `cancelled (rejected)` · `ask-human`.

## Hard gates
G1. **Human request.** Work the human asked for in an issue or comment is never rejected by triage. It can still
    be split, bundled or sequenced. If it conflicts with a standing decision, ask the human.
G2. **Safety first.** A security weakness, data loss or corruption risk, or a broken core path (sign-in, upload,
    download, folders, move, rename, trash/restore, dockspace list, gallery browsing) is `ready` at once with
    priority P1, whatever the other criteria say.
G3. **Reachable by a real user.** The state must occur in normal use: real file-picker selections, real data,
    real network, at desktop or phone width. States that only appear with mocked responses, injected delays,
    synthetic listings, hand-crafted paths, or batches far beyond normal use are `cancelled` (unless G2 applies).
G4. **Do not reverse a deliberate decision.** If the task undoes or changes behaviour that an earlier task, the
    design spec or a standing human decision chose on purpose (check product.md `## Product rules`, the task files
    and design-preferences.md), it is `ask-human`, not `ready`.
G5. **Follow-up depth.** Follow the `Origin:` chain back to the human's request. A candidate whose origin is itself
    an agent-originated task (depth 2 or more) needs a human approval: `ask-human`, unless G2 applies.

## Scored criteria (each: + / 0 / -)
S1. **Serves an open request.** Does it deliver, or directly unblock, one of the asks of an open human request
    issue (name the ask)? + if yes; - if it only polishes code that was already fine for the request.
S2. **User-visible impact.** Would the owner notice it in a normal week? + if it changes what they see or can do,
    0 if only in an uncommon path, - if only visible in a screenshot diff or a test tool.
S3. **Frequency.** How often does a real user meet it? + every session, 0 occasionally, - rarely or never.
S4. **Severity when met.** + wrong result, misleading message, lost focus that blocks keyboard use, or a dead end;
    0 confusing but recoverable; - cosmetic (spacing, ring style, wording nuance).
S5. **Accessibility that blocks.** + if a keyboard or screen-reader user cannot complete a task without it;
    0 for polish of a path that already works by keyboard.
S6. **Regression.** + if something worked before a recent sprint and now does not (that is also P1).
    0 if it was always like this.
S7. **Cost vs value.** Estimate the size (S: one file or copy/CSS; M: a component and its tests; L: several
    components, shared code or the backend). - if the size is L and S2–S4 are not all +.
S8. **Risk of the change.** - if it touches shared components used across the app (menus, dialogs, upload hooks,
    API contracts) for a gain in one place; prefer the smallest local change.
S9. **Bundling.** Is there another open task (new, backlog, ready) on the same theme or the same files? If yes,
    `bundle into T-XXXX`: merge the acceptance criteria into the older task and cancel this one with a pointer.
    One theme (e.g. "skipped-files messaging", "phone touch targets") is one task.
S10. **Testable on dev.** + if every acceptance criterion can be checked on the dev environment with real data
    at desktop and phone widths. - if it needs mocks or data the test accounts cannot create.
S11. **Fits one sprint.** + if it can be built, reviewed and tested in one sprint. If not, split it into tasks
    that each deliver something the user can see.
S12. **Product consistency.** + if it makes the app follow an existing `## Product rules` entry or the design
    preferences. If it reveals a new product rule (e.g. "skipped files are a notice, not an error"), write the rule
    in product.md the first time, whatever the decision.

## Decision
- Any hard gate decides first (G2 → ready P1; G3 → cancelled; G4/G5 → ask-human; G1 → never cancelled).
- `ready` when S1 or S6 is +, and the S criteria have more + than -.
- `backlog` when the task is real and reachable but has as many - as + (keep it; re-triage when a request touches
  the same area, or bundle it into a related ready task later).
- `cancelled (rejected)` when it has more - than +, or S2, S3 and S4 are all -.
- Priority for ready tasks: P1 (G2 or S6), P2 (S1 +), P3 (everything else). The orchestrator plans sprints by priority.
