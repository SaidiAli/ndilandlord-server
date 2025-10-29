import { Router, Response } from 'express';
import { 
  authenticate
} from '../middleware/auth';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { TenantService } from '../services/tenantService';
import { PaymentService } from '../services/paymentService';

const router = Router();

/**
 * Tenant-specific routes for mobile app
 * All routes require authentication and tenant role verification
 */

// Middleware to ensure user is a tenant with active lease
const requireActiveTenant = async (
  req: AuthenticatedRequest, 
  res: Response<ApiResponse>, 
  next: Function
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    // Check if user is a tenant
    if (req.user.role !== 'tenant') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Tenant role required.',
      });
    }

    // Verify tenant has active lease
    const hasAccess = await TenantService.verifyTenantAccess(req.user.id);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'No active lease found. Please contact your landlord.',
      });
    }

    next();
  } catch (error) {
    console.error('Error in requireActiveTenant middleware:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify tenant access',
    });
  }
};

// Get tenant dashboard data
router.get('/dashboard', authenticate, requireActiveTenant, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const dashboardData = await TenantService.getTenantDashboard(req.user!.id);

    if (!dashboardData) {
      return res.status(404).json({
        success: false,
        error: 'Tenant data not found',
      });
    }

    res.json({
      success: true,
      data: dashboardData,
      message: 'Tenant dashboard data retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching tenant dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tenant dashboard',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get tenant lease information
router.get('/lease', authenticate, requireActiveTenant, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const leaseInfo = await TenantService.getTenantLeaseInfo(req.user!.id);

    if (!leaseInfo) {
      return res.status(404).json({
        success: false,
        error: 'Lease information not found',
      });
    }

    res.json({
      success: true,
      data: leaseInfo,
      message: 'Tenant lease information retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching tenant lease info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tenant lease information',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get tenant property information
router.get('/property', authenticate, requireActiveTenant, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const propertyInfo = await TenantService.getTenantPropertyInfo(req.user!.id);

    if (!propertyInfo) {
      return res.status(404).json({
        success: false,
        error: 'Property information not found',
      });
    }

    res.json({
      success: true,
      data: propertyInfo,
      message: 'Tenant property information retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching tenant property info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tenant property information',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get tenant payment history (redirect to payment service)
router.get('/payments', authenticate, requireActiveTenant, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    // First get tenant's lease ID
    const leaseInfo = await TenantService.getTenantLeaseInfo(req.user!.id);
    
    if (!leaseInfo) {
      return res.status(404).json({
        success: false,
        error: 'No active lease found',
      });
    }

    // Get payment history for the lease
    const paymentHistory = await PaymentService.getPaymentHistory(leaseInfo.lease.id);

    res.json({
      success: true,
      data: paymentHistory,
      message: 'Tenant payment history retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching tenant payment history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tenant payment history',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get tenant payment balance
router.get('/payments/balance', authenticate, requireActiveTenant, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    // First get tenant's lease ID
    const leaseInfo = await TenantService.getTenantLeaseInfo(req.user!.id);
    
    if (!leaseInfo) {
      return res.status(404).json({
        success: false,
        error: 'No active lease found',
      });
    }

    // Get payment balance for the lease
    const balance = await PaymentService.calculateBalance(leaseInfo.lease.id);

    if (!balance) {
      return res.status(404).json({
        success: false,
        error: 'Could not calculate payment balance',
      });
    }

    res.json({
      success: true,
      data: balance,
      message: 'Tenant payment balance retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching tenant payment balance:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tenant payment balance',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get tenant profile (just redirect to current user info)
router.get('/profile', authenticate, requireActiveTenant, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const dashboardData = await TenantService.getTenantDashboard(req.user!.id);

    if (!dashboardData) {
      return res.status(404).json({
        success: false,
        error: 'Tenant profile not found',
      });
    }

    // Return just the tenant and landlord contact info
    res.json({
      success: true,
      data: {
        tenant: dashboardData.tenant,
        landlord: dashboardData.landlord,
        lease: {
          id: dashboardData.lease?.id,
          startDate: dashboardData.lease?.startDate,
          endDate: dashboardData.lease?.endDate,
          status: dashboardData.lease?.status,
        },
        unit: dashboardData.unit,
        property: {
          name: dashboardData.property?.name,
          address: dashboardData.property?.address,
        },
      },
      message: 'Tenant profile retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching tenant profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tenant profile',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;