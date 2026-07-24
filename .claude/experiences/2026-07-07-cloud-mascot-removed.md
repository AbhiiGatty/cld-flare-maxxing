# Cloud mascot removed from the landing page

**What:** Removed the roaming cloud mascot (CSS animation, cursor-tracking JS, and its SVG
markup) from `site/index.html` entirely, on direct request. No replacement.

**Why:** User request, no design critique attached. Logged here mainly for the removal
pattern, not the decision itself.

**Outcome:** Shipped. Confirmed zero leftover references afterward (`grep -ri mascot` across
the repo, excluding historical commit messages inside committed snapshot JSON, which are a
point-in-time record and don't get edited).

**Lesson:** Removing a feature cleanly means removing all three layers in the same change:
the CSS, the JS (event listeners included), and the HTML markup. Then grep for the feature
name across the whole repo, not just the file that seemed like the obvious location - the
same name can leak into docs, READMEs, and design-system references that a literal "delete
the mascot" edit won't touch.
