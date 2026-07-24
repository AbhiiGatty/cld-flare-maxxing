# README banner redesign: Apple-style restraint over dashboard-style density

**What:** Rebuilt `assets/brand/banner.svg` from scratch. Removed the repeating dot-grid
background and the four colored capability pill badges ("Snapshot", "Investigate", "Guard",
"Maximize"). Replaced with: a near-black background with one soft off-center orange glow and
a subtle vignette instead of a visible grid pattern, a centered mark+wordmark lockup at a
larger size, one crisp tagline line (Apple secondary-gray, `#a1a1a6`) instead of two bold
lines, and the same four capability words reduced to a single quiet, letter-spaced small-caps
line (`#6e6e73`, no boxes) beneath it. Moved the author's AG monogram from top-right to
bottom-right, lower opacity (85% → 70%).

**Why:** Requested explicitly: "make it look better like the design team at apple made it."
Interpreted that as a specific, checkable aesthetic direction, not a vague "improve it":
generous negative space, a restrained near-monochrome palette with one accent used sparingly,
large confident typography, soft/diffuse lighting instead of flat decoration, and no
dashboard-style UI chrome (badges, pills, grids) in a hero image. The four capability pills
were the clearest violation of that direction - accurate content, but presented as dashboard
UI rather than editorial typography - so they were the main thing cut, not just restyled.

**Outcome:** Shipped. Verified precisely rather than by eye (the screenshot tool was
unreliable all session, consistent with `2026-07-07-ag-logo-banner-placement.md`): extracted
`getBBox()` for every positioned element through its actual `transform` chain, computed real
global coordinates, and confirmed the lockup/tagline/caption all land at exactly
`centerX: 600` (canvas center) and the AG mark sits at an exact 36px/24px margin from the
bottom-right corner with no overlap against the caption line above it. Caught and fixed one
real bug this way: the initial hand-estimated lockup position was off-center by ~28px because
a text width was guessed rather than measured, exactly the kind of error the geometry-check
habit exists to catch.

**Lesson:** A style direction named after a real, well-known design language ("like Apple," "like
Stripe," "like a terminal") is more actionable than it first appears - it decomposes into
specific, checkable properties (here: negative space, typographic hierarchy, restrained color,
no UI chrome) rather than staying a vague vibe. Treat it as a checklist, and be willing to cut
content (not just restyle it) when the content's *presentation* is what actually conflicts
with the requested direction.
