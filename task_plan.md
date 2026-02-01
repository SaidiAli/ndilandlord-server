# Task: Implement Landlord Wallet Module

## Goal
Create a wallet system for landlords to track rent collected from tenants, withdrawals made, and current balance. The wallet acts as an intermediary since tenant payments go to Yo/ioTec wallets first before being disbursed to landlords.

## Current State Analysis
- Payments are collected via mobile money through Yo/ioTec gateways
- Payments are linked to leases and payment schedules
- No mechanism exists to track landlord's collected funds or withdrawals
- ioTec API supports disbursements (withdrawals to mobile money or bank accounts)

## Implementation Phases

### Phase 1: Database Schema [complete]
- [x] Create `wallet_transaction_type_enum` enum (deposit, withdrawal, adjustment)
- [x] Create `wallet_transaction_status_enum` enum (pending, completed, failed)
- [x] Create `landlord_wallets` table (one per landlord)
- [x] Create `wallet_transactions` table (tracks all deposits/withdrawals)
- [x] Add Drizzle relations
- [x] Generate migration

**Files:**
- `src/db/schema.ts` - added wallet tables and enums

### Phase 2: Wallet Service [complete]
- [x] Create `WalletService` class
- [x] Implement `getOrCreateWallet(landlordId)` - get or create wallet for landlord
- [x] Implement `getWalletBalance(landlordId)` - get current balance
- [x] Implement `recordDeposit(landlordId, amount, paymentId, description)` - credit wallet
- [x] Implement `requestWithdrawal(landlordId, amount, destination)` - debit wallet
- [x] Implement `getTransactionHistory(landlordId, filters)` - get transactions
- [x] Implement `getWalletSummary(landlordId)` - balance + recent transactions

**Files:**
- `src/services/walletService.ts` - new file

### Phase 3: API Routes [complete]
- [x] Create wallet routes file
- [x] GET `/api/wallet` - get wallet summary (balance, recent activity)
- [x] GET `/api/wallet/balance` - lightweight balance endpoint
- [x] GET `/api/wallet/transactions` - get paginated transaction history
- [x] POST `/api/wallet/withdraw` - request withdrawal to mobile money or bank
- [x] POST `/api/wallet/webhook/iotec` - handle ioTec callbacks
- [x] Register routes in `app.ts`

**Files:**
- `src/routes/wallet.ts` - new file
- `src/app.ts` - registered wallet routes

### Phase 4: Payment Integration [complete]
- [x] Update `PaymentService.updatePaymentStatus()` to credit landlord wallet when payment completes
- [x] Ensure lease → unit → property → landlordId chain is resolved
- [x] Add wallet credit in `registerManualPayment()` for completed payments
- [x] Add wallet credit in `distributePaymentToSchedules()` for distributed payments

**Files:**
- `src/services/paymentService.ts` - modified to credit wallet

### Phase 5: Documentation [complete]
- [x] Create admin dashboard change documentation
- [x] Tenant app not affected (wallet is landlord-only feature)

**Files:**
- `docs/wallet-admin-changes.md` - admin UI requirements

## Database Design

```
landlord_wallets
├── id (uuid, PK)
├── landlord_id (uuid, FK → users.id, unique)
├── balance (decimal 12,2) - current available balance
├── total_deposited (decimal 12,2) - lifetime deposits
├── total_withdrawn (decimal 12,2) - lifetime withdrawals
├── created_at
└── updated_at

wallet_transactions
├── id (uuid, PK)
├── wallet_id (uuid, FK → landlord_wallets.id)
├── type (enum: deposit, withdrawal, adjustment)
├── amount (decimal 12,2)
├── balance_after (decimal 12,2) - balance after this transaction
├── status (enum: pending, completed, failed)
├── payment_id (uuid, FK → payments.id, nullable) - for deposits
├── gateway_reference (varchar) - for withdrawals via ioTec
├── destination_type (varchar: mobile_money, bank_account, nullable)
├── destination_details (text, JSON) - phone/account number
├── description (text)
├── created_at
└── updated_at
```

## API Design

### GET /api/wallet
Response:
```json
{
  "success": true,
  "data": {
    "walletId": "uuid",
    "balance": 1500000,
    "totalDeposited": 3000000,
    "totalWithdrawn": 1500000,
    "pendingWithdrawals": 0,
    "recentTransactions": [...]
  }
}
```

### POST /api/wallet/withdraw
Request:
```json
{
  "amount": 500000,
  "destinationType": "mobile_money",
  "provider": "mtn",
  "phoneNumber": "0771234567"
}
```

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| TypeScript error: pagination not in ApiResponse | 1 | Used PaginatedResponse type for transactions endpoint |

## Notes
- Withdrawals have a minimum amount of UGX 10,000
- Balance cannot go negative
- Wallets are auto-created on first deposit
- Withdrawal failures restore the balance automatically
- Tenant mobile app not affected (wallet is landlord-only)
