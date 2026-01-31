import { Router, Response, Request } from 'express';
import {
  authenticate,
  authorize,
  injectLandlordFilter,
  requireResourceOwnership
} from '../middleware/auth';
import { AuthenticatedRequest, ApiResponse, PaginatedResponse } from '../types';
import { PaymentService, paymentInitiationSchema } from '../services/paymentService';
import { OwnershipService } from '../db/ownership';
import crypto from 'crypto';
import { LeaseService } from '../services/leaseService';
import { PaymentScheduleService } from '../services/paymentScheduleService';
import {
  getPaymentGateway,
  getGatewayByName,
  getConfiguredGateway,
  GatewayError,
  TransactionStatus,
} from '../gateways';
import type { IpnPayload, FailurePayload } from '../gateways/yo';

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

      const enrichedPaginatedPayments = await Promise.all(
        paginatedPayments.map(async row => {
          const schedules = await PaymentScheduleService.getPaymentLinkedSchedules(row.payment.id);

          return {
            ...row,
            appliedSchedules: schedules
          }
        })
      )

      return res.json({
        success: true,
        data: enrichedPaginatedPayments,
        pagination: {
          page: Math.floor(startIndex / (filters.limit || landlordPayments.length)) + 1,
          limit: filters.limit || landlordPayments.length,
          total: landlordPayments.length,
          pages: totalPages,
        },
        message: 'Landlord payments retrieved successfully',
      } as PaginatedResponse<any>);
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
router.get('/landlord/overview', authenticate, authorize('landlord'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const landlordPayments = await OwnershipService.getLandlordPayments(req.user!.id);

    const now = new Date();
    const pendingPayments = landlordPayments.filter(p => p.payment.status === 'pending');
    const completedPayments = landlordPayments.filter(p => p.payment.status === 'completed');
    const failedPayments = landlordPayments.filter(p => p.payment.status === 'failed');

    const totalPendingAmount = pendingPayments.reduce((sum, p) => sum + parseFloat(p.payment.amount), 0);
    const totalCompletedAmount = completedPayments.reduce((sum, p) => sum + parseFloat(p.payment.amount), 0);
    const totalFailedAmount = failedPayments.reduce((sum, p) => sum + parseFloat(p.payment.amount), 0);

    const overview = {
      summary: {
        totalPayments: landlordPayments.length,
        pendingPayments: pendingPayments.length,
        completedPayments: completedPayments.length,
        failedPayments: failedPayments.length,
        totalPendingAmount,
        totalCompletedAmount,
        totalFailedAmount,
        collectionRate: landlordPayments.length > 0
          ? (completedPayments.length / landlordPayments.length) * 100
          : 0,
      },
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
    const validationResult = paymentInitiationSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        message: validationResult.error.errors.map(e => e.message).join(', '),
      });
    }

    const { leaseId, amount, phoneNumber, provider, scheduleId } = validationResult.data;

    // Validate against a specific schedule if scheduleId is provided
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

    // Generate unique external reference for tracking
    const externalReference = `VRT_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // Get the configured gateway and initiate deposit
    const gateway = getPaymentGateway();
    const gatewayName = gateway.getProviderName();

    const depositResult = await gateway.deposit({
      externalReference,
      phoneNumber,
      amount,
      narrative: `Rent payment for lease ${leaseId.substring(0, 8)}`,
    });

    // Create the payment record with gateway info
    const payment = await PaymentService.createPayment({
      leaseId,
      amount,
      transactionId: externalReference,
      paymentMethod: 'mobile_money',
      phoneNumber,
      mobileMoneyProvider: provider,
      gateway: gatewayName,
      gatewayReference: depositResult.gatewayReference,
      gatewayRawResponse: JSON.stringify(depositResult.rawResponse),
    });

    const response = {
      paymentId: payment.id,
      transactionId: externalReference,
      amount,
      status: depositResult.status === 'pending' ? 'pending' : 'processing',
      gateway: gatewayName,
      gatewayReference: depositResult.gatewayReference,
      leaseId,
      scheduleId,
      statusMessage: depositResult.message,
    };

    res.json({
      success: true,
      data: response,
      message: 'Payment initiated successfully. Please complete the transaction on your mobile device.',
    });
  } catch (error) {
    console.error('Error initiating payment:', error);

    const errorMessage = error instanceof GatewayError
      ? `Gateway error: ${error.message}`
      : error instanceof Error
        ? error.message
        : 'Unknown error occurred';

    res.status(500).json({
      success: false,
      error: 'Failed to initiate payment',
      message: errorMessage,
    });
  }
});

// Manual Payment Registration (Landlord Only)
router.post('/register', authenticate, authorize('landlord'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const { leaseId, amount, paidDate, paymentMethod, notes, scheduleId } = req.body;

    // Basic Validation
    if (!leaseId || !amount || !paidDate || !paymentMethod) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: leaseId, amount, paidDate, paymentMethod',
      });
    }

    // Verify ownership (Landlord must own the lease)
    const isOwner = await OwnershipService.isLandlordOwnerOfLease(req.user!.id, leaseId);
    if (!isOwner) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to register payments for this lease',
      });
    }

    const payment = await PaymentService.registerManualPayment({
      leaseId,
      amount: parseFloat(amount),
      paidDate: new Date(paidDate),
      paymentMethod,
      notes,
      scheduleId,
    });

    res.json({
      success: true,
      data: payment,
      message: 'Payment registered successfully',
    });
  } catch (error) {
    console.error('Error registering payment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register payment',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});



// Get payment status (for polling)
router.get('/status/:transactionId', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const { transactionId } = req.params;

    // Find the payment to get gateway info
    const payment = await PaymentService.getPaymentByTransactionId(transactionId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found',
      });
    }

    // Get the gateway used for this payment
    const gatewayName = payment.gateway || 'iotec';
    const gateway = getGatewayByName(gatewayName);

    // Check status using gateway reference if available, otherwise use transaction ID
    const reference = payment.gatewayReference || transactionId;
    const statusResult = await gateway.checkStatus(reference);

    // Map gateway status to payment status
    const mapStatus = (status: TransactionStatus): 'pending' | 'completed' | 'failed' => {
      switch (status) {
        case 'succeeded':
          return 'completed';
        case 'failed':
          return 'failed';
        default:
          return 'pending';
      }
    };

    const paymentStatus = mapStatus(statusResult.status);

    // Update local payment status if changed
    if (payment.status === 'pending' && paymentStatus !== 'pending') {
      await PaymentService.updatePaymentStatus(
        payment.id,
        paymentStatus,
        paymentStatus === 'completed' ? new Date() : undefined
      );

      // Update gateway raw response
      if (statusResult.rawResponse) {
        await PaymentService.updatePaymentGatewayData(payment.id, {
          gatewayRawResponse: JSON.stringify(statusResult.rawResponse),
        });
      }
    }

    res.json({
      success: true,
      data: {
        transactionId,
        gatewayReference: statusResult.gatewayReference,
        status: statusResult.status,
        paymentStatus,
        message: statusResult.message,
        amount: statusResult.amount,
        mnoReference: statusResult.mnoReference,
        gateway: gatewayName,
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

// IoTec webhook for payment completion
router.post('/webhook', async (req: Request, res: Response<ApiResponse>) => {
  try {
    console.log('[Webhook] IoTec payload received:', JSON.stringify(req.body));

    const { transactionId, status, vendorTransactionId } = req.body;

    if (!transactionId || !status) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
      });
    }

    // Verify webhook using IoTec gateway
    const gateway = getGatewayByName('iotec');
    if (!gateway.verifyWebhook(req.body)) {
      console.warn('[Webhook] IoTec signature verification failed');
      // Still return 200 to prevent retries
      return res.json({
        success: false,
        message: 'Signature verification failed',
      });
    }

    // Find payment by transaction ID (our external reference)
    const payment = await PaymentService.getPaymentByTransactionId(transactionId);

    if (payment && payment.status === 'pending') {
      const paymentStatus = status === 'Success' ? 'completed' : 'failed';
      await PaymentService.updatePaymentStatus(
        payment.id,
        paymentStatus,
        status === 'Success' ? new Date() : undefined
      );

      // Store vendor reference
      if (vendorTransactionId) {
        await PaymentService.updatePaymentGatewayData(payment.id, {
          gatewayRawResponse: JSON.stringify(req.body),
        });
      }

      console.log(`[Webhook] IoTec payment ${payment.id} updated to ${paymentStatus}`);
    }

    res.json({
      success: true,
      message: 'Webhook processed successfully',
    });
  } catch (error) {
    console.error('[Webhook] Error processing IoTec webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process webhook',
    });
  }
});

// Yo! IPN (Instant Payment Notification) webhook for successful payments
router.post('/yo/ipn', async (req: Request, res: Response) => {
  try {
    console.log('[Webhook] Yo! IPN payload received:', JSON.stringify(req.body));

    const payload = req.body as IpnPayload;

    // Verify signature using Yo! gateway
    const gateway = getGatewayByName('yo');
    if (!gateway.verifyWebhook(payload)) {
      console.warn('[Webhook] Yo! IPN signature verification failed');
      // Return 200 to prevent retries, but log the issue
      return res.status(200).send('OK');
    }

    // Find payment by external reference
    const payment = await PaymentService.getPaymentByTransactionId(payload.external_ref);

    if (!payment) {
      console.warn(`[Webhook] Yo! IPN: Payment not found for external_ref: ${payload.external_ref}`);
      return res.status(200).send('OK');
    }

    if (payment.status === 'pending') {
      // Update payment status to completed
      await PaymentService.updatePaymentStatus(
        payment.id,
        'completed',
        new Date(payload.date_time || Date.now())
      );

      // Store the IPN data
      await PaymentService.updatePaymentGatewayData(payment.id, {
        gatewayRawResponse: JSON.stringify(payload),
      });

      console.log(`[Webhook] Yo! IPN: Payment ${payment.id} completed. MNO ref: ${payload.network_ref}`);
    } else {
      console.log(`[Webhook] Yo! IPN: Payment ${payment.id} already in status: ${payment.status}`);
    }

    // Respond with optional SMS narrative
    res.status(200).send('Thank you for your payment');
  } catch (error) {
    console.error('[Webhook] Error processing Yo! IPN:', error);
    // Return 200 even on error to prevent infinite retries
    res.status(200).send('Error');
  }
});

// Yo! failure webhook for failed payments
router.post('/yo/failure', async (req: Request, res: Response) => {
  try {
    console.log('[Webhook] Yo! failure payload received:', JSON.stringify(req.body));

    const payload = req.body as FailurePayload;

    // Verify signature using Yo! gateway
    const gateway = getGatewayByName('yo');
    if (!gateway.verifyWebhook(payload)) {
      console.warn('[Webhook] Yo! failure signature verification failed');
      return res.status(200).send('OK');
    }

    // Find payment by external reference
    const payment = await PaymentService.getPaymentByTransactionId(payload.failed_transaction_reference);

    if (!payment) {
      console.warn(`[Webhook] Yo! failure: Payment not found for ref: ${payload.failed_transaction_reference}`);
      return res.status(200).send('OK');
    }

    if (payment.status === 'pending') {
      // Update payment status to failed
      await PaymentService.updatePaymentStatus(payment.id, 'failed');

      // Store the failure data
      await PaymentService.updatePaymentGatewayData(payment.id, {
        gatewayRawResponse: JSON.stringify(payload),
      });

      console.log(`[Webhook] Yo! failure: Payment ${payment.id} marked as failed`);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('[Webhook] Error processing Yo! failure webhook:', error);
    res.status(200).send('Error');
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
      receiptNumber: `VRT-${payment.payment.id.substring(0, 8).toUpperCase()}`,
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
        name: 'Verit',
        address: 'Kampala, Uganda',
        email: 'receipts@verit.com',
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