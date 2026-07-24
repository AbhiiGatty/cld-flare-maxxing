# AG logo in the README banner: corner, verified by geometry

> **Superseded in part:** the corner-vs-center call below held, but the specific corner later
> changed from top-right to bottom-right as part of a full banner redesign - see
> `2026-07-07-readme-banner-apple-redesign.md`. Kept this entry for the still-relevant
> reasoning (corner over center, and the geometry-verification approach).

**What:** Added the author's AG monogram to `assets/brand/banner.svg` (the README header
image), top-right corner, white at 85% opacity - not centered.

**Why:** Explicitly requested "at the corner." A later, unrelated message ("itn shoud be at
the center") turned out to be about a different element entirely (the dashboard sandbox's
WebGL scene, which really was mis-centered at the time) - resolved by asking rather than
guessing which of the two pending items it meant, since the two instructions directly
conflicted if read as being about the same thing.

**Outcome:** Shipped at the corner, matching the existing `.ag-corner` link's placement
convention on the live site (top-left there; top-right on the banner, mirroring the product
mark's placement on the opposite side). Verified the exact position with real math rather
than eyeballing an image render: extracted the SVG's `getBBox()` coordinates through its
`transform`, confirmed a ~61px margin from the right edge against the product mark's 60px
left margin, and confirmed no overlap with the headline text or the capability pills.

**Lesson:** When two instructions could plausibly refer to the same thing but conflict if they
do, don't silently pick one interpretation - name the conflict and ask which one is meant.
Also: geometry math on the actual SVG coordinate transforms is more reliable than rendering
and eyeballing a preview image, especially when a screenshot tool is unreliable in the current
session (it was, throughout this one).
