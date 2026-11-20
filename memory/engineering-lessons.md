# Engineering lessons (owned by Engineering agent)
Implementation details repeatedly flagged by the testing or code-review agents. Each entry: rule, why, times flagged, tasks.

- Touch press-and-hold: after a hold fires, handle every event the release can produce (touchend, compat mousedown/focus, click, Android contextmenu). Any "swallow the next X" flag must be cleared on every path where X will not come (cancelled touchend, menu closed), or it eats the next keyboard or assistive-tech activation. Test the release AND the next keyboard activation. Flagged 2x: T-0005 test rounds 1 and 2.
