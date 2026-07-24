# site/

The public landing page, live at [cld-flare-maxxing.abhiigatty.com](https://cld-flare-maxxing.abhiigatty.com).
A single self-contained static HTML file, no build step and no framework, so it deploys
unchanged via `scripts/actions/pages-deploy-site.mjs`.

This folder is maintainer-facing. It is not imported by the skills, snapshot scripts, reports,
tests, or dashboard. Cloning or using this repository never builds or deploys the site.

| Path | What it is |
|---|---|
| `index.html` | the whole page: hero, brand lockup, the animated background, the "Get started" terminal popup, and the footer |
| `assets/` | the page's own local images and one vendored script (favicon, corner mark, the Unicorn Studio SDK), see `assets/README.md` |

See `docs/DESIGN-SYSTEM.md` for the full breakdown of the palette, type, the
animated background, and the terminal popup. A maintainer deploys it only after reviewing the
action's dry run and arming break-glass:
```bash
node scripts/actions/pages-deploy-site.mjs
# After approval and arming .env.break-glass:
node scripts/actions/pages-deploy-site.mjs --commit
```
