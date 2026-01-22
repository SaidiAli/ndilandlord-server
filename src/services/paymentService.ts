import { db } from '../db';
import { payments, leases, users, paymentSchedules, paymentSchedulePayments } from '../db/schema';
import { eq, and, desc, asc, sum } from 'drizzle-orm';
import { z } from 'zod';
import { PaymentScheduleService } from './paymentScheduleService';

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
  transactionId: string;
  amount: number;
  status: 'pending' | 'processing';
  estimatedCompletion: string;
  iotecReference: string;
  leaseId: string;
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
  scheduleId: z.string().uuid('Invalid schedule ID').optional(),
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
   * Calculate payment balance for a specific lease (UPDATED METHOD)
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

      // Check maximum amount - REMOVED to allow overpayments
      // if (amount > balance.outstandingBalance) { ... }

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
 * Validate payment against schedule
 */
  static async validatePaymentWithSchedule(
    leaseId: string,
    scheduleId: string,
    amount: number
  ): Promise<PaymentValidation> {
    try {
      // Get the schedule entry
      const [schedule] = await db
        .select()
        .from(paymentSchedules)
        .where(
          and(
            eq(paymentSchedules.id, scheduleId),
            eq(paymentSchedules.leaseId, leaseId)
          )
        )
        .limit(1);

      if (!schedule) {
        return {
          isValid: false,
          errors: ['Invalid payment schedule'],
        };
      }

      if (schedule.isPaid) {
        return {
          isValid: false,
          errors: ['This payment has already been made'],
        };
      }

      const scheduledAmount = parseFloat(schedule.amount);
      const errors: string[] = [];

      // Allow exact amount or overpayment (credit)
      if (amount < scheduledAmount) {
        errors.push(`Amount must be at least UGX ${scheduledAmount.toLocaleString()}`);
        return {
          isValid: false,
          errors,
          suggestedAmount: scheduledAmount,
        };
      }

      return {
        isValid: true,
        errors: [],
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
     * Create a new payment record (UPDATED METHOD)
     */
  static async createPayment(data: {
    leaseId: string;
    amount: number;
    transactionId: string;
    paymentMethod?: string;
    phoneNumber?: string;
    mobileMoneyProvider?: string;
  }) {
    try {
      const [payment] = await db
        .insert(payments)
        .values({
          leaseId: data.leaseId,
          amount: data.amount.toString(),
          transactionId: data.transactionId,
          paymentMethod: data.paymentMethod || 'mobile_money',
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
   * Register a manual payment (e.g. cash, bank transfer)
   */
  static async registerManualPayment(data: {
    leaseId: string;
    amount: number;
    paidDate: Date;
    paymentMethod: string;
    notes?: string;
    scheduleId?: string;
    transactionId?: string;
  }) {
    try {
      // Create transaction ID if not provided (for manual payments)
      const transactionId = data.transactionId || `MAN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      if (data.scheduleId) {
        // CASE 1: Specific Schedule Selected
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

        // Check if this schedule is now fully paid
        const schedule = await db.select().from(paymentSchedules).where(eq(paymentSchedules.id, data.scheduleId)).limit(1);
        if (schedule.length > 0) {
          // Get existing payments from junction table
          const existingPaymentsResult = await db
            .select({ total: sum(paymentSchedulePayments.amountApplied) })
            .from(paymentSchedulePayments)
            .where(eq(paymentSchedulePayments.scheduleId, data.scheduleId));

          const alreadyPaid = parseFloat(existingPaymentsResult[0]?.total || '0');
          const scheduleAmount = parseFloat(schedule[0].amount);
          const remainingDue = scheduleAmount - alreadyPaid;

          // Apply payment to schedule (full or partial)
          const amountToApply = Math.min(data.amount, remainingDue);
          await PaymentScheduleService.linkPaymentToSchedule(payment.id, data.scheduleId, amountToApply);
        }

        return payment;
      } else {
        // CASE 2: No Specific Schedule (Auto-Distribute / Cascading)
        const createdPayments = await this.distributePaymentToSchedules(
          data.leaseId,
          data.amount,
          transactionId,
          data.paymentMethod,
          data.paidDate,
          data.notes
        );

        return createdPayments[0];
      }
    } catch (error) {
      console.error('Error registering manual payment:', error);
      throw new Error('Failed to register manual payment');
    }
  }

  /**
   * Update payment status
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
        await this.autoMatchPaymentToSchedule(updatedPayment);
      }

      return updatedPayment;
    } catch (error) {
      console.error('Error updating payment status:', error);
      throw new Error('Failed to update payment status');
    }
  }

  /**
   * Auto-match payment to oldest unpaid schedule
   */
  private static async autoMatchPaymentToSchedule(payment: any) {
    try {
      // Find oldest unpaid schedule for this lease
      const [oldestUnpaid] = await db
        .select()
        .from(paymentSchedules)
        .where(
          and(
            eq(paymentSchedules.leaseId, payment.leaseId),
            eq(paymentSchedules.isPaid, false)
          )
        )
        .orderBy(asc(paymentSchedules.paymentNumber))
        .limit(1);

      if (oldestUnpaid) {
        // Mark schedule as paid if sufficient amount
        const paymentVal = parseFloat(payment.amount);
        const scheduleVal = parseFloat(oldestUnpaid.amount);

        // Check if fully paid (or close enough)
        if (paymentVal >= scheduleVal - 0.01) {
          await PaymentScheduleService.linkPaymentToSchedule(
            payment.id,
            oldestUnpaid.id
          );
        }
      }
    } catch (error) {
      console.error('Error auto-matching payment to schedule:', error);
      // Don't throw - this is a best-effort operation
    }
  }

  /**
   * Distribute payment amount to schedules (Upfront/Partial logic)
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