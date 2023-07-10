
# dApp Publishing CLI

Tooling for publishing to the Solana Mobile dApp Store.

For all documentation regarding usage of the tooling, including a thorough walkthrough of the dApp publishing process, visit the [Solana Mobile docs site](https://docs.solanamobile.com/dapp-publishing/intro).

# Installation

Please run the CLI with Node version 18 or greater.

```shell
corepack enable
corepack prepare pnpm@`npm info pnpm --json | jq -r .version` --activate
```

If you don't have [jq](https://stedolan.github.io/jq/), you can manually get the current version of pnpm with `npm info pnpm` and setup like this:

```shell
corepack prepare pnpm@7.13.4 --activate
```

```shell
mkdir publishing
cd publishing

pnpm init
pnpm install --save-dev @solana-mobile/dapp-store-cli
npx dapp-store init
npx dapp-store --help
```

# License

Apache 2.0