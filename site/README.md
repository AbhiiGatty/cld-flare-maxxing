# site/

The public landing page, live at [cld-flare-maxxing.abhiigatty.com](https://cld-flare-maxxing.abhiigatty.com).
A single self-contained static HTML file, no build step and no framework, so it deploys
unchanged via `scripts/actions/pages-deploy-site.mjs`.

| Path | What it is |
|---|---|
| `index.html` | the whole page: hero, brand lockup, the animated background, the "Get started" terminal popup, and the footer |
| `assets/` | the page's own local images and one vendored script (favicon, corner mark, the Unicorn Studio SDK), see `assets/README.md` |

See `docs/DESIGN-SYSTEM.md` for the full breakdown of the palette, type, the
animated background, and the terminal popup. Deploy with:
```bash
CF_ALLOW_DESTRUCTIVE=YES_I_AM_SURE node scripts/actions/pages-deploy-site.mjs --commit
```
