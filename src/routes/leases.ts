import { Router, Response } from 'express';
import {
  authenticate,
  authorize,
  injectLandlordFilter,
  requireResourceOwnership
} from '../middleware/auth';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { leaseCreationSchema, leaseRenewalSchema, LeaseService, leaseUpdateSchema } from '../services/leaseService';
import { validateBody } from '../middleware/validation';
import { z } from 'zod';
import { PaymentService } from '../services/paymentService';
import { updateLease } from '../controllers/leases';

const router = Router();

// Validation schemas
const createLeaseSchemaUpdated = leaseCreationSchema;

const assignLeaseSchema = z.object({
  tenantId: z.string().uuid(),
  unitId: z.string().uuid(),
  startDate: z.string().refine((val) => {
    const date = new Date(val);
    return !isNaN(date.getTime()) && val.length >= 10;
  }, { message: "Invalid start date format" }),
  endDate: z.string().refine((val) => {
    const date = new Date(val);
    return !isNaN(date.getTime()) && val.length >= 10;
  }, { message: "Invalid end date format" }),
  monthlyRent: z.number().positive(),
  deposit: z.number().min(0),
  terms: z.string().optional(),
}).refine((data) => {
  const startDate = new Date(data.startDate);
  const endDate = new Date(data.endDate);
  return endDate > startDate;
}, {
  message: 'End date must be after start date',
  path: ['endDate'],
});

const updateLeaseSchemaUpdated = leaseUpdateSchema;

// Get all leases (filtered by role)
router.get('/', authenticate, injectLandlordFilter(), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const { status, propertyId, unitId } = req.query;

    if (req.user!.role === 'tenant') {
      // Tenants can only see their own leases
      const tenantLeases = await LeaseService.getTenantLease(req.user!.id);
      return res.json({
        success: true,
        data: tenantLeases,
        message: 'Tenant leases retrieved successfully',
      });
    }

    // Landlord logic
    const filters = {
      status: status as string,
      propertyId: propertyId as string,
      unitId: unitId as string,
    };

    const leases = await LeaseService.getLandlordLeases(req.user!.id, filters);

    res.json({
      success: true,
      data: leases,
      message: 'Leases retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching leases:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch leases',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Assign lease to existing tenant (landlord workflow)
router.post('/assign', authenticate, authorize('landlord'), validateBody(assignLeaseSchema), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const lease = await LeaseService.assignLeaseToTenant(req.user!.id, req.body);

    res.status(201).json({
      success: true,
      data: lease,
      message: 'Lease assigned successfully',
    });
  } catch (error) {
    console.error('Error assigning lease:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to assign lease',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get lease analytics (landlords only)
router.get('/analytics', authenticate, authorize('landlord'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const analytics = await LeaseService.getLeaseAnalytics(req.user!.id);

    res.json({
      success: true,
      data: analytics,
      message: 'Lease analytics retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching lease analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch lease analytics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Activate a lease
router.post('/:id/activate', authenticate, requireResourceOwnership('lease', 'id', 'write'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const lease = await LeaseService.activateLease(req.user!.id, req.params.id);

    res.json({
      success: true,
      data: lease,
      message: 'Lease activated successfully',
    });
  } catch (error) {
    console.error('Error activating lease:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to activate lease',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/:id/renew', authenticate, requireResourceOwnership('lease', 'id', 'write'), validateBody(leaseRenewalSchema), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
      const renewedLease = await LeaseService.renewLease(req.user!.id, req.params.id, req.body);
      res.json({
          success: true,
          data: renewedLease,
          message: 'Lease renewed successfully',
      });
  } catch (error) {
      console.error('Error renewing lease:', error);
      res.status(400).json({
          success: false,
          error: 'Failed to renew lease',
          message: error instanceof Error ? error.message : 'Unknown error',
      });
  }
});

router.get('/:id/payment-schedule', authenticate, requireResourceOwnership('lease', 'id', 'read'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
      const schedule = await LeaseService.getLeaseWithSchedule(req.user!.id, req.params.id);
      res.json({
          success: true,
          data: schedule.paymentSchedule,
          message: 'Payment schedule retrieved successfully',
      });
  } catch (error) {
      console.error('Error fetching payment schedule:', error);
      res.status(500).json({
          success: false,
          error: 'Failed to fetch payment schedule',
      });
  }
});

router.get('/:id/balance', authenticate, requireResourceOwnership('lease', 'id', 'read'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
      const balance = await PaymentService.calculateBalance(req.params.id);
      res.json({
          success: true,
          data: balance,
          message: 'Lease balance retrieved successfully',
      });
  } catch (error) {
      console.error('Error fetching lease balance:', error);
      res.status(500).json({
          success: false,
          error: 'Failed to fetch lease balance',
      });
  }
});

// Terminate a lease
router.post('/:id/terminate', authenticate, requireResourceOwnership('lease', 'id', 'write'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const lease = await LeaseService.terminateLease(req.user!.id, req.params.id);

    res.json({
      success: true,
      data: lease,
      message: 'Lease terminated successfully',
    });
  } catch (error) {
    console.error('Error terminating lease:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to terminate lease',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get lease by ID
router.get('/:id', authenticate, requireResourceOwnership('lease', 'id', 'read'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    let lease;

    if (req.user!.role === 'tenant') {
      lease = await LeaseService.getTenantLease(req.user!.id, req.params.id);
    } else {
      lease = await LeaseService.getLeaseDetails(req.user!.id, req.params.id);
    }

    if (!lease) {
      return res.status(404).json({
        success: false,
        error: 'Lease not found or not accessible',
      });
    }

    res.json({
      success: true,
      data: lease,
      message: 'Lease retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching lease:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch lease',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Create lease
router.post('/', authenticate, authorize('landlord'), validateBody(createLeaseSchemaUpdated), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const lease = await LeaseService.createLease(req.user!.id, req.body);

    res.status(201).json({
      success: true,
      data: lease,
      message: 'Lease created successfully',
    });
  } catch (error) {
    console.error('Error creating lease:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to create lease',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Update lease (with ownership validation)
router.put('/:id', authenticate, requireResourceOwnership('lease', 'id', 'write'), validateBody(updateLeaseSchemaUpdated), updateLease);

// Delete lease (placeholder - not implemented for safety)
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  res.status(501).json({
    success: false,
    message: 'Lease deletion not implemented for data safety',
  });
});

export default router;