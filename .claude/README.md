# .claude/

Claude-Code-specific configuration for this repo: the permission tiers and tripwire hook that
enforce the safety model, plus the skill, agents, and slash commands that make Claude useful
here beyond just running scripts. Other AI coding agents follow `AGENTS.md` at the repo root
instead; this folder is the Claude Code layer on top of that.

| Path | What it is |
|---|---|
| `settings.json` | permission tiers (`allow`/`ask`) and the `PreToolUse` tripwire hook wiring |
| `settings.local.json` | local overrides, gitignored |
| `launch.json` | dev-server configs for the `preview_start` tooling (dashboard, site) |
| `agents/` | the `cf-investigator`, `cf-optimizer`, `cf-architect` agent definitions |
| `commands/` | slash commands (`/cf-investigate`, `/cf-refresh`) |
| `hooks/` | the tripwire hook script itself (`guard.mjs`) |
| `skills/` | the `cloudflare-maxxing` skill (use-case map, platform map, beta advisor) |

See `docs/SAFETY.md` for how the permission tiers and the hook fit into the three-layer
defense model, and `CLAUDE.md` for the full operating contract.
