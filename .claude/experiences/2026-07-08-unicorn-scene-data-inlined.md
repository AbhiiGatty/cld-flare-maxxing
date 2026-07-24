# Inline the Unicorn Studio scene data instead of fetching it at runtime

**What:** The animated background's scene data (shaders/layers/params, not the SDK script -
see `2026-07-07-website-animated-background.md`) is now embedded directly in `site/index.html`
as a `<script type="application/json" id="unicornSceneData">` block, and `addScene()` passes
`filePath: 'unicornSceneData'` to read it from the DOM instead of fetching it.

**Why:** The SDK's default behavior for a `projectId`-only call fetches the scene JSON from
`storage.googleapis.com/unicornstudio-production/embeds/<id>` on every page load, with a
`v=Date.now()` cache-busting query param - the browser can never cache this response, so it's
a fresh external network round-trip every single visit, on top of the already-deferred SDK
script. Same category of problem as the SDK script itself (an unnecessary third-party runtime
dependency slowing the page down), which was already fixed by vendoring the SDK - this fetch
just wasn't caught at the time. Fetched the current scene once (25.8KB, no embedded external
asset URLs - it's a pure procedural WebGL scene, so nothing else depends on the network), and
used the SDK's own already-existing local-embed mechanism (`filePath` → `document.getElementById`
→ parse inline JSON, no fetch) rather than routing a same-origin request through a separate
`.json` asset file, which would just trade a cross-origin fetch for a same-origin one.

**Outcome:** Shipped. Verified in the browser: the scene still renders identically, and the
network log shows zero requests to any Unicorn Studio domain - only the locally-served SDK
script. `projectId` is left in the `addScene()` call for traceability (which project this scene
came from) even though it's now unused for loading, since `filePath` resolving successfully
short-circuits before the SDK ever reaches the `projectId` fetch branch.

**Lesson:** Vendoring a third-party script doesn't automatically vendor everything it depends
on at runtime - the SDK file being self-hosted didn't mean the *data* it loads was. Worth
explicitly checking a vendored library's own network calls (not just where the script itself
comes from) when the stated goal is removing external dependencies for load-time reasons.
