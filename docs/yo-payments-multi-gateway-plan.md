# Yo! Payments Integration Plan for Verit (Multi-Gateway Architecture)

## Overview

Integrate Yo! Payments alongside the existing IoTec Pay integration using a **Payment Gateway Abstraction Layer**. This allows switching between gateways via environment variables without code changes.

---

## Architecture Approach

### Gateway Abstraction Pattern

Create a unified interface that both IoTec and Yo! implement. The application code interacts only with this interface, never directly with gateway-specific code.

```
┌─────────────────────────────────────────────────────┐
│                  Application Layer                   │
│         (PaymentService, Routes, Jobs)              │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│              PaymentGateway Interface               │
│    (deposit, withdraw, checkStatus, getBalance)     │
└─────────────────────┬───────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
┌──────────────────┐    ┌──────────────────┐
│  IoTecGateway    │    │   YoGateway      │
│  (existing)      │    │   (new)          │
└──────────────────┘    └──────────────────┘
```

---

## Phase 1: Define Gateway Interface

### 1.1 Create Payment Gateway Interface

**File:** `src/gateways/types.ts`

Define TypeScript interfaces for:

- `PaymentGatewayConfig` - Gateway-specific configuration
- `DepositRequest` - Common deposit parameters (amount, phone, reference, narrative, callbacks)
- `WithdrawRequest` - Common withdrawal parameters
- `TransactionResult` - Standardized response (success, pending, reference, status, rawResponse)
- `TransactionStatus` - Enum: `pending`, `processing`, `succeeded`, `failed`, `indeterminate`
- `BalanceResult` - Array of currency/balance pairs
- `PaymentGateway` - Main interface with methods:
  - `deposit(request: DepositRequest): Promise<TransactionResult>`
  - `withdraw(request: WithdrawRequest): Promise<TransactionResult>`
  - `checkStatus(reference: string): Promise<TransactionResult>`
  - `getBalance(): Promise<BalanceResult[]>`
  - `verifyWebhook(payload: any, signature: string): boolean`
  - `getProviderName(): string`

### 1.2 Create Gateway Factory

**File:** `src/gateways/gatewayFactory.ts`

- Read `PAYMENT_GATEWAY` environment variable
- Return appropriate gateway instance based on value (`iotec` or `yo`)
- Throw error if invalid gateway specified
- Export singleton `getPaymentGateway()` function

---

## Phase 2: Refactor IoTec to Gateway Interface

### 2.1 Create IoTec Gateway Adapter

**File:** `src/gateways/iotec/iotecGateway.ts`

- Implement `PaymentGateway` interface
- Wrap existing IoTec service methods
- Map IoTec-specific responses to standardized `TransactionResult`
- Map IoTec status codes to `TransactionStatus` enum

### 2.2 Move IoTec Utilities

**File:** `src/gateways/iotec/`

- Move existing IoTec-specific code into this directory
- Keep existing logic intact, just reorganize
- Export through gateway interface only

---

## Phase 3: Implement Yo! Gateway

### 3.1 Yo! Configuration

**File:** `src/gateways/yo/config.ts`

- Load Yo! credentials from environment variables
- Define sandbox vs production URL selection
- Load public/private keys for signature operations

### 3.2 Yo! XML Utilities

**File:** `src/gateways/yo/xmlUtils.ts`

- Function to build XML request from parameters
- Function to parse XML response to object
- Helper functions to check response status (success/pending/error)

### 3.3 Yo! API Client

**File:** `src/gateways/yo/apiClient.ts`

- HTTP client configured for Yo! API (XML content type, timeout)
- Methods for each Yo! API operation:
  - `acdepositfunds` - With NonBlocking=TRUE
  - `acwithdrawfunds` - With optional signature auth
  - `actransactioncheckstatus`
  - `acacctbalance`

### 3.4 Yo! Webhook Verification

**File:** `src/gateways/yo/webhookVerifier.ts`

- IPN signature verification using RSA-SHA1
- Failure notification signature verification
- Concatenate fields in correct order, hash, verify against public key

### 3.5 Yo! Gateway Implementation

**File:** `src/gateways/yo/yoGateway.ts`

- Implement `PaymentGateway` interface
- Use API client for operations
- Map Yo! responses to standardized `TransactionResult`
- Map Yo! status values to `TransactionStatus` enum

---

## Phase 4: Database Changes

### 4.1 Modify Existing Transactions Table

Add columns to existing payment/transaction tracking:

- `gateway` - Enum: `iotec`, `yo` - Which gateway processed this transaction
- `gateway_reference` - The gateway's transaction reference
- `gateway_raw_response` - Store raw response for debugging

Alternatively, if you want separate tracking:

### 4.2 Create Gateway-Agnostic Transaction Log Table

**Table:** `payment_gateway_transactions`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| gateway | ENUM('iotec', 'yo') | Which gateway |
| type | ENUM('deposit', 'withdrawal') | Transaction type |
| status | ENUM (standardized) | Current status |
| amount | DECIMAL | Transaction amount |
| currency | VARCHAR(3) | Currency code |
| msisdn | VARCHAR(15) | Phone number |
| internal_reference | VARCHAR | Your reference |
| gateway_reference | VARCHAR | Gateway's reference |
| mno_reference | VARCHAR | Mobile network reference |
| user_id | UUID | FK to users |
| payment_id | UUID | FK to payments (for deposits) |
| lease_id | UUID | FK to leases |
| webhook_received_at | TIMESTAMP | When webhook arrived |
| webhook_verified | BOOLEAN | Signature valid |
| raw_request | TEXT | Sent request |
| raw_response | TEXT | Received response |
| raw_webhook | TEXT | Webhook payload |
| error_message | TEXT | Error details |
| initiated_at | TIMESTAMP | When initiated |
| completed_at | TIMESTAMP | When completed |
| created_at | TIMESTAMP | Record created |
| updated_at | TIMESTAMP | Record updated |

### 4.3 Landlord Payout Accounts

**Table:** `landlord_payout_accounts`

Same as original plan - stores landlord mobile money account details for disbursements.

---

## Phase 5: Unified Payment Service

### 5.1 Refactor PaymentService

**File:** `src/services/paymentService.ts`

Modify existing service to:

- Get gateway instance from factory instead of calling IoTec directly
- Use standardized interfaces for all gateway operations
- Store gateway identifier with each transaction
- Handle both gateway's webhook formats through abstraction

Key methods:
- `initiateRentPayment(params)` - Calls `gateway.deposit()`
- `initiateDisbursement(params)` - Calls `gateway.withdraw()`
- `checkTransactionStatus(reference)` - Calls `gateway.checkStatus()`
- `processWebhook(gateway, payload)` - Routes to correct verifier

### 5.2 Transaction Recording

Create helper to record all gateway interactions:

- Log request before sending
- Log response after receiving
- Log webhook when received
- Track status transitions

---

## Phase 6: Webhook Routes

### 6.1 Gateway-Specific Webhook Endpoints

**IoTec webhooks** (existing):
- `POST /api/payments/iotec/callback` - Keep existing

**Yo! webhooks** (new):
- `POST /api/payments/yo/ipn` - Success notifications
- `POST /api/payments/yo/failure` - Failure notifications

### 6.2 Webhook Processing Logic

For each webhook endpoint:

1. Log raw incoming payload
2. Get appropriate gateway instance
3. Call `gateway.verifyWebhook(payload, signature)`
4. If invalid, log warning, return 200 (don't retry)
5. Extract standardized data from payload
6. Find transaction by external reference
7. Update transaction status
8. If deposit success: create payment record, apply to schedules
9. If withdrawal success: update disbursement record
10. Return 200 OK

For Yo! IPN specifically:
- Optionally return SMS narrative in response body

---

## Phase 7: Environment Configuration

### 7.1 Environment Variables

```bash
# Gateway Selection
PAYMENT_GATEWAY=iotec  # or 'yo'

# IoTec Configuration (existing)
IOTEC_API_KEY=xxx
IOTEC_API_SECRET=xxx
IOTEC_CALLBACK_URL=xxx

# Yo! Configuration (new)
YO_API_USERNAME=xxx
YO_API_PASSWORD=xxx
YO_API_URL=https://paymentsapi1.yo.co.ug/ybs/task.php
YO_SANDBOX_URL=https://sandbox.yo.co.ug/ybs/task.php
YO_USE_SANDBOX=true
YO_IPN_URL=https://your-domain.com/api/payments/yo/ipn
YO_FAILURE_URL=https://your-domain.com/api/payments/yo/failure
YO_PUBLIC_KEY_PATH=./keys/yo_public.pem
YO_PRIVATE_KEY_PATH=./keys/yo_private.pem
```

### 7.2 Configuration Validation

On application startup:
- Check which gateway is selected
- Validate required env vars for that gateway exist
- Log warning if switching gateways with pending transactions

---

## Phase 8: Background Jobs

### 8.1 Generic Transaction Status Checker

Modify existing job (or create new):

- Query pending transactions from database
- Group by gateway
- For each gateway, call `checkStatus()` through interface
- Update database with results
- Works for both IoTec and Yo! without gateway-specific code

### 8.2 Balance Alert Job

- Get current gateway from factory
- Call `gateway.getBalance()`
- Alert if below threshold
- Log which gateway balance was checked

---

## Phase 9: Testing Strategy

### 9.1 Unit Tests

- Test gateway interface implementations independently
- Mock HTTP calls for each gateway
- Test response mapping to standardized format
- Test webhook signature verification

### 9.2 Integration Tests

- Test gateway factory returns correct instance
- Test PaymentService works with mocked gateway
- Test webhook processing for both gateways

### 9.3 Manual Testing

- Test IoTec in sandbox (existing)
- Test Yo! in sandbox (new)
- Verify switching via env var works
- Test webhook delivery for both

---

## Implementation Checklist

### Gateway Abstraction
- [ ] Define `PaymentGateway` interface and types
- [ ] Create gateway factory with env var selection
- [ ] Create IoTec gateway adapter (wrap existing code)
- [ ] Create Yo! gateway implementation

### Yo! Specific
- [ ] Yo! configuration module
- [ ] XML request builder
- [ ] XML response parser
- [ ] API client (deposit, withdraw, status, balance)
- [ ] IPN signature verification
- [ ] Failure notification verification

### Database
- [ ] Add gateway tracking columns or create new table
- [ ] Create landlord payout accounts table
- [ ] Write and run migrations

### Services
- [ ] Refactor PaymentService to use gateway interface
- [ ] Create transaction logging helper
- [ ] Update payment application logic

### Routes
- [ ] Add Yo! IPN webhook endpoint
- [ ] Add Yo! failure webhook endpoint
- [ ] Keep IoTec webhooks unchanged

### Configuration
- [ ] Add Yo! environment variables
- [ ] Add PAYMENT_GATEWAY selector variable
- [ ] Add startup validation

### Jobs
- [ ] Update transaction checker to be gateway-agnostic
- [ ] Update balance alert to use gateway interface

### Testing
- [ ] Unit tests for Yo! gateway
- [ ] Unit tests for gateway factory
- [ ] Integration tests for payment flow
- [ ] Sandbox testing for both gateways

---

## Directory Structure

```
src/
├── gateways/
│   ├── types.ts                 # Shared interfaces
│   ├── gatewayFactory.ts        # Factory function
│   ├── iotec/
│   │   ├── index.ts
│   │   ├── iotecGateway.ts      # Interface implementation
│   │   ├── apiClient.ts         # Existing IoTec client
│   │   └── webhookHandler.ts    # Existing webhook logic
│   └── yo/
│       ├── index.ts
│       ├── config.ts            # Yo! configuration
│       ├── yoGateway.ts         # Interface implementation
│       ├── apiClient.ts         # Yo! API client
│       ├── xmlUtils.ts          # XML helpers
│       └── webhookVerifier.ts   # Signature verification
├── services/
│   └── paymentService.ts        # Uses gateway interface
├── routes/
│   └── payments.ts              # Includes both webhook routes
└── jobs/
    └── transactionChecker.ts    # Gateway-agnostic
```

---

## Migration Path

1. **Phase A**: Implement gateway abstraction with IoTec only
   - Create interface
   - Wrap IoTec in adapter
   - Refactor PaymentService to use interface
   - Verify existing functionality unchanged

2. **Phase B**: Add Yo! gateway
   - Implement Yo! gateway
   - Add Yo! webhook routes
   - Add Yo! environment variables
   - Test with `PAYMENT_GATEWAY=yo`

3. **Phase C**: Production rollout
   - Deploy with `PAYMENT_GATEWAY=iotec` (no change)
   - Configure Yo! credentials
   - Switch to `PAYMENT_GATEWAY=yo` when ready
   - Monitor transactions

---

## Switching Gateways

To switch from IoTec to Yo!:

1. Ensure all pending IoTec transactions are resolved
2. Set `PAYMENT_GATEWAY=yo` in environment
3. Restart application
4. New transactions use Yo!
5. Existing transaction history preserved with gateway identifier

To switch back:
1. Set `PAYMENT_GATEWAY=iotec`
2. Restart application

---

## Notes

- **Phone Format**: Both gateways expect `256XXXXXXXXX` format - validate at service layer
- **Idempotency**: Generate unique internal references regardless of gateway
- **Webhook Security**: Each gateway has different verification - handle in gateway-specific code
- **Error Mapping**: Map gateway-specific errors to common error types for consistent API responses
- **Logging**: Log gateway name with every transaction for debugging
- **Pending Transactions**: Don't switch gateways while transactions are pending - they need their original gateway to check status
