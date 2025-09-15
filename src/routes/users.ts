import { Router, Response } from 'express';
import { 
  authenticate, 
  authorize, 
  requireLandlordContext,
  requireTenantSelfAccess,
  injectLandlordFilter 
} from '../middleware/auth';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { UserService } from '../services/userService';
import { validateBody } from '../middleware/validation';
import { z } from 'zod';

const router = Router();

// Validation schemas
const createTenantSchema = z.object({
  email: z.string().email().optional(),
  userName: z.string().min(1),
  password: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().regex(/^[0-9+\-\s()]+$/),
});

const createTenantWithLeaseSchema = z.object({
  email: z.string().email().optional(),
  userName: z.string().min(1),
  password: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().regex(/^[0-9+\-\s()]+$/),
  unitId: z.string().uuid(),
  leaseData: z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    monthlyRent: z.number().positive(),
    deposit: z.number().min(0),
    terms: z.string().optional(),
  }),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().regex(/^[0-9+\-\s()]+$/).optional(),
  isActive: z.boolean().optional(),
});

const updateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

// Get all users (admin only) with optional filtering
router.get('/', authenticate, authorize('admin'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const { role, isActive } = req.query;
    
    const filters = {
      role: role as any,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    };

    const users = await UserService.getAllUsers(req.user!.role, req.user!.id, filters);

    res.json({
      success: true,
      data: users,
      message: 'Users retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Create tenant account only (landlords can use this to create tenant first)
router.post('/tenants', authenticate, requireLandlordContext(), validateBody(createTenantSchema), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const tenant = await UserService.createTenant(req.body);

    res.status(201).json({
      success: true,
      data: tenant,
      message: 'Tenant created successfully',
    });
  } catch (error) {
    console.error('Error creating tenant:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to create tenant',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Create tenant with lease assignment (complete workflow)
router.post('/tenants/with-lease', authenticate, requireLandlordContext(), validateBody(createTenantWithLeaseSchema), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const result = await UserService.createTenantWithLease(req.user!.id, req.body);

    res.status(201).json({
      success: true,
      data: result,
      message: 'Tenant created and lease assigned successfully',
    });
  } catch (error) {
    console.error('Error creating tenant with lease:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to create tenant with lease',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get landlord's tenants
router.get('/tenants/my-tenants', authenticate, requireLandlordContext(), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const tenants = await UserService.getLandlordTenants(req.user!.id);

    res.json({
      success: true,
      data: tenants,
      message: 'Tenants retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching tenants:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tenants',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get detailed tenant information (landlords only for their tenants)
router.get('/tenants/:tenantId/details', authenticate, requireLandlordContext(), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const tenantDetails = await UserService.getTenantDetails(req.user!.id, req.params.tenantId);

    if (!tenantDetails) {
      return res.status(404).json({
        success: false,
        error: 'Tenant not found or not accessible',
      });
    }

    res.json({
      success: true,
      data: tenantDetails,
      message: 'Tenant details retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching tenant details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tenant details',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get user by ID (with ownership validation)
router.get('/:id', authenticate, requireTenantSelfAccess(), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const user = await UserService.getUserById(
      req.user!.id,
      req.user!.role,
      req.params.id
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found or not accessible',
      });
    }

    res.json({
      success: true,
      data: user,
      message: 'User retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Update user (with ownership validation)
router.put('/:id', authenticate, validateBody(updateUserSchema), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const updatedUser = await UserService.updateUser(
      req.user!.id,
      req.user!.role,
      req.params.id,
      req.body
    );

    res.json({
      success: true,
      data: updatedUser,
      message: 'User updated successfully',
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to update user',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Update user profile (self-update)
router.put('/profile', authenticate, validateBody(updateProfileSchema), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const updatedUser = await UserService.updateProfile(req.user!.id, req.body);
    res.json({
      success: true,
      data: updatedUser,
      message: 'Profile updated successfully',
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to update profile',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Delete user (admin only)
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  res.json({
    success: true,
    message: 'Delete user endpoint - to be implemented',
  });
});

export default router;