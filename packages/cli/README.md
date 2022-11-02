## Prerequisites

- Node 16+
- PNPM

If you have Node 16+, you can [activate PNPM with Corepack](https://pnpm.io/installation#using-corepack):

```shell
corepack enable
corepack prepare pnpm@`npm info pnpm --json | jq -r .version` --activate
```

Corepack requires a version to enable, so if you don't have [jq](https://stedolan.github.io/jq/) installed, you can [install it](https://formulae.brew.sh/formula/jq), or just manually get the current version of pnpm with `npm info pnpm` and use it like this:

```shell
corepack prepare pnpm@7.13.4 --activate
```

## Setup

```shell
git clone https://github.com/solana-mobile/app-publishing-spec
cd app-publishing-spec
pnpm install
pnpm run build
pnpm link .
```

## Usage

In your application folder (e.g., `example`):

```shell
cd example
pnpm link <path-to-app-publishing-spec>/packages/cli
npx dapp-store --help
```

# Overview

Publishers, applications, and releases on the Saga Dapp Store are all represented as NFTs, with some modifications.

"Publishers" are Metaplex Certified Collection (MCC) NFTs that have can have many "apps" associated with them.

"Apps" are _also_ MCC NFTs that can have many "releases" associated with them.

"Releases" are immutable Metaplex NFTs that can only be issued once per-version. Any new releases must be re-issued as a new NFT.

A typical publishing flow might look like:

1. Create a publisher (`dapp-store create publisher`)
2. Create an app (`dapp-store create app`)
3. Create a release (`dapp-store create release`)
4. Submit an app for review (`dapp-store submit-for-review`)

Repeat steps 3. and 4. as needed!

## Editor's Note

The `dapp-store` CLI:

- takes an opinionated approach to file structure optimizing for source control
- handles rote tasks like uploading assets to immutable file storage and i18n

However, it is by no means the only way to create these NFTs—all information about the requirements are specified in this repository, and the packages have been designed to be portable to other client contexts besides the CLI

## Configuration

In `dapp-store/config.yaml`:

```yaml
publisher:
  name: My new publisher name
  address: BrWNieTsfdkkwMaz2A616i1fkqSjxk2kHhTn1Y44pi48
  description:
    en-US: >
      A lot of extra information about my wonderful publisher
  website: https://solanamobile.com
  email: hello@solanamobile.com

app:
  name: My new app name
  address: 3Pvi6wKUiN2jujQQdGKB41dG1m6nAKLL67GeA8q3Vuj8
  description:
    en-US: >
      My new app description
  creators:
    - 7pF18kRbv4mWdLPNMa8CjqLotQpznxzzRJqwdMibMitE
  urls:
    license_url: http://cdn.org/license.html
    copyright_url: http://cdn.org/copyright.html
    privacy_policy_url: http://cdn.org/privacy.html
    website: http://cdn.org
  age_rating: 3+
  locales:
    - en-US
    - ja-JP
    - it-IT
  android_details:
    android_package: com.company.dapp
    google_store_package: com.company.dapp.otherpkg
    min_sdk: 21
    version_code: 5
    permissions:
      - android.permission.INTERNET
      - android.permission.LOCATION_HARDWARE
      - com.solanamobile.seedvault.ACCESS_SEED_VAULT
```

Since releases happen quite often, those are stored in the `dapp-store/releases` folder.

For example, a release with version `v1.0.2` would look like:

```
dapp-store/releases
└── v1.0.2
    ├── app-debug.apk
    ├── app_screenshot.png
    └── release.yml
```
