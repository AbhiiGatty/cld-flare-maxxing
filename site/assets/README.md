# site/assets/

Local images (and one vendored script) for `site/index.html`, kept in a self-contained folder
so the whole `site/` directory deploys as one static bundle with no external asset dependencies
beyond the two Google Fonts.

| File | What it is |
|---|---|
| `unicorn-studio-sdk.js` | vendored copy of the Unicorn Studio embed SDK (~246KB, ~46KB gzipped), extracted from the `unicornstudio-react` npm package's own bundled build (`dashboard/node_modules/unicornstudio-react/dist/index.js`, the `BUNDLED_UNICORN_SDK.scripts` core entry). Self-hosted rather than pulled from a third-party CDN, since there's no documented default CDN URL for it - only a custom `sdkUrl` override, which this repo doesn't use. Drives the animated background on the hero (`.unicorn-bg` in `site/index.html`). To update: bump `unicornstudio-react` in `dashboard/`, re-extract the same way. |

<table>
<tr><td align="center" width="50%">

<img src="mark.svg" width="72" alt="mark.svg preview">
<br><code>mark.svg</code><br>
<sub>the favicon (linked from `&lt;head&gt;`) and the same mark used inline in the hero</sub>

</td><td align="center" width="50%">

<img src="ag-logo.svg" width="90" alt="ag-logo.svg preview">
<br><code>ag-logo.svg</code><br>
<sub>the author's "AG" monogram (single colour, <code>fill="currentColor"</code>), rendered white in the page's top-left corner, links to abhiigatty.com</sub>

</td></tr>
</table>
