import { db } from '../db';
import { payments, leases, users, paymentSchedules, paymentSchedulePayments } from '../db/schema';
import { eq, and, desc, asc, sum } from 'drizzle-orm';
import { z } from 'zod';
import { PaymentScheduleService } from './paymentScheduleService';
import { WalletService } from './walletService';

// Types for payment service
export interface PaymentBalance {
  leaseId: string;
  monthlyRent: number;
  paidAmount: number;
  outstandingBalance: number;
  minimumPayment: number;
  dueDate: string;
  isOverdue: boolean;
  nextPaymentDue?: string;
}

export interface PaymentInitiation {
  paymentId: string;
  transactionId: string;
  amount: number;
  status: 'pending' | 'processing';
  gateway: 'iotec' | 'yo';
  gatewayReference: string;
  leaseId: string;
  statusMessage?: string;
}

export interface PaymentValidation {
  isValid: boolean;
  errors: string[];
  suggestedAmount?: number;
}

// Validation schemas
export const paymentAmountSchema = z.object({
  amount: z.number().min(10000, 'Minimum payment amount is UGX 10,000'),
  leaseId: z.string().uuid('Invalid lease ID'),
});

export const paymentInitiationSchema = z.object({
  leaseId: z.string().uuid('Invalid lease ID'),
  amount: z.number(),
  paymentMethod: z.string().optional().default('mobile_money'),
  provider: z.enum(['mtn', 'airtel', 'm-sente']),
  phoneNumber: z.string().regex(/^[0-9]{10,12}$/, 'Invalid phone number'),
});

export class PaymentService {
  /**
   * Calculate accurate number of months owed from lease start to current date
   */
  private static calculateMonthsOwed(leaseStart: Date, currentDate: Date): number {
    const startYear = leaseStart.getFullYear();
    const startMonth = leaseStart.getMonth();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();

    // Calculate total months from lease start to current month
    let monthsOwed = (currentYear - startYear) * 12 + (currentMonth - startMonth);

    // Always include the first month of the lease
    monthsOwed = Math.max(1, monthsOwed + 1);

    return monthsOwed;
  }

  /**
   * Calculate next payment due date (next month)
   */
  private static calculateNextPaymentDate(currentDueDate: Date): Date {
    const nextDue = new Date(currentDueDate);
    nextDue.setMonth(nextDue.getMonth() + 1);
    nextDue.setDate(1); // Always due on 1st
    nextDue.setHours(0, 0, 0, 0);
    return nextDue;
  }

  /**
   * Calculate payment balance for a specific lease
   */
  static async calculateBalance(leaseId: string): Promise<PaymentBalance | null> {
    try {
      const [leaseData] = await db.select().from(leases).where(eq(leases.id, leaseId)).limit(1);
      if (!leaseData) return null;

      const schedule = await PaymentScheduleService.getLeasePaymentSchedule(leaseId);

      // Get current date (start of day for consistent comparison)
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      // Include schedules where dueDate <= now
      // Since dueDate represents when rent becomes due (at period start),
      // this correctly captures all obligations that are currently due
      const dueSchedules = schedule.filter(s => {
        const dueDate = new Date(s.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate <= now;
      });

      const totalScheduled = dueSchedules.reduce((sum, s) => sum + s.amount, 0);
      const totalPaid = dueSchedules.filter(s => s.isPaid).reduce((sum, s) => sum + s.amount, 0);
      const outstandingBalance = totalScheduled - totalPaid;

      const nextSchedule = await PaymentScheduleService.getNextPaymentDue(leaseId);
      const overduePayments = await PaymentScheduleService.getOverduePayments(leaseId);

      return {
        leaseId,
        monthlyRent: parseFloat(leaseData.monthlyRent),
        paidAmount: totalPaid,
        outstandingBalance,
        minimumPayment: nextSchedule ? Number(nextSchedule.amount) : 0,
        dueDate: nextSchedule ? nextSchedule.dueDate.toISOString() : '',
        isOverdue: overduePayments.length > 0,
        nextPaymentDue: nextSchedule ? nextSchedule.dueDate.toISOString() : undefined,
      };
    } catch (error) {
      console.error('Error calculating payment balance:', error);
      throw new Error('Failed to calculate payment balance');
    }
  }

  /**
   * Validate payment amount against lease balance
   */
  static async validatePayment(leaseId: string, amount: number): Promise<PaymentValidation> {
    try {
      const balance = await this.calculateBalance(leaseId);

      if (!balance) {
        return {
          isValid: false,
          errors: ['Lease not found'],
        };
      }

      const errors: string[] = [];

      // Check minimum amount
      if (amount < 10000) {
        errors.push('Minimum payment amount is UGX 10,000');
      }

      return {
        isValid: errors.length === 0,
        errors,
      };
    } catch (error) {
      console.error('Error validating payment:', error);
      return {
        isValid: false,
        errors: ['Failed to validate payment'],
      };
    }
  }

  /**
 * Get payment history with schedule info
 */
  static async getPaymentHistory(leaseId: string) {
    try {
      // Get all payments for the lease
      const paymentRecords = await db
        .select({
          // Payment data
          paymentId: payments.id,
          amount: payments.amount,
          status: payments.status,
          paymentMethod: payments.paymentMethod,
          transactionId: payments.transactionId,
          paidDate: payments.paidDate,
          notes: payments.notes,
          paymentCreatedAt: payments.createdAt,
          paymentUpdatedAt: payments.updatedAt,

          // Lease data
          leaseId: leases.id,
          leaseStartDate: leases.startDate,
          leaseEndDate: leases.endDate,
          monthlyRent: leases.monthlyRent,
          deposit: leases.deposit,
          leaseStatus: leases.status,

          // Tenant data
          tenantId: users.id,
          tenantFirstName: users.firstName,
          tenantLastName: users.lastName,
          tenantEmail: users.email,
          tenantPhone: users.phone,
        })
        .from(payments)
        .leftJoin(leases, eq(payments.leaseId, leases.id))
        .leftJoin(users, eq(leases.tenantId, users.id))
        .where(eq(payments.leaseId, leaseId))
        .orderBy(desc(payments.createdAt));

      // For each payment, get the schedules it was applied to
      const enrichedHistory = await Promise.all(
        paymentRecords.map(async (row) => {
          const appliedSchedules = await db
            .select({
              scheduleId: paymentSchedulePayments.scheduleId,
              amountApplied: paymentSchedulePayments.amountApplied,
              paymentNumber: paymentSchedules.paymentNumber,
              periodStart: paymentSchedules.periodStart,
              periodEnd: paymentSchedules.periodEnd,
              scheduledAmount: paymentSchedules.amount,
            })
            .from(paymentSchedulePayments)
            .innerJoin(paymentSchedules, eq(paymentSchedulePayments.scheduleId, paymentSchedules.id))
            .where(eq(paymentSchedulePayments.paymentId, row.paymentId));

          return {
            payment: {
              id: row.paymentId,
              leaseId: row.leaseId,
              amount: row.amount,
              paidDate: row.paidDate,
              status: row.status as 'pending' | 'processing' | 'completed' | 'failed' | 'refunded',
              paymentMethod: row.paymentMethod,
              transactionId: row.transactionId,
              notes: row.notes,
              createdAt: row.paymentCreatedAt,
              updatedAt: row.paymentUpdatedAt,
              // Add schedule info (first schedule if multiple)
              paymentNumber: appliedSchedules[0]?.paymentNumber || null,
              periodCovered: appliedSchedules.length > 0
                ? appliedSchedules.map(s =>
                  `${new Date(s.periodStart).toLocaleDateString()} - ${new Date(s.periodEnd).toLocaleDateString()}`
                ).join(', ')
                : null,
              appliedSchedules: appliedSchedules.map(s => ({
                scheduleId: s.scheduleId,
                paymentNumber: s.paymentNumber,
                amountApplied: parseFloat(s.amountApplied),
                scheduledAmount: parseFloat(s.scheduledAmount),
                period: `${new Date(s.periodStart).toLocaleDateString()} - ${new Date(s.periodEnd).toLocaleDateString()}`,
              })),
            },
            lease: {
              id: row.leaseId,
              unitId: '',
              tenantId: row.tenantId,
              startDate: row.leaseStartDate,
              endDate: row.leaseEndDate,
              monthlyRent: parseFloat(row.monthlyRent || '0'),
              deposit: parseFloat(row.deposit || '0'),
              status: row.leaseStatus as 'draft' | 'active' | 'expired' | 'terminated',
              terms: null,
              createdAt: '',
              updatedAt: '',
            },
            tenant: {
              id: row.tenantId,
              firstName: row.tenantFirstName,
              lastName: row.tenantLastName,
              email: row.tenantEmail || '',
              phone: row.tenantPhone || '',
            },
          };
        })
      );

      return enrichedHistory;
    } catch (error) {
      console.error('Error fetching payment history:', error);
      throw new Error('Failed to fetch payment history');
    }
  }

  /**
     * Create a new payment record
     */
  static async createPayment(data: {
    leaseId: string;
    amount: number;
    transactionId: string;
    paymentMethod?: string;
    phoneNumber?: string;
    mobileMoneyProvider?: 'mtn' | 'airtel' | 'm-sente';
    gateway?: 'iotec' | 'yo';
    gatewayReference?: string;
    gatewayRawResponse?: string;
  }) {
    try {
      const [payment] = await db
        .insert(payments)
        .values({
          leaseId: data.leaseId,
          amount: data.amount.toString(),
          transactionId: data.transactionId,
          paymentMethod: data.paymentMethod || 'mobile_money',
          phoneNumber: data.phoneNumber,
          mobileMoneyProvider: data.mobileMoneyProvider,
          gateway: data.gateway || 'iotec',
          gatewayReference: data.gatewayReference,
          gatewayRawResponse: data.gatewayRawResponse,
          status: 'pending',
        })
        .returning();

      return payment;
    } catch (error) {
      console.error('Error creating payment:', error);
      throw new Error('Failed to create payment');
    }
  }

  /**
   * Get payment by transaction ID (external reference)
   */
  static async getPaymentByTransactionId(transactionId: string) {
    try {
      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.transactionId, transactionId))
        .limit(1);

      return payment || null;
    } catch (error) {
      console.error('Error fetching payment by transaction ID:', error);
      throw new Error('Failed to fetch payment');
    }
  }

  /**
   * Get payment by gateway reference
   */
  static async getPaymentByGatewayReference(gatewayReference: string) {
    try {
      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.gatewayReference, gatewayReference))
        .limit(1);

      return payment || null;
    } catch (error) {
      console.error('Error fetching payment by gateway reference:', error);
      throw new Error('Failed to fetch payment');
    }
  }

  /**
   * Update payment with gateway response data
   */
  static async updatePaymentGatewayData(
    paymentId: string,
    data: {
      gatewayReference?: string;
      gatewayRawResponse?: string;
      status?: 'pending' | 'completed' | 'failed' | 'refunded';
      paidDate?: Date;
    }
  ) {
    try {
      const updateData: Record<string, unknown> = { updatedAt: new Date() };

      if (data.gatewayReference !== undefined) {
        updateData.gatewayReference = data.gatewayReference;
      }
      if (data.gatewayRawResponse !== undefined) {
        updateData.gatewayRawResponse = data.gatewayRawResponse;
      }
      if (data.status !== undefined) {
        updateData.status = data.status;
      }
      if (data.paidDate !== undefined) {
        updateData.paidDate = data.paidDate;
      }

      const [updatedPayment] = await db
        .update(payments)
        .set(updateData)
        .where(eq(payments.id, paymentId))
        .returning();

      return updatedPayment || null;
    } catch (error) {
      console.error('Error updating payment gateway data:', error);
      throw new Error('Failed to update payment');
    }
  }

  /**
   * Register a manual payment (e.g. cash, bank transfer)
   * Manual payments are auto-distributed to schedules but do NOT credit the landlord wallet
   * (the money was already received outside the system)
   */
  static async registerManualPayment(data: {
    leaseId: string;
    amount: number;
    paidDate: Date;
    paymentMethod: string;
    notes?: string;
    transactionId?: string;
  }) {
    try {
      // Create transaction ID if not provided (for manual payments)
      const transactionId = data.transactionId || `MAN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // Create the payment record
      const [payment] = await db
        .insert(payments)
        .values({
          leaseId: data.leaseId,
          amount: data.amount.toString(),
          transactionId: transactionId,
          paymentMethod: data.paymentMethod,
          status: 'completed',
          paidDate: data.paidDate,
          notes: data.notes
        })
        .returning();

      // Distribute payment to schedules (no wallet credit for manual payments)
      await this.applyPaymentToSchedules(payment);

      return payment;
    } catch (error) {
      console.error('Error registering manual payment:', error);
      throw new Error('Failed to register manual payment');
    }
  }

  /**
   * Update payment status
   * For mobile money payments, this is called when the webhook confirms completion.
   * Mobile money payments DO credit the landlord wallet (money flows through the system).
   */
  static async updatePaymentStatus(
    paymentId: string,
    status: 'pending' | 'completed' | 'failed' | 'refunded',
    paidDate?: Date
  ) {
    try {
      const updateData: any = { status, updatedAt: new Date() };
      if (status === 'completed' && paidDate) {
        updateData.paidDate = paidDate;
      }

      const [updatedPayment] = await db.update(payments).set(updateData).where(eq(payments.id, paymentId)).returning();

      if (!updatedPayment) {
        throw new Error('Payment not found');
      }

      if (status === 'completed') {
        // Distribute payment to schedules
        await this.applyPaymentToSchedules(updatedPayment);

        // Credit the landlord's wallet (only for mobile money payments that flow through the system)
        await this.creditLandlordWallet(updatedPayment);
      }

      return updatedPayment;
    } catch (error) {
      console.error('Error updating payment status:', error);
      throw new Error('Failed to update payment status');
    }
  }

  /**
   * Credit landlord wallet when payment is completed
   */
  private static async creditLandlordWallet(payment: any) {
    try {
      const landlordId = await WalletService.getLandlordIdFromPayment(payment.id);
      if (!landlordId) {
        console.warn(`Could not find landlord for payment ${payment.id}`);
        return;
      }

      await WalletService.recordDeposit(
        landlordId,
        parseFloat(payment.amount),
        payment.id,
        `Rent payment - Transaction: ${payment.transactionId || 'N/A'}`
      );

      console.log(`Credited wallet for landlord ${landlordId} with UGX ${payment.amount}`);
    } catch (error) {
      // Log but don't fail the payment update
      console.error('Error crediting landlord wallet:', error);
    }
  }

  /**
   * Apply a completed payment to unpaid/partially paid schedules (cascading distribution)
   * This method distributes the payment amount across schedules, oldest first.
   * Does NOT handle wallet crediting - that's the caller's responsibility.
   */
  private static async applyPaymentToSchedules(payment: any) {
    try {
      const amount = parseFloat(payment.amount);
      const leaseId = payment.leaseId;

      // Get all schedules for this lease ordered by payment number
      const allSchedules = await db
        .select()
        .from(paymentSchedules)
        .where(eq(paymentSchedules.leaseId, leaseId))
        .orderBy(asc(paymentSchedules.paymentNumber));

      let remainingAmount = amount;

      // Iterate through schedules and apply payment
      for (const schedule of allSchedules) {
        if (remainingAmount <= 0.01) break;

        const scheduleAmount = parseFloat(schedule.amount);

        // Calculate how much of this schedule has already been paid (from junction table)
        const existingPaymentsResult = await db
          .select({ total: sum(paymentSchedulePayments.amountApplied) })
          .from(paymentSchedulePayments)
          .where(eq(paymentSchedulePayments.scheduleId, schedule.id));

        const alreadyPaid = parseFloat(existingPaymentsResult[0]?.total || '0');
        const remainingDue = scheduleAmount - alreadyPaid;

        if (remainingDue <= 0.01) continue; // Skip if fully paid (floating point tolerance)

        // Determine allocation for this schedule
        const allocation = Math.min(remainingAmount, remainingDue);

        // Insert junction record
        await db.insert(paymentSchedulePayments).values({
          paymentId: payment.id,
          scheduleId: schedule.id,
          amountApplied: allocation.toString(),
        });

        remainingAmount -= allocation;

        // Update isPaid flag if fully paid
        const newTotal = alreadyPaid + allocation;
        if (newTotal >= scheduleAmount - 0.01) {
          await db
            .update(paymentSchedules)
            .set({
              isPaid: true,
              updatedAt: new Date(),
            })
            .where(eq(paymentSchedules.id, schedule.id));
        }
      }

      // Handle Overpayment (Credit) - payment remains but not applied to any schedule yet
      // This credit will be applied to future schedules automatically
      if (remainingAmount > 0.01) {
        console.log(`Payment ${payment.id} has ${remainingAmount} in credit for future schedules`);
      }
    } catch (error) {
      console.error('Error applying payment to schedules:', error);
      // Don't throw - this is a best-effort operation for distribution
    }
  }

  /**
   * Distribute payment amount to schedules (Upfront/Partial logic)
   * Used internally for creating and distributing a new payment in one operation.
   * @deprecated Use registerManualPayment or the applyPaymentToSchedules helper instead
   */
  private static async distributePaymentToSchedules(
    leaseId: string,
    amount: number,
    transactionId: string,
    paymentMethod: string,
    paidDate: Date,
    notes?: string
  ) {
    try {
      // 1. Create a single payment record for the entire amount
      const [payment] = await db
        .insert(payments)
        .values({
          leaseId,
          amount: amount.toString(),
          transactionId,
          paymentMethod,
          status: 'completed',
          paidDate,
          notes,
        })
        .returning();

      // 2. Get all unpaid or partially paid schedules ordered by date
      const allSchedules = await db
        .select()
        .from(paymentSchedules)
        .where(eq(paymentSchedules.leaseId, leaseId))
        .orderBy(asc(paymentSchedules.paymentNumber));

      let remainingAmount = amount;
      const appliedSchedules = [];

      // 3. Iterate through schedules and apply payment
      for (const schedule of allSchedules) {
        if (remainingAmount <= 0.01) break;

        const scheduleAmount = parseFloat(schedule.amount);

        // Calculate how much of this schedule has already been paid (from junction table)
        const existingPaymentsResult = await db
          .select({ total: sum(paymentSchedulePayments.amountApplied) })
          .from(paymentSchedulePayments)
          .where(eq(paymentSchedulePayments.scheduleId, schedule.id));

        const alreadyPaid = parseFloat(existingPaymentsResult[0]?.total || '0');
        const remainingDue = scheduleAmount - alreadyPaid;

        if (remainingDue <= 0.01) continue; // Skip if fully paid (floating point tolerance)

        // Determine allocation for this schedule
        const allocation = Math.min(remainingAmount, remainingDue);

        // Insert junction record
        await db.insert(paymentSchedulePayments).values({
          paymentId: payment.id,
          scheduleId: schedule.id,
          amountApplied: allocation.toString(),
        });

        appliedSchedules.push({
          scheduleId: schedule.id,
          amount: allocation,
        });

        remainingAmount -= allocation;

        // Update isPaid flag if fully paid
        const newTotal = alreadyPaid + allocation;
        if (newTotal >= scheduleAmount - 0.01) {
          await db
            .update(paymentSchedules)
            .set({
              isPaid: true,
              updatedAt: new Date(),
            })
            .where(eq(paymentSchedules.id, schedule.id));
        }
      }

      // 4. Handle Overpayment (Credit) - payment remains but not applied to any schedule yet
      // This credit will be applied to future schedules automatically
      if (remainingAmount > 0.01) {
        // Log that there's a credit - could be used for future payments
        console.log(`Payment ${payment.id} has ${remainingAmount} in credit for future schedules`);
      }

      // Note: Wallet crediting is NOT done here - it's the caller's responsibility
      // This method is deprecated; use applyPaymentToSchedules instead

      return [payment];
    } catch (error) {
      console.error('Error distributing payment to schedules:', error);
      throw error; // Propagate error
    }
  }

  /**
* Get upcoming payments for a lease
*/
  static async getUpcomingPayments(leaseId: string, limit: number = 3) {
    try {
      const now = new Date();

      const upcoming = await db
        .select()
        .from(paymentSchedules)
        .where(
          and(
            eq(paymentSchedules.leaseId, leaseId),
            eq(paymentSchedules.isPaid, false)
          )
        )
        .orderBy(paymentSchedules.paymentNumber)
        .limit(limit);

      return upcoming.map(schedule => ({
        ...schedule,
        amount: parseFloat(schedule.amount),
        status: now > schedule.dueDate ? 'overdue' : 'upcoming',
      }));
    } catch (error) {
      console.error('Error fetching upcoming payments:', error);
      throw new Error('Failed to fetch upcoming payments');
    }
  }

  /**
   * Get payment by ID with lease details
   */
  static async getPaymentById(paymentId: string) {
    try {
      const payment = await db
        .select({
          payment: payments,
          lease: leases,
          tenant: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            phone: users.phone,
          },
        })
        .from(payments)
        .leftJoin(leases, eq(payments.leaseId, leases.id))
        .leftJoin(users, eq(leases.tenantId, users.id))
        .where(eq(payments.id, paymentId))
        .limit(1);

      return payment[0] || null;
    } catch (error) {
      console.error('Error fetching payment by ID:', error);
      throw new Error('Failed to fetch payment');
    }
  }

  /**
   * Get all payments with optional filtering
   */
  static async getAllPayments(filters?: {
    status?: 'pending' | 'completed' | 'failed' | 'refunded';
    landlordId?: string;
    limit?: number;
    offset?: number;
  }) {
    try {
      // Build base query
      let baseQuery = db
        .select({
          payment: payments,
          lease: leases,
          tenant: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            phone: users.phone,
          },
        })
        .from(payments)
        .leftJoin(leases, eq(payments.leaseId, leases.id))
        .leftJoin(users, eq(leases.tenantId, users.id))
        .orderBy(desc(payments.createdAt));

      // Apply filters and build final query
      let finalQuery;
      if (filters?.status) {
        finalQuery = baseQuery.where(eq(payments.status, filters.status));
      } else {
        finalQuery = baseQuery;
      }

      // Apply pagination if specified
      if (filters?.limit && filters?.offset) {
        finalQuery = finalQuery.limit(filters.limit).offset(filters.offset);
      } else if (filters?.limit) {
        finalQuery = finalQuery.limit(filters.limit);
      } else if (filters?.offset) {
        finalQuery = finalQuery.offset(filters.offset);
      }

      const result = await finalQuery;
      return result;
    } catch (error) {
      console.error('Error fetching payments:', error);
      throw new Error('Failed to fetch payments');
    }
  }
}