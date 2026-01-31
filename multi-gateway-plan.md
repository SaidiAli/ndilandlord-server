# Multi-Payment Gateway Implementation Plan

## Overview

Implement a multi-payment gateway architecture with Yo! Payments as the primary gateway and IoTec as the secondary/backup gateway. This enables gateway switching via environment variables without code changes.

## Current State Analysis

### Existing IoTec Integration
- **Location**: `src/services/iotecService.ts`
- **Auth**: OAuth 2.0 token-based
- **Operations**: Collection initiation, status checking
- **Hardcoded to**: IoTec API endpoints

### Current Payment Flow
1. Tenant initiates payment via `POST /api/payments/initiate`
2. PaymentService creates pending payment record
3. IoTecService initiates mobile money collection
4. Webhook receives completion notification
5. PaymentService updates status and distributes to schedules

## Architecture Design

### Gateway Abstraction Layer

```
                    ┌─────────────────────────────────────┐
                    │         Application Layer           │
                    │  (PaymentService, Routes, Jobs)     │
                    └───────────────┬─────────────────────┘
                                    │
                                    ▼
                    ┌─────────────────────────────────────┐
                    │      PaymentGateway Interface       │
                    │  (deposit, withdraw, checkStatus,   │
                    │   getBalance, verifyWebhook)        │
                    └───────────────┬─────────────────────┘
                                    │
                ┌───────────────────┼───────────────────┐
                ▼                   │                   ▼
    ┌───────────────────┐           │       ┌───────────────────┐
    │   YoGateway       │           │       │   IoTecGateway    │
    │   (Primary)       │           │       │   (Secondary)     │
    └───────────────────┘           │       └───────────────────┘
                                    │
                    ┌───────────────┴───────────────────┐
                    │         GatewayFactory            │
                    │   Selects gateway based on env    │
                    └───────────────────────────────────┘
```

### Directory Structure

```
src/
├── gateways/
│   ├── types.ts                 # Shared interfaces & types
│   ├── gatewayFactory.ts        # Factory function
│   ├── iotec/
│   │   ├── index.ts             # Barrel export
│   │   ├── iotecGateway.ts      # Interface implementation
│   │   └── config.ts            # IoTec configuration
│   └── yo/
│       ├── index.ts             # Barrel export
│       ├── yoGateway.ts         # Interface implementation
│       ├── config.ts            # Yo! configuration
│       ├── apiClient.ts         # Yo! API client
│       ├── xmlUtils.ts          # XML request/response helpers
│       └── webhookVerifier.ts   # IPN signature verification
```

## Implementation Phases

### Phase 1: Gateway Abstraction Layer
**Goal**: Create unified interface without changing existing functionality

1. Define `PaymentGateway` interface in `src/gateways/types.ts`
2. Create gateway factory in `src/gateways/gatewayFactory.ts`
3. Create IoTec adapter wrapping existing `iotecService.ts`
4. Refactor `PaymentService` to use gateway interface
5. Verify existing IoTec flow still works

### Phase 2: Yo! Gateway Implementation
**Goal**: Implement Yo! Payments gateway

1. Create Yo! configuration module
2. Implement XML utilities (request builder, response parser)
3. Implement Yo! API client (deposit, withdraw, status, balance)
4. Implement IPN signature verification
5. Create YoGateway implementing PaymentGateway interface

### Phase 3: Database Updates
**Goal**: Track gateway per transaction

1. Add `gateway` column to payments table
2. Add `gatewayReference` column for gateway's transaction ID
3. Add `gatewayRawResponse` column for debugging
4. Create and run migration

### Phase 4: Webhook Routes
**Goal**: Handle callbacks from both gateways

1. Keep existing IoTec webhook endpoint
2. Add Yo! IPN webhook endpoint (`POST /api/payments/yo/ipn`)
3. Add Yo! failure webhook endpoint (`POST /api/payments/yo/failure`)
4. Implement signature verification for both

### Phase 5: Environment Configuration
**Goal**: Enable gateway switching via environment

1. Add `PAYMENT_GATEWAY` env variable (values: `yo`, `iotec`)
2. Add all Yo! configuration variables
3. Add startup validation for selected gateway
4. Document configuration in `.env.example`

### Phase 6: Background Jobs Update
**Goal**: Make transaction polling gateway-agnostic

1. Update transaction status checker to use gateway interface
2. Add balance alert job using gateway interface
3. Handle pending transactions during gateway switch

## Critical Files to Modify

| File | Changes |
|------|---------|
| `src/services/paymentService.ts` | Use gateway interface instead of direct IoTec calls |
| `src/routes/payments.ts` | Add Yo! webhook routes, update initiation |
| `src/db/schema.ts` | Add gateway tracking columns |
| `src/domain/config.ts` | Add Yo! environment variables |
| `src/jobs/worker.ts` | Update for gateway-agnostic status checking |

## New Files to Create

| File | Purpose |
|------|---------|
| `src/gateways/types.ts` | Gateway interface, request/response types |
| `src/gateways/gatewayFactory.ts` | Factory for gateway selection |
| `src/gateways/iotec/iotecGateway.ts` | IoTec adapter |
| `src/gateways/yo/yoGateway.ts` | Yo! implementation |
| `src/gateways/yo/apiClient.ts` | Yo! HTTP/XML client |
| `src/gateways/yo/xmlUtils.ts` | XML helpers |
| `src/gateways/yo/webhookVerifier.ts` | IPN verification |
| `src/gateways/yo/config.ts` | Yo! configuration |

## Key Interface Definitions

### PaymentGateway Interface
```typescript
interface PaymentGateway {
  deposit(request: DepositRequest): Promise<TransactionResult>;
  withdraw(request: WithdrawRequest): Promise<TransactionResult>;
  checkStatus(reference: string): Promise<TransactionResult>;
  getBalance(): Promise<BalanceResult[]>;
  verifyWebhook(payload: any, signature?: string): boolean;
  getProviderName(): string;
}
```

### TransactionResult
```typescript
interface TransactionResult {
  success: boolean;
  status: TransactionStatus;
  gatewayReference: string;
  externalReference?: string;
  mnoReference?: string;
  amount?: number;
  currency?: string;
  message?: string;
  rawResponse?: any;
}

type TransactionStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'indeterminate';
```

## Environment Variables

```bash
# Gateway Selection
PAYMENT_GATEWAY=yo  # or 'iotec'

# IoTec (existing)
IOTEC_CLIENT_ID=xxx
IOTEC_CLIENT_SECRET=xxx
IOTEC_WALLET_ID=xxx

# Yo! Payments (new)
YO_API_USERNAME=xxx
YO_API_PASSWORD=xxx
YO_API_URL=https://paymentsapi1.yo.co.ug/ybs/task.php
YO_SANDBOX_URL=https://sandbox.yo.co.ug/ybs/task.php
YO_USE_SANDBOX=true
YO_IPN_URL=https://your-domain.com/api/payments/yo/ipn
YO_FAILURE_URL=https://your-domain.com/api/payments/yo/failure
YO_PUBLIC_KEY_PATH=./keys/yo_public.pem
```

## Database Migration

```sql
-- Add gateway tracking to payments table
ALTER TABLE payments
ADD COLUMN gateway VARCHAR(20) DEFAULT 'iotec',
ADD COLUMN gateway_reference VARCHAR(255),
ADD COLUMN gateway_raw_response TEXT;

-- Create index on gateway column
CREATE INDEX idx_payments_gateway ON payments(gateway);
```

## Verification Plan

### Unit Tests
- [ ] Gateway factory returns correct instance based on env
- [ ] IoTec adapter maps responses correctly
- [ ] Yo! XML builder creates valid XML
- [ ] Yo! response parser extracts all fields
- [ ] Webhook signature verification works

### Integration Tests
- [ ] PaymentService works with mocked gateway
- [ ] Webhook processing for both gateways
- [ ] Gateway switching via env variable

### Manual Testing
- [ ] IoTec sandbox: initiate payment, receive webhook
- [ ] Yo! sandbox: initiate payment, receive IPN
- [ ] Switch gateway, verify new transactions use correct gateway
- [ ] Verify existing transactions retain gateway history

## Rollout Strategy

1. **Phase A**: Deploy with `PAYMENT_GATEWAY=iotec` (no behavior change)
2. **Phase B**: Configure Yo! credentials, test in sandbox
3. **Phase C**: Switch to `PAYMENT_GATEWAY=yo` for production
4. **Phase D**: Monitor transactions, keep IoTec as fallback

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Pending transactions during switch | Log warning, existing transactions use original gateway for status |
| Webhook security | Implement signature verification for both gateways |
| XML parsing errors | Comprehensive error handling, log raw responses |
| Gateway unavailability | Future: Implement automatic failover |

## Dependencies

- `fast-xml-parser` - XML parsing for Yo! API
- `crypto` - Signature verification (built-in Node.js)

## Success Criteria

1. Both gateways work independently
2. Gateway selection via single env variable
3. All transactions tracked with gateway identifier
4. Webhooks verified with signatures
5. Zero regression on existing IoTec functionality
