import { Router, Response } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { PaymentService, paymentInitiationSchema } from '../services/paymentService';
import { IoTecService } from '../services/iotecService';
import crypto from 'crypto';
import { z } from 'zod';

const router = Router();

// Get all payments (landlord/admin can see all, tenants see their own)
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const { status, limit, offset } = req.query;
    const user = req.user!;

    const filters: any = {
      status: status as any,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    };

    // If user is tenant, they only see their own payments
    if (user.role === 'tenant') {
      // TODO: Add tenant filtering when we implement lease-tenant relationships
    }

    const payments = await PaymentService.getAllPayments(filters);

    res.json({
      success: true,
      data: payments,
      message: 'Payments retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payments',
    });
  }
});

// Get payment balance for a specific lease
router.get('/lease/:leaseId/balance', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const { leaseId } = req.params;

    const balance = await PaymentService.calculateBalance(leaseId);
    
    if (!balance) {
      return res.status(404).json({
        success: false,
        error: 'Lease not found',
      });
    }

    res.json({
      success: true,
      data: balance,
      message: 'Payment balance calculated successfully',
    });
  } catch (error) {
    console.error('Error calculating balance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate payment balance',
    });
  }
});

// Get payment history for a specific lease
router.get('/lease/:leaseId/history', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const { leaseId } = req.params;

    const history = await PaymentService.getPaymentHistory(leaseId);

    res.json({
      success: true,
      data: history,
      message: 'Payment history retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment history',
    });
  }
});

// Get payment by ID
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const { id } = req.params;

    const payment = await PaymentService.getPaymentById(id);

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found',
      });
    }

    res.json({
      success: true,
      data: payment,
      message: 'Payment retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment',
    });
  }
});

// Initiate payment (mobile money collection)
router.post('/initiate', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    // Validate request body
    const validationResult = paymentInitiationSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        message: validationResult.error.errors.map(e => e.message).join(', '),
      });
    }

    const { leaseId, amount, phoneNumber } = validationResult.data;

    // Validate payment amount against lease balance
    const validation = await PaymentService.validatePayment(leaseId, amount);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment amount',
        message: validation.errors.join(', '),
        data: { suggestedAmount: validation.suggestedAmount },
      });
    }

    // Generate external ID for tracking
    const externalId = `NDI_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    
    // Initiate IoTec collection first
    const iotecRequest = {
      category: 'MobileMoney' as const,
      currency: 'UGX' as const,
      walletId: process.env.IOTEC_WALLET_ID || '5e83b187-801e-410e-b76e-f491928547e0',
      externalId,
      payer: phoneNumber || '256700000000', // Default if not provided
      amount,
      payerNote: `Rent payment for lease ${leaseId}`,
      payeeNote: `NDI Landlord - Lease ${leaseId}`,
      transactionChargesCategory: 'ChargeWallet' as const,
    };

    const iotecResponse = await IoTecService.initiateCollection(iotecRequest);

    // Create payment record in database with IoTec transaction ID
    const payment = await PaymentService.createPayment({
      leaseId,
      amount,
      transactionId: iotecResponse.id, // Use IoTec transaction ID
      paymentMethod: 'mobile_money',
    });

    const response = {
      paymentId: payment.id,
      transactionId: iotecResponse.id,
      amount,
      status: 'pending',
      estimatedCompletion: new Date(Date.now() + 60000).toISOString(), // 1 minute from now
      iotecReference: iotecResponse.id,
      leaseId,
      statusMessage: iotecResponse.statusMessage,
    };

    res.json({
      success: true,
      data: response,
      message: 'Payment initiated successfully. Please complete the transaction on your mobile device.',
    });
  } catch (error) {
    console.error('Error initiating payment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate payment',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

// Get payment status (for polling)
router.get('/status/:transactionId', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const { transactionId } = req.params;

    // Get status from IoTec
    const iotecStatus = await IoTecService.getTransactionStatus(transactionId);

    if (!iotecStatus) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found',
      });
    }

    // Update local payment status if changed
    if (iotecStatus.status === 'Success') {
      // Find payment by transaction ID and update
      const payments = await PaymentService.getAllPayments({});
      const payment = payments.find(p => p.payment.transactionId === transactionId);
      
      if (payment && payment.payment.status === 'pending') {
        await PaymentService.updatePaymentStatus(
          payment.payment.id,
          'completed',
          new Date()
        );
      }
    } else if (iotecStatus.status === 'Failed') {
      // Update payment to failed status
      const payments = await PaymentService.getAllPayments({});
      const payment = payments.find(p => p.payment.transactionId === transactionId);
      
      if (payment && payment.payment.status === 'pending') {
        await PaymentService.updatePaymentStatus(payment.payment.id, 'failed');
      }
    }

    res.json({
      success: true,
      data: {
        transactionId: iotecStatus.id,
        status: iotecStatus.status,
        statusMessage: iotecStatus.statusMessage,
        amount: iotecStatus.amount,
        processedAt: iotecStatus.processedAt,
        vendorTransactionId: iotecStatus.vendorTransactionId,
      },
      message: 'Transaction status retrieved successfully',
    });
  } catch (error) {
    console.error('Error getting payment status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get payment status',
    });
  }
});

// Mock webhook for payment completion (in production, this would be secured)
router.post('/webhook', async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const { transactionId, status, vendorTransactionId } = req.body;

    if (!transactionId || !status) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
      });
    }

    // Find and update payment
    const payments = await PaymentService.getAllPayments({});
    const payment = payments.find(p => p.payment.transactionId === transactionId);

    if (payment) {
      const paymentStatus = status === 'Success' ? 'completed' : 'failed';
      await PaymentService.updatePaymentStatus(
        payment.payment.id,
        paymentStatus,
        status === 'Success' ? new Date() : undefined
      );
    }

    res.json({
      success: true,
      message: 'Webhook processed successfully',
    });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process webhook',
    });
  }
});

// Generate payment receipt
router.get('/:id/receipt', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const { id } = req.params;

    const payment = await PaymentService.getPaymentById(id);

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found',
      });
    }

    if (payment.payment.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Receipt only available for completed payments',
      });
    }

    // Generate receipt data
    const receipt = {
      receiptNumber: `NDI-${payment.payment.id.substring(0, 8).toUpperCase()}`,
      paymentId: payment.payment.id,
      transactionId: payment.payment.transactionId,
      amount: parseFloat(payment.payment.amount),
      currency: 'UGX',
      paymentMethod: payment.payment.paymentMethod,
      paidDate: payment.payment.paidDate,
      tenant: payment.tenant ? {
        name: `${payment.tenant.firstName} ${payment.tenant.lastName}`,
        email: payment.tenant.email,
        phone: payment.tenant.phone,
      } : null,
      lease: payment.lease ? {
        id: payment.lease.id,
        monthlyRent: parseFloat(payment.lease.monthlyRent),
        startDate: payment.lease.startDate,
        endDate: payment.lease.endDate,
      } : null,
      generatedAt: new Date().toISOString(),
      companyInfo: {
        name: 'NDI Landlord',
        address: 'Kampala, Uganda',
        email: 'receipts@ndilandlord.com',
        phone: '+256 700 000 000',
      },
    };

    res.json({
      success: true,
      data: receipt,
      message: 'Receipt generated successfully',
    });
  } catch (error) {
    console.error('Error generating receipt:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate receipt',
    });
  }
});

// Update payment status (landlord/admin only)
router.put('/:id', authenticate, authorize('landlord', 'admin'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'completed', 'failed', 'refunded'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status value',
      });
    }

    const updatedPayment = await PaymentService.updatePaymentStatus(
      id,
      status,
      status === 'completed' ? new Date() : undefined
    );

    if (!updatedPayment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found',
      });
    }

    res.json({
      success: true,
      data: updatedPayment,
      message: 'Payment status updated successfully',
    });
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update payment',
    });
  }
});

export default router;