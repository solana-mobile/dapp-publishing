[\[Home\]](../README.md)

# Publishing to the Solana dApp Store

## Overview
Publishing a dApp to the Solana dApp Store involves two steps:
1. Create a set of NFTs describing the dApp, publisher, and release on-chain
1. Submit a request to the Solana dApp Store publisher portal requesting that Solana Mobile team review the dApp's release NFT

The publishing tool is designed for CI/CD usage - all steps, including submitting publish portal requests, can be integrated into your dApp release workflows. All files used during the NFT creation and publishing request submission steps can be committed to source control.

## Setup
Please follow the instructions in [README.md](../packages/cli/README.md) to set up the `dapp-store` CLI tooling

## RPC endpoints

By default, the `dapp-store` CLI interacts with **Devnet**. This facilitates experimentation and testing, before you are ready to publish your dApp on Mainnet Beta. To publish to Mainnet Beta, add the `-u <mainnet_beta_rpc_url>` parameter to all commands below. If you have a private RPC URL, it is strongly recommended that you use that. If you do not yet have a private RPC URL, you can make use of the [public endpoint](https://docs.solana.com/cluster/rpc-endpoints#mainnet-beta) (but be cognizant of the rate and usage limits).

## Step-by-step walkthrough of dApp publishing

### Where do the files for my dApp go?

It is recommended that you put your dApp publishing files next to your dApp, and source control them together. This guide assumes that your dApp is built with Android Studio, and the root directory for the project which builds your APKs is `${APP_ROOT}`.

### Configure the publishing details for your dApp

1. Having followed the instructions in the CLI tooling README file, collect the file paths for all your publishing assets (e.g., APK file, icons, screenshot images) relative to the directory you just created.

1. Populate the initial contents of the configuration file created during setup. By default, the file name is `config.yaml`. Replace all fields in `<< >>` with details for your dApp. Remove any fields that don't apply (for e.g., `saga_features`, `google_store_package`, etc). There are 3 sections to fill out: `publisher`, `app`, and `release`. The `publisher` section describes you, the app developer. The `app` section represents a single logical app produced by a publisher. A single publisher will always have at least one app, but if you publish multiple different apps under a single identity, there will be one for each of your apps. The `release` section is the most important, and describes all the metadata for a single release of an app, including it's display name, description, icons, screenshots, etc. The text you enter in the `catalog` subsection, along with the icon and screenshots in the `media` subsections, are what application stores will use to display details about your app to the end user, so be as descriptive as you can.

1. \[Optional\] Localize strings within your configuration file for all desired locales.
   Anywhere there is a string in your configuration file with an `en-US` key, you can provide additional localizations. For e.g., here's how you'd localize the strings for French (France):
   ```
   release:
     catalog:
       fr-FR:
         name: >-
           <<NAME_OF_APP_IN_FRENCH_(FRANCE)>>
         short_description: >-
           <<SHORT_APP_DESCRIPTION_IN_FRENCH_(FRANCE)>>
         long_description: >-
           <<LONG_APP_DESCRIPTION_IN_FRENCH_(FRANCE)>>
         new_in_version: >-
           <<WHATS_NEW_IN_THIS_VERSION_IN_FRENCH_(FRANCE)>>
         saga_features: >-
           <<ANY_FEATURES_ONLY_AVAILBLE_WHEN_RUNNING_ON_SAGA_IN_FRENCH_(FRANCE)>>
   ```
   A tip: make sure that your dApp is also localized properly, and that your build.gradle file identifies the languages & locales that your dApp supports. See [the Android developer documentation](https://developer.android.com/guide/topics/resources/multilingual-support#specify-the-languages-your-app-supports) for more details.

### Create a keypair for your dapp
**IMPORTANT: this keypair is a critical secret for your dApp. Whomever possesses it is able to create new releases of your dApp and submit them to the Solana dApp Store. It should be safeguarded with appropriate technical measures.**

See the [File System Wallet](https://docs.solana.com/wallet-guide/file-system-wallet) instructions to create a new keypair for publishing your dApp. You'll need to fund your account with some SOL to mint the necessary publisher, dApp, and release NFTs. For testing purposes, you can use devnet or testnet, and airdrop some SOL to this wallet.

### Validate your configuration
To validate your configuration file, use:
```
npx dapp-store validate -k <path_to_your_keypair> -b <path_to_your_android_sdk_build_tools>
```

On success, you should see output similar to:
```
Publisher JSON valid!
App JSON valid!
Release JSON valid!
```

### Mint the NFTs

1. Create the publisher NFT
   ```
   npx dapp-store create publisher -k <path_to_your_keypair> [-u <mainnet_beta_rpc_url>]
   ```
   _NOTE: this is a one-time operation. Once you have created your publisher, the mint address is recorded in your configuration file_.
1. Create the dApp NFT
   ```
   npx dapp-store create app -k <path_to_your_keypair> [-u <mainnet_beta_rpc_url>]
   ```
   _NOTE: this is a one-time operation. Once you have created your dApp, the mint address is recorded in your configuration file_.
1. Create the release NFT
   ```
   npx dapp-store create release -k <path_to_your_keypair> -b <path_to_your_android_sdk_build_tools> [-u <mainnet_beta_rpc_url>]
   ```
   _NOTE: this will be repeated each time you have a new version to release. The mint address of the latest release is recorded in your configuration file_.

### Submit your dApp
After minting a complete set of NFTs (publisher, dApp, and release) to represent your dApp on-chain, you may choose to submit them to the Solana dApp Publisher Portal, as a candidate for inclusion in the Solana dApp Store catalog.
```
npx dapp-store publish submit -k <path_to_your_keypair> -u <mainnet_beta_rpc_url> --requestor-is-authorized --complies-with-solana-dapp-store-policies
```
The two flags for this command (`--requestor-is-authorized` and `--complies-with-solana-dapp-store-policies`) are attestations from the requestor that this dApp is compliant with Solana dApp Store policies, and that they are authorized to submit this request to the Solana dApp Publisher Portal. After submitting, please check the email address specified in the `publisher` section of your configuration file; you will receive correspondence from the Solana dApp Publisher Portal to that account.

### What files should I commit to source control?
You should source control `.asset-manifest.json`, your configuration file, and any other files you would like to store alongside the publishing configuration (for e.g., icon and screenshot media files). These files should be committed each time you mint new NFT(s) for your dApp; the history of these files will serve as a record of all the NFTs ever minted to represent your dApp.

**IMPORTANT: Do NOT commit your keypair directly to source control. If your CI/CD environment has the capability to manage secrets, you can use this to manage and deploy the keypair for use in your publishing workflow.**

## Updating your dApp
To submit an update for your dApp to the Solana dApp Publisher Portal:
1. Edit the `release` and `solana_mobile_dapp_publisher_portal` sections of your configuration file to reflect any changes
1. Repeat the "Create the release NFT" step from the [Mint the NFTs](#mint-the-nfts) section
1. Submit the update to the Solana dApp Publisher Portal
   ```
   npx dapp-store publish update -k <path_to_your_keypair> -u <mainnet_beta_rpc_url> --requestor-is-authorized --complies-with-solana-dapp-store-policies
   ```

## Support and feedback
In the **PILOT** phase, support will be provided via direct communications with the Solana Mobile team. Please see the details of your invitation for details of how to get in touch.
