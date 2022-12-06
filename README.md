# Release NFT Metadata Spec v0.2.0

This is the official spec of the off-chain metadata that will be created for the NFT release management system.

## Release NFT JSON Overview

The following is a JSON file for a dApp NFT release with readable sample data filled in.

```json
{
  "schema_version": "0.2.3",
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
        "version": "1.0.2",
        "updated_on": "2018-12-10T13:45:00.000Z",
        "license_url": "http://cdn.org/license.html",
        "copyright_url": "http://cdn.org/copyright.html",
        "privacy_policy_url": "http://cdn.org/privacy.html",
        "localized_resources": {
          "long_description": "uid_1",
          "new_in_version": "uid_2",
          "saga_features_localized": "uid_3",
          "name": "uid_4"
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
          "mime": "image/mp4",
          "purpose": "video",
          "uri": "http://cdn.org/video.mp4",
          "width": 1080,
          "height": 1920,
          "sha256": "6ed00a7cb9dca84025473fc6b4d1f7d4680a34fcda54432504b0cdeb5e27801b"
        },
        {
          "mime": "image/jpg",
          "purpose": "banner",
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
        "version_code": 5,
        "min_sdk": 21,
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
      "en-US": {
        "uid_1": "[Long desc en]",
        "uid_2": "[New in version en]",
        "uid_3": "[Saga features in en]",
        "uid_4": "[Name in en]"
      },
      "fr-FR": {
        "uid_1": "[Long desc fr]",
        "uid_2": "[New in version fr]",
        "uid_3": "[Saga features in fr]",
        "uid_4": "[Name in fr]"
      },
      "de": {
        "uid_1": "[Long desc de]",
        "uid_2": "[New in version de]",
        "uid_3": "[Saga features in de]",
        "uid_4": "[Name in de]"
      }
    }
  }
}
```

### Clarifications & Comments

In general, the schema of this JSON file has moved away from using Metaplex NFT JSON fields and instead puts most of the dApp store data into the `extensions` region. These releases only need minimal existing Wallet support, which this scheme fulfills. Fields left in to fulfill the Metaplex spec are suffixed with `[Metaplex compatibility]`.

It should be noted that many of the fields included in the above JSON scheme are duplicated between releases. A convenient feature for the tooling would be to populate fields from the previous release when beginning to prepare a new release for publishing.

### Auto-populating APK Data

A certain subset of the data stored in the JSON file above can be derived from parsing the contents of the apk file. The apk is just a zip file that could be decompressed and contents parsed. The fields are:

- Package name
- Version number
- File size
- Translations
- Permissions

Another helpful feature in the tooling would be to parse the apk and auto-populate the relevant fields.

## dApp “Collection” NFT JSON Overview

All releases for a dApp store entry will be grouped under a collection, which itself will be an NFT that contains JSON metadata representing “global” immutable data for a dApp’s catalog entry. This actually ends up being just _one_ extension property, the package name:

```json
{
  "schema_version": "0.2.3",
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

## Publisher NFT JSON Overview

Publisher details will also be stored on-chain as an NFT. If it isn’t clear already, the relationship between the entities in this document are as follows:

- Publisher details represent the “root” entity and acts as a parent to all the others
- Publishers can create & manage multiple dApps - otherwise known as Collection NFTs
- Collection NFTs are the parent to all release NFTs associated with it

That said, all store-relevant publisher information will be managed in the release, so there is no special data stored in the publisher NFT that needs to be documented here.

```json
{
  "schema_version": "0.2.3",
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
