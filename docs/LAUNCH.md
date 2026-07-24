# Launch runbook: making this repo public

One-time checklist for taking the GitHub repo from private to public. Most of it exists
because of one fact: **merged PR diffs keep old commits reachable on GitHub independent of
branch history.** This repo's history was reset to a single pseudonymized commit on
2026-07-08, but PRs merged before that day (e.g. PR #4) still serve diffs containing real
account data. Deleting and recreating the repo is the only way to purge them — GitHub has
no per-PR delete.

## Step 1 — back up the reversal keys (before anything else)

Copy these two somewhere private and durable (password manager, encrypted drive):
- `secrets/alias-map.json` (the alias vault)
- the `CF_ALIAS_SALT=` line from `.env`

Losing both makes committed aliases permanently unresolvable. Neither ever goes in git.

## Step 2 — delete and recreate the GitHub repo

```bash
# capture what repo-level state exists (secrets are write-only; note their names)
gh secret list
gh repo view --json description,homepageUrl

# delete (asks for confirmation) and recreate under the same name
gh repo delete AbhiiGatty/cld-flare-maxxing --yes
gh repo create AbhiiGatty/cld-flare-maxxing --private \
  --description "The AI agent manager that runs your Cloudflare account for you" \
  --homepage "https://cld-flare-maxxing.abhiigatty.com"

git remote set-url origin https://github.com/AbhiiGatty/cld-flare-maxxing.git
git push -u origin main
```

Recreate private first; flipping to public is step 6, after verification.

## Step 3 — restore repo-level state (lost with the old repo)

```bash
# Actions secrets for the daily snapshot workflow
gh secret set CF_READ_TOKEN     # read-only token
gh secret set CF_ACCOUNT_ID     # account id — keep it out of files, secret only
gh secret set CF_ALIAS_SALT     # same value as local .env, so CI aliases match yours

# topics
gh repo edit --add-topic cloudflare --add-topic ai-agent --add-topic claude-code \
  --add-topic security-audit --add-topic devops --add-topic dns
```

Then in the web UI: enable private vulnerability reporting (Settings → Code security),
confirm the default branch, and re-run the `daily-snapshot` workflow once manually
(Actions tab) to prove the secrets work.

## Step 4 — final leak lint

```bash
# nothing real in the tracked tree: your email, account id, zone ids, raw domains
git grep -Il "" | xargs grep -l -i -E "<your-email>|<account-id>|<zone-id>" || echo clean
```

Also spot-open one `snapshot.public.json` and confirm ids read as `zone_…`/`account_…`
aliases. The full category list to check is in `docs/SHARING.md`.

## Step 5 — fresh-clone test

Clone to a temp dir, `npm run dashboard:build && npm run dashboard` — the sample dashboard
must render with no `.env` present. That is a stranger's first experience of the repo.

## Step 6 — flip public

```bash
gh repo edit --visibility public
```

Then: pin the repo on the GitHub profile, confirm the README banner and OG card render on
the repo page and on one shared link (paste the site URL into a social post preview).

## Non-git assets that ride along

- `site/assets/og-card.png` + the `og:`/`twitter:` meta tags in `site/index.html` — link
  previews. Redeploy the site (break-glass Pages deploy) before the launch posts go out so
  the live site serves them.
- Demo GIF for the README top — recorded manually, added when available.
