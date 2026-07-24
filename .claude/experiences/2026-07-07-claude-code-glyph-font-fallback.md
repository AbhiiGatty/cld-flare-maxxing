# Claude Code banner glyph: font-fallback bug, not a character-choice bug

**What:** The block-art mark in the terminal popup's `$ claude` banner (three lines of Unicode
box-drawing characters meant to look like the real Claude Code CLI's mark) rendered visibly
lopsided in the browser. Rebuilt it from scratch using a different character set.

**Why:** The first version used the Unicode "quadrant" block characters
(`▛▜▙▟▝▘▖▗`, e.g. QUADRANT UPPER LEFT AND UPPER RIGHT AND LOWER LEFT) to fake rounded corners
on the mark - visually reasonable in the abstract, and these are the exact characters a
user-provided reference sample used. It still rendered wrong. Measured why with
`ctx.measureText()` on a canvas using the page's actual font stack (`"JetBrains Mono",
monospace`, 13px): the full/half block characters already in use elsewhere on the page
(`█ ▌ ▐ ▄ ▀`) measured a consistent ~7.15px advance width, but the quadrant characters
measured ~12.2px - nearly double. JetBrains Mono doesn't have glyphs for that specific
Unicode block, so the browser silently substitutes a different, non-monospace-matched
fallback font for just those characters. The rest of the line stays in JetBrains Mono. Every
character that's supposed to line up in a monospace grid stops lining up, and the effect
compounds across a multi-line ASCII-art shape.

**Outcome:** Rebuilt the glyph using only the measured-safe set (`█ ▄ ▀`, plus plain spaces).
Verified alignment with actual `getBoundingClientRect()` measurements on the live rendered
page (not by eye): the text following each of the three glyph lines landed at the identical
x-coordinate. Shipped.

**Lesson:** "It's a standard Unicode character" does not mean a specific loaded web font
covers it, and a browser's silent per-glyph font substitution breaks monospace alignment in a
way that just looks like "something's off" rather than throwing any error. Before trusting
hand-built Unicode block/box-drawing art (or any place where per-character width matters) in
a specific font stack, measure it: `new OffscreenCanvas(...).getContext('2d')`,
set `ctx.font` to the exact CSS font string in use, and compare `ctx.measureText(char).width`
across the characters actually being used. Don't assume visual similarity to a reference
screenshot means the same characters will render the same way in a different font.
