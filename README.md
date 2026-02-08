# ArticVault - File Storage

A file storage system in the cloud. Similar to Google Drive, where you can upload and retrieve any kind of file, in a folder organisation system.

The proposal is for anyone to be able to deploy this system with their own AWS cloud infrastructure, for themselves.

## Components

- A web application for the user.
- The cloud infrastructure.

Authentication and permissions:
- User authenticates through a Cognito group.
- Only users in the group have access to their vaults.

Infrastructure:
- A single DynamoDB table acts as a repository for the metadata of the files in each of the user's vault.
- When user signs in for the first time, their account is configured if they don't yet have an assigned bucket. A S3 bucket is created, allowing read and write access only to the user.
- The web app is hosted on a S3 bucket with a CloudFront distribution.
- An API Gateway has endpoints that act as the intermediary for reading, uploading files, and other operations.

Web application:
- A basic Typescript and React single-page-application.
- Authenticated usera can perform CRUD operations on their vault's files.
- Multi-selection of files should be supported for download and delete operations.
- When user deletes a file, they add a deleted flag, and a flaggedForDeleteAt attribute, to its metadata. The metadata record is never deleted from DynamoDB. The S3 file is deleted after 30 days.
- Uploading an entire folder shpuld be supported, and the organisation structure should be kept
