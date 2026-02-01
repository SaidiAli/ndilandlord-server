## IoTec Pay API Reference
ioTec is a financial services platform that allows businesses to "make and receive payments, ensure the authenticity of your customers with robust identity verification, effortlessly perform credit checks and submit credit reports to CRBs while staying in constant communication with your customers."

## Summary of the API

Overview
The ioTec Pay API enables seamless integration between your systems and ioTec Pay services. With it, you can:

Collect Payments: Receive mobile money payments directly into your ioTec Pay wallet.
Make Disbursements: Send funds from your wallet to mobile money accounts or commercial bank accounts.
Manage Transactions: Access and work with transaction data to streamline your financial operations.

Getting started
To begin using the ioTec Pay API, you'll need to authenticate via OAuth 2.0 client credentials flow.

Where to Get Your API Credentials
When you sign up for ioTec Pay, your client_id and client_secret are automatically sent to the email address you used during registration.

Once you have your credentials, you can request an access token with the curl request below:

`curl --request POST \
  --url https://id.iotec.io/connect/token \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --data client_id=[client_id] \
  --data client_secret=[client_secret] \
  --data grant_type=client_credentials`

  The authorization server will then return an access token in the following format:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
  "expires_in": 300,
  "token_type": "Bearer",
  "scope": "profile email"
}
```

Use the returned access token in the Authorization header of all your API requests as follows:

`curl --request POST \
  --url https://pay.iotec.io/api/disbursements/disburse \
  --header 'Authorization: Bearer [access_token]' \
  --header 'Content-Type: application/json' \
  --data '{
  "category": "MobileMoney",
  "currency": "ITX",
  "walletId": "5e83b187-801e-410e-b76e-f491928547e0",
  "externalId": "001",
  "payee": "0111777771",
  "amount": 1000,
  "payerNote": "payerNote",
  "payeeNote": "payeeNote"
}'`


### Initiate Mobile Money Collection
This endpoint is used to perform a mobile money collection request from a specified payer to your ioTec Pay wallet.

The transaction flow works as follows:

A collection request is initiated
The payer receives a prompt on their mobile device
The transaction remains in Pending status until:
The payer authorizes the payment (status changes to Success)
The payer declines the payment (status changes to Failed)
The system times out the request (status changes to Failed)
You can check the transaction status using:

`GET api/collections/status/{transactionId}`

Request:
```javascript
fetch('https://pay.iotec.io/api/collections/collect', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer <jwt-token>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    category: 'MobileMoney',
    currency: 'ITX',
    walletId: '5e83b187-801e-410e-b76e-f491928547e0',
    externalId: '001',
    payer: '0111777771',
    payerNote: 'Payment for Invoice #12345',
    amount: 700,
    payeeNote: 'Customer ID: 78923, Order #: ABC123',
    channel: null,
    transactionChargesCategory: 'ChargeWallet'
  })
})
```

Response: 200

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "createdAt": "2025-09-14T07:57:49.147Z",
  "category": "MobileMoney",
  "status": "Pending",
  "paymentChannel": "Api",
  "statusCode": "pending",
  "statusMessage": "Request is being processed",
  "externalId": "001",
  "amount": 700,
  "payerNote": "Payment for Invoice #12345",
  "payeeNote": "Customer ID: 78923, Order #: ABC123",
  "currency": "ITX",
  "wallet": {
    "id": null,
    "name": null
  },
  "chargeModel": null,
  "createdBy": "2d629907-d515-4943-84b7-da337292bdba",
  "transactionCharge": 14,
  "vendorCharge": 10.5,
  "totalTransactionCharge": 24.5,
  "vendor": "Mock",
  "vendorTransactionId": null,
  "lastUpdated": null,
  "processedAt": null,
  "transactions": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "createdAt": "2025-09-14T07:57:49.147Z",
      "operation": "TopUp",
      "wallet": {
        "id": null,
        "name": null
      },
      "walletId": "123e4567-e89b-12d3-a456-426614174000",
      "requestId": "123e4567-e89b-12d3-a456-426614174000",
      "requestCategory": "Disbursement",
      "transactionNumber": 1,
      "amount": 1,
      "memo": null,
      "narration": null,
      "balance": 1,
      "previousBalance": 1,
      "rollback": true,
      "category": "Disbursement",
      "disbursement": {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "createdAt": "2025-09-14T07:57:49.147Z",
        "lastUpdated": null,
        "isDeleted": true,
        "status": "Pending",
        "vendor": "Mock",
        "amount": 1,
        "msisdn": null,
        "vendorTransactionId": null,
        "transactionCharge": 1,
        "vendorCharge": 1
      },
      "collection": {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "createdAt": "2025-09-14T07:57:49.147Z",
        "lastUpdated": null,
        "isDeleted": true,
        "status": "Pending",
        "vendor": "Mock",
        "amount": 1,
        "msisdn": null,
        "vendorTransactionId": null,
        "transactionCharge": 1,
        "vendorCharge": 1
      }
    }
  ],
  "payer": "0111777771",
  "payerName": "John Doe"
}
```
Response: 400
```json
{
  "message": "Invalid ioTec wallet",
  "code": "BadRequest"
}
```


### Get transaction status
This endpoint is used to get the details of a collection transaction including the status.

Path Parameters
requestId
Type:BankTransferType
Format:uuid
required
The unique identifier of the transaction you want to check. This is the id field from the response body returned when you initiated the collection.

Headers
Authorization
Type:BankTransferType
required
Example
OAuth2 bearer token, got from id.iotec.io

Request:
```javascript
fetch('https://pay.iotec.io/api/collections/status/', {
  headers: {
    Authorization: 'Bearer <jwt-token>'
  }
})
```

Response: 200
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "createdAt": "2025-09-14T07:57:49.147Z",
  "category": "MobileMoney",
  "status": "Pending",
  "paymentChannel": "Api",
  "statusCode": "pending",
  "statusMessage": "Request is being processed",
  "externalId": "001",
  "amount": 700,
  "payerNote": "Payment for Invoice #12345",
  "payeeNote": "Customer ID: 78923, Order #: ABC123",
  "currency": "ITX",
  "wallet": {
    "id": null,
    "name": null
  },
  "chargeModel": null,
  "createdBy": "2d629907-d515-4943-84b7-da337292bdba",
  "transactionCharge": 14,
  "vendorCharge": 10.5,
  "totalTransactionCharge": 24.5,
  "vendor": "Mock",
  "vendorTransactionId": null,
  "lastUpdated": null,
  "processedAt": null,
  "transactions": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "createdAt": "2025-09-14T07:57:49.147Z",
      "operation": "TopUp",
      "wallet": {
        "id": null,
        "name": null
      },
      "walletId": "123e4567-e89b-12d3-a456-426614174000",
      "requestId": "123e4567-e89b-12d3-a456-426614174000",
      "requestCategory": "Disbursement",
      "transactionNumber": 1,
      "amount": 1,
      "memo": null,
      "narration": null,
      "balance": 1,
      "previousBalance": 1,
      "rollback": true,
      "category": "Disbursement",
      "disbursement": {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "createdAt": "2025-09-14T07:57:49.147Z",
        "lastUpdated": null,
        "isDeleted": true,
        "status": "Pending",
        "vendor": "Mock",
        "amount": 1,
        "msisdn": null,
        "vendorTransactionId": null,
        "transactionCharge": 1,
        "vendorCharge": 1
      },
      "collection": {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "createdAt": "2025-09-14T07:57:49.147Z",
        "lastUpdated": null,
        "isDeleted": true,
        "status": "Pending",
        "vendor": "Mock",
        "amount": 1,
        "msisdn": null,
        "vendorTransactionId": null,
        "transactionCharge": 1,
        "vendorCharge": 1
      }
    }
  ],
  "payer": "0111777771",
  "payerName": "John Doe"
}
```

### Get transaction status by externalId
This endpoint is used to get the details of a collection transaction including the status with the use of your own reference ID (externalId).

Path Parameters
externalId
Type:BankTransferType
required
Your custom unique identifier/reference for the transaction. This is the value you provided in the externalId field when initiating the collection.

Headers
Authorization
Type:BankTransferType
required
Example
OAuth2 bearer token, got from id.iotec.io

Request:
```
fetch('https://pay.iotec.io/api/collections/external-id/', {
  headers: {
    Authorization: 'Bearer <jwt-token>'
  }
})
```

Response: 200
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "createdAt": "2025-09-14T07:57:49.147Z",
  "category": "MobileMoney",
  "status": "Pending",
  "paymentChannel": "Api",
  "statusCode": "pending",
  "statusMessage": "Request is being processed",
  "externalId": "001",
  "amount": 700,
  "payerNote": "Payment for Invoice #12345",
  "payeeNote": "Customer ID: 78923, Order #: ABC123",
  "currency": "ITX",
  "wallet": {
    "id": null,
    "name": null
  },
  "chargeModel": null,
  "createdBy": "2d629907-d515-4943-84b7-da337292bdba",
  "transactionCharge": 14,
  "vendorCharge": 10.5,
  "totalTransactionCharge": 24.5,
  "vendor": "Mock",
  "vendorTransactionId": null,
  "lastUpdated": null,
  "processedAt": null,
  "transactions": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "createdAt": "2025-09-14T07:57:49.147Z",
      "operation": "TopUp",
      "wallet": {
        "id": null,
        "name": null
      },
      "walletId": "123e4567-e89b-12d3-a456-426614174000",
      "requestId": "123e4567-e89b-12d3-a456-426614174000",
      "requestCategory": "Disbursement",
      "transactionNumber": 1,
      "amount": 1,
      "memo": null,
      "narration": null,
      "balance": 1,
      "previousBalance": 1,
      "rollback": true,
      "category": "Disbursement",
      "disbursement": {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "createdAt": "2025-09-14T07:57:49.147Z",
        "lastUpdated": null,
        "isDeleted": true,
        "status": "Pending",
        "vendor": "Mock",
        "amount": 1,
        "msisdn": null,
        "vendorTransactionId": null,
        "transactionCharge": 1,
        "vendorCharge": 1
      },
      "collection": {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "createdAt": "2025-09-14T07:57:49.147Z",
        "lastUpdated": null,
        "isDeleted": true,
        "status": "Pending",
        "vendor": "Mock",
        "amount": 1,
        "msisdn": null,
        "vendorTransactionId": null,
        "transactionCharge": 1,
        "vendorCharge": 1
      }
    }
  ],
  "payer": "0111777771",
  "payerName": "John Doe"
}
```

---

## Disbursement

### Initiate Payment Disbursement​#Copy link
This endpoint withdraws money from your ioTec Pay wallet and transfers it to a recipient's mobile money account or bank account.

```javascript

fetch('https://pay.iotec.io/api/disbursements/disburse', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer <jwt-token>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    category: 'MobileMoney',
    currency: 'ITX',
    walletId: '5e83b187-801e-410e-b76e-f491928547e0',
    externalId: '001',
    payeeName: 'John Doe',
    payeeEmail: 'johndoe@gmail.com',
    payee: '0111777771',
    amount: 700,
    payerNote: 'Payment for Invoice #12345',
    payeeNote: 'Customer ID: 78923, Order #: ABC123',
    channel: null,
    bankId: null,
    bankIdentificationCode: null,
    bankTransferType: 'InternalTransfer',
    sendAt: '2025-05-29T05:55:36.578Z'
  })
})

```


Response

```json

{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "createdAt": "2026-01-31T18:11:18.714Z",
  "category": "MobileMoney",
  "status": "Pending",
  "paymentChannel": "Api",
  "statusCode": "pending",
  "statusMessage": "Request is being processed",
  "externalId": "001",
  "amount": 700,
  "payerNote": "Payment for Invoice #12345",
  "payeeNote": "Customer ID: 78923, Order #: ABC123",
  "currency": "ITX",
  "wallet": {
    "id": null,
    "name": null
  },
  "chargeModel": null,
  "createdBy": "2d629907-d515-4943-84b7-da337292bdba",
  "createdByData": {
    "id": null,
    "name": null
  },
  "transactionCharge": 14,
  "vendorCharge": 10.5,
  "totalTransactionCharge": 24.5,
  "vendor": "Mock",
  "vendorTransactionId": null,
  "lastUpdated": null,
  "processedAt": null,
  "transactions": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "createdAt": "2026-01-31T18:11:18.714Z",
      "operation": "TopUp",
      "wallet": {
        "id": null,
        "name": null
      },
      "walletId": "123e4567-e89b-12d3-a456-426614174000",
      "requestId": "123e4567-e89b-12d3-a456-426614174000",
      "requestCategory": "Disbursement",
      "transactionNumber": 1,
      "amount": 1,
      "memo": null,
      "narration": null,
      "balance": 1,
      "previousBalance": 1,
      "rollback": true,
      "category": "Disbursement",
      "disbursement": {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "createdAt": "2026-01-31T18:11:18.714Z",
        "lastUpdated": null,
        "isDeleted": true,
        "status": "Pending",
        "vendor": "Mock",
        "amount": 1,
        "msisdn": null,
        "vendorTransactionId": null,
        "transactionCharge": 1,
        "vendorCharge": 1
      },
      "collection": {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "createdAt": "2026-01-31T18:11:18.714Z",
        "lastUpdated": null,
        "isDeleted": true,
        "status": "Pending",
        "vendor": "Mock",
        "amount": 1,
        "msisdn": null,
        "vendorTransactionId": null,
        "transactionCharge": 1,
        "vendorCharge": 1
      }
    }
  ],
  "payee": "0111777771",
  "payeeName": "JOHN DOE",
  "payeeUploadName": "John Doe",
  "nameStatus": "Pending",
  "bulkId": "5e83b187-801e-410e-b76e-f491928547e0",
  "internalRequestId": null,
  "bankId": "5e83b187-801e-410e-b76e-f491928547e0",
  "bank": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "createdAt": "2026-01-31T18:11:18.714Z",
    "createdBy": null,
    "name": "Stanbic Bank",
    "bankIdentificationCode": "ABCDUGKAXXX",
    "stanbicIdentificationCode": null,
    "mainBranchCode": null,
    "mainBranchName": "Stanbic Main Branch",
    "accountNumberRegex": null
  },
  "bankTransferType": "InternalTransfer",
  "approvalDecision": true,
  "decisionMadeBy": "5e83b187-801e-410e-b76e-f491928547e0",
  "decisionMadeByData": {
    "id": null,
    "name": null
  },
  "decisionMadeAt": "2025-05-29T05:55:36.578Z",
  "decisionRemarks": "Approved after verifying recipient details with client.",
  "sendAt": "2025-05-29T05:55:36.578Z",
  "decisions": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "createdAt": "2026-01-31T18:11:18.714Z",
      "category": "Approve",
      "disbursementId": "123e4567-e89b-12d3-a456-426614174000",
      "createdBy": null,
      "role": null,
      "decisionMadeBy": null,
      "decisionMadeAt": null,
      "decisionRemarks": null
    }
  ]
}

```

Error response 

```
{
  "message": "Invalid ioTec wallet",
  "code": "BadRequest"
}
```

### Transfer funds to bank account​#Copy link
This endpoint withdraws money from your ioTec Pay wallet and transfers it to a recipient's bank account.

```javascript

fetch('https://pay.iotec.io/api/disbursements/bank-disburse', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer <jwt-token>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    bankId: '5e83b187-801e-410e-b76e-f491928547e0',
    bankIdentificationCode: 'ABCDUGKAXXX',
    transferType: 'InternalTransfer',
    currency: 'ITX',
    walletId: '5e83b187-801e-410e-b76e-f491928547e0',
    externalId: '001',
    accountName: 'John Doe',
    accountNumber: '1234567890',
    amount: 700,
    payeeNote: 'Customer ID: 78923, Order #: ABC123',
    channel: null,
    sendAt: '2025-05-29T05:55:36.578Z'
  })
})

```

Response
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "createdAt": "2026-01-31T18:11:18.714Z",
  "category": "MobileMoney",
  "status": "Pending",
  "paymentChannel": "Api",
  "statusCode": "pending",
  "statusMessage": "Request is being processed",
  "externalId": "001",
  "amount": 700,
  "payerNote": "Payment for Invoice #12345",
  "payeeNote": "Customer ID: 78923, Order #: ABC123",
  "currency": "ITX",
  "wallet": {
    "id": null,
    "name": null
  },
  "chargeModel": null,
  "createdBy": "2d629907-d515-4943-84b7-da337292bdba",
  "createdByData": {
    "id": null,
    "name": null
  },
  "transactionCharge": 14,
  "vendorCharge": 10.5,
  "totalTransactionCharge": 24.5,
  "vendor": "Mock",
  "vendorTransactionId": null,
  "lastUpdated": null,
  "processedAt": null,
  "transactions": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "createdAt": "2026-01-31T18:11:18.714Z",
      "operation": "TopUp",
      "wallet": {
        "id": null,
        "name": null
      },
      "walletId": "123e4567-e89b-12d3-a456-426614174000",
      "requestId": "123e4567-e89b-12d3-a456-426614174000",
      "requestCategory": "Disbursement",
      "transactionNumber": 1,
      "amount": 1,
      "memo": null,
      "narration": null,
      "balance": 1,
      "previousBalance": 1,
      "rollback": true,
      "category": "Disbursement",
      "disbursement": {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "createdAt": "2026-01-31T18:11:18.714Z",
        "lastUpdated": null,
        "isDeleted": true,
        "status": "Pending",
        "vendor": "Mock",
        "amount": 1,
        "msisdn": null,
        "vendorTransactionId": null,
        "transactionCharge": 1,
        "vendorCharge": 1
      },
      "collection": {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "createdAt": "2026-01-31T18:11:18.714Z",
        "lastUpdated": null,
        "isDeleted": true,
        "status": "Pending",
        "vendor": "Mock",
        "amount": 1,
        "msisdn": null,
        "vendorTransactionId": null,
        "transactionCharge": 1,
        "vendorCharge": 1
      }
    }
  ],
  "payee": "0111777771",
  "payeeName": "JOHN DOE",
  "payeeUploadName": "John Doe",
  "nameStatus": "Pending",
  "bulkId": "5e83b187-801e-410e-b76e-f491928547e0",
  "internalRequestId": null,
  "bankId": "5e83b187-801e-410e-b76e-f491928547e0",
  "bank": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "createdAt": "2026-01-31T18:11:18.714Z",
    "createdBy": null,
    "name": "Stanbic Bank",
    "bankIdentificationCode": "ABCDUGKAXXX",
    "stanbicIdentificationCode": null,
    "mainBranchCode": null,
    "mainBranchName": "Stanbic Main Branch",
    "accountNumberRegex": null
  },
  "bankTransferType": "InternalTransfer",
  "approvalDecision": true,
  "decisionMadeBy": "5e83b187-801e-410e-b76e-f491928547e0",
  "decisionMadeByData": {
    "id": null,
    "name": null
  },
  "decisionMadeAt": "2025-05-29T05:55:36.578Z",
  "decisionRemarks": "Approved after verifying recipient details with client.",
  "sendAt": "2025-05-29T05:55:36.578Z",
  "decisions": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "createdAt": "2026-01-31T18:11:18.714Z",
      "category": "Approve",
      "disbursementId": "123e4567-e89b-12d3-a456-426614174000",
      "createdBy": null,
      "role": null,
      "decisionMadeBy": null,
      "decisionMadeAt": null,
      "decisionRemarks": null
    }
  ]
}
```

### Get transaction status​#Copy link
This endpoint is used to get the details of a disbursement transaction including the status.

```javascript
fetch('https://pay.iotec.io/api/disbursements/status/', {
  headers: {
    Authorization: 'Bearer <jwt-token>'
  }
})
```

200 Response 

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "createdAt": "2026-01-31T18:11:18.714Z",
  "category": "MobileMoney",
  "status": "Pending",
  "paymentChannel": "Api",
  "statusCode": "pending",
  "statusMessage": "Request is being processed",
  "externalId": "001",
  "amount": 700,
  "payerNote": "Payment for Invoice #12345",
  "payeeNote": "Customer ID: 78923, Order #: ABC123",
  "currency": "ITX",
  "wallet": {
    "id": null,
    "name": null
  },
  "chargeModel": null,
  "createdBy": "2d629907-d515-4943-84b7-da337292bdba",
  "createdByData": {
    "id": null,
    "name": null
  },
  "transactionCharge": 14,
  "vendorCharge": 10.5,
  "totalTransactionCharge": 24.5,
  "vendor": "Mock",
  "vendorTransactionId": null,
  "lastUpdated": null,
  "processedAt": null,
  "payee": "0111777771",
  "payeeName": "JOHN DOE",
  "payeeUploadName": "John Doe",
  "nameStatus": "Pending",
  "bulkId": "5e83b187-801e-410e-b76e-f491928547e0",
  "internalRequestId": null,
  "bankId": "5e83b187-801e-410e-b76e-f491928547e0",
  "bank": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "createdAt": "2026-01-31T18:11:18.714Z",
    "createdBy": null,
    "name": "Stanbic Bank",
    "bankIdentificationCode": "ABCDUGKAXXX",
    "stanbicIdentificationCode": null,
    "mainBranchCode": null,
    "mainBranchName": "Stanbic Main Branch",
    "accountNumberRegex": null
  },
  "bankTransferType": "InternalTransfer",
  "approvalDecision": true,
  "decisionMadeBy": "5e83b187-801e-410e-b76e-f491928547e0",
  "decisionMadeByData": {
    "id": null,
    "name": null
  },
  "decisionMadeAt": "2025-05-29T05:55:36.578Z",
  "decisionRemarks": "Approved after verifying recipient details with client.",
  "sendAt": "2025-05-29T05:55:36.578Z"
}
```

### Get transaction status by externalId​#Copy link
This endpoint is used to get the details of a disbursement transaction including the status with the use of your own reference ID (externalId).

```javascript
fetch('https://pay.iotec.io/api/disbursements/external-id/', {
  headers: {
    Authorization: 'Bearer <jwt-token>'
  }
})
```

200 response
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "createdAt": "2026-01-31T18:11:18.714Z",
  "category": "MobileMoney",
  "status": "Pending",
  "paymentChannel": "Api",
  "statusCode": "pending",
  "statusMessage": "Request is being processed",
  "externalId": "001",
  "amount": 700,
  "payerNote": "Payment for Invoice #12345",
  "payeeNote": "Customer ID: 78923, Order #: ABC123",
  "currency": "ITX",
  "wallet": {
    "id": null,
    "name": null
  },
  "chargeModel": null,
  "createdBy": "2d629907-d515-4943-84b7-da337292bdba",
  "createdByData": {
    "id": null,
    "name": null
  },
  "transactionCharge": 14,
  "vendorCharge": 10.5,
  "totalTransactionCharge": 24.5,
  "vendor": "Mock",
  "vendorTransactionId": null,
  "lastUpdated": null,
  "processedAt": null,
  "payee": "0111777771",
  "payeeName": "JOHN DOE",
  "payeeUploadName": "John Doe",
  "nameStatus": "Pending",
  "bulkId": "5e83b187-801e-410e-b76e-f491928547e0",
  "internalRequestId": null,
  "bankId": "5e83b187-801e-410e-b76e-f491928547e0",
  "bank": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "createdAt": "2026-01-31T18:11:18.714Z",
    "createdBy": null,
    "name": "Stanbic Bank",
    "bankIdentificationCode": "ABCDUGKAXXX",
    "stanbicIdentificationCode": null,
    "mainBranchCode": null,
    "mainBranchName": "Stanbic Main Branch",
    "accountNumberRegex": null
  },
  "bankTransferType": "InternalTransfer",
  "approvalDecision": true,
  "decisionMadeBy": "5e83b187-801e-410e-b76e-f491928547e0",
  "decisionMadeByData": {
    "id": null,
    "name": null
  },
  "decisionMadeAt": "2025-05-29T05:55:36.578Z",
  "decisionRemarks": "Approved after verifying recipient details with client.",
  "sendAt": "2025-05-29T05:55:36.578Z"
}
```

### Overrides the default payout schedule and pays out immediately.

```javascript
fetch('https://pay.iotec.io/api/disbursements/override-schedule', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer <jwt-token>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    disbursementId: '5e83b187-801e-410e-b76e-f491928547e0',
    decision: true,
    remarks: 'Approved after verifying recipient details with client.'
  })
})
```

200 response
```json
{
  "statusCode": 1
}
```