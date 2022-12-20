# Publishing to the Solana dApp Store

## Status
The Solana dApp Store is currently in the **PILOT** phase, and only accepting submissions by invited parties. Other submissions will be (politely) rejected.

## Overview
Publishing a dApp to the Solana dApp Store involves two steps:
1. Create a set of NFTs describing the app, publisher, and release on-chain
1. Submit a request to the Solana dApp Store publisher portal requesting that Solana Mobile team review the dApp's release NFT

The publishing tool is designed for CI/CD usage - all steps, including submitting publish portal requests, can be integrated into your app release workflows. All files used during the NFT creation and publishing request submission steps can be committed to source control.

## Setup
Please follow the instructions in [README.md](packages/cli/README.md) to set up the `dapp-store` CLI tooling

## RPC endpoints

By default, the `dapp-store` CLI interacts with **Devnet**. This facilitates experimentation and testing, before you are ready to publish your app on Mainnet Beta. To publish to Mainnet Beta, add the `-u <mainnet_beta_rpc_url>` parameter to all commands below. If you have a private RPC URL, it is strongly recommended that you use that. If you do not yet have a private RPC URL, you can make use of the [public endpoint](https://docs.solana.com/cluster/rpc-endpoints#mainnet-beta) (but be cognizant of the rate and usage limits).

## Step-by-step walkthrough of dApp publishing

### Where do the files for my dApp go?

It is recommended that you put your dApp publishing files next to your app, and source control them together. This guide assumes that your dApp is built with Android Studio, and the root directory for the project which builds your APKs is `${APP_ROOT}`.

### Create `config.yaml` for your dApp

1. Create `${APP_ROOT}/dapp-store`
   ```
   mkdir dapp-store
   cd dapp-store
   ```
1. Populate the initial contents of `${APP_ROOT}/dapp-store/config.yaml`
   ```
   echo \
   "publisher:
     address: '' # will be replaced with the publisher NFT account address
     name: [[YOUR_PUBLISHER_NAME]] # (max 32 chars) This appears only when viewing the publisher NFT metadata; it is not part of the submission to the Solana dApp Store
     website: [[URL_OF_PUBLISHER_WEBSITE]]
     email: [[EMAIL_ADDRESS_TO_CONTACT_PUBLISHER]]
     media:
       - purpose: icon
         uri: [[RELATIVE_PATH_TO_PUBLISHER_ICON]] # for e.g., media/publisher_icon.png
   app:
     address: '' # will be replaced with the app NFT account address
     name: [[APP_NAME]] # (max 32 chars) This appears only when viewing the app NFT metadata; it is not part of the submission to the Solana dApp Store
     android_package: [[ANDROID_PACKAGE_NAME]]
     urls:
       license_url: [[URL_OF_APP_LICENSE_OR_TERMS_OF_SERVICE]]
       copyright_url: [[URL_OF_COPYRIGHT_DETAILS_FOR_APP]]
       privacy_policy_url: [[URL_OF_APP_PRIVACY_POLICY]]
       website: [[URL_OF_APP_WEBSITE]]
     media:
       - purpose: icon
         uri: [[RELATIVE_PATH_TO_APP_ICON]] # for e.g., media/app_icon.png
   release:
     address: '' # will be replaced with the release NFT account address
     catalog:
       en:
         name: >-
           [[APP_NAME]]
         long_description: >-
           [[LONG_APP_DESCRIPTION]]
         new_in_version: >-
           [[WHATS_NEW_IN_THIS_VERSION]]
         saga_features: >- # this property may be blank if there are no Saga-specific features
           [[ANY_FEATURES_ONLY_AVAILBLE_WHEN_RUNNING_ON_SAGA]]
     media:
       - purpose: icon
         uri: [[RELATIVE_PATH_TO_APP_ICON]] # for e.g., media/app_icon.png
       - purpose: screenshot
         uri: [[RELATIVE_PATH_TO_SCREENSHOT]] # for e.g., media/app_screenshot_1.png
       # Add more media files here
     files:
       - purpose: install
         uri: [[RELATIVE_PATH_TO_APK]] # for e.g., ../build/outputs/apk/release/myapp-release.apk
   solana_mobile_dapp_publisher_portal:
     google_store_package: [[ANDROID_PACKAGE_NAME_OF_GOOGLE_PLAY_STORE_VERSION_IF_DIFFERENT]] # (optional) the package name of this app on the Google Play Store, if it differs from the package name used in the Solana dApp Store
     testing_instructions: >-
       [[TESTING_INSTRUCTIONS]]
   " > config.yaml
   ```
   Replace all fields in `[[ ]]` with details for your dApp. Remove any fields that don't apply (for e.g., `saga_features`, `google_store_package`, etc).
1. \[Optional\] Localize strings within `config.yaml` for all desired locales.
   Anywhere there is a string in `config.yaml` with an `en` key, you can provide additional localizations. For e.g., here's how you'd localize the strings for French (France):
   ```
   release:
     catalog:
       fr-FR:
         name: >-
           [[NAME_OF_APP_IN_FRENCH_(FRANCE)]]
         long_description: >-
           [[LONG_APP_DESCRIPTION_IN_FRENCH_(FRANCE)]]
         new_in_version: >-
           [[WHATS_NEW_IN_THIS_VERSION_IN_FRENCH_(FRANCE)]]
         saga_features: >-
           [[ANY_FEATURES_ONLY_AVAILBLE_WHEN_RUNNING_ON_SAGA_IN_FRENCH_(FRANCE)]]
   ```
   A tip: make sure that your app is also localized properly, and that your build.gradle file identifies the languages & locales that your app supports. See [the Android developer documentation](https://developer.android.com/guide/topics/resources/multilingual-support#specify-the-languages-your-app-supports) for more details.

### Create a keypair for your dapp
**IMPORTANT: this keypair is a critical secret for your dApp. Whomever possesses it is able to create new releases of your dApp and submit them to the Solana dApp Store. It should be safeguarded with appropriate technical measures.**

See the [File System Wallet](https://docs.solana.com/wallet-guide/file-system-wallet) instructions to create a new keypair for publishing your dApp. You'll need to fund your account with some SOL to mint the necessary publisher, app, and release NFTs. For testing purposes, you can use devnet or testnet, and airdrop some SOL to this wallet.

### Validate your `config.yaml`
To validate your `config.yaml`,
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
   _NOTE: this is a one-time operation. Once you have created your publisher, the mint address is recorded in your `config.yaml`_.
1. Create the app NFT
   ```
   npx dapp-store create app -k <path_to_your_keypair> [-u <mainnet_beta_rpc_url>]
   ```
   _NOTE: this is a one-time operation. Once you have created your app, the mint address is recorded in your `config.yaml`_.
1. Create the release NFT
   ```
   npx dapp-store create release -k <path_to_your_keypair> -b <path_to_your_android_sdk_build_tools> [-u <mainnet_beta_rpc_url>]
   ```
   _NOTE: this will be repeated each time you have a new version to release. The mint address of the latest release is recorded in your `config.yaml`_.

### Submit your dApp
After minting a complete set of NFTs (publisher, app, and release) to represent your app on-chain, you may choose to submit them to the Solana dApp Publisher Portal, as a candidate for inclusion in the Solana dApp Store catalog.
```
npx dapp-store publish submit -k <path_to_your_keypair> -u <mainnet_beta_rpc_url> --requestor-is-authorized --complies-with-solana-dapp-store-policies
```
The two flags for this command (`--requestor-is-authorized` and `--complies-with-solana-dapp-store-policies`) are attestations from the requestor that this dApp is compliant with Solana dApp Store policies, and that they are authorized to submit this request to the Solana dApp Publisher Portal. After submitting, please check the email address specified in the `publisher` section of `config.yaml`; you will receive correspondence from the Solana dApp Publisher Portal to that account.

### What files should I commit to source control?
You should source control `.asset-manifest.json`, `config.yaml`, and any other files you would like to store alongside the publishing configuration (for e.g., icon and screenshot media files). These files should be committed each time you mint new NFT(s) for your app; the history of these files will serve as a record of all the NFTs ever minted to represent your app.

**IMPORTANT: Do NOT commit your keypair directly to source control. If your CI/CD environment has the capability to manage secrets, you can use this to manage and deploy the keypair for use in your publishing workflow.**

## Updating your dApp
To submit an update for your dApp to the Solana dApp Publisher Portal:
1. Edit the `release` and `solana_mobile_dapp_publisher_portal` sections of your `config.yaml` to reflect any changes
1. Repeat the "Create the release NFT" step from the [Mint the NFTs](#mint-the-nfts) section
1. Submit the update to the Solana dApp Publisher Portal
   ```
   npx dapp-store publish update -k <path_to_your_keypair> -u <mainnet_beta_rpc_url> --requestor-is-authorized --complies-with-solana-dapp-store-policies
   ```

## Support and feedback
In the **PILOT** phase, support will be provided via direct communications with the Solana Mobile team. Please see the details of your invitation for details of how to get in touch.
