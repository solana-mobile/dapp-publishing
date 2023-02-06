## Prerequisites

- Node 18+
- PNPM
- Android SDK build tools

```shell
corepack enable
corepack prepare pnpm@`npm info pnpm --json | jq -r .version` --activate
```

Corepack requires a version to enable, so if you don't have [jq](https://stedolan.github.io/jq/) installed, you can [install it](https://formulae.brew.sh/formula/jq), or just manually get the current version of pnpm with `npm info pnpm` and use it like this:

```shell
corepack prepare pnpm@7.13.4 --activate
```

You must have the Android SDK build tools available for use by the `dapp-store` CLI. If you have Android Studio, these tools are available as part of that installation (for e.g., on MacOS, they can be found in ~/Library/Android/sdk/build-tools/<version>). If you do not have Android Studio installed, or wish to use a standalone version of the Android SDK build tools, please follow the instructions [here](https://developer.android.com/studio/intro/update#sdk-manager). The path to the SDK build tools can be provided either directly to subcommands that require it with the `-b` option, or indirectly via a `.env` file:
```
echo "ANDROID_TOOLS_DIR=\"<path_to_android_sdk_build_tools_dir>\"" > .env
```

## Usage

In your application folder (e.g., `example`):

```shell
mkdir publishing
cd publishing

pnpm init
pnpm install --save-dev @solana-mobile/dapp-store-cli
npx dapp-store init
npx dapp-store --help
```

or with `yarn`

```shell
mkdir publishing
cd publishing

yarn init
yarn add @solana-mobile/dapp-store-cli
yarn run dapp-store init
yarn run dapp-store --help
```

or with `npm`

```shell
mkdir publishing
cd publishing

npm init
npm install --save-dev @solana-mobile/dapp-store-cli
npx dapp-store init
npx dapp-store --help
```

# Overview

Publishers, applications, and releases on the Saga Dapp Store are all represented as NFTs, with some modifications.

"Publishers" are Metaplex Certified Collection (MCC) NFTs that have can have many "apps" associated with them.

"Apps" are _also_ MCC NFTs that can have many "releases" associated with them.

"Releases" are immutable Metaplex NFTs that can only be issued once per-version. Any new releases must be re-issued as a new NFT.

A typical publishing flow might look like:

1. Create a publisher (`dapp-store create publisher ...`)
2. Create an app (`dapp-store create app ...`)
3. Create a release (`dapp-store create release ...`)
4. Submit an app for review (`dapp-store publish submit ...`)

Repeat steps 3. and 4. as needed!

## Editor's Note

The `dapp-store` CLI handles rote tasks like uploading assets to immutable file storage and i18n. However, it is by no means the only way to create these NFTs—all information about the requirements are specified in this repository, and the packages have been designed to be portable to other client contexts besides the CLI.

### CLI Updates

The CLI will automatically check for updated versions on npm and restrict operations if the version bump is significant enough. If your CI/CD deployments fail be sure to check if there is a required update.