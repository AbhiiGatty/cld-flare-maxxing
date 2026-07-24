# Use with Claude Code or Codex

Install the plugin once, then use it from any project. The project does not need Cloudflare
packages, a copy of this repository, or changes to its existing `.env`.

## Claude Code

Add this repository as a marketplace and install the plugin:

```text
/plugin marketplace add AbhiiGatty/cld-flare-maxxing
/plugin install cld-flare-maxxing@cld-flare-maxxing
```

The terminal equivalents are:

```bash
claude plugin marketplace add AbhiiGatty/cld-flare-maxxing
claude plugin install cld-flare-maxxing@cld-flare-maxxing --scope user
```

Claude Code loads the bundled skill, three Cloudflare agents, and the safety hook. The hook
blocks ad-hoc Cloudflare writes and recursive deletion of this tool's saved state. It does
not intercept normal edits to the host project.

For local plugin development:

```bash
claude --plugin-dir ./plugins/cld-flare-maxxing
```

## Codex

```bash
codex plugin marketplace add AbhiiGatty/cld-flare-maxxing
codex plugin add cld-flare-maxxing@cld-flare-maxxing
```

Codex loads the bundled skill and agent roles from the same package.

## First prompt

Open the project where you want to use Cloudflare Maxxing and say:

> Use cloudflare-maxxing to set up read-only Cloudflare access for this project. Do not
> create an edit token. Then refresh my account and explain the highest-priority findings.

The agent should:

1. Create `<project>/.cloudflare-maxxing/`.
2. Create `.cloudflare-maxxing/.env.cloudflare` from the bundled template.
3. Guide you to Cloudflare's **Read all resources** token template.
4. Ask you to save the value locally as `CF_READ_TOKEN`, never paste it into chat.
5. Verify the token, take a snapshot, and generate a report.
6. Open the dashboard only when you ask.

The nested `.gitignore` excludes everything in `.cloudflare-maxxing/` by default.

## Skill-only install

Copy the complete directory at:

```text
plugins/cld-flare-maxxing/skills/cloudflare-maxxing/
```

to one of:

```text
<project>/.claude/skills/cloudflare-maxxing/
<project>/.agents/skills/cloudflare-maxxing/
```

Do not copy only `SKILL.md`. Its `scripts/` directory contains the portable runner and
runtime, while `references/` contains the product and safety guidance.

The skill-only install can run the full read-only workflow and guarded actions. The plugin is
recommended because it also supplies automatic updates, specialist agents, and Claude's
command tripwire.

## Direct runner commands

Resolve `scripts/cf-maxxing.mjs` relative to the installed skill, then run:

```bash
node "<skill-path>/scripts/cf-maxxing.mjs" init
node "<skill-path>/scripts/cf-maxxing.mjs" setup
node "<skill-path>/scripts/cf-maxxing.mjs" refresh
node "<skill-path>/scripts/cf-maxxing.mjs" dashboard
node "<skill-path>/scripts/cf-maxxing.mjs" where
```

The current working directory is the host project. Use
`--project=<absolute-or-relative-path>` only when targeting another project.

Routine commands use Node.js built-ins and do not install dependencies. The dashboard command
copies its bundled source to `.cloudflare-maxxing/dashboard/` and installs locked packages
there.

## Boundaries

- No command reads or modifies the host project's generic `.env`.
- No command adds packages to the host project's package manifest.
- No command deploys the host project.
- Installed plugin and skill files are treated as read-only.
- Cloudflare mutations still require a separate edit token, a dry run, approval, and
  break-glass.

See [token setup](TOKEN-SETUP.md) and [safety](SAFETY.md).
