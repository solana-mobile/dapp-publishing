### Schema Changelog

NOTE: The versions referenced in this changelog relate only to the publishing JSON schema spec (for Publisher/App/Release) and not the versions of the CLI tooling. The CLI tooling is versioned independently. 

## 0.2.4

- Rename `saga_features_localized` to `saga_features`
- Move `version` field from top level of release NFT to the `android_details` section, and derive it from the APK

## 0.2.3

- Remove `description` from Publisher & App "Collection" JSON schemas
- In the release schema, the `name` field that used to be under `release_details` has now been moved to be contained in `localized_resources`

## 0.2.2

- Move `saga_features_localized` to be along side other localized strings

## 0.2.1

- Remove `age_rating` from release schema for the time being

## 0.2.0

- Noted Metaplex-compatibility JSON fields
- Added `schema_version` field to all JSON schemas
- Added width & height values to media
- Icon size is set to 512x512 px
- The `updated_on` value is still a string, but follows ISO 8601 string format
- Converted file `size` value to a number
- Converted string resource reference strings to denote unique ID
- Removed `short_description` from release JSON schema
- Removed `google_store_package` from release schema
- Removed `"configuration"` as file role/purpose from release schema
- Removed `external_url` from publisher JSON schema

## 0.1.4

- Fixed inconsistent field naming.

## 0.1.3

- Added `versionCode` to the Android details section.

## 0.1.2

- Added `saga_features_localized` to the Android details section which also adds to the set of localized strings.

## 0.1.1

- Added Google store package field.