# Borrowed a reference terminal's structure, not its colors

**What:** Asked to look at another private project with a live "claude" terminal widget and
"copy that for claude." Ported three
structural patterns into this project's terminal popup: glowing traffic-light dots
(`box-shadow` matching each dot's color, not flat circles), a small model-name chip badge next
to the banner title, and a bordered callout box with its label cut into the top border like a
fieldset legend (instead of the left-accent-bar style used before). Did not port their actual
colors - their widget's accent is a teal (`#00ADB5`), this project's whole visual identity is
Cloudflare orange.

**Why:** Investigated the reference's production CSS/JS rather than guessing from the
screenshot alone. That confirmed the structural techniques: bar-and-label box construction,
chip styling, and dot glows.

**Outcome:** Shipped. Reads as a native part of this page (same orange, same fonts) while
having noticeably more polish than the pre-existing version.

**Lesson:** "Make it look like X" usually means borrow X's *patterns* (layout technique,
interaction, structural craft), not X's literal brand colors, especially when X is someone
else's product with its own distinct identity. When the instruction is ambiguous about which
half is wanted, default to structure-over-palette and say so explicitly, rather than silently
reskinning the whole thing in the reference's colors.
