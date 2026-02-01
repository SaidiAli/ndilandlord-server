# Admin Dashboard Changes for Landlord Wallet

## Overview
This document outlines the changes needed in the admin dashboard (verit-admin) to support the new landlord wallet module.

## New API Endpoints

### 1. GET /api/wallet
Get wallet summary for the authenticated landlord.

**Response:**
```json
{
  "success": true,
  "data": {
    "walletId": "uuid",
    "balance": 1500000,
    "totalDeposited": 3000000,
    "totalWithdrawn": 1500000,
    "pendingWithdrawals": 0,
    "recentTransactions": [
      {
        "id": "uuid",
        "type": "deposit",
        "amount": 500000,
        "balanceAfter": 1500000,
        "status": "completed",
        "description": "Rent payment - Transaction: TXN123",
        "createdAt": "2026-02-01T10:00:00Z",
        "paymentId": "uuid"
      }
    ]
  }
}
```

### 2. GET /api/wallet/balance
Lightweight endpoint for balance only.

**Response:**
```json
{
  "success": true,
  "data": { "balance": 1500000 }
}
```

### 3. GET /api/wallet/transactions
Paginated transaction history.

**Query Parameters:**
- `type`: "deposit" | "withdrawal" | "adjustment" (optional)
- `status`: "pending" | "completed" | "failed" (optional)
- `limit`: number (default: 50, max: 100)
- `offset`: number (default: 0)

**Response:**
```json
{
  "success": true,
  "data": [...transactions],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 125,
    "pages": 3
  }
}
```

### 4. POST /api/wallet/withdraw
Request a withdrawal.

**Request Body (Mobile Money):**
```json
{
  "amount": 500000,
  "destinationType": "mobile_money",
  "provider": "mtn",
  "phoneNumber": "0771234567"
}
```

**Request Body (Bank - Future):**
```json
{
  "amount": 500000,
  "destinationType": "bank_account",
  "accountNumber": "1234567890",
  "accountName": "John Doe"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "transactionId": "uuid",
    "gatewayReference": "iotec-ref",
    "status": "pending",
    "message": "Withdrawal initiated. You will receive the funds shortly."
  }
}
```

## UI Components to Create

### 1. Wallet Dashboard Card
Add to the main landlord dashboard.

**Location:** Dashboard page (prominent position)

**Display:**
- Current balance (large, highlighted)
- Total deposited (lifetime)
- Total withdrawn (lifetime)
- Pending withdrawals count/amount
- Quick "Withdraw" button

**Mockup:**
```
┌─────────────────────────────────────────┐
│  💰 Wallet Balance                      │
│                                         │
│  UGX 1,500,000                         │
│  ══════════════                         │
│                                         │
│  Total Collected: UGX 3,000,000        │
│  Total Withdrawn: UGX 1,500,000        │
│                                         │
│  [ Withdraw Funds ]  [ View History ]   │
└─────────────────────────────────────────┘
```

### 2. Wallet Page (/wallet)
Full wallet management page.

**Sections:**
1. **Balance Overview**
   - Current balance
   - Pending withdrawals
   - Available for withdrawal (balance - pending)

2. **Quick Actions**
   - Withdraw to Mobile Money
   - Withdraw to Bank (future)

3. **Transaction History Table**
   - Columns: Date, Type, Amount, Status, Description
   - Filters: Type dropdown, Status dropdown
   - Pagination
   - Color coding: green for deposits, red for withdrawals

### 3. Withdrawal Modal/Form
Triggered from "Withdraw" button.

**Fields:**
- Amount (number input with UGX prefix)
- Destination Type (radio: Mobile Money / Bank Account)
- Mobile Money Provider (dropdown: MTN, Airtel) - shown if Mobile Money selected
- Phone Number (input with validation) - shown if Mobile Money selected
- Bank Account fields (future)

**Validation:**
- Minimum amount: UGX 10,000
- Amount cannot exceed available balance
- Phone number format: 10-12 digits

**States:**
- Form → Processing → Success/Error

### 4. Transaction History Page (/wallet/transactions)
Full paginated transaction list.

**Features:**
- Date range filter
- Type filter (All, Deposits, Withdrawals, Adjustments)
- Status filter (All, Pending, Completed, Failed)
- Export to CSV
- Search by description

## Navigation Updates

Add to sidebar menu (under Payments or as top-level):
```
📊 Dashboard
🏠 Properties
📝 Leases
💳 Payments
💰 Wallet (NEW)
   └── Overview
   └── Transactions
   └── Withdraw
```

## State Management

### Wallet Store (if using Redux/Zustand)
```typescript
interface WalletState {
  balance: number;
  totalDeposited: number;
  totalWithdrawn: number;
  pendingWithdrawals: number;
  transactions: WalletTransaction[];
  isLoading: boolean;
  error: string | null;
}

interface WalletTransaction {
  id: string;
  type: 'deposit' | 'withdrawal' | 'adjustment';
  amount: number;
  balanceAfter: number;
  status: 'pending' | 'completed' | 'failed';
  description: string | null;
  createdAt: string;
  paymentId?: string;
  destinationType?: string;
}
```

### API Service
```typescript
// src/services/walletApi.ts
export const walletApi = {
  getSummary: () => api.get('/wallet'),
  getBalance: () => api.get('/wallet/balance'),
  getTransactions: (params) => api.get('/wallet/transactions', { params }),
  withdraw: (data) => api.post('/wallet/withdraw', data),
};
```

## Real-time Updates (Optional)
Consider WebSocket or polling for:
- Wallet balance updates when payments arrive
- Withdrawal status changes

## Error Handling
Display user-friendly messages for:
- Insufficient balance
- Invalid phone number
- Gateway errors
- Network failures

## Testing Checklist
- [ ] Wallet summary loads correctly
- [ ] Balance updates after payment is received
- [ ] Transaction history pagination works
- [ ] Type and status filters work
- [ ] Withdrawal form validation works
- [ ] Successful withdrawal flow
- [ ] Failed withdrawal shows error
- [ ] Pending withdrawal shows in list
- [ ] Mobile responsiveness
