# Make the skill the product

**What:** Replaced the clone-first, repository-scoped install with a self-contained skill and
Claude Code and Codex plugin package that can run inside any host project.

**Why:** The previous public-release pass treated the repository as the control center and a
copied skill as guidance only. That contradicted the intended use. A host project should gain
the Cloudflare workflow without adopting this repository's root env files, dependencies, or
website.

**The why, as given:** The owner said, "I wanted this to be more like a skill file and so on
and env was Cloudflare specific so that this can go sit in any project like a Claude plugin
and skill file with scripts and so on."

**Outcome:** The canonical package now lives at `plugins/cld-flare-maxxing/`. The complete
skill contains its runner and runtime, while plugin manifests add agents and Claude hooks.
Portable state is isolated under `<host-project>/.cloudflare-maxxing/`; the host project's
generic `.env`, package manifest, source, and deployment stay untouched. The repository root
remains the development and release harness.

**Lesson:** If a skill is the delivery unit, its runtime cannot depend on the source
repository. Bundle the executable parts with the skill and keep mutable state outside the
installed package.
