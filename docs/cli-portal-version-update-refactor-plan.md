# CLI Portal Version-Update Refactor Plan

Date: 2026-03-25

## Goal

Refactor the legacy CLI into a thin, update-only client that uses the
developer-portal backend as the source of truth for release creation,
validation, upload orchestration, and HubSpot submission, while keeping NFT
mint transaction signing and attestation generation in the CLI.

## Scope

- In scope:
  - Existing app APK updates only.
  - CLI authentication via portal-provisioned API key.
  - Portal-owned upload flow with Cloudflare R2 as the default provider.
  - Optional custom APK URL ingestion with strict URL/file validation.
  - Automatic release NFT minting, collection verification, attestation
    generation, and release submission from the CLI.
  - Removal of legacy CLI config files, direct HubSpot posting, devnet upload
    support, and dead code.
- Out of scope:
  - New app submission from the CLI.
  - App NFT minting from the CLI.
  - Moving private keys or transaction signing into the portal.
  - Changing attestation semantics.

## Current-State Findings

### CLI repo

1. The current CLI is config-file driven. The main command tree in
   `packages/cli/src/CliSetup.ts` depends on `config.yaml`,
   `packages/cli/src/config/PublishDetails.ts`, scaffolding, and stored
   address state.
2. The current CLI still supports:
   - `init`
   - `create app`
   - `create release`
   - `validate`
   - `publish submit`
   - `publish update`
   - `publish remove`
   - `publish support`
3. Direct publisher-portal submission still happens from the CLI core package
   by POSTing HubSpot forms directly:
   - `packages/core/src/publish/PublishCoreSubmit.ts`
   - `packages/core/src/publish/PublishCoreUpdate.ts`
   - `packages/core/src/publish/PublishCoreSupport.ts`
   - `packages/core/src/publish/dapp_publisher_portal.ts`
4. Legacy storage code is still built around Turbo/ArDrive and optional BYOK
   S3 plus local asset-manifest JSON files:
   - `packages/cli/src/upload/TurboStorageDriver.ts`
   - `packages/cli/src/upload/CachedStorageDriver.ts`
   - `packages/cli/src/config/EnvVariables.ts`
   - `packages/cli/src/config/S3StorageManager.ts`
5. Devnet is still baked into CLI defaults and tests:
   - `packages/cli/src/CliUtils.ts`
   - `packages/cli/src/upload/contentGateway.ts`
   - `packages/cli/src/upload/__tests__/*`
6. The current release mint path in `packages/core/src/create/ReleaseCore.ts`
   assumes local release metadata, local media files, and a full publishing
   config. That does not fit an update-only CLI that only receives an APK and a
   `what's new` string.

### Publishing portal repo

1. The portal already owns the authoritative release record, processing queue,
   HubSpot submission, and NFT persistence path:
   - `api/src/lib/createRelease.ts`
   - `api/src/modules/apk-processing-queue/apk-processing.processor.ts`
   - `api/src/lib/submitReleaseToStore.ts`
   - `api/src/lib/hubspot/createReleaseTicket.ts`
   - `api/src/lib/prepareReleaseNftTransaction.ts`
   - `api/src/lib/saveReleaseNftData.ts`
   - `api/src/lib/submitNftTransaction.ts`
2. Cloudflare R2 is already the default upload provider in the portal:
   - `api/src/dto/UserPreferences.ts`
   - `api/src/lib/generateR2UploadUrl.ts`
   - `api/src/services/r2.service.ts`
3. The current web new-version flow is spread across browser-specific modules:
   - `web/src/components/NewVersionPage/hooks/useNewVersionSubmission.ts`
   - `web/src/components/NewVersionPage/mintReleaseNft.ts`
   - `web/src/utils/nftMinting/mintNftWorkflow.ts`
   - `web/src/utils/releaseMinting.ts`
   - `web/src/utils/arweaveUploadProviderBased.ts`
4. The portal does not yet have a developer API key model or auth path for the
   CLI. Current authenticated flows assume a JWT bearer token:
   - `api/src/trpc/context.ts`
   - `api/src/lib/lookUpUserByBearerHeader.ts`
5. The current `validateApk` mutation is only an auth/ownership preflight and
   does not run full extraction:
   - `api/src/lib/validateApk.ts`
   - Full validation currently happens later in
     `api/src/modules/apk-processing-queue/apk-extraction.service.ts`
6. The portal web flow still uploads the release APK via the legacy S3
   `generateUploadUrl` path, not the R2 default:
   - `web/src/components/NewVersionPage/hooks/useNewVersionSubmission.ts`
   - `api/src/lib/generateUploadUrl.ts`
7. The web new-version page also has a separate "reuse previous APK" path that
   bypasses fresh upload and uses `createReleaseFromExisting`:
   - `web/src/components/NewVersionPage/hooks/useNewVersionSubmission.ts`
   - `web/src/services/releaseFromExisting.ts`
   - `api/src/lib/createReleaseFromExisting.ts`
8. External APK URLs are not actually supported today. The APK materializer in
   `api/src/modules/apk-processing-queue/apk-extraction.service.ts` treats any
   non-`file://` source as an S3-style path and fetches it through `S3Service`.
9. Portal-side package/config export features still exist to feed the
   config-driven CLI and package download path:
   - `api/src/controllers/download.controller.ts`
   - `api/src/trpc/router.ts`
   - `api/src/lib/generateConfigYaml.ts`
   - `api/src/lib/generateDappZip.ts`
   - `api/src/modules/dapp-package-queue/dapp-package.processor.ts`
   - `web/src/components/dashboard/DashboardHome.tsx`
10. The portal already has a natural local-development topology the CLI should
    target after the refactor:
    - API development defaults to port `3333`
    - web development defaults to `VITE_API_BASE_URL=http://localhost:3333`
    - the API exposes a health endpoint that will be served at `/api/health`
      under the global prefix
    - local testing still needs explicit upload/runtime rules because some
      development defaults fall back to shared staging infrastructure
11. Release submission already enforces most backend-side store submission
   preconditions and should remain the source of truth:
   - release processed
   - release NFT minted
   - app NFT present
   - collection verified
   - `what's new` present for updates
   - HubSpot submission and rollback behavior
   - See `api/src/lib/submitReleaseToStore.ts`

## Assumptions To Lock Early

1. The new CLI targets the existing app by APK package name under the API key's
   publisher scope, not by local config. This matches the desired one-command
   UX and the portal's unique `Dapp.androidPackage` constraint.
2. The CLI will still need:
   - a portal API key
   - the on-chain signer authority required by the resolved dapp, which is
     currently the dapp wallet / collection authority used by the web flow
   - an optional separate fee payer only if the backend explicitly supports it
   - an optional mainnet RPC override
3. The CLI will wait for portal processing to finish and surface the same
   backend validation failures instead of re-implementing APK validation logic
   locally.
4. The safest migration posture is to preserve the current web-only
   "reuse previous APK" variant until the shared ingestion contract is live and
   regression coverage proves it can either remain as a supported variant or be
   removed with explicit product sign-off.
5. APK plus `what's new` is only a valid CLI input contract if the portal can
   return or derive the full mint metadata bundle and signer-authority bundle
   needed by the current release NFT flow. Config-driven inputs cannot be
   deleted until that backend contract exists.
6. Update-versus-initial classification must come from one backend-authoritative
   marker for both web and CLI. The plan should normalize on
   `lastApprovedReleaseId` or an explicit derived `hasApprovedRelease` flag,
   not UI-only `releaseCount`.
7. Local developer ergonomics are part of the migration scope: after the
   refactor, a source-built CLI must be able to target a locally running portal
   stack without production self-update prompts or accidental use of shared
   staging upload infrastructure.

## Modules To Keep, Adapt, Or Extract

### Package boundary to preserve

1. `packages/core` is already the published
   `@solana-mobile/dapp-store-publishing-tools` package. Treat it as a public
   package boundary, not disposable repo-internal code.
2. Shared Node-safe publication logic should either:
   - become the new supported surface of that package, or
   - move to a replacement published package with a documented semver and
     compatibility story
3. Do not delete public exports from `packages/core` until the replacement
   surface is published, the CLI is migrated, and deprecation/compatibility
   guidance exists for downstream consumers.

### Keep and reuse from the portal

1. `api/src/lib/submitReleaseToStore.ts`
2. `api/src/lib/hubspot/createReleaseTicket.ts`
3. `api/src/lib/prepareReleaseNftTransaction.ts`
4. `api/src/lib/saveReleaseNftData.ts`
5. `api/src/lib/submitNftTransaction.ts`
6. `api/src/lib/generateR2UploadUrl.ts`
7. `api/src/services/r2.service.ts`
8. `api/src/modules/apk-processing-queue/apk-extraction.service.ts`
   after generalizing non-S3 source ingestion
9. `web/src/utils/attestation.ts`
   as the basis for a shared attestation helper
10. `web/src/utils/nftMinting/mintNftWorkflow.ts` and
    `web/src/utils/releaseMinting.ts`
    as the basis for a shared release mint workflow
11. `web/src/utils/arweaveUploadProviderBased.ts`
    as the basis for a shared release NFT upload/metadata assembly workflow

### Remove or heavily simplify from the CLI repo

1. `packages/cli/src/config/PublishDetails.ts`
2. `packages/cli/src/config/EnvVariables.ts`
3. `packages/cli/src/config/S3StorageManager.ts`
4. `packages/cli/src/commands/scaffolding/*`
5. `packages/cli/src/commands/create/*`
6. `packages/cli/src/commands/ValidateCommand.ts`
7. `packages/cli/src/commands/publish/PublishCliSubmit.ts`
8. `packages/cli/src/commands/publish/PublishCliUpdate.ts`
9. `packages/cli/src/commands/publish/PublishCliRemove.ts`
10. `packages/cli/src/commands/publish/PublishCliSupport.ts`
11. `packages/core/src/publish/*` direct HubSpot form posting internals, but
    only after a compatible shared/public replacement surface exists
12. `packages/cli/src/upload/TurboStorageDriver.ts`
13. `packages/cli/src/upload/CachedStorageDriver.ts`
14. `packages/cli/src/upload/contentGateway.ts`
15. `packages/core/src/create/*` local config-driven release creation internals,
    but only after a compatible shared/public replacement surface exists
16. `packages/cli/src/prebuild_schema/*`
17. `example/config.yaml` and config-driven examples
18. Devnet-specific tests and defaults across the CLI workspace

## Phased Numbered Tasklist

### Phase 1. Lock the target contract and remove ambiguity

1.1 Define the only supported new-submission CLI entrypoint as:
`cli-tool --apk-file=... --whats-new=\"...\"`
or
`cli-tool --apk-url=... --whats-new=\"...\"`.

1.1.1 Add an explicit operational resume/reconcile entrypoint for partially
completed publication flows, for example:
`cli-tool --resume-release=<release-id>`
or
`cli-tool --resume-session=<publication-session-id>`.

1.2 Enforce these argument rules in the new CLI surface:
   - exactly one of `--apk-file` or `--apk-url`
   - `--whats-new` required
   - API key required
   - signer keypair/private-key source required, and it must match the
     backend-declared signer authority for the resolved dapp
   - reject all devnet/testnet upload modes

1.3 Decide and document app resolution:
   - primary path: resolve target app from extracted `androidPackage`
   - optional future fallback: explicit `--dapp-id` or `--package-name`
   - keep the primary UX config-free

1.4 Freeze all unsupported legacy capabilities:
   - no new app submission
   - no `publish remove`
   - no `publish support`
   - no `create app`
   - no `create release`
   - no `init`
   - no standalone `validate`
   - no config YAML or JSON manifests

1.5 Preserve the current web-only "reuse previous APK" behavior as an explicit
variant during migration instead of accidentally regressing it:
   - either reimplement it on top of the new backend ingestion contract
   - or remove it only with explicit product sign-off, migration notes, and
     regression tests

1.6 Lock the package-boundary strategy before refactor work starts:
   - `@solana-mobile/dapp-store-publishing-tools` remains a supported public
     package boundary
   - shared workflow extraction must either land there or ship with a versioned
     replacement package and compatibility plan

### Phase 2. Add portal API key support for CLI auth

2.1 Add a first-class developer API key model in the portal database with:
   - hashed key storage only
   - label/name
   - binding to the effective `PublisherUserJoin`/publisher permission boundary
   - scope/permissions
   - created, last-used, revoked timestamps

2.2 Add portal backend services for:
   - key creation
   - one-time secret display
   - key lookup and hashing
   - revocation
   - audit logging

2.3 Add portal UI so a developer can provision and revoke CLI API keys from
the portal.

2.3.1 Add a local-development bootstrap path for the new auth model:
   - seed or scriptable creation of a local publisher/app fixture that is valid
     for update-only testing
   - a documented way to provision a local API key against the local portal
   - no dependency on production accounts for localhost development

2.4 Extend backend auth/context so protected CLI calls can authenticate with an
API key without disturbing existing JWT web auth:
   - keep JWT for web
   - add API key auth path for CLI
   - resolve API keys into a distinct API-key principal, not an implicit
     `ctx.user` clone
   - normalize both into the same permission model
   - default deny API keys on existing protected routes unless explicitly
     allowlisted
   - do not implicitly allow API keys on every existing protected route
   - add explicit route-level or procedure-level allowlisting for API-key access

2.5 Enforce permission checks so only users/publishers with release submission
rights can use the CLI update flow:
   - `ManageReleases` for ingestion and validation
   - `ManageNFTs` for mint-prep/save and collection verification
   - `SubmitToStore` for final submission

2.5.1 Refactor release endpoints that currently check only direct user ownership
to use the portal permission service before exposing them to API keys.

2.5.2 Auto-invalidate API-key access when the bound publisher relationship is
revoked, unaccepted, or deleted.

2.6 Add rate limiting, audit logs, secret redaction, and explicit tests for API
key auth failures and revocation behavior:
   - redact `x-api-key`
   - strip sensitive query strings from logs/audits
   - do not persist expiring presigned URLs as canonical release source URLs

2.7 Define CLI secret-handling rules before implementation:
   - API key via env var, stdin, or OS keychain integration, not raw argv when
     avoidable
   - signing key via file path, wallet integration, or secure key source
   - never echo secrets in terminal output

### Phase 3. Move release ingestion fully behind the portal backend

3.1 Introduce a dedicated backend inbound update-ingestion entity/session
instead of making the CLI orchestrate raw `createRelease` plus storage details.
This staging record must exist before `Release` creation so the portal can
queue extraction, hold source metadata, and resolve the target app safely.

3.2 Replace the current direct `createRelease` input shape
(`dappId`, `releaseFileUrl`, `releaseFileName`, `releaseFileSize`) with a new
portal-owned ingestion contract that can represent:
   - portal-uploaded APK source
   - external APK URL source
   - required `what's new`
   - an idempotency key for retry-safe CLI submissions

3.3 Extract package metadata against the ingestion record first, then resolve
the target app server-side from authenticated ownership plus APK package name.
Only create the real `Release` record after the request is tied to the correct
app and passes update-only gating.

3.4 Make update-only support a backend invariant, not only a CLI UX rule:
   - normalize web and CLI on one authoritative marker for
     initial-vs-update classification, preferably `lastApprovedReleaseId` or a
     derived `hasApprovedRelease`
   - reject requests when the target app has no existing approved/live release
   - reject requests when the target app cannot be matched under the API key's
     publisher scope
   - reject requests when required app-NFT prerequisites for release submission
     are impossible to satisfy

3.5 Persist the release metadata that the current web flow saves before minting
as part of the new contract or an immediately-following shared portal mutation:
   - store `what's new` as `newInVersion`
   - populate derived release metadata needed by the existing NFT assembly flow
   - keep `saveReleaseMetadata` semantics so release minting reads the same
     canonical data the web currently uses

3.6 Add dedicated source-provenance fields instead of overloading the existing
NFT upload-provider fields:
   - keep `uploadProvider`/`uploadProviderId` scoped to NFT asset storage
   - add explicit source-APK origin/provider/url metadata for ingestion

3.7 Keep the portal database as the single source of truth for:
   - release record creation
   - processing status
   - extracted APK metadata
   - inbound ingestion session status
   - portal-owned dapp/publisher metadata needed for release NFT assembly
   - minted release NFT data
   - HubSpot ticket submission state

3.8 Preserve the existing release submission state machine in
`api/src/lib/submitReleaseToStore.ts` and route the new CLI flow through it
instead of adding a parallel submission path.

3.9 Add a backend response shape for the CLI/shared workflow that returns the
portal-owned dapp, publisher, and release metadata needed to build release NFT
metadata without any local YAML/JSON config.

3.9.1 Make the full mint metadata bundle an explicit prerequisite before
config-driven inputs are removed. The backend/shared contract must return or
derive, at minimum:
   - localized name
   - short and long descriptions
   - publisher contact/support fields
   - publisher website
   - legal URLs
   - locales
   - icon/screenshot/banner/feature-graphic references or reuse rules
   - install-file metadata such as URI, mime, size, and digest

3.9.2 Add a signer-authority bundle to the same contract so the CLI can fail
early instead of discovering authority mismatches during mint/verify:
   - resolved dapp wallet address
   - required collection authority
   - app mint address
   - accepted mint signer / payer roles
   - whether the same signer must be used for minting and collection
     verification

3.10 Harden the release-processing path for automation before making the CLI
depend on create-and-poll behavior:
   - replace or harden the current in-memory queue usage
   - persist job state or use a durable queue so backend restarts do not orphan
     work
   - classify transient vs terminal failures
   - ensure release processing survives restarts without ambiguous stuck states
   - make polling semantics reliable for a non-browser client
   - support idempotent retry/resume without forcing re-upload

### Phase 4. Generalize APK source handling for file uploads and custom APK URLs

4.1 Replace the S3-only APK materialization logic in
`api/src/modules/apk-processing-queue/apk-extraction.service.ts` with a source
adapter that can read:
   - portal-owned object storage sources
   - external HTTPS APK URLs
   - local file URLs only for local/internal tests

4.2 Add strict external APK URL validation before queueing processing:
   - HTTPS only
   - final response reachable
   - file is non-empty
   - content type or file signature consistent with APK/ZIP
   - content length within supported limits
   - redirect policy defined
   - reject presigned/expiring URLs if they are not stable enough for later
     processing and minting

4.3 Add backend-side download safeguards for external URLs:
   - timeouts
   - max size limits
   - streaming download
   - DNS resolution and re-checking on every redirect hop
   - redirect caps
   - block loopback, RFC1918, link-local, metadata-service, and other
     non-public/private destinations on every hop
   - reject userinfo-bearing URLs and strip secret query fragments from logs
   - clear error messages for dead links and invalid content

4.4 Store enough normalized source metadata on the release record to
distinguish:
   - uploaded-via-portal object
   - externally supplied canonical APK URL

4.5 When `--apk-url` is used, skip the default upload entirely and reuse that
URL both for portal processing and for the NFT install file URI, subject to the
same validation and canonicalization rules.

4.6 Because `--apk-url` skips mirroring by requirement, define and enforce an
artifact-stability policy before minting:
   - record the canonical final URL after redirects
   - record file size and content digest from validation-time download
   - reject URLs that are too ephemeral or cannot satisfy permanence rules
   - require downstream processing/minting to use the same canonical URL and
     validated artifact identity, not a second unchecked target

### Phase 5. Make R2 the default portal-owned upload path for release updates

5.1 Remove the web new-version dependency on `generateUploadUrl`/legacy S3 for
APK update uploads and move that path to R2-backed upload generation.

5.2 Keep `api/src/lib/generateR2UploadUrl.ts` and `api/src/services/r2.service.ts`
as the base for the default upload mechanism for release APK uploads driven by
both web and CLI, but extend or replace the current NFT-specific DTO/route so
release-source ingestion is not forced through the existing `ReleaseAPK`
NFT-upload contract blindly.

5.3 Ensure the portal-generated public URL is the canonical NFT asset URL for
default uploads.

5.4 Keep the existing user-preference/provider machinery only where the web
still needs it, but treat CLI update uploads as portal-owned R2 by default
instead of asking the CLI to manage provider config.

5.5 Make the CLI shared workflow default all release NFT asset uploads to the
portal-owned R2 provider as well, except when `--apk-url` explicitly supplies
the install-file URI and skips that one upload.

5.6 Remove stale web gating that assumes the user must have a custom storage
provider or ArDrive credits to submit a new version once portal-owned R2
ingestion is live. Keep wallet/mint prerequisites, but drop obsolete storage
configuration blockers from the new-version path.

5.7 Add tests proving the default upload provider for CLI-driven update uploads
and CLI-driven release NFT asset uploads is R2, not legacy S3 or ArDrive.

5.8 Add explicit local-development upload rules so local portal + CLI testing
does not silently depend on shared staging buckets:
   - require local/dev-safe R2 configuration or test doubles for localhost work
   - document the expected local upload env vars alongside the portal dev stack
   - fail fast when local mode is requested but upload targets still point at
     unintended shared infrastructure

### Phase 6. Extract a shared release publication workflow for web and CLI

6.1 Extract only the headless release-publication core from the update flow
currently scattered across:
   - `web/src/components/NewVersionPage/hooks/useNewVersionSubmission.ts`
   - `web/src/components/NewVersionPage/mintReleaseNft.ts`
   - `web/src/utils/nftMinting/mintNftWorkflow.ts`
   - `web/src/utils/releaseMinting.ts`
   - `web/src/utils/arweaveUploadProviderBased.ts`
into a shared workflow package/module that both the web app and CLI can call.

6.2 Split that shared workflow into clean layers:
   - portal API client/orchestration
   - ingestion-session polling and release creation handoff
   - signer-authority preflight and capability checks
   - portal metadata fetch for dapp/publisher/release context
   - release metadata persistence before minting
   - release NFT metadata assembly
   - upload provider adapter
   - Solana transaction preparation/submission
   - collection verification
   - attestation generation
   - store submission

6.3 Keep environment-specific adapters thin:
   - browser adapter: wallet adapter + browser `File`
   - CLI adapter: keypair signer + Node file/stream + terminal logging

6.4 Keep browser-only/provider-specific concerns out of the shared core:
   - provider selection UI
   - ArDrive credit checks
   - browser `fetchAndConvertToFile` helpers
   - browser-local preference storage
   - page toasts/navigation/state management

6.5 Ensure the shared workflow preserves current behavior:
   - upload NFT metadata/assets
   - persist release metadata before minting
   - consume a complete portal-owned metadata bundle instead of falling back to
     deleted config inputs
   - mint release NFT
   - save release NFT data to the portal
   - verify collection membership
   - generate attestation locally
   - submit the release to the portal store workflow

6.6 Add a dedicated shared abstraction for upload sources so the CLI can pass:
   - local APK file
   - prevalidated external APK URL
without reintroducing browser-only `File` assumptions everywhere.

### Phase 7. Refactor portal validation so the CLI gets parity with the web flow

7.1 Keep authoritative APK validation in the portal backend, not in the CLI.

7.2 Reuse the exact existing processing/validation services instead of copying
the rules into the CLI:
   - debug build rejection
   - certificate fingerprint required
   - arm64-v8a checks
   - package-name ownership checks
   - duplicate version checks

7.3 Make the CLI wait for processing completion and fail fast with the same
error text the portal would expose after queued validation.

7.4 Review and close the current `validateApk` gap. It is only a stub today.
Either:
   - expand it into a real synchronous preflight for the new ingestion flow, or
   - remove it from the CLI path and rely on create-and-poll processing as the
     single validation path.

7.5 Add a metadata-completeness validation step before NFT upload/mint:
   - fail early when required publisher, legal, localized, or media metadata is
     missing from the portal-owned bundle
   - treat missing required metadata as a portal/shared-workflow error, not a
     reason to fall back to local config

7.6 Add explicit regression coverage for:
   - duplicate version code
   - package mismatch
   - invalid APK file
   - external URL that is not an APK
   - external URL timeout or redirect failure
   - unsigned/debug APK
   - missing required mint metadata bundle fields

### Phase 8. Keep minting, tx signing, and attestation in the CLI

8.1 Do not move private-key operations into the portal.

8.2 Reuse the portal transaction-preparation endpoints:
   - `prepareReleaseNftTransaction`
   - `prepareVerifyCollectionTransaction`
   - `submitNftTransaction`
   - `markReleaseCollectionAsVerified`

8.2.1 Add a signer-authority preflight before upload/minting starts:
   - compare the CLI-provided signer against the backend-declared dapp wallet /
     collection authority bundle
   - fail before upload/mint when the signer does not match
   - only allow separate mint signer or fee payer roles when the backend
     contract explicitly permits them

8.3 Move the CLI to the same release mint sequence the web already uses:
   - upload NFT assets/metadata
   - prepare release NFT transaction
   - sign and submit in the CLI
   - save release NFT data
   - prepare collection verification transaction
   - sign and submit in the CLI
   - mark collection verified
   - generate attestation in the CLI
   - call `submitReleaseToStore`

8.4 Extract and share the attestation helper from
`web/src/utils/attestation.ts` by introducing a signer abstraction:
   - shared payload format and serialization logic
   - browser-wallet adapter for the web
   - Node/private-key adapter for the CLI

8.5 Keep cluster handling mainnet-safe only for the refactored CLI path and add
matching backend/API-key guardrails so the CLI flow cannot accidentally target
devnet/testnet.

8.6 Introduce a durable release-publication session/checkpoint model for the
post-processing flow instead of relying on ad hoc manual retry:
   - persist publication stage transitions such as prepared-for-mint,
     mint-submitted, mint-saved, verification-submitted, verified,
     attested, and submitted
   - persist expected mint address, metadata URI, signer bundle, and known
     transaction signatures
   - make save/verify/submit steps idempotent against the same publication
     session

8.7 Define explicit crash-safe resume semantics after release creation:
   - add a backend reconcile/resume operation keyed by publication session or
     release ID
   - if the CLI crashes after signed transaction submission, reconcile on-chain
     state by transaction signature and/or expected mint address before
     attempting another mint
   - resume from the last durable checkpoint instead of restarting the whole
     flow

8.8 Keep partially completed releases by default, but tie that policy to the
resume contract:
   - if processing fails, keep the ingestion/release state for inspection and
     retry where safe
   - if minting, collection verification, or attestation fails after release
     creation, keep the release/publication session and print the durable ID for
     resume
   - add cleanup only as an explicit operator action, not the default

### Phase 9. Replace direct HubSpot submission with portal-owned submission only

9.1 Delete all direct HubSpot form submission code from the CLI core package:
   - `packages/core/src/publish/PublishCoreSubmit.ts`
   - `packages/core/src/publish/PublishCoreUpdate.ts`
   - `packages/core/src/publish/PublishCoreSupport.ts`
   - `packages/core/src/publish/dapp_publisher_portal.ts`

9.2 Keep the backend submission code in one place by reusing:
   - `api/src/lib/submitReleaseToStore.ts`
   - `api/src/lib/hubspot/createReleaseTicket.ts`

9.3 Add a portal-owned support/ticket submission service for any remaining
manual support flow so those tickets also go through backend-controlled
submission code and HubSpot persistence instead of direct form posts.

9.4 If support/ticket submission remains exposed anywhere after this refactor,
route it through the same portal-owned submission service family instead of
direct form posts from the CLI or any future client.

9.5 Preserve rollback and observability behavior already present in
`submitReleaseToStore.ts`.

### Phase 10. Rebuild the CLI around a single update command

10.1 Replace the current commander surface in
`packages/cli/src/CliSetup.ts` with an update-only command tree.

10.1.1 Keep a dedicated operational resume path in that command tree for
reconciling partially completed publication sessions.

10.1.2 Add a first-class local-development runtime mode for source-built CLI
execution:
   - portal API base URL override
   - optional portal web URL override for links/messages
   - self-update/version-gating bypass only for explicit local-dev execution
   - a repo-local run target so contributors can execute the CLI against a
     localhost portal stack without publishing a package first

10.2 Add a new top-level flow roughly shaped as:
   - parse args
   - authenticate to portal with API key
   - create an ingestion session for local APK or external APK URL through the
     portal
   - poll until validation/processing completes, the release record exists, and
     the signer-authority + metadata bundle are ready
   - run shared release NFT upload + mint + verify flow
   - generate attestation
   - submit update through the portal backend
   - print release ID, mint address, tx signature, and HubSpot ticket ID

10.2.1 Add a resume/reconcile flow roughly shaped as:
   - load publication session or release state from the portal
   - reconcile any previously submitted on-chain transactions
   - continue from the last durable checkpoint
   - avoid preparing/submitting a second mint when the first one may already
     have succeeded

10.3 Keep only the CLI utilities that still matter:
   - keypair parsing for the required signer-authority contract
   - terminal output
   - mainnet safety checks
   - retry/poll helpers
   - publication-session resume helpers

10.3.1 Add a local-dev connectivity check to the CLI developer workflow:
   - verify the configured local portal endpoint is reachable
   - hit the portal health endpoint before long-running smoke tests when useful
   - surface the resolved local API/web targets clearly in developer-facing
     output or docs

10.4 Remove all references to:
   - config YAML
   - asset-manifest JSON
   - BYOK S3 config
   - Turbo credits/top-ups
   - devnet upload gateways
   - direct publisher-portal form posting

10.5 Add terminal UX for long-running operations:
   - upload progress
   - processing poll status
   - mint/signature prompts
   - collection verification status
   - submission result

10.6 Surface retryable failure states clearly in CLI output:
   - print ingestion-session ID and release ID whenever they exist
   - print publication-session ID whenever the mint/verify/submit workflow has
     started
   - distinguish validation failures from mint/sign/submit failures
   - tell the operator whether resume is possible without re-upload

### Phase 11. Clean out obsolete packages, files, and tests

11.1 Remove config-driven scaffolding and example assets that no longer match
the CLI product.

11.2 Remove legacy CLI tests that validate deleted command surfaces.

11.3 Delete devnet/Turbo/content-gateway tests that no longer apply.

11.4 Remove or archive old publishing-spec material if it only documents the
legacy config-driven CLI and direct form-posting model.

11.5 Trim package dependencies that only support removed code paths:
   - Turbo SDK
   - AWS BYOK upload helpers in the CLI
   - schema-generation/config tooling for `config.yaml`

11.5.1 Do not strand the published SDK package during cleanup:
   - either refactor `packages/core` into the new shared/public workflow surface
   - or introduce a replacement published package and keep compatibility exports
     in place until the migration is complete

11.6 Remove or deprecate portal-side legacy package-export/codegen features
that only exist to feed the config-driven CLI, including the dapp package
download/generation path and related config/template emitters.

11.6.1 Clean up the concrete portal surfaces deliberately, not implicitly:
   - `api/src/controllers/download.controller.ts`
   - `api/src/trpc/router.ts` package/config generation routes
   - `api/src/lib/generateConfigYaml.ts`
   - `api/src/lib/generateDappZip.ts`
   - `api/src/modules/dapp-package-queue/dapp-package.processor.ts`
   - `api/src/app.module.ts` wiring for retired package/config flows
   - `web/src/components/dashboard/DashboardHome.tsx` links/buttons for package
     downloads or config-driven CLI setup

11.6.2 Retire the legacy CLI command inventory completely, including
`packages/cli/src/commands/ValidateCommand.ts`, after the new flow is covered
by tests and the migration note is ready.

11.7 Keep cleanup atomic. Delete code only after the shared workflow and new
CLI path are fully exercised by tests.

### Phase 12. Add full regression coverage before switching the CLI over

12.1 API tests:
   - API key auth lifecycle
   - API-key route isolation and deny-by-default behavior on non-allowlisted
     protected routes
   - JWT web auth behavior remains unchanged
   - `x-api-key` and remote-URL secret redaction in logs/audit output
   - release ingestion from file upload and external URL
   - external APK URL validation and failure cases
   - mandatory SSRF blocking across redirects and private-network targets
   - APK extraction from R2 and external HTTP(S)
   - update-only app resolution by package name
   - authoritative update marker normalization (`lastApprovedReleaseId` or
     equivalent) for both web and CLI contracts
   - backend rejection when no approved/live release exists
   - signer-authority bundle generation and mismatch rejection before mint
   - duplicate release/version rejection
   - release metadata persistence for `what's new` before minting
   - full metadata-bundle completeness checks before minting
   - unchanged `submitReleaseToStore` behavior

12.2 Shared workflow tests:
   - release metadata assembly
   - full portal metadata-bundle consumption without config-file fallback
   - upload-provider behavior for R2 default uploads
   - custom URL passthrough behavior
   - signer abstraction parity for web wallet vs CLI keypair attestation
   - signer-authority preflight parity for web and CLI
   - mint/verify/attestation orchestration

12.3 CLI tests:
   - arg validation
   - `--apk-file` happy path
   - `--apk-url` happy path
   - signer mismatch fails before upload/mint
   - missing metadata bundle fails before upload/mint
   - processing failure output
   - mint signature rejection
   - resume by release/publication session after crash following tx submission
   - collection verification retry path
   - release kept for retry after mint/attestation/submit failure
   - portal submission failure and retryability
   - self-update/version-gating behavior does not force stable users onto a
     breaking prerelease or minor release
   - explicit local-dev mode bypasses self-update and honors localhost portal
     endpoint overrides only when requested
   - no-config/no-devnet guarantees

12.4 End-to-end tests:
   - portal web new-version flow still works after shared-workflow extraction
   - existing web "reuse previous APK" path is either preserved on the new
     contract or intentionally removed with matching product/test updates
   - web new-version flow no longer depends on storage-provider/ArDrive-credit
     gating once portal-owned R2 ingestion is live
   - web and CLI use the same authoritative update marker
   - CLI update flow produces the same release state transitions as the web flow
   - queue restart/recovery keeps ingestion/release state recoverable
   - mint crash/restart recovery reconciles on-chain state without double mint
   - stable package/binary upgrade path preserves the intended `dapp-store`
     command behavior during rollout
   - source-built CLI can run against a local portal API/web stack with local
     auth fixtures and dev-safe upload configuration
   - no regression in HubSpot ticket creation and release persistence
   - portal package/config export shutdown does not leave dead UI/backend paths

### Phase 13. Roll out safely

13.1 Ship the portal backend support first behind an internal flag or hidden CLI
client.

13.2 Migrate the web new-version flow onto the shared backend/upload path
before deleting the old code. This reduces CLI-specific divergence.

13.2.1 During that migration, either move "reuse previous APK" onto the same
shared contract or explicitly remove it with product approval and release notes.

13.2.2 Remove obsolete storage-provider gating from the web new-version path
only after the shared R2-backed ingestion path is proven in tests.

13.3 Treat CLI rollout as a package-and-binary migration, not only a command
surface change:
   - retain the public package name `@solana-mobile/dapp-store-cli` and the
     `dapp-store` binary unless there is an explicit replacement strategy
   - ship prerelease validation through a `next` dist-tag or separate preview
     channel before promoting stable
   - only ship the breaking stable refactor as a new major version

13.3.1 Update the self-update/version-gating strategy alongside rollout:
   - current `checkForSelfUpdate` forces users forward on newer minor/major
     versions
   - do not let stable users be forced directly onto a breaking prerelease or
     minor release
   - define how legacy binaries discover the supported upgrade target and when
     forced updates are enabled

13.3.2 Publish and keep a documented local-development path after rollout:
   - how to start the local portal API and web
   - how to run the source-built CLI against localhost
   - which env vars are required for local auth and dev-safe uploads

13.4 Add telemetry for:
   - API key auth failures
   - external URL validation failures
   - processing failures
   - mint failures
   - signer-authority mismatch failures
   - publication-session resume/reconcile outcomes
   - collection verification failures
   - HubSpot submission failures

13.5 Publish a migration note stating:
   - old config files are no longer used
   - new app submission is no longer available from the CLI
   - devnet upload support is removed
   - portal API key setup is now mandatory
   - retry semantics for partially-completed releases have changed to keep
     release state by default for safe resumption
   - the package/binary versioning story for the breaking CLI change

## Audit Review Summary

This plan was re-checked against the current source code after drafting. The
main audit corrections were:

1. App targeting cannot depend on local config anymore, but the current queue
   shape also cannot resolve the app before `Release` creation. The plan now
   requires a dedicated ingestion-session/staging entity ahead of `Release`.
2. `what's new` cannot stay a loose CLI string. The plan now explicitly
   preserves `saveReleaseMetadata` semantics so `newInVersion` and derived
   release metadata are persisted before minting.
3. Update-only support cannot be just a CLI UX rule. The plan now makes it a
   backend invariant that rejects requests with no matching owned app or no
   existing approved/live release.
4. External APK URLs are not a small CLI-only change. The current APK
   extraction service assumes non-`file://` URLs are S3-backed, so backend
   source ingestion must be generalized before `--apk-url` can work safely.
5. External URL hardening must be mandatory, not optional. The plan now
   requires redirect-aware SSRF blocking, streaming size limits, canonical URL
   capture, and artifact-stability checks before minting from `--apk-url`.
6. The current portal web flow still uses legacy S3 upload generation for new
   version APK uploads and has separate storage-provider gating. The refactor
   must move web and CLI onto the same R2-backed ingestion path before old code
   is deleted.
7. API-key auth cannot be enabled globally for every existing protected portal
   route. The plan now explicitly requires a distinct API-key principal,
   `PublisherUserJoin` scoping, deny-by-default route allowlisting, permission
   checks, and secret redaction.
8. The shared workflow extraction was too broad initially. The plan now limits
   the shared layer to the headless release-publication core and keeps browser
   wallet/provider UI concerns out of it.
9. The current web-only "reuse previous APK" path and portal package/config
   export features were easy to miss. The plan now treats both as explicit
   migration items so the refactor does not silently regress the web app or
   leave dead backend/UI paths behind.
10. The plan now calls out queue durability, retry semantics, and release-keep
    behavior after mint/attestation failures so the CLI does not depend on a
    brittle create-and-poll path or destroy recoverable state.
11. The plan originally assumed a generic publisher signer, but the live portal
    flow actually binds collection verification to `dapp.walletAddress`. The
    plan now requires a backend-declared signer-authority bundle and early CLI
    mismatch checks.
12. APK plus `what's new` is not enough to mint a release NFT on its own. The
    plan now makes the full portal-owned metadata bundle a hard prerequisite
    before config-driven inputs can be removed.
13. `packages/core` is a published SDK package, not just a private folder. The
    plan now preserves that public package boundary and requires a semver-safe
    compatibility story before deleting internals.
14. The plan now normalizes update detection around one backend-authoritative
    marker instead of letting web `releaseCount` checks and backend
    `lastApprovedReleaseId` checks diverge.
15. The rollout plan now accounts for the existing `dapp-store` binary and
    forced self-update behavior, so users are not pushed onto a breaking
    command surface through a minor-version upgrade.
16. The plan now treats local CLI-against-local-portal development as a
    first-class migration concern, including localhost endpoint overrides,
    local auth/bootstrap fixtures, dev-safe upload configuration, and
    regression coverage for source-built CLI runs.

## Requirement Coverage Check

1. Portal backend as source of truth:
   covered by Phases 2, 3, 5, 9.
2. API key provisioned in portal:
   covered by Phase 2.
3. No new app submissions:
   covered by Phases 1 and 10.
4. CLI only supports version updates with APK + what's new:
   covered by Phases 1 and 10.
5. Same validations as portal/web:
   covered by Phase 7.
6. Flat CLI UX:
   covered by Phases 1 and 10.
7. Default uploads use R2:
   covered by Phase 5.
8. No JSON/YAML config files:
   covered by Phases 1, 10, and 11.
9. Custom APK URL support:
   covered by Phase 4.
10. NFT mints and tx signing stay in CLI:
   covered by Phase 8.
11. Attestation generation unchanged:
   covered by Phase 8.
12. Ticket submissions go through the portal and reuse backend code:
   covered by Phase 9.
13. No devnet uploads:
   covered by Phases 1, 8, 10, and 11.
14. Old/unused CLI code cleaned up:
   covered by Phase 11.
