
# Uploading Assets to Amazon S3 Storage

## Prerequisites

In order to use the CLI tooling with S3 bucket storage, you will need the following configuration data from your S3 account:

- The name of your S3 bucket
- Your account access key ID
- Your account secret access key ID

The CLI tooling assumes the S3 bucket is configured correctly for both tool-based uploading along with usage as a public endpoint for downloads. 

## Tooling Configuration

There are two methods for providing your S3 configuration to the CLI tooling. Once you have made and prepared your selection, you can return back to the general publishing documentation.

### Option 1: .env file values

You can add your S3 details in a `.env` file that lives in the same directory alongside your configuration file. You should add them as follows:

```
STORAGE_TYPE="s3"
S3_ACCESS_KEY="<your access key>"
S3_SECRET_KEY="<your secret key>"
S3_BUCKET="<destination bucket name>"
```

_NOTE: This is the same `.env` file that can also contain the path to your Android tools directory._

### Option 2: Command line argument

Alternatively you can provide the values as command line arguments along with all other relevant command line parameters you are using. In order to provide all relevant data, you provide an *array* of values on the command line:

```
npx dapp-store {relevant mint command with args} -s '["s3", "<access_key>", "<secret_key>", "<bucket_name>"]'
```

Some notes about providing the S3 details via the CLI:

- The order of the array arguments is very important; they must be passed in the same order as listed above.
- It is important that the _array itself_ is contained in single quotes: ``''``
- It is important that the _values inside_ the array are contained in double quotes: ``""``
- You must append this argument/array parameter for each of the NFT minting operations: publisher, dApp, and releases.
 