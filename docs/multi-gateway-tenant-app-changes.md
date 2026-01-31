# Multi-Gateway Changes for Tenant Mobile App

This document outlines the changes needed in the **verit-tenant-mobile-app** to support the multi-payment gateway implementation.

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
  "leaseId": "uuid",
  "statusMessage": "Pending"
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
  "statusMessage": "Payment initiated successfully"
}
```

### Key Differences

1. **transactionId format**: Now uses our own reference format (`VRT_timestamp_random`) instead of IoTec's format
2. **New `gateway` field**: Indicates which payment provider processed the transaction
3. **New `gatewayReference` field**: The payment provider's internal reference
4. **Removed `iotecReference`**: Replaced by `gatewayReference`

## TypeScript Type Updates

Update the payment initiation response type:

```typescript
// Before
interface PaymentInitiationResponse {
  paymentId: string;
  transactionId: string;
  amount: number;
  status: 'pending' | 'processing';
  estimatedCompletion: string;
  iotecReference: string;
  leaseId: string;
  scheduleId?: string;
  statusMessage: string;
}

// After
interface PaymentInitiationResponse {
  paymentId: string;
  transactionId: string;
  amount: number;
  status: 'pending' | 'processing';
  gateway: 'yo' | 'iotec';
  gatewayReference: string;
  leaseId: string;
  scheduleId?: string;
  statusMessage?: string;
}
```

## UI Changes Recommended

### 1. Payment Confirmation Screen

The user experience remains the same - they still receive a mobile money prompt. However, you may want to update messaging:

**Before:**
```jsx
<Text>Waiting for IoTec payment confirmation...</Text>
```

**After:**
```jsx
<Text>Please complete the payment on your mobile device</Text>
// Don't mention specific provider - it's abstracted away
```

### 2. Payment Status Screen

No changes required - the status polling works the same way:

```javascript
// This still works
const checkStatus = async (transactionId) => {
  const response = await api.get(`/payments/status/${transactionId}`);
  return response.data;
};
```

### 3. Payment History

Payment records now include gateway information. Consider showing this for transparency:

```jsx
<PaymentCard>
  <Text>Amount: UGX {payment.amount}</Text>
  <Text>Status: {payment.status}</Text>
  <Text style={styles.subtle}>via {payment.gateway === 'yo' ? 'Yo! Payments' : 'IoTec'}</Text>
</PaymentCard>
```

### 4. Error Handling

Gateway errors are now more specific:

```javascript
try {
  await initiatePayment(data);
} catch (error) {
  if (error.message.includes('Gateway error')) {
    // Payment service issue
    Alert.alert(
      'Payment Service Unavailable',
      'Please try again in a few minutes'
    );
  } else {
    // Other error
    Alert.alert('Error', error.message);
  }
}
```

## Migration Notes

### Backwards Compatibility

The API is backwards compatible:
- If your app doesn't read `iotecReference`, no changes are needed
- If you stored `iotecReference`, update to use `transactionId` or `gatewayReference`

### Recommended Updates

1. Update TypeScript types to include new fields
2. Remove any IoTec-specific branding/messaging
3. Use generic "mobile money" language instead of provider names
4. Update any stored payment references

## Testing Checklist

Before deployment:

- [ ] Payment initiation works
- [ ] USSD prompt is received on phone
- [ ] Payment confirmation updates UI
- [ ] Payment history shows correctly
- [ ] Error messages are appropriate
- [ ] Status polling works correctly

## No Breaking Changes

The core flow is unchanged:
1. User selects amount and phone number
2. App calls `/api/payments/initiate`
3. User receives USSD prompt
4. User enters PIN on phone
5. App polls for status or receives push notification
6. Payment completes

The only difference is which payment provider handles the transaction, which is transparent to the user.
