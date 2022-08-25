# Release NFT Metadata Spec v0.1.1

This is the official spec of the off-chain metadata that will be created for the NFT release management system.

## Release NFT JSON Overview

The following is a JSON file for a dApp NFT release with readable sample data filled in:

```json
{
    "name": "[Wallet-visible name; 32 char limit]",
    "description": "[Wallet-visible description]",
    "image": "http://cdn.org/wallet_display.png",
    "properties": {
        "category": "dApp",
        "creators": [{
            "address": "7pF18kRbv4mWdLPNMa8CjqLotQpznxzzRJqwdMibMitE"
        }]
    },
    "extensions": {
        "solana_dapp_store": {
            "publisher_details": {
                "name": "[Publisher Name]",
                "website": "https://www.company.com",
                "contact": "contact@company.com"
            },
            "release_details": {
                "name": "[Official Catalog Name]",
                "version": "1.0.2",
                "updated_on": "354343342112121",
                "license_url": "http://cdn.org/license.html",
                "copyright_url": "http://cdn.org/copyright.html",
                "privacy_policy_url": "http://cdn.org/privacy.html",
                "age_rating": "3+",
                "localized_resources": {
                    "short_description": 1,
                    "long_description": 2,
                    "new_in_version": 3
                }
            },
            "media": [
                {
                    "mime": "image/png",
                    "purpose": "icon",
                    "uri": "http://cdn.org/app_icon.png",
                    "sha256": "6ed00a7cb9dca84025473fc6b4d1f7d4680a34fcda54432504b0cdeb5e27801b"
                },
                {
                    "mime": "image/mp4",
                    "purpose": "video",
                    "uri": "http://cdn.org/video.mp4",
                    "sha256": "6ed00a7cb9dca84025473fc6b4d1f7d4680a34fcda54432504b0cdeb5e27801b"
                },
                {
                    "mime": "image/jpg",
                    "purpose": "banner",
                    "uri": "http://cdn.org/image.jpg",
                    "sha256": "6ed00a7cb9dca84025473fc6b4d1f7d4680a34fcda54432504b0cdeb5e27801b"
                },
                {
                    "mime": "image/jpg",
                    "purpose": "screenshot",
                    "uri": "http://cdn.org/image.jpg",
                    "sha256": "6ed00a7cb9dca84025473fc6b4d1f7d4680a34fcda54432504b0cdeb5e27801b"
                },
                {
                    "mime": "image/jpg",
                    "purpose": "screenshot",
                    "uri": "http://cdn.org/image.jpg",
                    "sha256": "6ed00a7cb9dca84025473fc6b4d1f7d4680a34fcda54432504b0cdeb5e27801b"
                }
            ],
            "files": [
                {
                    "mime": "application/octet-stream",
                    "purpose": "install",
                    "uri": "http://cdn.org/dapp_1.0.2.apk",
                    "size": "125829120",
                    "sha256": "6ed00a7cb9dca84025473fc6b4d1f7d4680a34fcda54432504b0cdeb5e27801b"
                },
                {
                    "mime": "application/octet-stream",
                    "purpose": "configuration",
                    "uri": "http://cdn.org/some_binary.bin",
                    "size": "125829120",
                    "sha256": "6ed00a7cb9dca84025473fc6b4d1f7d4680a34fcda54432504b0cdeb5e27801b"
                }
            ],
            "android_details": {
                "android_package": "com.company.dapp",
                "google_store_package": "com.company.dapp.otherpkg",
                "minSdk": 21,
                "permissions": [
                    "android.permission.INTERNET",
                    "android.permission.LOCATION_HARDWARE",
                    "com.solanamobile.seedvault.ACCESS_SEED_VAULT"
                ],
                "languages": [
                    "en-US",
                    "ja-JP",
                    "it-IT"
                ]
            }
        },
        "i18n": {
            "en-US": {
                "1": "[Short desc en]",
                "2": "[Long desc en]",
                "3": "[New in version en]"
            },
            "fr-FR": {
                "1": "[Short desc fr]",
                "2": "[Long desc fr]",
                "3": "[New in version fr]"
            },
            "de": {
                "1": "[Short desc de]",
                "2": "[Long desc de]",
                "3": "[New in version de]"
            }
        }
    }
}
```

### Clarifications & Comments

In general, the schema of this JSON file has moved away from using metaplex-spec fields and instead puts most of the dApp store data into the `extensions` region. These releases only need minimal existing Wallet support, which this scheme fulfills.

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

All releases for a dApp store entry will be grouped under a collection, which itself will be an NFT that contains JSON metadata representing “global” immutable data for a dApp’s catalog entry. This actually ends up being just *one* extension property, the package name:

```json
{
    "name": "[Wallet-visible collection name - 32 char limit]",
    "description": "[Wallet-visible collection description]",
    "image": "http://cdn.org/wallet_display.png",
    "properties": {
        "category": "dApp",
        "creators": {
            "address": "7pF18kRbv4mWdLPNMa8CjqLotQpznxzzRJqwdMibMitE"
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
    "name": "[Wallet-visible Publisher; 32 char limit]",
    "description": "[Wallet-visible pub desc]",
    "image": "http://cdn.org/wallet_display.png",
    "external_url": "https://www.company.com",
    "properties": {
        "category": "dApp",
        "creators": [{
            "address": "7pF18kRbv4mWdLPNMa8CjqLotQpznxzzRJqwdMibMitE"
        }]
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