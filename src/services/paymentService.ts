import { db } from '../db';
import { payments, leases, users } from '../db/schema';
import { eq, and, sum, desc } from 'drizzle-orm';
import { z } from 'zod';

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
  amount: z.number().min(10000, 'Minimum payment amount is UGX 10,000'),
  paymentMethod: z.string().optional().default('mobile_money'),
  phoneNumber: z.string().regex(/^[0-9]{10,12}$/, 'Invalid phone number').optional(),
});

export class PaymentService {
  /**
   * Calculate payment balance for a specific lease
   */
  static async calculateBalance(leaseId: string): Promise<PaymentBalance | null> {
    try {
      // Get lease details
      const lease = await db
        .select()
        .from(leases)
        .where(eq(leases.id, leaseId))
        .limit(1);

      if (!lease.length) {
        return null;
      }

      const leaseData = lease[0];

      // Calculate total paid amount for this lease
      const paidPayments = await db
        .select({
          totalPaid: sum(payments.amount),
        })
        .from(payments)
        .where(
          and(
            eq(payments.leaseId, leaseId),
            eq(payments.status, 'completed')
          )
        );

      const totalPaid = Number(paidPayments[0]?.totalPaid || 0);
      const monthlyRent = Number(leaseData.monthlyRent);
      
      // Calculate months since lease start
      const leaseStart = new Date(leaseData.startDate);
      const currentDate = new Date();
      const monthsDiff = Math.floor(
        (currentDate.getTime() - leaseStart.getTime()) / (1000 * 60 * 60 * 24 * 30)
      );
      const monthsOwed = Math.max(1, monthsDiff + 1); // At least current month
      
      const totalOwed = monthlyRent * monthsOwed;
      const outstandingBalance = Math.max(0, totalOwed - totalPaid);
      
      // Calculate next payment due date
      const nextDueDate = new Date(leaseStart);
      nextDueDate.setMonth(nextDueDate.getMonth() + monthsOwed);
      
      // Check if payment is overdue (more than 5 days past due date)
      const isOverdue = currentDate.getTime() > (nextDueDate.getTime() + 5 * 24 * 60 * 60 * 1000);

      return {
        leaseId,
        monthlyRent,
        paidAmount: totalPaid,
        outstandingBalance,
        minimumPayment: Math.min(10000, outstandingBalance), // Minimum 10k UGX or remaining balance
        dueDate: nextDueDate.toISOString(),
        isOverdue,
        nextPaymentDue: new Date(nextDueDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
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
   * Get payment history for a lease with detailed information
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

      // Transform to match mobile app expectations (PaymentWithDetails[])
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
        },
        lease: {
          id: row.leaseId,
          unitId: '', // We'd need to join with units table if needed
          tenantId: row.tenantId,
          startDate: row.leaseStartDate,
          endDate: row.leaseEndDate,
          monthlyRent: parseFloat(row.monthlyRent || '0'),
          deposit: parseFloat(row.deposit || '0'),
          status: row.leaseStatus as 'draft' | 'active' | 'expired' | 'terminated',
          terms: null,
          createdAt: '', // Would need from leases table
          updatedAt: '', // Would need from leases table
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
   * Create a new payment record in pending status
   */
  static async createPayment(data: {
    leaseId: string;
    amount: number;
    transactionId: string;
    paymentMethod?: string;
    dueDate?: Date;
  }) {
    try {
      const payment = await db
        .insert(payments)
        .values({
          leaseId: data.leaseId,
          amount: data.amount.toString(),
          transactionId: data.transactionId,
          paymentMethod: data.paymentMethod || 'mobile_money',
          dueDate: data.dueDate || new Date(),
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      return payment[0];
    } catch (error) {
      console.error('Error creating payment:', error);
      throw new Error('Failed to create payment');
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
      const updateData: any = {
        status,
        updatedAt: new Date(),
      };

      if (status === 'completed' && paidDate) {
        updateData.paidDate = paidDate;
      }

      const updatedPayment = await db
        .update(payments)
        .set(updateData)
        .where(eq(payments.id, paymentId))
        .returning();

      return updatedPayment[0];
    } catch (error) {
      console.error('Error updating payment status:', error);
      throw new Error('Failed to update payment status');
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