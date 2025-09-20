## Context
You are enhancing the property management system. The system currently has basic lease management but needs improvements to properly handle monthly payment workflows, payment scheduling, and lease lifecycle management.

## Current System Overview
- **Stack**: Node.js, Express, TypeScript, Drizzle ORM, PostgreSQL
- **Key Tables**: users, properties, units, leases, payments
- **Authentication**: JWT with role-based access (admin, landlord, tenant)
- **Payment Integration**: IoTec mobile money (already implemented)

## Required Changes

### 1. API Endpoint Updates

#### Lease Endpoints (`src/routes/leases.ts`)

1. **POST /leases/create** - Enhanced to include payment_day
   ```typescript
   {
     unitId, tenantId, startDate, endDate, 
     monthlyRent, deposit, paymentDay, terms
   }
   ```

2. **POST /leases/:id/activate**
   - Validates lease is in 'draft' status
   - Calls activateLease service method
   - Returns lease with generated payment schedule

3. **POST /leases/:id/renew** - New endpoint
   ```typescript
   {
     newEndDate, newMonthlyRent?, newTerms?
   }
   ```

4. **GET /leases/:id/payment-schedule** - New endpoint
   - Returns full payment schedule with payment status
   - Shows paid/unpaid/overdue status for each

5. **GET /leases/:id/balance** - Updated
   - Returns accurate balance using payment schedule
   - Shows total owed, total paid, current balance

#### Payment Endpoints (`src/routes/payments.ts`)

1. **POST /payments/initiate** - Updated
   - Accept scheduleId to link payment to specific month
   - Validate amount matches schedule amount

2. **GET /payments/upcoming** - New endpoint
   - Returns next 3 scheduled payments for tenant

3. **GET /payments/overdue** - New endpoint  
   - Returns overdue payments (landlord sees all, tenant sees own)

### 2. Automated Jobs

Create `src/jobs/leaseJobs.ts`:

```typescript
export class LeaseJobs {
  // Run daily at 1 AM
  static async updateLeaseStatuses() {
    // Call LeaseService.updateLeaseStatuses()
  }
  
  // Run daily at 8 AM
  static async sendPaymentReminders() {
    // Find payments due in next 3 days
    // Send reminder notifications
  }
  
  // Run on 25th of each month
  static async sendLeaseExpiryNotices() {
    // Find leases expiring in next 30 days
    // Send notifications to landlords and tenants
  }
}
```

### 7. Calculation Rules

#### First Month Proration:
```
If lease starts AFTER payment day:
  Days in period = (Month end date - Lease start date + 1)
  First payment = (Days in period / Days in month) × Monthly rent
```

#### Last Month Proration:
```
If lease ends BEFORE payment day:
  Days in period = Lease end date - Month start date + 1
  Last payment = (Days in period / Days in month) × Monthly rent
```

#### Payment Schedule Due Dates:
```
For each month in lease period:
  Due date = payment_day of that month
  If payment_day = 31 and month has fewer days, use last day of month
```

### 8. Business Logic Rules

1. **Lease Activation**
   - Can only activate if status = 'draft'
   - Generates full payment schedule immediately
   - First payment includes deposit if not paid

2. **Payment Application**
   - Payments apply to oldest unpaid schedule first
   - When payment completed, mark schedule as paid
   - Update balance calculations immediately

3. **Lease Renewal**
   - Can initiate when lease status = 'active' or 'expiring'
   - New lease starts day after current ends
   - No gap in payment schedules

4. **Lease Expiry**
   - Auto-mark as 'expiring' 30 days before end date
   - Auto-mark as 'expired' on day after end date
   - Release unit (mark available) when expired

### 9. Migration Steps

1. Add new columns to existing tables
2. Create payment_schedules table
3. For existing active leases:
   - Set payment_day = 1 (default)
   - Generate payment schedules retroactively
   - Link existing payments to appropriate schedules

### 10. Testing Requirements

Ensure these scenarios work correctly:

1. **Full Year Lease**: 12 monthly payments generated correctly
2. **Mid-Month Start**: First month prorated correctly
3. **Mid-Month End**: Last month prorated correctly  
4. **Payment Linking**: Payments correctly linked to schedule
5. **Balance Calculation**: Accurate at any point in time
6. **Renewal**: Seamless transition between leases
7. **Status Updates**: Automatic status changes work

## Implementation Notes

- Maintain backward compatibility with existing leases
- Use database transactions for critical operations (lease activation, payment completion)
- Add appropriate indexes for performance
- Include audit logging for lease status changes
- Ensure all monetary calculations use decimal precision
- Validate payment_day (1-31) and handle months with fewer days

## Success Criteria

1. Payment schedules generated accurately for any lease period
2. Balance calculations always correct
3. Clear visibility of paid vs unpaid months
4. Smooth lease renewal process
5. Automatic lease status management
6. No breaking changes to existing functionality

Generate the complete implementation code following the existing project patterns and conventions. Ensure all TypeScript types are properly defined and all database operations use transactions where appropriate.