<p align="center">
  <img src="assets/brand/banner.svg" alt="cld-flare-maxxing: the AI agent that runs your Cloudflare account for you" width="100%">
</p>

# cld-flare-maxxing

**Talk to Cloudflare from any project.** This plugin gives Claude Code or Codex a read-first
Cloudflare control center. It snapshots your account, flags misconfigurations, explains what
changed, recommends useful Cloudflare products, and runs only the changes you approve.

The portable package keeps its credentials, snapshots, reports, dashboard, and dependencies
inside `.cloudflare-maxxing/` in the project where you use it. It does not use that project's
`.env`, package manifest, source tree, or deployment setup.

Live introduction: [cld-flare-maxxing.abhiigatty.com](https://cld-flare-maxxing.abhiigatty.com)

## Install

You need Git and Node.js 20.19+ or 22.12+.

### Claude Code

Run these inside Claude Code:

```text
/plugin marketplace add AbhiiGatty/cld-flare-maxxing
/plugin install cld-flare-maxxing@cld-flare-maxxing
```

Or use the terminal:

```bash
claude plugin marketplace add AbhiiGatty/cld-flare-maxxing
claude plugin install cld-flare-maxxing@cld-flare-maxxing --scope user
```

### Codex

```bash
codex plugin marketplace add AbhiiGatty/cld-flare-maxxing
codex plugin add cld-flare-maxxing@cld-flare-maxxing
```

Now open any project and say:

> Use cloudflare-maxxing to set up read-only Cloudflare access for this project. Do not
> create an edit token. Then check my account and explain the highest-priority findings.

The agent creates only:

```text
<your-project>/.cloudflare-maxxing/
```

It will guide you through creating Cloudflare's **Read all resources** token and ask you to
save it locally in `.cloudflare-maxxing/.env.cloudflare`. Never paste a token into chat.

### Skill-only install

The complete skill directory is self-contained:

```text
plugins/cld-flare-maxxing/skills/cloudflare-maxxing/
```

Copy that whole directory to either:

```text
<your-project>/.claude/skills/cloudflare-maxxing/
<your-project>/.agents/skills/cloudflare-maxxing/
```

The skill-only install includes snapshots, reports, recommendations, the dashboard, and
guarded action scripts. The plugin adds Claude hooks, specialist agents, and marketplace
updates around the same skill.

See [the Claude and Codex guide](docs/USING-WITH-CLAUDE-AND-CODEX.md) for local-development
installs and exact command behavior.

## What it does

- Captures account, zone, DNS, WAF, SSL, Pages, Workers, storage, and audit-log state.
- Runs 61 checks and turns them into prioritized findings.
- Diffs snapshots and attributes changes from Cloudflare's audit log.
- Scores useful Cloudflare features against the account's current stack and limits.
- Builds a local dashboard on demand.
- Runs an allowlisted Cloudflare action in dry-run mode before any real change.

Every snapshot has a raw local copy and a pseudonymized public copy. Real ids, domains, names,
emails, and IPs are replaced with stable aliases. Tokens and the local alias vault never
enter the public copy. See [sharing and pseudonymization](docs/SHARING.md).

## Two-token safety model

Routine work uses one read-only token:

```text
.cloudflare-maxxing/.env.cloudflare
CF_READ_TOKEN=...
```

A separate edit token is optional and should exist only for a specific approved change:

```text
.cloudflare-maxxing/.env.cloudflare.break-glass
CF_EDIT_TOKEN=...
CF_ALLOW_DESTRUCTIVE=YES_I_AM_SURE
```

Changes are allowlisted, dry-run by default, require explicit approval before `--commit`, and
write an audit record locally. The plugin's Claude hook also blocks ad-hoc Cloudflare writes
and recursive deletion of saved `.cloudflare-maxxing/` state. The host project's generic
`.env` is never read.

Read [token setup](docs/TOKEN-SETUP.md) and [the safety model](docs/SAFETY.md) before making a
change.

## Common requests

Ask in plain language:

```text
Check my Cloudflare account and tell me what is misconfigured.
Who changed this DNS record?
What am I paying for but not using?
Which Cloudflare products could replace parts of this stack?
Show me the local dashboard.
Dry-run adding this DNS record. Do not commit it.
```

The bundled runner also supports direct use:

```bash
node "<skill-path>/scripts/cf-maxxing.mjs" init
node "<skill-path>/scripts/cf-maxxing.mjs" setup
node "<skill-path>/scripts/cf-maxxing.mjs" refresh
node "<skill-path>/scripts/cf-maxxing.mjs" dashboard
node "<skill-path>/scripts/cf-maxxing.mjs" diff
```

Use `where` to print the selected host project, state directory, and bundled runtime.

## Contributing

This repository is the source and test harness for the portable package. A normal user does
not need to clone it. Contributors can run:

```bash
git clone https://github.com/AbhiiGatty/cld-flare-maxxing.git
cd cld-flare-maxxing
npm test
npm run dashboard:build
```

Repository-maintainer scripts retain the original root workflow and local state layout.
Plugin users get the isolated `.cloudflare-maxxing/` layout described above.

Read [CONTRIBUTING.md](CONTRIBUTING.md), [the architecture](docs/ARCHITECTURE.md), and the
[release process](docs/RELEASING.md). Report security problems through
[SECURITY.md](SECURITY.md).

## License

MIT, see [LICENSE](LICENSE).
