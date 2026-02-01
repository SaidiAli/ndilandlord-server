# Findings: Landlord Wallet Implementation

## Codebase Patterns Discovered

### Schema Patterns (src/db/schema.ts)
- UUIDs with `defaultRandom()` for primary keys
- snake_case column names in DB, camelCase in TypeScript
- Timestamps: `createdAt`, `updatedAt` on all tables
- Decimal fields for money: `decimal('amount', { precision: 10, scale: 2 })`
- Enums defined with `pgEnum()`
- Indexes on foreign keys and frequently queried columns
- Relations defined separately with `relations()`

### Service Pattern (src/services/paymentService.ts)
- Static class methods
- Error handling with try/catch and console.error
- Parse decimal strings from DB: `parseFloat(payment.amount)`
- Use transactions for multi-table operations
- Return null for not-found cases

### Route Pattern (src/routes/landlords.ts)
- Express Router with typed Request/Response
- Auth middleware: `authenticate, authorize('landlord')`
- Consistent response format: `{ success, data, message }` or `{ success: false, error, message }`
- Zod schemas for request validation with `validateBody()`
- Error status codes: 400 for bad requests, 403 for forbidden, 500 for server errors

### Payment Integration Points
- `PaymentService.updatePaymentStatus()` is called when payment completes
- `PaymentService.registerManualPayment()` for cash/bank payments
- Payments link to leases, which link to units → properties → landlords
- Payment gateway info stored: `gateway`, `gatewayReference`, `gatewayRawResponse`

### ioTec Disbursement API
- Endpoint: `POST https://pay.iotec.io/api/disbursements/disburse`
- Requires: `walletId`, `payee` (phone), `amount`, `externalId`
- Returns: transaction ID and status
- Status check: `GET api/disbursements/status/{transactionId}`

## Key Decisions

1. **One wallet per landlord**: Simple 1:1 relationship, auto-created on first deposit
2. **Balance tracking**: Store running balance + totals for quick queries
3. **Transaction types**: deposit (from payments), withdrawal (to landlord), adjustment (manual corrections)
4. **Withdrawal destinations**: Mobile money (MTN, Airtel) or bank transfer (future)
5. **Balance validation**: Check balance before withdrawal, reject if insufficient

## Integration Strategy

When a payment status changes to 'completed':
1. Get payment → lease → unit → property → landlordId
2. Get or create wallet for landlord
3. Record deposit transaction with payment reference
4. Update wallet balance and totals

For withdrawals:
1. Validate balance >= withdrawal amount
2. Create pending withdrawal transaction
3. Call ioTec disbursement API
4. Update transaction status based on API response
5. Update wallet balance when completed
