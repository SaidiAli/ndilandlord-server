# Payment Distribution Unification - Admin Dashboard Changes

## Overview

The backend payment handling has been unified so that all payments (manual and mobile money) are automatically distributed across payment schedules. The `scheduleId` parameter has been removed from payment APIs.

## API Changes

### POST `/api/payments/register` (Manual Payment Registration)

**Before:**
```json
{
  "leaseId": "uuid",
  "amount": 500000,
  "paidDate": "2026-02-01",
  "paymentMethod": "cash",
  "notes": "Optional notes",
  "scheduleId": "uuid"  // REMOVED
}
```

**After:**
```json
{
  "leaseId": "uuid",
  "amount": 500000,
  "paidDate": "2026-02-01",
  "paymentMethod": "cash",
  "notes": "Optional notes"
}
```

### POST `/api/payments/initiate` (Mobile Money Payment)

The `scheduleId` field has been removed from both the request and response.

## Required Admin Dashboard Changes

### 1. Payment Registration Form

**Location:** Likely in `src/components/payments/RegisterPaymentForm.tsx` or similar

**Changes Required:**
- Remove any schedule selection dropdown/input from the payment registration form
- The form should only include:
  - Lease selection (if not already selected)
  - Amount input
  - Paid date picker
  - Payment method dropdown (cash, bank_transfer, cheque, etc.)
  - Notes textarea (optional)

**Before UI:**
```
┌─────────────────────────────────────┐
│ Register Payment                     │
├─────────────────────────────────────┤
│ Lease: [Dropdown]                   │
│ Schedule: [Dropdown]  ← REMOVE THIS │
│ Amount: [Input]                     │
│ Paid Date: [Date Picker]            │
│ Payment Method: [Dropdown]          │
│ Notes: [Textarea]                   │
│                                     │
│ [Submit]                            │
└─────────────────────────────────────┘
```

**After UI:**
```
┌─────────────────────────────────────┐
│ Register Payment                     │
├─────────────────────────────────────┤
│ Lease: [Dropdown]                   │
│ Amount: [Input]                     │
│ Paid Date: [Date Picker]            │
│ Payment Method: [Dropdown]          │
│ Notes: [Textarea]                   │
│                                     │
│ [Submit]                            │
└─────────────────────────────────────┘
```

### 2. API Call Updates

Update the payment registration API call to remove `scheduleId`:

```typescript
// Before
const registerPayment = async (data: PaymentRegistration) => {
  return api.post('/payments/register', {
    leaseId: data.leaseId,
    amount: data.amount,
    paidDate: data.paidDate,
    paymentMethod: data.paymentMethod,
    notes: data.notes,
    scheduleId: data.scheduleId,  // REMOVE THIS
  });
};

// After
const registerPayment = async (data: PaymentRegistration) => {
  return api.post('/payments/register', {
    leaseId: data.leaseId,
    amount: data.amount,
    paidDate: data.paidDate,
    paymentMethod: data.paymentMethod,
    notes: data.notes,
  });
};
```

### 3. Type Definitions

Update any TypeScript interfaces:

```typescript
// Before
interface PaymentRegistration {
  leaseId: string;
  amount: number;
  paidDate: string;
  paymentMethod: string;
  notes?: string;
  scheduleId?: string;  // REMOVE THIS
}

// After
interface PaymentRegistration {
  leaseId: string;
  amount: number;
  paidDate: string;
  paymentMethod: string;
  notes?: string;
}
```

## Behavior Changes to Communicate

### For Landlords

1. **Automatic Distribution**: When registering a payment, the amount is automatically applied to the oldest unpaid schedules first. No need to select a specific schedule.

2. **Multi-Month Payments**: If a tenant pays for multiple months at once, the payment is distributed across schedules automatically.

3. **Partial Payments**: Partial payments are tracked and applied to schedules proportionally.

4. **Wallet Impact**: Manual payments (cash, bank transfer, cheque) do NOT affect the landlord's wallet balance since the money was already received outside the system. Only mobile money payments credit the wallet.

## Testing Checklist

- [ ] Payment registration form works without schedule selector
- [ ] Payments are correctly distributed to oldest unpaid schedules
- [ ] Payment history shows which schedules each payment was applied to
- [ ] Multi-month payments distribute correctly
- [ ] Partial payments are tracked correctly
- [ ] No wallet transactions are created for manual payments
