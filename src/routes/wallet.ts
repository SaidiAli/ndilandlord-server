import { Router, Response } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { AuthenticatedRequest, ApiResponse, PaginatedResponse } from '../types';
import { WalletService, withdrawalRequestSchema } from '../services/walletService';
import { validateBody } from '../middleware/validation';
import { z } from 'zod';

const router = Router();

/**
 * GET /api/wallet
 * Get wallet summary for authenticated landlord
 */
router.get('/', authenticate, authorize('landlord'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const landlordId = req.user!.id;
    const summary = await WalletService.getWalletSummary(landlordId);

    res.json({
      success: true,
      data: summary,
      message: 'Wallet summary retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching wallet summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch wallet summary',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/wallet/balance
 * Get wallet balance only (lightweight endpoint)
 */
router.get('/balance', authenticate, authorize('landlord'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const landlordId = req.user!.id;
    const balance = await WalletService.getWalletBalance(landlordId);

    res.json({
      success: true,
      data: { balance },
      message: 'Wallet balance retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching wallet balance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch wallet balance',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Transaction history query schema
const transactionHistorySchema = z.object({
  type: z.enum(['deposit', 'withdrawal', 'adjustment']).optional(),
  status: z.enum(['pending', 'completed', 'failed']).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

/**
 * GET /api/wallet/transactions
 * Get paginated transaction history
 */
router.get('/transactions', authenticate, authorize('landlord'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const landlordId = req.user!.id;

    // Validate query params
    const validation = transactionHistorySchema.safeParse(req.query);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        message: validation.error.errors.map(e => e.message).join(', '),
      });
    }

    const { type, status, limit, offset } = validation.data;

    const result = await WalletService.getTransactionHistory(landlordId, {
      type,
      status,
      limit,
      offset,
    });

    const response: PaginatedResponse<typeof result.transactions[0]> = {
      success: true,
      data: result.transactions,
      pagination: {
        page: Math.floor(result.pagination.offset / result.pagination.limit) + 1,
        limit: result.pagination.limit,
        total: result.pagination.total,
        pages: Math.ceil(result.pagination.total / result.pagination.limit),
      },
      message: 'Transaction history retrieved successfully',
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching transaction history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch transaction history',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/wallet/withdraw
 * Request a withdrawal to mobile money or bank account
 */
router.post('/withdraw', authenticate, authorize('landlord'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const landlordId = req.user!.id;

    // Validate request body
    const validation = withdrawalRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid withdrawal request',
        message: validation.error.errors.map(e => e.message).join(', '),
      });
    }

    const result = await WalletService.requestWithdrawal(landlordId, validation.data);

    res.status(201).json({
      success: true,
      data: result,
      message: result.message,
    });
  } catch (error) {
    console.error('Error processing withdrawal:', error);

    // Check for insufficient balance error
    if (error instanceof Error && error.message.includes('Insufficient balance')) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient balance',
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to process withdrawal',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/wallet/webhook/iotec
 * Handle IoTec disbursement webhook (callback)
 * This endpoint should be called by IoTec when a disbursement status changes
 */
router.post('/webhook/iotec', async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    // TODO: Add webhook signature verification for security
    const { id, status, externalId } = req.body;

    if (!id || !status) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'id and status are required',
      });
    }

    // Map IoTec status to our status
    let mappedStatus: 'completed' | 'failed';
    if (status === 'Success' || status === 'Completed') {
      mappedStatus = 'completed';
    } else if (status === 'Failed' || status === 'Rejected') {
      mappedStatus = 'failed';
    } else {
      // Still pending, acknowledge but don't update
      return res.json({
        success: true,
        message: 'Webhook received, status still pending',
      });
    }

    await WalletService.updateWithdrawalStatus(id, mappedStatus);

    res.json({
      success: true,
      message: 'Withdrawal status updated',
    });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process webhook',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
