## Revised Lease Management Plan (Monthly Payments, No Late Fees)

### Current System Reality Check

**What you have:**
- Monthly rent amount stored on lease
- Basic lease lifecycle (draft → active → expired/terminated)
- Manual payment creation when tenant pays
- Deposit tracking

**Core problems to solve:**
- No predictable payment schedule
- No clear view of what's owed vs what's paid
- Manual tracking of payment due dates
- No proper lease activation workflow
- Incorrect balance calculations

## Simplified Lease Workflow

### Phase 1: Lease Setup
```
1. LEASE CREATION
   ├── Landlord creates lease with tenant
   ├── Sets monthly rent amount
   ├── Sets security deposit
   ├── Sets lease period (start/end dates)
   └── Sets payment day (e.g., 1st of month)

2. LEASE ACTIVATION
   ├── Lease approved by landlord
   ├── Start date arrives → Status: Active
   ├── Payment schedule generated for entire lease period
   └── Unit marked as occupied
```

### Phase 2: Payment Management
```
1. PAYMENT SCHEDULE
   ├── System pre-calculates all monthly payments
   ├── Each payment has a due date (e.g., 1st of month)
   ├── Tenant sees upcoming payments
   └── Landlord sees expected revenue

2. PAYMENT COLLECTION
   ├── Tenant initiates payment for specific month
   ├── Payment linked to scheduled payment
   ├── Balance automatically updated
   └── Receipt generated

3. PAYMENT TRACKING
   ├── Clear view of paid vs unpaid months
   ├── Running balance calculation
   ├── Payment history with dates
   └── Simple overdue indicator (no fees)
```

### Phase 3: Lease Completion
```
1. LEASE EXPIRY
   ├── System alerts 30 days before end
   ├── Options: Renew or End
   └── Final payment reconciliation

2. RENEWAL (if chosen)
   ├── Create new lease starting after current
   ├── Can adjust rent amount
   ├── New payment schedule generated
   └── Seamless transition

3. TERMINATION
   ├── Mark lease as ended
   ├── Calculate final balance
   ├── Handle deposit return/deduction
   └── Release unit
```

## Core Design Decisions

### 1. **Payment Schedule Generation**
**Decision:** Generate all monthly payments upfront when lease becomes active
- **Why:** Provides clear visibility of entire lease payment obligation
- **Example:** 12-month lease = 12 payment schedule entries created

### 2. **Payment Due Dates**
**Decision:** Fixed day of month (1st, 5th, 15th, etc.)
- **Why:** Predictable for both landlord and tenant
- **Handling:** If lease starts mid-month, first payment is prorated

### 3. **Balance Calculation**
**Decision:** Simple running balance
- **Formula:** Total Owed (scheduled payments up to today) - Total Paid
- **Why:** Clear and easy to understand

### 4. **Deposit Handling**
**Decision:** Separate from rent payments
- **Collection:** Required before/at lease activation
- **Return:** Handled at lease termination
- **Why:** Cleaner accounting

### 5. **Overdue Handling (No Fees)**
**Decision:** Simple status indicator
- **Overdue:** Payment date has passed, no payment received
- **No penalties:** Just visibility for landlord to follow up
- **Why:** Keeps MVP simple

## Data Model Requirements

### Essential Entities

#### 1. **Lease** (enhanced)
```
- id
- unit_id
- tenant_id
- start_date
- end_date
- monthly_rent
- security_deposit
- payment_day (1-31)
- status (draft/active/expiring/expired/terminated)
- previous_lease_id (for renewals)
```

#### 2. **PaymentSchedule** (new)
```
- id
- lease_id
- payment_number (1, 2, 3...)
- due_date
- amount
- period_start
- period_end
- is_paid (boolean)
- paid_payment_id (links to actual payment when paid)
```

#### 3. **Payments** (existing, clarified)
```
- id
- lease_id
- schedule_id (links to payment schedule)
- amount
- payment_date
- payment_method
- transaction_id
- status
```

### Key Relationships
- When lease activated → Generate full payment schedule
- When payment made → Link to corresponding schedule entry
- Balance = SUM(due schedules) - SUM(completed payments)

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Goal:** Accurate payment scheduling and balance calculation

1. Add payment_day field to lease
2. Create payment_schedule table
3. Build schedule generation logic
4. Fix balance calculation to use schedule
5. Update payment creation to link to schedule

**Success Metrics:**
- Correct payment schedule for any lease
- Accurate balance calculation
- Clear payment history

### Phase 2: Lease Lifecycle (Week 3-4)
**Goal:** Proper lease activation and status management

1. Implement lease approval workflow
2. Auto-generate payment schedule on activation
3. Add lease expiry notifications
4. Build renewal process
5. Handle lease termination properly

**Success Metrics:**
- Smooth lease activation
- Timely expiry alerts
- Successful renewals

### Phase 3: Visibility & Reports (Week 5-6)
**Goal:** Clear visibility for landlords and tenants

1. Tenant payment dashboard
2. Landlord collection overview
3. Payment reminders (upcoming due dates)
4. Monthly collection report
5. Lease expiry report

**Success Metrics:**
- Tenants know what's due
- Landlords see revenue clearly
- Reduced payment delays

## Critical Business Rules

### 1. **First Month Proration**
- If lease starts after payment day: Prorate first month
- Formula: (Days remaining / Days in month) × Monthly rent
- Example: Start Jan 15, payment day 1st = 17/31 × rent

### 2. **Last Month Proration**
- If lease ends before payment day: Prorate last month
- Formula: (Days used / Days in month) × Monthly rent

### 3. **Payment Application**
- Payments apply to oldest unpaid schedule first
- Partial payments allowed (apply to single month)
- Overpayments create credit for next month

### 4. **Renewal Rules**
- Can initiate 60 days before expiry
- New lease starts day after current ends
- Rent can be adjusted
- New payment schedule generated

### 5. **Termination Rules**
- Either party can terminate with notice
- Final payment calculated to termination date
- Deposit handled separately

## Questions Before Implementation

1. **Payment Day**: Should this be flexible per lease or fixed system-wide (e.g., always 1st)?

2. **Proration**: Should the first/last month be prorated or always full month?

3. **Advance Payments**: Can tenants pay multiple months in advance?

4. **Renewal Timing**: How early should renewal be allowed (30, 60, 90 days)?

5. **Deposit Collection**: Must deposit be paid before activation or can it be part of first month?

6. **Payment Validation**: Should system prevent overpayment or allow credits?

This simplified approach focuses on getting the core monthly payment workflow right.