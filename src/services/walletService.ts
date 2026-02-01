import { db } from '../db';
import { landlordWallets, walletTransactions, payments, leases, units, properties } from '../db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import { IoTecService } from './iotecService';

// Types
export interface WalletSummary {
  walletId: string;
  balance: number;
  totalDeposited: number;
  totalWithdrawn: number;
  pendingWithdrawals: number;
  recentTransactions: WalletTransaction[];
}

export interface WalletTransaction {
  id: string;
  type: 'deposit' | 'withdrawal' | 'adjustment';
  amount: number;
  balanceAfter: number;
  status: 'pending' | 'completed' | 'failed';
  description: string | null;
  createdAt: Date;
  paymentId?: string | null;
  destinationType?: string | null;
}

export interface WithdrawalRequest {
  amount: number;
  destinationType: 'mobile_money' | 'bank_account';
  provider?: 'mtn' | 'airtel';
  phoneNumber?: string;
  bankId?: string;
  accountNumber?: string;
  accountName?: string;
}

// Validation schemas
export const withdrawalRequestSchema = z.object({
  amount: z.number().min(10000, 'Minimum withdrawal amount is UGX 10,000'),
  destinationType: z.enum(['mobile_money', 'bank_account']),
  provider: z.enum(['mtn', 'airtel']).optional(),
  phoneNumber: z.string().regex(/^[0-9]{10,12}$/, 'Invalid phone number').optional(),
  bankId: z.string().uuid().optional(),
  accountNumber: z.string().optional(),
  accountName: z.string().optional(),
}).refine(
  (data) => {
    if (data.destinationType === 'mobile_money') {
      return data.provider && data.phoneNumber;
    }
    if (data.destinationType === 'bank_account') {
      return data.accountNumber && data.accountName;
    }
    return false;
  },
  { message: 'Invalid destination details for the selected type' }
);

export class WalletService {
  /**
   * Get or create wallet for a landlord
   */
  static async getOrCreateWallet(landlordId: string) {
    try {
      // Try to find existing wallet
      const [existingWallet] = await db
        .select()
        .from(landlordWallets)
        .where(eq(landlordWallets.landlordId, landlordId))
        .limit(1);

      if (existingWallet) {
        return existingWallet;
      }

      // Create new wallet
      const [newWallet] = await db
        .insert(landlordWallets)
        .values({
          landlordId,
          balance: '0',
          totalDeposited: '0',
          totalWithdrawn: '0',
        })
        .returning();

      return newWallet;
    } catch (error) {
      console.error('Error getting/creating wallet:', error);
      throw new Error('Failed to get or create wallet');
    }
  }

  /**
   * Get wallet balance for a landlord
   */
  static async getWalletBalance(landlordId: string): Promise<number> {
    const wallet = await this.getOrCreateWallet(landlordId);
    return parseFloat(wallet.balance);
  }

  /**
   * Get wallet summary with recent transactions
   */
  static async getWalletSummary(landlordId: string): Promise<WalletSummary> {
    try {
      const wallet = await this.getOrCreateWallet(landlordId);

      // Get pending withdrawals total
      const [pendingResult] = await db
        .select({
          total: sql<string>`COALESCE(SUM(${walletTransactions.amount}), '0')`,
        })
        .from(walletTransactions)
        .where(
          and(
            eq(walletTransactions.walletId, wallet.id),
            eq(walletTransactions.type, 'withdrawal'),
            eq(walletTransactions.status, 'pending')
          )
        );

      // Get recent transactions
      const recentTxns = await db
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.walletId, wallet.id))
        .orderBy(desc(walletTransactions.createdAt))
        .limit(10);

      return {
        walletId: wallet.id,
        balance: parseFloat(wallet.balance),
        totalDeposited: parseFloat(wallet.totalDeposited),
        totalWithdrawn: parseFloat(wallet.totalWithdrawn),
        pendingWithdrawals: parseFloat(pendingResult?.total || '0'),
        recentTransactions: recentTxns.map((txn) => ({
          id: txn.id,
          type: txn.type,
          amount: parseFloat(txn.amount),
          balanceAfter: parseFloat(txn.balanceAfter),
          status: txn.status,
          description: txn.description,
          createdAt: txn.createdAt,
          paymentId: txn.paymentId,
          destinationType: txn.destinationType,
        })),
      };
    } catch (error) {
      console.error('Error getting wallet summary:', error);
      throw new Error('Failed to get wallet summary');
    }
  }

  /**
   * Record a deposit (called when a payment is completed)
   */
  static async recordDeposit(
    landlordId: string,
    amount: number,
    paymentId: string,
    description?: string
  ) {
    try {
      const wallet = await this.getOrCreateWallet(landlordId);
      const currentBalance = parseFloat(wallet.balance);
      const newBalance = currentBalance + amount;

      // Update wallet in a transaction
      await db.transaction(async (tx) => {
        // Update wallet balance and totals
        await tx
          .update(landlordWallets)
          .set({
            balance: newBalance.toString(),
            totalDeposited: (parseFloat(wallet.totalDeposited) + amount).toString(),
            updatedAt: new Date(),
          })
          .where(eq(landlordWallets.id, wallet.id));

        // Create transaction record
        await tx.insert(walletTransactions).values({
          walletId: wallet.id,
          type: 'deposit',
          amount: amount.toString(),
          balanceAfter: newBalance.toString(),
          status: 'completed',
          paymentId,
          description: description || 'Rent payment received',
        });
      });

      return {
        success: true,
        newBalance,
        transactionId: paymentId,
      };
    } catch (error) {
      console.error('Error recording deposit:', error);
      throw new Error('Failed to record deposit');
    }
  }

  /**
   * Request a withdrawal
   */
  static async requestWithdrawal(
    landlordId: string,
    request: WithdrawalRequest
  ) {
    try {
      // Validate request
      const validation = withdrawalRequestSchema.safeParse(request);
      if (!validation.success) {
        throw new Error(validation.error.errors.map((e) => e.message).join(', '));
      }

      const wallet = await this.getOrCreateWallet(landlordId);
      const currentBalance = parseFloat(wallet.balance);

      // Check sufficient balance
      if (currentBalance < request.amount) {
        throw new Error(
          `Insufficient balance. Available: UGX ${currentBalance.toLocaleString()}, Requested: UGX ${request.amount.toLocaleString()}`
        );
      }

      const newBalance = currentBalance - request.amount;

      // Create external ID for tracking
      const externalId = `WD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // Prepare destination details
      const destinationDetails = JSON.stringify({
        type: request.destinationType,
        provider: request.provider,
        phoneNumber: request.phoneNumber,
        bankId: request.bankId,
        accountNumber: request.accountNumber,
        accountName: request.accountName,
      });

      // Create pending withdrawal transaction
      const [withdrawalTxn] = await db.transaction(async (tx) => {
        // Update wallet balance
        await tx
          .update(landlordWallets)
          .set({
            balance: newBalance.toString(),
            updatedAt: new Date(),
          })
          .where(eq(landlordWallets.id, wallet.id));

        // Create transaction record
        const [txn] = await tx
          .insert(walletTransactions)
          .values({
            walletId: wallet.id,
            type: 'withdrawal',
            amount: request.amount.toString(),
            balanceAfter: newBalance.toString(),
            status: 'pending',
            destinationType: request.destinationType,
            destinationDetails,
            description: `Withdrawal to ${request.destinationType === 'mobile_money' ? request.phoneNumber : request.accountNumber}`,
          })
          .returning();

        return [txn];
      });

      // Initiate disbursement via IoTec
      try {
        if (request.destinationType === 'mobile_money' && request.phoneNumber) {
          const disbursementResponse = await this.initiateIoTecDisbursement(
            request.amount,
            request.phoneNumber,
            externalId,
            `Verit withdrawal for landlord`
          );

          // Update transaction with gateway reference
          await db
            .update(walletTransactions)
            .set({
              gatewayReference: disbursementResponse.id,
              updatedAt: new Date(),
            })
            .where(eq(walletTransactions.id, withdrawalTxn.id));

          return {
            success: true,
            transactionId: withdrawalTxn.id,
            gatewayReference: disbursementResponse.id,
            status: 'pending',
            message: 'Withdrawal initiated. You will receive the funds shortly.',
          };
        }

        // For bank transfers, we would use a different endpoint
        // For now, mark as pending for manual processing
        return {
          success: true,
          transactionId: withdrawalTxn.id,
          status: 'pending',
          message: 'Withdrawal request submitted for processing.',
        };
      } catch (gatewayError) {
        // Revert the balance if gateway call fails
        await db.transaction(async (tx) => {
          await tx
            .update(landlordWallets)
            .set({
              balance: currentBalance.toString(),
              updatedAt: new Date(),
            })
            .where(eq(landlordWallets.id, wallet.id));

          await tx
            .update(walletTransactions)
            .set({
              status: 'failed',
              description: `${withdrawalTxn.description} - Gateway error: ${gatewayError instanceof Error ? gatewayError.message : 'Unknown error'}`,
              updatedAt: new Date(),
            })
            .where(eq(walletTransactions.id, withdrawalTxn.id));
        });

        throw new Error(
          `Withdrawal failed: ${gatewayError instanceof Error ? gatewayError.message : 'Payment gateway error'}`
        );
      }
    } catch (error) {
      console.error('Error requesting withdrawal:', error);
      throw error;
    }
  }

  /**
   * Initiate IoTec disbursement
   */
  private static async initiateIoTecDisbursement(
    amount: number,
    phoneNumber: string,
    externalId: string,
    note: string
  ) {
    const token = await IoTecService.getAccessToken();

    const payload = {
      category: 'MobileMoney',
      currency: 'UGX',
      walletId: IoTecService.WALLET_ID,
      externalId,
      payee: phoneNumber,
      amount,
      payerNote: note,
      payeeNote: 'Verit rent collection withdrawal',
    };

    const response = await fetch('https://pay.iotec.io/api/disbursements/disburse', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Disbursement failed: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Get transaction history with pagination
   */
  static async getTransactionHistory(
    landlordId: string,
    options?: {
      type?: 'deposit' | 'withdrawal' | 'adjustment';
      status?: 'pending' | 'completed' | 'failed';
      limit?: number;
      offset?: number;
    }
  ) {
    try {
      const wallet = await this.getOrCreateWallet(landlordId);

      let query = db
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.walletId, wallet.id));

      // Apply filters
      const conditions = [eq(walletTransactions.walletId, wallet.id)];

      if (options?.type) {
        conditions.push(eq(walletTransactions.type, options.type));
      }

      if (options?.status) {
        conditions.push(eq(walletTransactions.status, options.status));
      }

      const transactions = await db
        .select()
        .from(walletTransactions)
        .where(and(...conditions))
        .orderBy(desc(walletTransactions.createdAt))
        .limit(options?.limit || 50)
        .offset(options?.offset || 0);

      // Get total count for pagination
      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(walletTransactions)
        .where(and(...conditions));

      return {
        transactions: transactions.map((txn) => ({
          id: txn.id,
          type: txn.type,
          amount: parseFloat(txn.amount),
          balanceAfter: parseFloat(txn.balanceAfter),
          status: txn.status,
          description: txn.description,
          createdAt: txn.createdAt,
          paymentId: txn.paymentId,
          destinationType: txn.destinationType,
          gatewayReference: txn.gatewayReference,
        })),
        pagination: {
          total: Number(countResult?.count || 0),
          limit: options?.limit || 50,
          offset: options?.offset || 0,
        },
      };
    } catch (error) {
      console.error('Error getting transaction history:', error);
      throw new Error('Failed to get transaction history');
    }
  }

  /**
   * Update withdrawal status (called by webhook or polling)
   */
  static async updateWithdrawalStatus(
    gatewayReference: string,
    status: 'completed' | 'failed'
  ) {
    try {
      const [transaction] = await db
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.gatewayReference, gatewayReference))
        .limit(1);

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      if (transaction.status !== 'pending') {
        throw new Error('Transaction is not pending');
      }

      await db.transaction(async (tx) => {
        // Update transaction status
        await tx
          .update(walletTransactions)
          .set({
            status,
            updatedAt: new Date(),
          })
          .where(eq(walletTransactions.id, transaction.id));

        // If failed, restore the balance
        if (status === 'failed') {
          const [wallet] = await tx
            .select()
            .from(landlordWallets)
            .where(eq(landlordWallets.id, transaction.walletId))
            .limit(1);

          if (wallet) {
            const restoredBalance =
              parseFloat(wallet.balance) + parseFloat(transaction.amount);
            await tx
              .update(landlordWallets)
              .set({
                balance: restoredBalance.toString(),
                updatedAt: new Date(),
              })
              .where(eq(landlordWallets.id, wallet.id));
          }
        } else if (status === 'completed') {
          // Update total withdrawn
          const [wallet] = await tx
            .select()
            .from(landlordWallets)
            .where(eq(landlordWallets.id, transaction.walletId))
            .limit(1);

          if (wallet) {
            await tx
              .update(landlordWallets)
              .set({
                totalWithdrawn: (
                  parseFloat(wallet.totalWithdrawn) + parseFloat(transaction.amount)
                ).toString(),
                updatedAt: new Date(),
              })
              .where(eq(landlordWallets.id, wallet.id));
          }
        }
      });

      return { success: true, status };
    } catch (error) {
      console.error('Error updating withdrawal status:', error);
      throw error;
    }
  }

  /**
   * Get landlord ID from a payment (resolves lease → unit → property → landlord)
   */
  static async getLandlordIdFromPayment(paymentId: string): Promise<string | null> {
    try {
      const result = await db
        .select({
          landlordId: properties.landlordId,
        })
        .from(payments)
        .innerJoin(leases, eq(payments.leaseId, leases.id))
        .innerJoin(units, eq(leases.unitId, units.id))
        .innerJoin(properties, eq(units.propertyId, properties.id))
        .where(eq(payments.id, paymentId))
        .limit(1);

      return result[0]?.landlordId || null;
    } catch (error) {
      console.error('Error getting landlord ID from payment:', error);
      return null;
    }
  }
}
