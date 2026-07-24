# Safety model

Use one read token for routine work and an optional edit token for one approved change.

## Read token

Store `CF_READ_TOKEN` only in:

```text
<host-project>/.cloudflare-maxxing/.env.cloudflare
```

Use Cloudflare's **Read all resources** API-token template. The setup, snapshot, report, diff,
beta, and dashboard commands load only this file.

## Edit token

Store `CF_EDIT_TOKEN` only in:

```text
<host-project>/.cloudflare-maxxing/.env.cloudflare.break-glass
```

Create it only after the user chooses a specific change. Scope it to the affected account,
zone, and permissions. Delete the file after the change when practical.

Every bundled mutation:

1. Runs as a dry-run by default using the read token.
2. Prints the exact target and planned change.
3. Requires the user to approve that plan.
4. Requires `CF_ALLOW_DESTRUCTIVE=YES_I_AM_SURE`.
5. Requires `--commit`.
6. Writes an audit record under `.cloudflare-maxxing/reports/`.

Never use ad-hoc Cloudflare `DELETE`, `PATCH`, `PUT`, POST, Wrangler mutation, or Code Mode MCP
execution to bypass the guarded action scripts.
