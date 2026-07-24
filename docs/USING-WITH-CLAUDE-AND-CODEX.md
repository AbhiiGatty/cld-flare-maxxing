# Use with Claude Code or Codex

The simplest install is a clone. Open the repository as the agent's working folder. Claude
Code and Codex then discover the included project skill without a marketplace install.

## One prompt setup

Start Claude Code or Codex from the repository root and say:

> Set up read-only Cloudflare access. Do not create an edit token. Then refresh and show me
> the dashboard.

The agent should:

1. Copy `.env.example` to the gitignored `.env`.
2. Walk you through Cloudflare's **Read all resources** API-token template.
3. Ask you to add that value as `CF_READ_TOKEN` locally.
4. Run `npm run setup`, then `npm run refresh`.
5. Run `npm run dashboard` only when you ask to view the dashboard.

The read-only scripts use Node.js built-ins. They do not need `npm install`. The dashboard
installs its own locked packages when it starts.

## What each agent loads

Claude Code reads `CLAUDE.md`, the shared `AGENTS.md` contract, and
`.claude/skills/cloudflare-maxxing/`.

Codex reads `AGENTS.md` and `.agents/skills/cloudflare-maxxing/`.

Both copies of the skill have the same instructions and reference files. The extra
Claude-specific folder contains its permission rules, agents, and tripwire hook.

## Optional parts

- `CF_EDIT_TOKEN` is not part of setup. Create it only for a specific approved change.
- Cloudflare MCP access is optional. Normal snapshots and reports use `CF_READ_TOKEN`.
- The public `site/` folder is maintainer-facing. No user command builds or deploys it.
- Root `npm ci` installs the pinned Wrangler used by guarded deployment actions. Routine
  read-only use does not need it.

## Copying only the skill

You can copy the `cloudflare-maxxing` skill directory into another project if you only want
Cloudflare product and architecture guidance. The full control center still needs this
repository because snapshots, reports, the dashboard, safety hooks, and action scripts live
here.

See [token setup](TOKEN-SETUP.md) for the read-token steps and [safety](SAFETY.md) before
making any account change.
