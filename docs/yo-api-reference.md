# Yo! Payments API Technical Reference

## API Basics

**Endpoints:**
- Production: `https://paymentsapi1.yo.co.ug/ybs/task.php` (or `paymentsapi2`)
- Sandbox: `https://sandbox.yo.co.ug/ybs/task.php`

**Request Format:** XML via HTTP POST

**Required Headers:**
```
Content-Type: text/xml
Content-transfer-encoding: text
```

**Authentication:** API Username + Password in every request body

---

## Request Structure

All requests follow this XML structure:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<AutoCreate>
  <Request>
    <APIUsername>your_username</APIUsername>
    <APIPassword>your_password</APIPassword>
    <Method>method_name</Method>
    <!-- method-specific parameters -->
  </Request>
</AutoCreate>
```

---

## Response Structure

### Success (StatusCode = 0)
```xml
<AutoCreate>
  <Response>
    <Status>OK</Status>
    <StatusCode>0</StatusCode>
    <TransactionStatus>SUCCEEDED</TransactionStatus>
    <TransactionReference>unique_ref</TransactionReference>
    <MNOTransactionReferenceId>network_ref</MNOTransactionReferenceId>
  </Response>
</AutoCreate>
```

### Pending (StatusCode = 1)
```xml
<AutoCreate>
  <Response>
    <Status>OK</Status>
    <StatusCode>1</StatusCode>
    <TransactionStatus>PENDING</TransactionStatus>
    <TransactionReference>unique_ref</TransactionReference>
  </Response>
</AutoCreate>
```

### Error (Status = ERROR)
```xml
<AutoCreate>
  <Response>
    <Status>ERROR</Status>
    <StatusCode>-1</StatusCode>
    <StatusMessage>Error description</StatusMessage>
    <ErrorMessage>Detailed error</ErrorMessage>
    <TransactionStatus>FAILED</TransactionStatus>
  </Response>
</AutoCreate>
```

### Transaction Status Values
- `SUCCEEDED` - Transaction completed successfully
- `FAILED` - Transaction failed
- `PENDING` - Awaiting processing or user action
- `INDETERMINATE` - Status unclear, resolves within 24 hours

---

## Core API Methods

### 1. Deposit Funds (Receive Payment)

**Method:** `acdepositfunds`

**Purpose:** Request payment from a mobile money user. Sends USSD prompt to their phone.

**Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| Method | Yes | `acdepositfunds` |
| NonBlocking | Yes | Set to `TRUE` for async (recommended) |
| Amount | Yes | Payment amount (numeric) |
| Account | Yes | Phone number with country code (e.g., `256771234567`) |
| Narrative | Yes | Payment description (max 4096 chars) |
| ExternalReference | No | Your internal reference for tracking |
| ProviderReferenceText | No | Text to include in customer's SMS confirmation |
| InstantNotificationUrl | No | URL for success webhook (IPN) |
| FailureNotificationUrl | No | URL for failure webhook |

**Example Request:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<AutoCreate>
  <Request>
    <APIUsername>your_username</APIUsername>
    <APIPassword>your_password</APIPassword>
    <Method>acdepositfunds</Method>
    <NonBlocking>TRUE</NonBlocking>
    <Amount>50000</Amount>
    <Account>256771234567</Account>
    <Narrative>Rent payment for Unit 101</Narrative>
    <ExternalReference>PAY-001-2025</ExternalReference>
    <InstantNotificationUrl>https://yoursite.com/api/yo/ipn</InstantNotificationUrl>
    <FailureNotificationUrl>https://yoursite.com/api/yo/failure</FailureNotificationUrl>
  </Request>
</AutoCreate>
```

**Response (NonBlocking=TRUE):**
```xml
<AutoCreate>
  <Response>
    <Status>OK</Status>
    <StatusCode>1</StatusCode>
    <TransactionStatus>PENDING</TransactionStatus>
    <TransactionReference>yo-txn-123456</TransactionReference>
  </Response>
</AutoCreate>
```

**Flow:**
1. You send request → Yo! returns PENDING with TransactionReference
2. Customer receives USSD prompt on phone
3. Customer enters PIN to approve
4. Yo! sends IPN to your InstantNotificationUrl
5. You process IPN and credit the account

---

### 2. Withdraw Funds (Send Payment)

**Method:** `acwithdrawfunds`

**Purpose:** Send money from your Yo! account to a mobile money user.

**Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| Method | Yes | `acwithdrawfunds` |
| NonBlocking | No | Set to `TRUE` for async |
| Amount | Yes | Amount to send |
| Account | Yes | Recipient phone number (e.g., `256771234567`) |
| Narrative | Yes | Transaction description |
| ExternalReference | No | Your internal reference |
| ProviderReferenceText | No | Text for recipient's SMS |
| PublicKeyAuthenticationNonce | Conditional | Unique string for signature (if auth enabled) |
| PublicKeyAuthenticationSignatureBase64 | Conditional | RSA signature (if auth enabled) |

**Example Request:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<AutoCreate>
  <Request>
    <APIUsername>your_username</APIUsername>
    <APIPassword>your_password</APIPassword>
    <Method>acwithdrawfunds</Method>
    <Amount>100000</Amount>
    <Account>256772345678</Account>
    <Narrative>Rent disbursement - January 2025</Narrative>
    <ExternalReference>DISB-001-2025</ExternalReference>
  </Request>
</AutoCreate>
```

**Success Response:**
```xml
<AutoCreate>
  <Response>
    <Status>OK</Status>
    <StatusCode>0</StatusCode>
    <TransactionStatus>SUCCEEDED</TransactionStatus>
    <TransactionReference>yo-txn-789</TransactionReference>
    <MNOTransactionReferenceId>MNO123456</MNOTransactionReferenceId>
  </Response>
</AutoCreate>
```

**Signature Calculation (if public key auth enabled):**
1. Concatenate: `APIUsername + Amount + Account + Narrative + ExternalReference + Nonce`
2. If any field > 255 chars, use only first 255
3. Calculate SHA1 hash of concatenated string
4. Sign hash with your RSA private key
5. Base64 encode the signature

---

### 3. Check Transaction Status

**Method:** `actransactioncheckstatus`

**Purpose:** Query status of a previous transaction.

**Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| Method | Yes | `actransactioncheckstatus` |
| TransactionReference | Conditional | Yo!'s transaction reference |
| PrivateTransactionReference | Conditional | Your ExternalReference |

One of the two references is required. If both provided, TransactionReference takes precedence.

**Example Request:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<AutoCreate>
  <Request>
    <APIUsername>your_username</APIUsername>
    <APIPassword>your_password</APIPassword>
    <Method>actransactioncheckstatus</Method>
    <PrivateTransactionReference>PAY-001-2025</PrivateTransactionReference>
  </Request>
</AutoCreate>
```

**Response includes:**
- `TransactionStatus` - SUCCEEDED, FAILED, PENDING, or INDETERMINATE
- `Amount`, `AmountFormatted`, `CurrencyCode`
- `TransactionInitiationDate`, `TransactionCompletionDate`
- `IssuedReceiptNumber` (for deposits)

---

### 4. Check Account Balance

**Method:** `acacctbalance`

**Purpose:** Get your Yo! account balance(s).

**Example Request:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<AutoCreate>
  <Request>
    <APIUsername>your_username</APIUsername>
    <APIPassword>your_password</APIPassword>
    <Method>acacctbalance</Method>
  </Request>
</AutoCreate>
```

**Response:**
```xml
<AutoCreate>
  <Response>
    <Status>OK</Status>
    <StatusCode>0</StatusCode>
    <Balance>
      <Currency>
        <Code>UGX</Code>
        <Balance>5000000.00</Balance>
      </Currency>
    </Balance>
  </Response>
</AutoCreate>
```

Note: Multiple Currency elements if you have multiple currency balances.

---

## Webhooks

### Instant Payment Notification (IPN)

Sent to `InstantNotificationUrl` when deposit succeeds.

**Method:** HTTP POST with form-urlencoded body

**Parameters received:**

| Parameter | Description |
|-----------|-------------|
| date_time | Transaction timestamp |
| amount | Transaction amount |
| narrative | Payment reason |
| network_ref | Mobile network reference |
| external_ref | Your ExternalReference |
| msisdn | Payer's phone number |
| payer_names | Payer's registered name |
| payer_email | Payer's email (if available) |
| signature | Base64 RSA signature for verification |

**Example payload:**
```
date_time=2025-01-15+10%3A30%3A00&amount=50000&narrative=Rent+payment&network_ref=MNO789&external_ref=PAY-001-2025&msisdn=256771234567&payer_names=John+Doe&signature=BASE64_SIGNATURE
```

**Signature Verification:**
1. Concatenate in order: `date_time + amount + narrative + network_ref + external_ref + msisdn`
2. Calculate SHA1 hash
3. Base64-decode the received signature
4. Verify using Yo!'s public key with RSA-SHA1

**Your Response:**
- Return HTTP 200 to acknowledge (prevents retries)
- Optionally include SMS text: `narrative=Thank+you+for+your+payment`

---

### Failure Notification

Sent to `FailureNotificationUrl` when deposit fails.

**Parameters received:**

| Parameter | Description |
|-----------|-------------|
| failed_transaction_reference | Your ExternalReference |
| transaction_init_date | When transaction was initiated |
| verification | Base64 RSA signature |

**Signature Verification:**
1. Concatenate: `failed_transaction_reference + transaction_init_date`
2. Calculate SHA1 hash
3. Verify with Yo!'s public key

**Your Response:** Return HTTP 200

---

## Common Status Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Pending/Processing |
| -1 | General error |
| -2 | Invalid API credentials |
| -3 | Insufficient balance |
| -10 | Invalid phone number |
| -20 | Transaction limit exceeded |
| -30 | Transaction not found (for status check) |
| -40 | Duplicate transaction reference |

---

## Phone Number Format

**Required format:** Country code + number, no `+` sign

- Uganda MTN: `256771234567`
- Uganda Airtel: `256751234567`

Always validate: `/^256\d{9}$/`

---

## Best Practices

1. **Always use NonBlocking=TRUE** for deposits - avoids timeout issues
2. **Always provide ExternalReference** - enables status lookup by your reference
3. **Always provide callback URLs** - don't rely on polling alone
4. **Verify all webhook signatures** - prevent fraud
5. **Return HTTP 200 for webhooks** - even on verification failure (log and investigate)
6. **Check balance before withdrawals** - avoid failed transactions
7. **Store raw responses** - useful for debugging
8. **Handle INDETERMINATE status** - retry status check, resolves within 24 hours
9. **Use unique ExternalReference** - include timestamp or UUID component

---

## Sandbox Testing

**Signup:** https://sandbox.yo.co.ug/services/yopaymentsdev/signup/start/?sid=1

**Portal:** https://sandbox.yo.co.ug/services/yopaymentsdev/portal/

**Special test behaviors:**
- Amounts ending in `00` (e.g., 5000) → Success
- Amounts ending in `01` (e.g., 5001) → Failure
- Use sandbox URL for all test requests

---

## Quick Implementation Checklist

1. [ ] Set up XML request builder (construct XML from parameters)
2. [ ] Set up XML response parser (extract fields from response)
3. [ ] Implement `acdepositfunds` with NonBlocking=TRUE
4. [ ] Implement `acwithdrawfunds`
5. [ ] Implement `actransactioncheckstatus`
6. [ ] Implement `acacctbalance`
7. [ ] Create IPN webhook endpoint
8. [ ] Implement IPN signature verification
9. [ ] Create failure webhook endpoint
10. [ ] Implement failure signature verification
11. [ ] Test in sandbox
12. [ ] Switch to production URLs
