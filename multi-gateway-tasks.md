# Multi-Payment Gateway - Task List

## Phase 1: Gateway Abstraction Layer

### Task 1.1: Define Gateway Types and Interfaces
**Status**: `pending`
**Priority**: High
**File**: `src/gateways/types.ts`

Create the core TypeScript interfaces:
- [ ] `PaymentGatewayConfig` - Base configuration type
- [ ] `DepositRequest` - Phone, amount, reference, narrative, callbacks
- [ ] `WithdrawRequest` - Phone, amount, reference, narrative
- [ ] `TransactionResult` - Success, status, references, amount, raw response
- [ ] `TransactionStatus` - Enum: pending, processing, succeeded, failed, indeterminate
- [ ] `BalanceResult` - Currency and amount pairs
- [ ] `PaymentGateway` - Main interface with all methods
- [ ] `WebhookPayload` - Base webhook payload type

---

### Task 1.2: Create Gateway Factory
**Status**: `pending`
**Priority**: High
**File**: `src/gateways/gatewayFactory.ts`

Implement factory pattern:
- [ ] Read `PAYMENT_GATEWAY` environment variable
- [ ] Import IoTec and Yo! gateway implementations
- [ ] Return singleton instance based on env value
- [ ] Throw descriptive error for invalid gateway
- [ ] Export `getPaymentGateway()` function
- [ ] Add type safety for gateway names

---

### Task 1.3: Create IoTec Gateway Adapter
**Status**: `pending`
**Priority**: High
**Files**: `src/gateways/iotec/iotecGateway.ts`, `src/gateways/iotec/config.ts`, `src/gateways/iotec/index.ts`

Wrap existing IoTecService:
- [ ] Create IoTec configuration module
- [ ] Implement `PaymentGateway` interface
- [ ] Map `initiateCollection()` to `deposit()`
- [ ] Implement `withdraw()` (if supported, or throw not implemented)
- [ ] Map `getTransactionStatus()` to `checkStatus()`
- [ ] Implement `getBalance()` (if supported)
- [ ] Implement `verifyWebhook()` for IoTec callbacks
- [ ] Map IoTec status codes to `TransactionStatus` enum
- [ ] Return `getProviderName()` as 'iotec'

---

### Task 1.4: Update PaymentService to Use Gateway Interface
**Status**: `pending`
**Priority**: High
**File**: `src/services/paymentService.ts`

Refactor to use abstraction:
- [ ] Import `getPaymentGateway` from factory
- [ ] Replace direct `IoTecService` calls with gateway interface
- [ ] Update `initiatePayment()` to use `gateway.deposit()`
- [ ] Update status polling to use `gateway.checkStatus()`
- [ ] Store gateway name with payment record
- [ ] Handle both gateway's response formats through interface
- [ ] Add gateway to payment creation data

---

### Task 1.5: Verify IoTec Still Works
**Status**: `pending`
**Priority**: High

Validation:
- [ ] Set `PAYMENT_GATEWAY=iotec` in environment
- [ ] Test payment initiation
- [ ] Test webhook reception
- [ ] Test status polling
- [ ] Verify no regression in existing functionality

---

## Phase 2: Yo! Gateway Implementation

### Task 2.1: Create Yo! Configuration Module
**Status**: `pending`
**Priority**: High
**File**: `src/gateways/yo/config.ts`

Configuration setup:
- [ ] Define `YoConfig` interface
- [ ] Load `YO_API_USERNAME` from env
- [ ] Load `YO_API_PASSWORD` from env
- [ ] Load `YO_API_URL` (production)
- [ ] Load `YO_SANDBOX_URL`
- [ ] Load `YO_USE_SANDBOX` boolean
- [ ] Load `YO_IPN_URL`
- [ ] Load `YO_FAILURE_URL`
- [ ] Load `YO_PUBLIC_KEY_PATH`
- [ ] Implement `getApiUrl()` - returns sandbox or production
- [ ] Add validation for required fields
- [ ] Export singleton config object

---

### Task 2.2: Implement XML Utilities
**Status**: `pending`
**Priority**: High
**File**: `src/gateways/yo/xmlUtils.ts`

XML handling:
- [ ] Install `fast-xml-parser` package
- [ ] Create `buildXmlRequest(method, params)` function
- [ ] Create `parseXmlResponse(xml)` function
- [ ] Create `isSuccessResponse(response)` helper
- [ ] Create `isPendingResponse(response)` helper
- [ ] Create `isErrorResponse(response)` helper
- [ ] Extract common response fields (Status, StatusCode, etc.)
- [ ] Handle XML encoding properly
- [ ] Add error handling for malformed XML

---

### Task 2.3: Implement Yo! API Client
**Status**: `pending`
**Priority**: High
**File**: `src/gateways/yo/apiClient.ts`

HTTP client for Yo! API:
- [ ] Configure axios/fetch for XML content type
- [ ] Set proper headers (`Content-Type: text/xml`)
- [ ] Set reasonable timeout (30 seconds)
- [ ] Implement `depositFunds(params)` - acdepositfunds
- [ ] Implement `withdrawFunds(params)` - acwithdrawfunds
- [ ] Implement `checkTransactionStatus(reference)` - actransactioncheckstatus
- [ ] Implement `getAccountBalance()` - acacctbalance
- [ ] Handle HTTP errors gracefully
- [ ] Log raw requests/responses for debugging
- [ ] Add retry logic for transient failures

---

### Task 2.4: Implement Webhook Signature Verification
**Status**: `pending`
**Priority**: High
**File**: `src/gateways/yo/webhookVerifier.ts`

Security verification:
- [ ] Load Yo! public key from configured path
- [ ] Implement `verifyIpnSignature(payload, signature)`:
  - Concatenate: date_time + amount + narrative + network_ref + external_ref + msisdn
  - Calculate SHA1 hash
  - Verify RSA signature with public key
- [ ] Implement `verifyFailureSignature(payload, signature)`:
  - Concatenate: failed_transaction_reference + transaction_init_date
  - Calculate SHA1 hash
  - Verify RSA signature
- [ ] Return boolean result
- [ ] Log verification failures for investigation

---

### Task 2.5: Implement YoGateway Class
**Status**: `pending`
**Priority**: High
**File**: `src/gateways/yo/yoGateway.ts`

Main gateway implementation:
- [ ] Implement `PaymentGateway` interface
- [ ] `deposit()`:
  - Build DepositRequest from params
  - Call apiClient.depositFunds() with NonBlocking=TRUE
  - Map response to TransactionResult
  - Include ExternalReference for tracking
  - Include callback URLs
- [ ] `withdraw()`:
  - Build WithdrawRequest from params
  - Call apiClient.withdrawFunds()
  - Handle signature auth if configured
  - Map response to TransactionResult
- [ ] `checkStatus()`:
  - Call apiClient.checkTransactionStatus()
  - Map Yo! status to TransactionStatus enum
- [ ] `getBalance()`:
  - Call apiClient.getAccountBalance()
  - Parse multiple currency balances
- [ ] `verifyWebhook()`:
  - Detect IPN vs failure notification
  - Call appropriate verifier
- [ ] `getProviderName()`: return 'yo'
- [ ] Create barrel export in `src/gateways/yo/index.ts`

---

### Task 2.6: Map Yo! Status to TransactionStatus
**Status**: `pending`
**Priority**: Medium
**File**: `src/gateways/yo/yoGateway.ts`

Status mapping:
```
Yo! Status          → TransactionStatus
SUCCEEDED           → succeeded
FAILED              → failed
PENDING             → pending
INDETERMINATE       → indeterminate
StatusCode=1        → processing (pending user action)
```

---

## Phase 3: Database Updates

### Task 3.1: Add Gateway Columns to Payments Table
**Status**: `pending`
**Priority**: High
**File**: `src/db/schema.ts`

Schema changes:
- [ ] Add `gateway` column (varchar, default 'iotec')
- [ ] Add `gatewayReference` column (varchar, nullable)
- [ ] Add `gatewayRawResponse` column (text, nullable)
- [ ] Create enum type for gateway values if needed

---

### Task 3.2: Create Migration
**Status**: `pending`
**Priority**: High
**File**: `drizzle/migrations/xxxx_add_gateway_tracking.sql`

Migration:
- [ ] Run `npm run db:generate` to create migration
- [ ] Verify migration SQL is correct
- [ ] Add index on gateway column
- [ ] Test migration on local database
- [ ] Run `npm run db:migrate`

---

### Task 3.3: Update Payment Types
**Status**: `pending`
**Priority**: Medium
**File**: `src/types/index.ts`

Type updates:
- [ ] Add `gateway` to Payment type
- [ ] Add `gatewayReference` to Payment type
- [ ] Update any related interfaces

---

## Phase 4: Webhook Routes

### Task 4.1: Add Yo! IPN Webhook Endpoint
**Status**: `pending`
**Priority**: High
**File**: `src/routes/payments.ts`

IPN endpoint:
- [ ] Add `POST /api/payments/yo/ipn` route (public, no auth)
- [ ] Log raw incoming payload
- [ ] Parse form-urlencoded body
- [ ] Extract signature from payload
- [ ] Verify signature using YoGateway
- [ ] If invalid: log warning, return 200 (prevent retries)
- [ ] Find payment by external_reference
- [ ] Update payment status to 'completed'
- [ ] Set paidDate from webhook timestamp
- [ ] Store raw webhook in gatewayRawResponse
- [ ] Trigger payment distribution to schedules
- [ ] Optionally return SMS narrative in response
- [ ] Return 200 OK

---

### Task 4.2: Add Yo! Failure Webhook Endpoint
**Status**: `pending`
**Priority**: High
**File**: `src/routes/payments.ts`

Failure endpoint:
- [ ] Add `POST /api/payments/yo/failure` route (public, no auth)
- [ ] Log raw incoming payload
- [ ] Parse form-urlencoded body
- [ ] Extract verification signature
- [ ] Verify signature using YoGateway
- [ ] Find payment by failed_transaction_reference
- [ ] Update payment status to 'failed'
- [ ] Store failure details
- [ ] Return 200 OK

---

### Task 4.3: Keep IoTec Webhook Working
**Status**: `pending`
**Priority**: Medium
**File**: `src/routes/payments.ts`

Verification:
- [ ] Ensure existing `/api/payments/webhook` still works
- [ ] Add gateway-specific handling if needed
- [ ] Test IoTec webhook reception

---

## Phase 5: Environment Configuration

### Task 5.1: Add Environment Variables
**Status**: `pending`
**Priority**: High
**File**: `src/domain/config.ts`

Config updates:
- [ ] Add `PAYMENT_GATEWAY` (default: 'iotec')
- [ ] Add `YO_API_USERNAME`
- [ ] Add `YO_API_PASSWORD`
- [ ] Add `YO_API_URL`
- [ ] Add `YO_SANDBOX_URL`
- [ ] Add `YO_USE_SANDBOX`
- [ ] Add `YO_IPN_URL`
- [ ] Add `YO_FAILURE_URL`
- [ ] Add `YO_PUBLIC_KEY_PATH`

---

### Task 5.2: Add Startup Validation
**Status**: `pending`
**Priority**: Medium
**File**: `src/app.ts` or `src/domain/config.ts`

Validation:
- [ ] Check PAYMENT_GATEWAY value is valid ('yo' or 'iotec')
- [ ] If 'yo': validate all YO_* variables exist
- [ ] If 'iotec': validate all IOTEC_* variables exist
- [ ] Log which gateway is active on startup
- [ ] Throw error if required config missing

---

### Task 5.3: Update .env.example
**Status**: `pending`
**Priority**: Low
**File**: `.env.example`

Documentation:
- [ ] Add all new environment variables with descriptions
- [ ] Add comments explaining gateway switching
- [ ] Include example values

---

## Phase 6: Background Jobs

### Task 6.1: Update Transaction Status Checker
**Status**: `pending`
**Priority**: Medium
**File**: `src/jobs/worker.ts`

Job updates:
- [ ] Query pending transactions grouped by gateway
- [ ] For each gateway, get appropriate instance from factory
- [ ] Call `gateway.checkStatus()` for each pending transaction
- [ ] Update database with results
- [ ] Handle 'indeterminate' status (retry later)

---

### Task 6.2: Add Balance Alert Job
**Status**: `pending`
**Priority**: Low
**File**: `src/jobs/worker.ts`

New job:
- [ ] Get current gateway from factory
- [ ] Call `gateway.getBalance()`
- [ ] Compare against threshold (configurable)
- [ ] Send alert if below threshold
- [ ] Log which gateway balance was checked

---

## Phase 7: Testing

### Task 7.1: Unit Tests - Gateway Types
**Status**: `pending`
**Priority**: Medium

Tests:
- [ ] Test interface compliance
- [ ] Test status mapping functions
- [ ] Test request/response transformations

---

### Task 7.2: Unit Tests - XML Utilities
**Status**: `pending`
**Priority**: Medium

Tests:
- [ ] Test XML request building
- [ ] Test XML response parsing
- [ ] Test error response detection
- [ ] Test edge cases (empty fields, special characters)

---

### Task 7.3: Unit Tests - Webhook Verification
**Status**: `pending`
**Priority**: High

Tests:
- [ ] Test valid IPN signature verification
- [ ] Test invalid signature rejection
- [ ] Test failure notification verification
- [ ] Test with real Yo! public key format

---

### Task 7.4: Integration Tests
**Status**: `pending`
**Priority**: Medium

Tests:
- [ ] Test gateway factory with different env values
- [ ] Test PaymentService with mocked gateway
- [ ] Test webhook routes with sample payloads
- [ ] Test database operations with new columns

---

### Task 7.5: Sandbox Testing
**Status**: `pending`
**Priority**: High

Manual tests:
- [ ] Set up Yo! sandbox account
- [ ] Test deposit with NonBlocking=TRUE
- [ ] Verify IPN webhook received
- [ ] Test status check API
- [ ] Test account balance API
- [ ] Test failure webhook
- [ ] Document test results

---

## Summary

| Phase | Tasks | Critical Path |
|-------|-------|---------------|
| 1 | 5 tasks | Yes - Foundation |
| 2 | 6 tasks | Yes - Core Feature |
| 3 | 3 tasks | Yes - Data Layer |
| 4 | 3 tasks | Yes - Webhooks |
| 5 | 3 tasks | Medium - Config |
| 6 | 2 tasks | Low - Jobs |
| 7 | 5 tasks | Medium - Quality |

**Total**: 27 tasks

**Estimated critical path**: Tasks 1.1 → 1.2 → 1.3 → 1.4 → 2.1 → 2.2 → 2.3 → 2.5 → 3.1 → 3.2 → 4.1 → 4.2
