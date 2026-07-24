# Self-written docs broke this repo's own writing-style rule

**What:** After writing a batch of doc updates (`CLAUDE.md`, `README.md`,
`docs/CHANGELOG.md`) for the Cloudflare primary-MCP-server integration, went back and grepped
those same files for violations of this repo's own explicit writing-style rule (no em dash as
a comma/period substitute). Found 7. Fixed them in a follow-up commit.

**Why:** Asked directly whether the docs matched "the current repo architecture and standards
we have set" - a prompt to verify, not just assert, compliance. Grepping the actual diff
(`git show <commit> | grep '^+' | grep ' — '`) found real violations that a first read-through
had missed while focused on technical accuracy.

**Outcome:** Fixed in a separate, small follow-up PR rather than amending the original commit,
since the original had already been merged.

**Lesson:** Writing new content "in the style of" an existing file is not the same as
checking new content against that file's *explicit written rules* - it's easy to match the
existing prose's rhythm while still breaking a rule the existing prose itself doesn't
consistently follow (this repo's older content has pre-existing em dashes too, likely
predating the rule). When a repo has an explicit style guide, grep new writing against its
specific banned patterns before considering it done, rather than trusting a stylistic
impression. This is generalizable to any written-rule checklist a repo maintains, not just
this one rule.
