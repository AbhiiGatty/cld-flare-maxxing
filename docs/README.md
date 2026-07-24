# docs/

The written half of the operating contract: how the repo works, how to stay safe, and how to
extend it. `CLAUDE.md`/`AGENTS.md` at the repo root are the rules; these are the reference.

| File | What it covers |
|---|---|
| `ARCHITECTURE.md` | the data-flow diagram and file map, start here to understand how a snapshot becomes a dashboard |
| `SAFETY.md` | the three-layer defense model and the break-glass protocol for making a real change |
| `TOKEN-SETUP.md` | exact steps and permission scopes for creating `CF_READ_TOKEN` and `CF_EDIT_TOKEN` |
| `USING-WITH-CLAUDE-AND-CODEX.md` | one-prompt setup, skill discovery, and which optional parts can be skipped |
| `SHARING.md` | what's safe to share publicly vs. what stays in your private repo |
| `PUBLIC-LAUNCH-CHECKLIST.md` | verified blockers and repository, release, site, and visibility checks before going public |
| `RELEASING.md` | the version-bump/tag/release checklist |
| `DESIGN-SYSTEM.md` | the visual language shared by the dashboard and the landing page: palette, type, the terminal popup |
| `SPONSORS-SETUP.md` | copy-paste-ready GitHub Sponsors tier content, for once that profile is manually enrolled |
| `CHANGELOG.md` | dated log of operator work on this repo, shipped via PR |

For *why* a decision was made rather than what shipped, including for anything later undone,
see `.claude/experiences/` (not under `docs/`, but read it before any key decision on this
repo - see "Experience log" in `CLAUDE.md`/`AGENTS.md`).
