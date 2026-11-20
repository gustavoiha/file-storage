# Human design preferences (owned by Design agent)
Each entry: preference, evidence (issue/comment link), date.

## Navigation and layout
- Prefers a Finder-style column view (Miller columns) for browsing folder hierarchies: every ancestor level is a visible column, the open folder is highlighted in its parent column, and the file preview is the last column on the right. Reason given: "all the information the user needs in a single place, neatly organised in a predictable manner". (T-0001, https://github.com/gustavoiha/file-storage/issues/5#issuecomment-7021776277, 2026-11-19)
- Values predictability and having everything in one place: favor layouts where position on screen tells the user where they are (path left to right, detail on the right) over layouts that change shape as you expand things. (T-0001, 2026-11-19)
- (inferred) Does not want the folder hierarchy to live only in a separate sidebar tree with a files-only main panel: a tree split from the listing reads as two places. (T-0001, rejected Option 2, 2026-11-19)
- (inferred) Prefers fixed, predictable structure over expand-in-place outlines whose indentation and pinned ancestors shift while scrolling. (T-0001, rejected Option 3, 2026-11-19)
- (inferred) Page-level actions such as New folder and Upload belong in a top bar next to the breadcrumb rather than in a side panel; background status (uploads) can float as a small card. (T-0001, part of chosen Option 1, 2026-11-19)

## Touch / phone interaction
- On phone screens, enters multi-select from an explicit "Select items" entry in the folder's options (⋯) menu, which turns on a selection mode; not from a per-row "Select" action, not from a header button, and not from press-and-hold. (T-0005, https://github.com/gustavoiha/file-storage/issues/15#issuecomment-7039970641, 2026-11-20)
- On phone screens, wants no per-item ⋯ menu button on rows (files and folders): press-and-hold on the item opens that item's menu instead, and a normal tap keeps its primary action (preview/open). Keeps phone rows clean and gives each row one obvious tap target. (T-0005, same comment, 2026-11-20)
- (inferred) Press-and-hold on touch is for an item's menu (like a right-click), not for selecting; selection stays an explicit mode. (T-0005, rejected Option 3 long-press-to-select, 2026-11-20)
- (inferred) Prefers reusing existing surfaces (the folder ⋯ menu, the desktop selection bar) over adding new chrome such as a header Select button, a full-width bottom action bar or a floating dock. (T-0005, rejected Options 1 and 3, 2026-11-20)
