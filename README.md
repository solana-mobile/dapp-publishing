
# dApp Publishing CLI

Portal-backed CLI for Solana Mobile dApp version publishing.

The legacy config-driven `init`, `create`, `validate`, and direct
`publish submit|update|remove|support` flows are no longer part of the active
CLI surface. The supported entrypoints are:

```bash
dapp-store --apk-file ./app.apk --whats-new "Bug fixes"
dapp-store --apk-url https://example.com/app.apk --whats-new "Bug fixes"
```

Api key:
Can be obtained from https://publish.solanamobile.com/dashboard/settings/api-keys



```bash
# API key from env
export DAPP_STORE_API_KEY=...
# Or read the API key from stdin
printf '%s' "$DAPP_STORE_API_KEY" | dapp-store ...

```

The CLI expects a signer keypair path and a portal API key. For
the default publish flow, the target app is inferred from the APK package name by the
portal. That same portal flow handles both the first release for an existing
portal app and later updates; the CLI does not need a separate mode for
those cases. The app itself must already exist in the portal and already
have its App NFT. Solana RPC submission is
handled by the portal backend, so the publication workflow does not require a
separate RPC URL.

This means you do not need to pass a dApp id for version publications. The
portal extracts the APK metadata, matches the Android package name to the
existing app, and creates the next release for that app.