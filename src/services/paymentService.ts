import { db } from '../db';
import { payments, leases, users, paymentSchedules } from '../db/schema';
import { eq, and, sum, desc, lte } from 'drizzle-orm';
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
      const totalScheduled = schedule.reduce((sum, s) => sum + s.amount, 0);
      const totalPaid = schedule.filter(s => s.isPaid).reduce((sum, s) => sum + s.amount, 0);
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

      // Check maximum amount (cannot exceed outstanding balance)
      if (amount > balance.outstandingBalance) {
        errors.push(`Amount cannot exceed outstanding balance of UGX ${balance.outstandingBalance.toLocaleString()}`);
        return {
          isValid: false,
          errors,
          suggestedAmount: balance.outstandingBalance,
        };
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
 * Get payment history with schedule info (UPDATED METHOD)
 */
  static async getPaymentHistory(leaseId: string) {
    try {
      const paymentHistory = await db
        .select({
          // Payment data
          paymentId: payments.id,
          amount: payments.amount,
          status: payments.status,
          paymentMethod: payments.paymentMethod,
          transactionId: payments.transactionId,
          paidDate: payments.paidDate,
          dueDate: payments.dueDate,
          notes: payments.notes,
          paymentCreatedAt: payments.createdAt,
          paymentUpdatedAt: payments.updatedAt,

          // Schedule data (NEW)
          scheduleId: paymentSchedules.id,
          paymentNumber: paymentSchedules.paymentNumber,
          scheduledAmount: paymentSchedules.amount,
          periodStart: paymentSchedules.periodStart,
          periodEnd: paymentSchedules.periodEnd,

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
        .leftJoin(paymentSchedules, eq(payments.scheduleId, paymentSchedules.id))
        .leftJoin(leases, eq(payments.leaseId, leases.id))
        .leftJoin(users, eq(leases.tenantId, users.id))
        .where(eq(payments.leaseId, leaseId))
        .orderBy(desc(payments.createdAt));

      // Transform to match expected format
      return paymentHistory.map((row) => ({
        payment: {
          id: row.paymentId,
          leaseId: row.leaseId,
          amount: row.amount,
          dueDate: row.dueDate,
          paidDate: row.paidDate,
          status: row.status as 'pending' | 'processing' | 'completed' | 'failed' | 'refunded',
          paymentMethod: row.paymentMethod,
          transactionId: row.transactionId,
          notes: row.notes,
          createdAt: row.paymentCreatedAt,
          updatedAt: row.paymentUpdatedAt,
          // Add schedule info
          paymentNumber: row.paymentNumber,
          periodCovered: row.periodStart && row.periodEnd ?
            `${new Date(row.periodStart).toLocaleDateString()} - ${new Date(row.periodEnd).toLocaleDateString()}` :
            null,
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
      }));
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
    // ADDED: scheduleId is now part of the creation data
    scheduleId?: string;
  }) {
    try {
      const [schedule] = data.scheduleId ? await db.select().from(paymentSchedules).where(eq(paymentSchedules.id, data.scheduleId)).limit(1) : [];
      if (data.scheduleId && (!schedule || schedule.leaseId !== data.leaseId)) {
        throw new Error('Invalid schedule ID for this lease');
      }

      const [payment] = await db
        .insert(payments)
        .values({
          leaseId: data.leaseId,
          scheduleId: data.scheduleId,
          amount: data.amount.toString(),
          transactionId: data.transactionId,
          paymentMethod: data.paymentMethod || 'mobile_money',
          // Use schedule due date if available
          dueDate: schedule ? schedule.dueDate : new Date(),
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

      // 1. Create the payment record directly as completed
      const [payment] = await db
        .insert(payments)
        .values({
          leaseId: data.leaseId,
          scheduleId: data.scheduleId,
          amount: data.amount.toString(),
          transactionId: transactionId,
          paymentMethod: data.paymentMethod,
          status: 'completed',
          paidDate: data.paidDate,
          notes: data.notes,
          dueDate: data.paidDate, // Default due date to paid date if no schedule
        })
        .returning();

      // 2. Handle Schedule Linking
      if (data.scheduleId) {
        // Explicit schedule provided
        await PaymentScheduleService.linkPaymentToSchedule(payment.id, data.scheduleId);
      } else {
        // Auto-match if no schedule provided
        await this.autoMatchPaymentToSchedule(payment);
      }

      return payment;
    } catch (error) {
      console.error('Error registering manual payment:', error);
      throw new Error('Failed to register manual payment');
    }
  }

  /**
   * Update payment status (UPDATED METHOD)
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

      if (status === 'completed' && updatedPayment.scheduleId) {
        await PaymentScheduleService.linkPaymentToSchedule(paymentId, updatedPayment.scheduleId);
      } else if (status === 'completed' && !updatedPayment.scheduleId) {
        await this.autoMatchPaymentToSchedule(updatedPayment);
      }

      return updatedPayment;
    } catch (error) {
      console.error('Error updating payment status:', error);
      throw new Error('Failed to update payment status');
    }
  }

  /**
 * Auto-match payment to oldest unpaid schedule (NEW METHOD)
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
        .orderBy(paymentSchedules.paymentNumber)
        .limit(1);

      if (oldestUnpaid) {
        // Update payment with scheduleId
        await db
          .update(payments)
          .set({
            scheduleId: oldestUnpaid.id,
            updatedAt: new Date(),
          })
          .where(eq(payments.id, payment.id));

        // Mark schedule as paid
        await PaymentScheduleService.linkPaymentToSchedule(
          payment.id,
          oldestUnpaid.id
        );
      }
    } catch (error) {
      console.error('Error auto-matching payment to schedule:', error);
      // Don't throw - this is a best-effort operation
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