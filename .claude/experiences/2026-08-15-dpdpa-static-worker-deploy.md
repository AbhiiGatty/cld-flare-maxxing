# Fixed-target DPDPA Worker deployment

**What:** Added a guarded repository action for the DPDPA landing that deploys only static
assets to one named Worker and one Custom Domain.

**Why:** The DPDPA landing lives in another repository and needs a same-day Cloudflare release,
but an ad-hoc Wrangler write would bypass Maxxing's audit and break-glass controls. A general
cross-repository deploy action would expose more mutation scope than this release needs.

**The why, as given:** Release the private DPDPA skill today on
`dpdpa.gattyworks.com`, while keeping the skill source private and using the Cloudflare Maxxing
path for the live change.

**Outcome:** The action accepts an absolute source path, then pins the live target to Worker
`gattyworks-dpdpa` and Custom Domain `dpdpa.gattyworks.com`. It rejects executable Worker code,
extra bindings or routes, a different asset directory, and symbolic links. Locked dependency
verification and a Wrangler dry run happen before the edit token is loaded. The live commit
still needs a reviewed dry run, explicit approval, and armed break-glass.
