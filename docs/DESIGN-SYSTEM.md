# Design system

The visual language shared by the landing page (`site/`) and the dashboard
(`dashboard/`). Dark surface, one warm accent, restrained type. This file is the
reference; the values live in `site/index.html` (`:root`) and
`dashboard/src/styles.css`.

## Color

Tokens as used on the landing page (`site/index.html`):

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#0d1117` | Page background, the base of the paper texture |
| `--text` | `#f0f3f7` | Headings, primary copy |
| `--text-dim` | `#9aa4b2` | Subheads, supporting copy |
| `--text-faint` | `#5b6472` | Captions, the capability row, the footer |
| `--border` | `#22272e` | Hairline borders and separators |
| `--accent` | `#f6821f` | Cloudflare orange. Primary button, brand mark, the paper's warm glow |
| `--accent-2` | `#38bdf8` | Sky blue. Links, focus rings |

The dashboard shares the same `#0d1117` base and `#f6821f`/`#38bdf8` accents; a
few neutral steps differ (`dashboard/src/styles.css` uses `--text #e6edf3`,
`--border #2a3038`). The brand core is the dark base plus orange; treat those two
as fixed and the neutrals as adjustable per surface.

Contrast: `--text` on `--bg` is ~15:1 and `--text-dim` on `--bg` ~7:1, both clear
AA/AAA against the flat paper. `h1`/`.sub` also carry a multi-layer `text-shadow`
(a soft dark halo, not just a drop shadow) so the headline stays legible over
the paper texture.

## Typography

Font stack:

```
"Google Sans", "Product Sans", "DM Sans", -apple-system,
BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
```

Google Sans (and Product Sans) are Google's restricted brand fonts and are not
served from the public Google Fonts CDN, so they render only for readers who have
them licensed/installed. DM Sans is the loaded web fallback, a geometric sans
close to Google Sans in proportion and feel, pulled from
`fonts.googleapis.com` at weights 300–700. If licensed Google Sans `.woff2` files
are added under `site/assets/fonts/`, self-host them with an `@font-face` and drop
DM Sans from the `<link>`.

Weights used: 300 (footer credit), 400 (body), 500 (links), 600 (buttons),
700 (headline). Two-to-three weights per view, no more.

Landing-page type scale (fluid, `clamp()`):

| Role | Size | Notes |
|---|---|---|
| Headline (`h1`) | `clamp(2rem, 5.2vw, 4rem)` | weight 700, `letter-spacing: -0.03em`, `line-height: 1.06` |
| Subhead (`.sub`) | `clamp(1.02rem, 1.8vw, 1.2rem)` | weight 400, `line-height: 1.55` |
| Small labels | `11.5–12px` | `letter-spacing: 0.04–0.06em` |

## Background

Three fixed layers sit behind the content (`site/index.html`), in DOM order
(later paints on top, all at `z-index: 0`):

1. `.paper`: the `--bg` base with a warm orange top glow
   (`rgba(246,130,31,0.07)`) and a soft radial vignette toward the edges. Pure
   CSS, always present - this is what shows if the layer below fails to load,
   is disabled, or `prefers-reduced-motion` is set.
2. `.unicorn-bg`: an animated WebGL scene (Unicorn Studio, `projectId`
   `9tVO0xGS8DIar1DF4Sqc`) rendered full-viewport (`position: fixed; inset: 0`,
   the SDK reads the container's own rendered box for sizing, no JS resize
   listener needed). The scene's native palette is blue/violet, baked into the
   remote project; recolored orange with `filter: sepia(1) saturate(3)
   hue-rotate(345deg) brightness(0.85)` plus `opacity: 0.62` (tuned down from
   an initial `saturate(6) brightness(1.05)` pass that read too bright/vivid
   and hurt hero-text contrast against the vignette below). Hidden entirely
   under `prefers-reduced-motion: reduce`.
   - **SDK is vendored, not CDN-loaded**: `site/assets/unicorn-studio-sdk.js`
     (~246KB, ~46KB gzipped) is extracted from the `unicornstudio-react` npm
     package's own bundled build, not pulled from a third-party host - there's
     no publicly documented default CDN URL for this SDK, only a custom
     `sdkUrl` override (unused here). See `site/assets/README.md` for how to
     re-extract it after a package bump.
   - **Loaded deferred, not eagerly**: a Lighthouse run measured this single
     script costing ~2.8s of main-thread scripting unthrottled (~14.7s under
     mobile's 4x CPU simulation), tanking Performance to 37 (mobile) / 64
     (desktop) and LCP to 5.6s when loaded on initial page load. It's now
     kicked off 2s after the `load` event, which recovered LCP to ~2.5s
     ("good") - but Total Blocking Time stays high (~4.1s) because the fix
     only *moves* the expensive work out of the critical path, it doesn't
     make the work itself cheaper. Lowering `dpi`/`fps`/`scale` in the
     `addScene()` call (`site/index.html`) is the next lever if this needs to
     get fully clean; hasn't been tried.
   - The actual vanilla API is one call: `UnicornStudio.addScene({elementId,
     projectId, production, scale, dpi, fps})` - no width/height params exist
     on it despite the React wrapper's `<UnicornScene width height>` props,
     which just set CSS custom properties on the wrapper div. A fixed
     `inset: 0` container reproduces that without any JS sizing logic.
3. `.paper-grain`: fine fractal-noise grain at `opacity: 0.10`, generated
   inline with an SVG `feTurbulence` data URI (self-contained, no request),
   tiled 140×140. Painted last so the grain still reads as one cohesive paper
   surface sitting on top of the motion, not a separate layer.

The base is dark, so hero text stays readable without a hard scrim; `h1` keeps
a light `text-shadow` for depth, and `main::before` (see Layout and
accessibility) is the actual contrast workhorse - it got darkened (peak
`rgba(13,17,23,0.62)` → `0.8`) once the animated layer started reading
brighter than the flat `.paper` gradient it was originally tuned against. Any
future change to `.unicorn-bg`'s brightness/opacity should re-check this
vignette, not just eyeball the animation on its own. To warm or cool the
paper, change the `.paper` glow and vignette stops; for coarser or finer
grain, change the grain `baseFrequency` (higher = finer) and the layer
`opacity`.

## Motion

Entrance is staggered down the hero: the brand lockup and each element fade and
rise on a `cubic-bezier(0.16, 1, 0.3, 1)` ease. The headline reveals word by word
(each `h1 .word` on its own delay).

The accent word ("Cloudflare") carries the glass look directly on its own
glyphs, not a separate panel: `h1 .hl-accent .txt` fills the letterforms with
two `background-clip: text` layers (a warm highlight streak over a base
gradient built from the same orange as the primary button, `--accent
#f6821f`, so the word reads as "that orange, made of glass" rather than a
pale white chip), looping continuously via a plain linear `shine` keyframe
(2.6s, no pause between sweeps). `filter: drop-shadow(...)`, tinted the same
orange, gives the word its "lifted off the page" glow instead of `text-shadow`
or `backdrop-filter`.

Both of those were tried and dropped after testing showed they wash the fill
out to a muddy grey once combined with `background-clip: text`, confirmed
against a plain swatch of the same gradient (which rendered correctly with
neither applied):
- `backdrop-filter` samples the page behind the element; clipped to the
  text shape it should in principle only blur the backdrop, but in practice
  it visibly overrides the gradient fill.
- `text-shadow` is inherited from the `h1` rule above (it's an inherited CSS
  property), which uses it as a dark halo for legibility over the paper
  background - that inherited shadow hits the same bug once it reaches an
  element using `background-clip: text`, so `.hl-accent .txt` explicitly
  resets it to `none`.

Also worth knowing: gradient stops must fade through an explicit transparent
color (`rgba(255,255,255,0)`), not the bare `transparent` keyword - that
keyword is black-transparent, so a white-to-transparent-to-white streak
would interpolate through a visible grey band at every sweep.

Hover transitions are 150ms.

`prefers-reduced-motion: reduce` disables every entrance animation and freezes
the shine on a static frame. Honor it for any motion added later.

## Marks

Three marks, don't mix them:
- **Product mark** (`assets/brand/mark.svg`, `site/assets/mark.svg`): the cloud
  silhouette (three overlapping circles + a base ellipse, no bounding square)
  filled with the orange→amber gradient, with a small dark 4-point spark set
  into it. Replaced an earlier rounded-square-plus-terminal-caret version that
  read too close to other dev-tool logos (Codex, etc.); this one has no
  container shape and no monospace glyph baked into the mark itself. Stands for
  the tool. Used in the hero and the favicon.
- **Wordmark**: the text `cld-flare-maxxing` (monospace) beside the product mark
  in the hero lockup, with `maxxing` in the gradient (`.gradtext`). The readable
  product name. On mobile the lockup stacks, mark on top.
- **AG mark** (`site/assets/ag-logo.svg`): the personal "AG" monogram, single
  colour via `fill="currentColor"`. Stands for the author, not the product. Sits
  white in the top-left corner of the page and links to abhiigatty.com; the
  same mark also sits in the bottom-right corner of `assets/brand/banner.svg`
  (the README header image, redesigned - see the "Banner" section below), at
  70% opacity so it reads as a quiet credit under the hero content rather than
  competing with it.

## Banner (`assets/brand/banner.svg`)

The README's wide header image. Deliberately a different visual register from the rest of
this system (site + dashboard): those two are dense, utilitarian, dark-with-orange-accent
tools; the banner is a one-shot editorial hero image, so it borrows Apple marketing-page
conventions instead - generous negative space, one soft light source, restrained typographic
color, and no dashboard-style UI chrome (grids, pill badges) inside a hero image. 1200×320,
pure SVG, no raster assets.

- **Background**: near-black `#060607` base, one soft off-center radial glow in the brand
  orange (`cx 50% cy 8%`, low opacity, wide spread - a "product spotlight" from above, not a
  flat tint), a radial vignette darkening the edges, and very faint fractal-noise grain
  (`opacity: 0.035` - a texture cue, not a visible pattern). An earlier version used a visible
  repeating dot-grid (`opacity: 0.5`) as the texture layer; dropped it as part of the
  Apple-direction redesign; see `.claude/experiences/2026-07-07-readme-banner-apple-redesign.md`.
- **Typography and color**: `-apple-system, BlinkMacSystemFont, "SF Pro Display/Text", ...`
  stack (this actually renders as San Francisco on Apple devices, matching the requested
  direction literally, not just in spirit). Three text colors, all pulled from Apple's own
  marketing-site gray scale rather than this project's `--text-dim`/`--text-faint`: wordmark
  `#f5f5f7` (off-white, not pure white), tagline `#a1a1a6`, capability caption `#6e6e73`.
- **Composition**: mark + wordmark lockup, one tagline line, one small-caps capability line
  ("SNAPSHOT · INVESTIGATE · GUARD · MAXIMIZE", `letter-spacing: 0.28em`, no boxes), all
  centered on the canvas's horizontal midline (`x: 600`). An earlier version presented the
  four capability words as four separate colored pill badges (dashboard-style chips) - same
  information, replaced with plain tracked type as part of the same redesign, since pill
  badges read as UI chrome inside what's meant to be an editorial hero image.
- **Verification**: this file has no interactive states to click through, so correctness means
  precise layout - checked with `getBBox()` through each element's actual `transform` chain
  (SVG groups report bounding boxes in local, pre-transform coordinates) rather than by eye.
  The lockup, tagline, and caption should all measure `centerX: 600` exactly; the AG mark
  should sit at a consistent margin from the bottom-right corner with no overlap against the
  caption line above it.
- **AG mark**: bottom-right corner (see Marks above for why bottom-right, not top-right or
  center).

## Components

- Brand lockup: the product mark plus the `cld-flare-maxxing` wordmark, centered
  at the top of the hero (stacks on mobile).
- Primary button: solid `--accent`, dark text (`#1a1300`), pill radius, soft
  orange shadow. One primary action per view. The hero's "Get started" button
  opens the terminal popup below.
- Footer: a thin fixed bar at the bottom. "Made with love by AbhiiGatty" (linking
  to abhiigatty.com) plus the MIT-license link on the left, social icon links on
  the right, all in `--text-faint` and lifting to `--accent` on hover.

## Terminal popup

Opened by "Get started"; closes on the button, the backdrop, or Escape. All
state lives in one IIFE at the bottom of `site/index.html`.

**The scripted part.** A `SEQ` array of `{c: class, t: html}` lines gets typed
out one at a time (`reveal()`, a recursive `setTimeout` chain - `520ms` for a
`$ cmd` line, `150ms` for a blank spacer, `300ms` for everything else),
appended as `<span class="term-line <class>">`. It walks the README's actual
quickstart (`git clone`, `cd`, `npm run setup`) into a `claude` launch, a
Claude Code startup banner, a read-only callout, then two realistic prompts
(`refresh and show me the dashboard`, `fix the SSL mode on example.com`)
ending on `Apply this? (y/n)`.

**The Claude Code banner** (`.glyph`/`.cmd`/`.dim`/`.chip` spans, three
`banner`-class lines):
```
 ▄  ▄    Claude Code  [Sonnet 5]
██████   connected to this repo
 ▀  ▀    ~/cld-flare-maxxing
```
The glyph shape went through a rebuild. An earlier version used the Unicode
quadrant-corner block characters (`▛▜▙▟▝▘▖▗`) to round the mark's corners -
it rendered visibly lopsided. Measured why with `canvas.measureText()` in
this exact font stack: full/half blocks (`█▌▐▄▀`) render at a consistent
~7.15px advance width, but the quadrant corners measured ~12.2px - JetBrains
Mono doesn't cover that Unicode block, so the browser silently substitutes a
mismatched fallback font for just those characters, breaking the monospace
grid the whole ASCII-art shape depends on. **Lesson: verify any hand-built
Unicode block-art against the actual loaded font with `measureText()` before
trusting it renders square** - "it's a standard Unicode block" doesn't mean
a given font covers it. The rebuilt glyph uses only the measured-safe
`█▄▀` set. The `.chip` badge ("Sonnet 5") and the bordered callout below
both borrow their pattern from a private reference project's "claude" terminal
widget (a live reference of a real Claude Code CLI banner), recolored to
this project's orange rather than copied at their teal.

**The read-only callout** (`.box-top`/`.box-bottom`, a floating label cut
into the top border, like a fieldset legend):
```
┌─ READ-ONLY ──────────────────────────────┐
│ Nothing changes until you approve it...  │
└───────────────────────────────────────────┘
  npm run refresh · npm run diff
```
Built from two stacked `.term-line`s rather than one bordered block, since
each line is still typed in independently by `reveal()`: `.box-top` supplies
the label plus the top/left/right border and top corner radius, `.box-bottom`
supplies the content plus the bottom/left/right border and bottom corner
radius. Any future multi-line bordered box in this popup should follow the
same two-line (or N-line, with only the first and last carrying the
end-cap borders) split.

**The live `y`/`n` reply.** After the last scripted line
(`Apply this? (y/n)`), `promptYesNo()` renders a real `<input>` inline,
styled to inherit the surrounding `.prompt` line's font so it reads as typed
shell text, not a web form. On Enter: `y`/`yes`/`yeah`/`yup`/`yep`/`sure`/
`ok`/`okay` accept, `n`/`no`/`nope`/`nah`/`negative`/`never` decline, anything
else gets a `dim` nudge and reprompts. Accepting animates a text-mode
progress bar (`█`/`░` characters, filled via `setInterval`) to a success
line; declining is framed as the tool working as designed ("Cancelled -
exactly the point"), not an error, matching the product's actual pitch
("changes nothing until you say so").

**Links and the intro comment.** The transcript's first line is a `#`-prefixed
shell comment (`.comment`, editor-green `#6a9955`) pointing at the GitHub
repo; the `git clone` URL and the README link inside the callout are real
`<a>` tags, colored `--accent-2` (blue) at rest - a distinct color, not just
on hover, matching how a real terminal renders hyperlinks - brightening to
`--accent` on hover like every other link on the page.

**Traffic-light dots** carry a `box-shadow` glow matching each dot's own
color (`0 0 6px rgba(<r,g,b>,0.5-0.55)`), not flat circles. The reference
terminal used the same structural treatment.

## Layout and accessibility

- Single viewport: the hero is `height: 100dvh` and never scrolls on desktop or
  mobile. One breakpoint at `560px` stacks the CTAs, stacks the footer, and drops
  the longer credit line.
- Focus: visible `--accent-2` focus ring on interactive elements
  (`:focus-visible`), never removed. Footer links carry `aria-label`s.
- Decorative-only elements (`.paper`, `.unicorn-bg`, `.paper-grain`, the hero
  mark) are `aria-hidden="true"` so screen readers skip them.
- Layering: paper, the animated background, and the grain all share
  `z-index: 0` (DOM order decides paint order among them), `main` content at
  `2` (its own stacking context, with the `main::before` vignette at `-1`
  inside it), the footer and AG corner at `3/4`, the terminal popup at `50`.
  `main` also needs `overflow: hidden` so the vignette's oversized
  negative-inset box (`-10% -6%`, to feather past the edges) doesn't add
  scroll.
- `prefers-reduced-motion: reduce` hides `.unicorn-bg` entirely (falls back to
  the flat `.paper` gradient) in addition to disabling the hero's entrance
  animations and freezing the headline shine.
