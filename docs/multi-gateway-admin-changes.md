# Multi-Gateway Changes for Admin Dashboard

This document outlines the changes needed in the **verit-admin** dashboard to support the multi-payment gateway implementation.

## API Response Changes

### Payment Initiation Response

The `/api/payments/initiate` endpoint response now includes gateway information:

**Before:**
```json
{
  "paymentId": "uuid",
  "transactionId": "IOTEC-xxx",
  "amount": 50000,
  "status": "pending",
  "iotecReference": "IOTEC-xxx",
  "leaseId": "uuid"
}
```

**After:**
```json
{
  "paymentId": "uuid",
  "transactionId": "VRT_xxx_xxx",
  "amount": 50000,
  "status": "pending",
  "gateway": "yo",
  "gatewayReference": "yo-txn-xxx",
  "leaseId": "uuid",
  "statusMessage": "Payment initiated"
}
```

### Payment Status Response

The `/api/payments/status/:transactionId` endpoint response now includes:

```json
{
  "transactionId": "VRT_xxx_xxx",
  "gatewayReference": "yo-txn-xxx",
  "status": "pending",
  "paymentStatus": "pending",
  "message": "Awaiting user confirmation",
  "gateway": "yo",
  "mnoReference": "MNO123456"
}
```

### Payment Records

Payment objects now include gateway tracking fields:

```typescript
interface Payment {
  // ... existing fields
  gateway: 'iotec' | 'yo';           // Which gateway processed this payment
  gatewayReference: string | null;    // Gateway's internal transaction ID
  gatewayRawResponse: string | null;  // Raw response for debugging
}
```

## UI Changes Recommended

### 1. Payment Details View

Display gateway information in payment details:

```jsx
<div className="payment-details">
  <p>Gateway: {payment.gateway}</p>
  <p>Gateway Reference: {payment.gatewayReference}</p>
  {/* ... other fields */}
</div>
```

### 2. Payment List/Table

Consider adding a "Gateway" column to payment tables:

| Date | Amount | Status | Gateway | Tenant |
|------|--------|--------|---------|--------|
| ... | 50,000 | Completed | Yo! | John Doe |
| ... | 75,000 | Pending | IoTec | Jane Doe |

### 3. Payment Analytics

Update analytics to show breakdown by gateway:

```javascript
// Group payments by gateway
const paymentsByGateway = payments.reduce((acc, p) => {
  const gateway = p.gateway || 'iotec';
  if (!acc[gateway]) {
    acc[gateway] = { count: 0, amount: 0 };
  }
  acc[gateway].count++;
  acc[gateway].amount += parseFloat(p.amount);
  return acc;
}, {});
```

### 4. Error Messages

Gateway-specific error messages may be returned:

```javascript
// Handle gateway errors
if (error.message.includes('Gateway error:')) {
  // Show user-friendly message
  showToast('Payment service temporarily unavailable');
}
```

## No Breaking Changes

The API remains backwards compatible:
- The `transactionId` field is still returned (now using our reference instead of IoTec's)
- All existing endpoints work the same way
- Gateway defaults to 'iotec' if not specified

## Migration Notes

1. Existing payments will have `gateway: null` or `gateway: 'iotec'`
2. New payments will have the appropriate gateway value
3. No frontend changes are strictly required, but displaying gateway info is recommended

## Testing

Before deployment, test:
1. Payment initiation flow
2. Payment status polling
3. Payment history display
4. Analytics calculations
