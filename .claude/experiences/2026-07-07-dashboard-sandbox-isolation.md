# New dashboard components go in an isolated sandbox, not into App.jsx

**What:** Asked to integrate a pasted React component (`bloim-animation-background.tsx`, a
WebGL animated background) into the dashboard, which required bootstrapping TypeScript,
Tailwind, and shadcn/ui into a project that had none of those (plain JS/JSX, hand-rolled CSS).
Rather than wiring the new component into the real dashboard's `App.jsx`, built a second,
independent Vite entry point (`demo.html` + `src/demo-main.tsx`) that mounts only the new
component. `main.jsx`/`App.jsx`/`styles.css` - the actual internal ops tool people use daily -
stayed completely untouched.

**Why:** The dashboard is a working internal security/ops tool with an established dense,
utilitarian visual language (per `docs/DESIGN-SYSTEM.md`: dark, flat, no motion). A decorative
full-viewport animated background is a plausible fit for a marketing page, not obviously a fit
for that tool, and the task was "integrate this component" (make it available and working),
not "redesign the dashboard's actual UI." Bootstrapping a whole new toolchain (TS/Tailwind/
shadcn) is itself a substantial, blast-radius-bearing change; isolating it to a parallel entry
point meant that change could be verified (typecheck, build, render) with zero risk to the
tool already in daily use.

**Outcome:** Shipped, isolated. Later (`2026-07-07-website-animated-background.md`) the same
component's underlying visual effect was actually wanted on the *public website* instead,
which turned out to need a completely different implementation approach (site/ has no build
step at all) - the sandbox wasn't wasted work, it's what let the component be demoed,
color-tuned, and centered correctly before that decision was made.

**Lesson:** When asked to "integrate" a pasted component into a codebase that doesn't match
its assumptions (framework, build tooling, visual style) and the task doesn't explicitly ask
to change the primary user-facing surface, default to the smallest-blast-radius option: a
parallel/isolated mount point over wiring into the thing people already depend on. Confirm
placement with the user rather than guessing whether "integrate" means "make it available" or
"put it on the main screen" - those have very different risk profiles.
