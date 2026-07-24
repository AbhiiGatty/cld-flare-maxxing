# Releasing

This project uses manual, checklist-driven releases. No CI automation tags or publishes
without a human running the steps.

## Checklist

1. Land all changes for the release through the normal branch, PR, and merge flow.
2. On the release branch, bump the version in `package.json` and
   `dashboard/package.json` using semantic versioning.
3. Add a new top entry to `docs/CHANGELOG.md` in this format:
   `## vX.Y.Z - YYYY-MM-DD - <one-line summary>`.
4. Put the version and changelog changes in the same release PR. Do not push them directly to
   `main`.
5. After that PR merges, update local `main`, create an annotated tag, and push only that tag:

   ```bash
   git switch main
   git pull --ff-only
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

6. Copy the matching changelog section into a temporary `release-notes.md`, then publish the
   GitHub Release:

   ```bash
   gh release create vX.Y.Z --verify-tag --title "vX.Y.Z" --notes-file release-notes.md
   ```

7. Verify the release and its source archive:

   ```bash
   gh release view vX.Y.Z
   ```

The temporary notes file must stay outside the repository or be removed before the next
commit.

## Versioning

Semantic versioning applies to the tool's behavior, not the Cloudflare account it manages:

- Major: a breaking change to the snapshot schema or action-script interface, or a change
  that requires running setup again.
- Minor: new checks, guarded actions, dashboard panels, skills, or agents.
- Patch: compatible bug fixes, documentation changes, and dependency updates.
