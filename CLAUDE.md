# Claude Code layer

@AGENTS.md

`AGENTS.md` is the authoritative operating contract for this repository. Follow it before
the Claude-specific additions below. Keeping the shared contract in one file avoids loading
two copies of the same safety and workflow rules.

## What Claude Code discovers here

- `.claude/skills/cloudflare-maxxing/` teaches Cloudflare product selection, free-tier
  choices, and account-aware recommendations.
- `.claude/commands/cf-refresh.md` provides the read-only `/cf-refresh` workflow.
- `.claude/agents/` contains the investigator, optimizer, and architect profiles.
- `.claude/settings.json` defines the read/action permission split and the tripwire hook.
- `.claude/hooks/guard.mjs` blocks obvious ad-hoc destructive commands and protects saved
  state.

Use the `cloudflare-maxxing` skill for Cloudflare education and product recommendations. Use
the investigator for current account state, the optimizer for missed value, and the architect
for new Cloudflare designs.

## Optional MCP access

`.mcp.json` contains only Cloudflare's API Code Mode server and documentation server. Both are
optional. The normal snapshot, report, diff, and dashboard workflow uses `CF_READ_TOKEN`
through the local scripts and does not require MCP or OAuth.

Treat Cloudflare API MCP calls as read-only. Route every real account change through
`scripts/actions/*`, the dry run, human confirmation, and break-glass required by
`AGENTS.md`.

## No website side effects

The static `site/` folder is the project's public introduction. Opening this repository,
loading its skills, running setup, refreshing the account, generating reports, running tests,
or opening the dashboard never builds or deploys the website. Only the explicitly approved
`scripts/actions/pages-deploy-site.mjs --commit` path can publish it.

## Communication style: Simplified Technical English

Communicate with the user in ASD-STE100 Simplified Technical English by
default. In chat replies, explanations, reports, and summaries:

- Write short sentences. Keep instructions to 20 words or fewer and
  descriptions to 25 words or fewer.
- Give one instruction per sentence. Use the active voice.
- Use one word for one meaning. Do not switch synonyms for variety.
- Use simple words. Prefer "start" over "initiate", "use" over "utilize",
  "show" over "demonstrate".
- Use articles (a, an, the) where grammar needs them.
- Keep paragraphs to one topic, six sentences or fewer.

Scope: this governs how Claude talks to the user in this repo. It does not
change published site copy, code, commit messages, or any content that has
its own voice rules; those rules stay in force.
