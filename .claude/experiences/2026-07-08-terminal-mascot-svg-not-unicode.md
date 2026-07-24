# Replace the terminal's Unicode block-art mark with an SVG pixel grid

**What:** The get-started terminal's Claude Code mark (three lines of `█▄▀` block characters,
see `2026-07-07-claude-code-glyph-font-fallback.md`) is now a small inline SVG built from a
pixel grid of `<rect>` elements, laid out beside three stacked info lines (mark left, text
right) in one terminal line instead of three. Also bumped `.wordmark` and `.link-secondary`
("Read the docs") to bold, full white with a text-shadow halo - the animated background behind
them (added the same day, see the Unicorn Studio entries) made the old dim-grey/near-white
weights hard to read against its brighter regions.

**Why:** Pointed at the same private reference's `ClaudeSession.tsx` again (see
`2026-07-07-reference-terminal-structure.md` for the first borrow from that widget). Its mascot is
an SVG grid of `<rect>`s driven by a small ASCII pattern (`P`/`E` per cell), not styled text -
zero font dependency, so it can't hit the exact bug the old glyph already had (JetBrains Mono
doesn't cover the quadrant block characters, so the browser silently substitutes a fallback
font for just those glyphs and breaks the monospace grid the shape depends on). The prior fix
only *mitigated* that bug by restricting to full/half blocks that happen to measure evenly in
this font stack - still font-dependent, still one font update or fallback away from breaking
again. Reproduced the technique independently with an original grid and palette rather than
copying the reference file, consistent with how the
rest of this widget already borrows structure from them, not content.

**Outcome:** Shipped. Verified in the browser: mascot renders as a crisp, symmetric 36x32px
mark at the exact intended size, no distortion, transcript still plays through correctly end to
end including the live y/n prompt. Text contrast fix verified via computed styles (`color: rgb
(255,255,255)`, `font-weight: 700`) and a screenshot against the busiest part of the background.

**Lesson:** A mitigation that keeps the same underlying mechanism (styled Unicode characters,
selected by which ones happen to measure consistently in one font) is not the same as removing
the mechanism's failure mode entirely (a font-independent rendering technique). When a prior fix
is described as a workaround rather than a root-cause fix, and a better technique is sitting
right there in a reference implementation, prefer replacing the mechanism over re-tuning it again.
