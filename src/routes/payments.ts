import { Router, Response } from 'express';
import {
  authenticate,
  authorize,
  requireLandlordContext,
  injectLandlordFilter,
  requireResourceOwnership
} from '../middleware/auth';
import { AuthenticatedRequest, ApiResponse, PaginatedResponse } from '../types';
import { PaymentService, paymentInitiationSchema } from '../services/paymentService';
import { IoTecService } from '../services/iotecService';
import { OwnershipService } from '../db/ownership';
import crypto from 'crypto';
import { LeaseService } from '../services/leaseService';
import { PaymentScheduleService } from '../services/paymentScheduleService';

const router = Router();

// Get all payments (filtered by ownership)
// @ts-ignore - Route handler with proper returns but TypeScript can't infer all paths
router.get('/', authenticate, injectLandlordFilter(), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const { status, limit, offset, propertyId, leaseId } = req.query;
    const user = req.user!;

    const filters: any = {
      status: status as any,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    };

    // Handle role-based payment filtering
    if (user.role === 'tenant') {
      // Tenants can only see their own payments
      const tenantPayments = await OwnershipService.getTenantPayments(user.id);

      return res.json({
        success: true,
        data: tenantPayments,
        message: 'Tenant payments retrieved successfully',
      });
    }

    if (user.role === 'landlord') {
      // Landlords can only see payments from their properties
      let landlordPayments = await OwnershipService.getLandlordPayments(user.id);

      // Apply additional filters if provided
      if (propertyId) {
        landlordPayments = landlordPayments.filter(p => p.property.id === propertyId);
      }

      if (leaseId) {
        landlordPayments = landlordPayments.filter(p => p.lease.id === leaseId);
      }

      if (status) {
        landlordPayments = landlordPayments.filter(p => p.payment.status === status);
      }

      // Apply pagination
      const startIndex = filters.offset || 0;
      const endIndex = filters.limit ? startIndex + filters.limit : landlordPayments.length;
      const paginatedPayments = landlordPayments.slice(startIndex, endIndex);

      const totalPages = Math.ceil(landlordPayments.length / (filters.limit || landlordPayments.length));

      return res.json({
        success: true,
        data: paginatedPayments,
        pagination: {
          page: Math.floor(startIndex / (filters.limit || landlordPayments.length)) + 1,
          limit: filters.limit || landlordPayments.length,
          total: landlordPayments.length,
          pages: totalPages,
        },
        message: 'Landlord payments retrieved successfully',
      } as PaginatedResponse<any>);
    }

    if (user.role === 'admin') {
      // Admins can see all payments
      const payments = await PaymentService.getAllPayments(filters);

      return res.json({
        success: true,
        data: payments,
        message: 'All payments retrieved successfully',
      });
    }

    res.status(403).json({
      success: false,
      error: 'Invalid user role',
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payments',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get landlord payment overview (overdue, pending, etc.)
router.get('/landlord/overview', authenticate, requireLandlordContext(), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const landlordPayments = await OwnershipService.getLandlordPayments(req.user!.id);

    const now = new Date();
    const pendingPayments = landlordPayments.filter(p => p.payment.status === 'pending');
    const completedPayments = landlordPayments.filter(p => p.payment.status === 'completed');
    const overduePayments = landlordPayments.filter(p =>
      p.payment.status === 'pending' && new Date(p.payment.dueDate) < now
    );

    const totalPendingAmount = pendingPayments.reduce((sum, p) => sum + parseFloat(p.payment.amount), 0);
    const totalCompletedAmount = completedPayments.reduce((sum, p) => sum + parseFloat(p.payment.amount), 0);
    const totalOverdueAmount = overduePayments.reduce((sum, p) => sum + parseFloat(p.payment.amount), 0);

    const overview = {
      summary: {
        totalPayments: landlordPayments.length,
        pendingPayments: pendingPayments.length,
        completedPayments: completedPayments.length,
        overduePayments: overduePayments.length,
        totalPendingAmount,
        totalCompletedAmount,
        totalOverdueAmount,
        collectionRate: landlordPayments.length > 0
          ? (completedPayments.length / landlordPayments.length) * 100
          : 0,
      },
      overdueDetails: overduePayments.map(p => ({
        paymentId: p.payment.id,
        tenantName: `${p.tenant.firstName} ${p.tenant.lastName}`,
        propertyName: p.property.name,
        unitNumber: p.unit.unitNumber,
        amount: parseFloat(p.payment.amount),
        dueDate: p.payment.dueDate,
        daysPastDue: Math.ceil((now.getTime() - new Date(p.payment.dueDate).getTime()) / (1000 * 60 * 60 * 24)),
      })),
      recentPayments: completedPayments
        .sort((a, b) => new Date(b.payment.paidDate || b.payment.createdAt).getTime() - new Date(a.payment.paidDate || a.payment.createdAt).getTime())
        .slice(0, 10)
        .map(p => ({
          paymentId: p.payment.id,
          tenantName: `${p.tenant.firstName} ${p.tenant.lastName}`,
          amount: parseFloat(p.payment.amount),
          paidDate: p.payment.paidDate,
          propertyName: p.property.name,
        })),
    };

    res.json({
      success: true,
      data: overview,
      message: 'Payment overview retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching payment overview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment overview',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get payment balance for a specific lease (with ownership validation)
router.get('/lease/:leaseId/balance', authenticate, requireResourceOwnership('lease', 'leaseId', 'read'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
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
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get payment history for a specific lease (with ownership validation)
router.get('/lease/:leaseId/history', authenticate, requireResourceOwnership('lease', 'leaseId', 'read'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
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

// Get payment analytics (with ownership filtering)
router.get('/analytics', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const { startDate, endDate, propertyId } = req.query;
    const user = req.user!;

    let payments: any[] = [];

    // Get payments based on user role with proper ownership filtering
    if (user.role === 'tenant') {
      // Tenants can only see analytics for their own payments
      payments = await OwnershipService.getTenantPayments(user.id);
    } else if (user.role === 'landlord') {
      // Landlords can only see analytics for their properties
      payments = await OwnershipService.getLandlordPayments(user.id);

      // Filter by property if specified
      if (propertyId) {
        payments = payments.filter(p => p.property.id === propertyId);
      }
    } else if (user.role === 'admin') {
      // Admins can see all payments
      payments = await PaymentService.getAllPayments({});
    } else {
      return res.status(403).json({
        success: false,
        error: 'Invalid user role for analytics',
      });
    }

    // Filter by date range if provided
    let filteredPayments = payments;
    if (startDate && endDate) {
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);
      filteredPayments = payments.filter(p => {
        const paymentDate = new Date(p.payment.createdAt);
        return paymentDate >= start && paymentDate <= end;
      });
    }

    // Calculate analytics
    const totalPayments = filteredPayments.length;
    const totalAmount = filteredPayments.reduce((sum, p) => sum + parseFloat(p.payment.amount), 0);

    // Calculate average payment processing time (for completed payments)
    const completedPayments = filteredPayments.filter(p => p.payment.status === 'completed' && p.payment.paidDate);
    const averagePaymentTime = completedPayments.length > 0
      ? completedPayments.reduce((sum, p) => {
        const created = new Date(p.payment.createdAt).getTime();
        const paid = new Date(p.payment.paidDate!).getTime();
        return sum + (paid - created);
      }, 0) / completedPayments.length / (1000 * 60) // Convert to minutes
      : 0;

    // Group by status
    const paymentsByStatus = Object.entries(
      filteredPayments.reduce((acc, p) => {
        const status = p.payment.status;
        if (!acc[status]) {
          acc[status] = { count: 0, amount: 0 };
        }
        acc[status].count += 1;
        acc[status].amount += parseFloat(p.payment.amount);
        return acc;
      }, {} as Record<string, { count: number; amount: number }>)
    ).map(([status, data]) => ({
      status,
      count: (data as { count: number; amount: number }).count,
      amount: (data as { count: number; amount: number }).amount,
    }));

    // Group by mobile money provider
    const paymentsByProvider = Object.entries(
      filteredPayments
        .filter(p => p.payment.mobileMoneyProvider)
        .reduce((acc, p) => {
          const provider = p.payment.mobileMoneyProvider!;
          if (!acc[provider]) {
            acc[provider] = { count: 0, amount: 0 };
          }
          acc[provider].count += 1;
          acc[provider].amount += parseFloat(p.payment.amount);
          return acc;
        }, {} as Record<string, { count: number; amount: number }>)
    ).map(([provider, data]) => ({
      provider,
      count: (data as { count: number; amount: number }).count,
      amount: (data as { count: number; amount: number }).amount,
    }));

    // Monthly trends (last 12 months)
    const now = new Date();
    const monthlyTrends = [];
    for (let i = 11; i >= 0; i--) {
      const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
      const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);

      const monthPayments = filteredPayments.filter(p => {
        const paymentDate = new Date(p.payment.createdAt);
        return paymentDate >= monthStart && paymentDate <= monthEnd;
      });

      monthlyTrends.push({
        month: month.toISOString().substring(0, 7), // YYYY-MM format
        totalPayments: monthPayments.length,
        totalAmount: monthPayments.reduce((sum, p) => sum + parseFloat(p.payment.amount), 0),
      });
    }

    const analytics = {
      totalPayments,
      totalAmount,
      averagePaymentTime,
      paymentsByStatus,
      paymentsByProvider,
      monthlyTrends,
    };

    res.json({
      success: true,
      data: analytics,
      message: 'Payment analytics retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching payment analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment analytics',
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
    // UPDATED: The validation schema now includes an optional scheduleId
    const validationResult = paymentInitiationSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        message: validationResult.error.errors.map(e => e.message).join(', '),
      });
    }

    const { leaseId, amount, phoneNumber, provider, scheduleId } = validationResult.data;

    // UPDATED: Validate against a specific schedule if scheduleId is provided
    let validation;
    if (scheduleId) {
      validation = await PaymentService.validatePaymentWithSchedule(leaseId, scheduleId, amount);
    } else {
      validation = await PaymentService.validatePayment(leaseId, amount);
    }

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment amount',
        message: validation.errors.join(', '),
        data: { suggestedAmount: validation.suggestedAmount },
      });
    }

    const externalId = `NDI_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const iotecRequest = {
      category: 'MobileMoney' as const,
      currency: 'UGX' as const,
      walletId: process.env.IOTEC_WALLET_ID || '5e83b187-801e-410e-b76e-f491928547e0',
      externalId,
      payer: phoneNumber,
      amount,
      payerNote: `Rent payment for lease ${leaseId}`,
      payeeNote: `NDI Landlord - Lease ${leaseId}`,
      transactionChargesCategory: 'ChargeWallet' as const,
    };

    const iotecResponse = await IoTecService.initiateCollection(iotecRequest);

    // UPDATED: Pass the scheduleId when creating the payment record
    const payment = await PaymentService.createPayment({
      leaseId,
      amount,
      transactionId: iotecResponse.id,
      paymentMethod: 'mobile_money',
      phoneNumber: phoneNumber,
      mobileMoneyProvider: provider,
      scheduleId,
    });

    const response = {
      paymentId: payment.id,
      transactionId: iotecResponse.id,
      amount,
      status: 'pending',
      estimatedCompletion: new Date(Date.now() + 60000).toISOString(),
      iotecReference: iotecResponse.id,
      leaseId,
      scheduleId,
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

router.get('/upcoming', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const user = req.user!;
    let upcomingPayments: any[] = []; // todo: fix type

    if (user.role === 'tenant') {
      // Get tenant's active lease
      const tenantLeases = await LeaseService.getTenantLease(user.id);
      if (Array.isArray(tenantLeases) && tenantLeases.length > 0) {
        const activeLease = tenantLeases.find(l => l.lease.status === 'active');
        if (activeLease) {
          upcomingPayments = await PaymentService.getUpcomingPayments(activeLease.lease.id);
        }
      }
    } else if (user.role === 'landlord') {
      // For landlords, they need to specify a lease
      const { leaseId } = req.query;
      if (leaseId) {
        // Verify ownership
        const ownsLease = await OwnershipService.isLandlordOwnerOfLease(user.id, leaseId as string);
        if (ownsLease) {
          upcomingPayments = await PaymentService.getUpcomingPayments(leaseId as string);
        }
      }
    }

    res.json({
      success: true,
      data: upcomingPayments,
      message: 'Upcoming payments retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching upcoming payments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch upcoming payments',
    });
  }
});

// Add new endpoint for overdue payments
router.get('/overdue', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const user = req.user!;
    let overduePayments: any[] = []; // todo: fix type

    if (user.role === 'tenant') {
      // Get tenant's active lease
      const tenantLeases = await LeaseService.getTenantLease(user.id);
      if (Array.isArray(tenantLeases) && tenantLeases.length > 0) {
        const activeLease = tenantLeases.find(l => l.lease.status === 'active');
        if (activeLease) {
          overduePayments = await PaymentScheduleService.getOverduePayments(activeLease.lease.id);
        }
      }
    } else if (user.role === 'landlord' || user.role === 'admin') {
      // Get all overdue payments for landlord's properties
      const landlordLeases = await LeaseService.getLandlordLeases(user.id);
      
      for (const lease of landlordLeases) {
        if (lease.lease.status === 'active') {
          const leaseOverdue = await PaymentScheduleService.getOverduePayments(lease.lease.id);
          overduePayments.push(...leaseOverdue.map(p => ({
            ...p,
            leaseId: lease.lease.id,
            tenantName: `${lease.tenant.firstName} ${lease.tenant.lastName}`,
            unitNumber: lease.unit.unitNumber,
            propertyName: lease.property.name,
          })));
        }
      }
    }

    res.json({
      success: true,
      data: overduePayments,
      message: 'Overdue payments retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching overdue payments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch overdue payments',
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