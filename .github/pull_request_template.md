## What changed

Describe the problem and the change in plain language.

## Safety

- [ ] I did not add tokens, raw snapshots, the alias vault, real account identifiers, or private email addresses.
- [ ] Read-only behavior still uses `CF_READ_TOKEN`.
- [ ] Any mutation still goes through a guarded action, defaults to dry-run, and requires break-glass.
- [ ] I reviewed generated public snapshots if pseudonymization changed.

## Verification

List the commands you ran and their results.

- [ ] `npm test`
- [ ] `npm run dashboard:build` when dashboard or generated data changed
- [ ] `npm audit`

## Documentation

- [ ] I updated user-facing docs or the changelog when behavior changed.
- [ ] I added an experience entry if this changes architecture, the safety model, or a settled design decision.
