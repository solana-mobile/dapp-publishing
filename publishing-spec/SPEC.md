## dApp Store NFT Overview - v0.2.4

The following is documentation of the NFT & JSON metadata specification for the dApp store. In general, Publisher, App, and release details are minted as standard Metaplex NFTs with additional metadata specified that will be utilized by the Solana dApp store.

This data ideally should not be created manually. Instead, please see the publishing tooling documentation for a more automated workflow. 

## Release NFT JSON

The following is a JSON file for a dApp NFT release with readable sample data filled in.

```json
{
  "schema_version": "0.2.4",
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
        "version": "1.0",
        "version_code": 1,
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
      "en": {
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

In general, the schema of this JSON file has moved away from using Metaplex NFT JSON fields and instead puts most of the dApp store data into the `extensions` region. These releases only need minimal existing Wallet support, which this scheme fulfills. Fields left in to fulfill the Metaplex spec are suffixed with `[Metaplex compatibility]` in the sample data.

## dApp “Collection” NFT JSONx

All releases for a dApp store entry will be grouped under a collection, which itself will be an NFT that contains JSON metadata representing “global” immutable data for a dApp’s catalog entry. This actually ends up being just _one_ extension property, the dApp package name:

```json
{
  "schema_version": "0.2.4",
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
- Publishers can create & manage multiple dApps - otherwise known as Collection NFTs
- Collection NFTs are the parent to all release NFTs associated with it

```json
{
  "schema_version": "0.2.4",
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