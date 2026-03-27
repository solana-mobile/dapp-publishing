
# dApp Publishing CLI

Portal-backed CLI for Solana Mobile dApp version publishing.

The legacy config-driven `init`, `create`, `validate`, and direct
`publish submit|update|remove|support` flows are no longer part of the active
CLI surface. The supported entrypoints are:

```bash
dapp-store --new-version --apk-file ./app.apk --whats-new "Bug fixes"
dapp-store --new-version --apk-url https://example.com/app.apk --whats-new "Bug fixes"
dapp-store resume --release-id <release-id>
```

Secrets and local development:

```bash
# API key from env
export DAPP_STORE_API_KEY=...
export DAPP_STORE_PORTAL_URL=https://staging.publish.solanamobile.com

# If DAPP_STORE_PORTAL_URL is omitted, the CLI defaults to:
# https://publish.solanamobile.com

# Or read the API key from stdin
printf '%s' "$DAPP_STORE_API_KEY" | dapp-store --new-version ...

# Local portal development
dapp-store --new-version \
  --local-dev \
  --skip-self-update \
  --portal-url http://localhost:3333
```

The CLI expects a signer keypair path and a portal API key. For
`new-version`, the target app is inferred from the APK package name by the
portal. That same portal flow handles both the first release for an existing
portal app and later updates; the CLI does not need a separate mode for
those cases. The app itself must already exist in the portal and already
have its App NFT. Resume accepts either `--release-id` or `--session-id`;
release id resumes are resolved through the portal. The active publication workflow only
needs the portal base URL; the CLI derives the `/api` endpoint from
`DAPP_STORE_PORTAL_URL` or `--portal-url`. If no portal URL is provided, it
defaults to `https://publish.solanamobile.com`. Solana RPC submission is
handled by the portal backend, so the publication workflow does not require a
separate RPC URL. Local-dev mode still rejects non-local portal endpoints and
skips self-update gating only when `--local-dev` is explicitly provided.

This means you do not need to pass a dApp id for version publications. The
portal extracts the APK metadata, matches the Android package name to the
existing app, and creates the next release for that app. Resume does not re-detect
the app from the APK; it continues from the existing release or publication
session you specify.
