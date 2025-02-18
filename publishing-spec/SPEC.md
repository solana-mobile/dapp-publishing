
## dApp Store NFT Specification - v0.3.0

The following is documentation of the NFT & JSON metadata specification for the dApp store.

## Technical Overview

In general, publisher, app, and release details are minted as standard Metaplex NFTs with additional metadata specified that will be utilized by the Solana dApp store.

- Publisher NFTs are Metaplex Certified Collection (MCC) NFTs that have can have many "apps" associated with them.
- App NFTs are _also_ MCC NFTs that can have many "releases" associated with them.
- Releases are immutable Metaplex NFTs that can only be issued once per-version. Any new releases must be re-issued as a new NFT.

### Clarifications & Comments

In general, the schema of these JSON files have moved away from using Metaplex NFT JSON fields and instead puts most of the dApp store-relevant data into an `extensions` region. These NFTs only need minimal existing wallet support, which this scheme enables.

Fields left in to fulfill the Metaplex spec are suffixed with `[Metaplex compatibility]` in the sample data below.

## Release NFT JSON

The release NFT [json schema](https://json-schema.org/) formatted file can be viewed [here](https://github.com/solana-mobile/dapp-publishing/blob/main/packages/core/src/schemas/releaseJsonMetadata.json). It is not particularly human-readable.

The following is a readable example instance with sample data filled in:

```json
{
  "schema_version": "v0.3.0",
  "name": "Wallet-visible name; 32 char limit [Metaplex compatibility]",
  "description": "Wallet-visible description [Metaplex compatibility]",
  "image": "http://cdn.org/wallet_display.png [Metaplex compatibility]",
  "properties": {
    "category": "dApp [Metaplex compatibility]",
    "creators": [
      {
        "address": "7pF18kRbv4mWdLPNMa8CjqLotQpznxzzRJqwdMibMitE [Metaplex compatibility]"
      }
    ]
  },
  "extensions": {
    "solana_dapp_store": {
      "publisher_details": {
        "name": "[Publisher Name]",
        "website": "https://www.company.com",
        "contact": "contact@company.com"
      },
      "release_details": {
        "updated_on": "2018-12-10T13:45:00.000Z",
        "license_url": "http://cdn.org/license.html",
        "copyright_url": "http://cdn.org/copyright.html",
        "privacy_policy_url": "http://cdn.org/privacy.html",
        "localized_resources": {
          "long_description": "uid_1",
          "new_in_version": "uid_2",
          "saga_features": "uid_3",
          "name": "uid_4",
          "short_description": "uid_5"
        }
      },
      "media": [
        {
          "mime": "image/png",
          "purpose": "icon",
          "uri": "http://cdn.org/app_icon.png",
          "width": 512,
          "height": 512,
          "sha256": "6ed00a7cb9dca84025473fc6b4d1f7d4680a34fcda54432504b0cdeb5e27801b"
        },
        {
          "mime": "image/png",
          "purpose": "featureGraphic",
          "uri": "http://cdn.org/feature_graphic.png",
          "width": 1024,
          "height": 500,
          "sha256": "6ed00a7cb9dca84025473fc6b4d1f7d4680a34fcda54432504b0cdeb5e27801b"
        },
        {
          "mime": "image/mp4",
          "purpose": "video",
          "uri": "http://cdn.org/video.mp4",
          "width": 1080,
          "height": 1920,
          "sha256": "6ed00a7cb9dca84025473fc6b4d1f7d4680a34fcda54432504b0cdeb5e27801b"
        },
        {
          "mime": "image/jpg",
          "purpose": "screenshot",
          "uri": "http://cdn.org/image.jpg",
          "width": 1080,
          "height": 1920,
          "sha256": "6ed00a7cb9dca84025473fc6b4d1f7d4680a34fcda54432504b0cdeb5e27801b"
        },
        {
          "mime": "image/jpg",
          "purpose": "screenshot",
          "uri": "http://cdn.org/image.jpg",
          "width": 1080,
          "height": 1920,
          "sha256": "6ed00a7cb9dca84025473fc6b4d1f7d4680a34fcda54432504b0cdeb5e27801b"
        }
      ],
      "files": [
        {
          "mime": "application/octet-stream",
          "purpose": "install",
          "uri": "http://cdn.org/dapp_1.0.2.apk",
          "size": 125829120,
          "sha256": "6ed00a7cb9dca84025473fc6b4d1f7d4680a34fcda54432504b0cdeb5e27801b"
        }
      ],
      "android_details": {
        "android_package": "com.company.dapp",
        "version": "1.0",
        "version_code": 1,
        "min_sdk": 21,
        "cert_fingerprint": "121389995d84ba2573e677418923441a4e2d56b41174d8c2630e1137ea4a4c91",
        "permissions": [
          "android.permission.INTERNET",
          "android.permission.LOCATION_HARDWARE",
          "com.solanamobile.seedvault.ACCESS_SEED_VAULT"
        ],
        "locales": [
          "en-US",
          "ja-JP",
          "it-IT"
        ]
      }
    },
    "i18n": {
      "en": {
        "uid_1": "[Long desc en]",
        "uid_2": "[New in version en]",
        "uid_3": "[Saga features in en]",
        "uid_4": "[Name in en]",
        "uid_5": "[Short desc en]"
      },
      "fr-FR": {
        "uid_1": "[Long desc fr]",
        "uid_2": "[New in version fr]",
        "uid_3": "[Saga features in fr]",
        "uid_4": "[Name in fr]",
        "uid_5": "[Short desc fr]"
      },
      "de": {
        "uid_1": "[Long desc de]",
        "uid_2": "[New in version de]",
        "uid_3": "[Saga features in de]",
        "uid_4": "[Name in de]",
        "uid_5": "[Short desc de]"
      }
    }
  }
}
```

## App NFT JSON

All releases for a dApp store entry will be grouped under an "App" collection, which itself will be an NFT that contains JSON metadata representing “global” immutable data for a dApp’s catalog entry. This actually ends up being just _one_ extension property, the app package name.

The app release NFT json schema can be viewed [here](https://github.com/solana-mobile/dapp-publishing/blob/main/packages/core/src/schemas/appJsonMetadata.json).

The following is a readable example instance with sample data filled in:

```json
{
  "schema_version": "v0.3.0",
  "name": "Wallet-visible collection name - 32 char limit [Metaplex compatibility]",
  "image": "http://cdn.org/wallet_display.png [Metaplex compatibility]",
  "properties": {
    "category": "dApp [Metaplex compatibility]",
    "creators": {
      "address": "7pF18kRbv4mWdLPNMa8CjqLotQpznxzzRJqwdMibMitE [Metaplex compatibility]"
    }
  },
  "extensions": {
    "solana_dapp_store": {
      "android_package": "com.company.dapp"
    }
  }
}
```

## Publisher NFT JSON

Publisher details will also be stored as an NFT. If it isn’t clear already, the relationship between the NFT entities are as follows:

- Publisher details represent the “root” entity and acts as a parent to all the others
- Publishers can create & manage multiple app NFTs
- App NFTs are the parent to all release NFTs associated with it

The publisher release NFT json schema can be viewed [here](https://github.com/solana-mobile/dapp-publishing/blob/main/packages/core/src/schemas/publisherJsonMetadata.json).

The following is a readable example instance with sample data filled in:

```json
{
  "schema_version": "v0.3.0",
  "name": "Wallet-visible Publisher; 32 char limit [Metaplex compatibility]",
  "image": "http://cdn.org/wallet_display.png [Metaplex compatibility]",
  "properties": {
    "category": "dApp [Metaplex compatibility]",
    "creators": [
      {
        "address": "7pF18kRbv4mWdLPNMa8CjqLotQpznxzzRJqwdMibMitE [Metaplex compatibility]"
      }
    ]
  },
  "extensions": {
    "solana_dapp_store": {
      "publisher_details": {
        "name": "[Publisher Name]",
        "website": "https://www.company.com",
        "contact": "contact@company.com"
      }
    }
  }
}
```