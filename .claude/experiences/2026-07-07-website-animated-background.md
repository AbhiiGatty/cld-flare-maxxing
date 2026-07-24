# Website animated background: vanilla embed, vendored SDK, and a real performance cost

**What:** Ported the WebGL animated background (originally scoped to an isolated dashboard
sandbox, see `2026-07-07-dashboard-sandbox-isolation.md`) onto the actual public website.
Found and partially fixed a serious performance regression in the process.

**Why (vanilla instead of React):** `site/index.html` is a single static file by design - no
build step, no npm, deployed as-is. The pasted component was a React wrapper
(`unicornstudio-react`). Read the wrapper's compiled source directly (not its README) to find
the actual underlying mechanism: one vanilla call, `UnicornStudio.addScene({elementId,
projectId, production, scale, dpi, fps})`, which reads its target DOM element's own rendered
box for sizing. No width/height parameters exist on the real API at all, despite the React
component exposing `width`/`height` props - those just set CSS custom properties on a wrapper
div. A plain `position: fixed; inset: 0` container reproduces the same sizing with zero JS,
simpler than the React version's manual `window.innerWidth`-tracking hook.

**Why (vendored SDK instead of a CDN URL):** Searched the npm package's source and README for
a documented default CDN URL for the underlying SDK script. Found none - only a `sdkUrl`
override parameter, unused by the pasted component. Rather than guess a plausible-looking CDN
path (a real risk: wrong guess silently 404s, and per this repo's own rules, never fabricate a
URL without confidence), extracted the exact SDK bundle already vetted inside the
`unicornstudio-react` package itself (the same code path it uses by default) and self-hosted
it as a static asset (`site/assets/unicorn-studio-sdk.js`, ~246KB / ~46KB gzipped).

**Why (the performance investigation):** After shipping, ran Lighthouse against the live
local preview - not asked to skip this even though the feature "worked." Found Performance at
37 (mobile) / 64 (desktop), traced to one exact cause via `bootup-time`/`mainthread-work-
breakdown` audits: the self-hosted SDK alone cost ~2.8s of main-thread scripting unthrottled
(~14.7s under Lighthouse's mobile 4x-CPU simulation), pushing LCP to 5.6s. Accessibility,
Best Practices, and SEO all scored 100 - the regression was specific to this one script.

**Outcome:** Partially fixed, documented as an open tradeoff rather than called "done." Tried
three mitigations in order, measuring after each: (1) no change - Performance 37, LCP 5.6s;
(2) defer script load to the `load` event - barely helped, Performance 42, LCP 5.1s, because
Lighthouse's trace window still caught it; (3) defer 2s past `load` - Performance 58, LCP 2.5s
("good"). Total Blocking Time stayed high (~4.1s) through all three, because scheduling the
expensive work later doesn't make it cheaper, only moves *when* it happens. Shipped option 3
as the current state; the doc (`docs/DESIGN-SYSTEM.md`) names lowering `dpi`/`fps`/`scale` in
the `addScene()` call as the next untried lever if this needs to get fully clean.

**Lesson:** "It renders correctly" and "it performs acceptably" are different questions - a
feature can pass every functional check and still be a serious regression. When a heavy
third-party script gets added to a page with an explicit fast/lightweight design goal, measure
(Lighthouse or equivalent) before calling it done, not just after being asked to. And when a
scheduling-based mitigation only partially helps, say precisely which metric moved and which
didn't, rather than reporting the best number and staying quiet about the rest.
