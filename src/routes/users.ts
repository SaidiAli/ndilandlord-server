import { Router, Response } from 'express';
import {
  authenticate,
  authorize,
  requireTenantSelfAccess,
} from '../middleware/auth';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { validateBody } from '../middleware/validation';
import { z } from 'zod';
import { createTenantController, createTenantWithLease, getAllUsersController, getLandlordTenantsController, getTenantDetailsController, getUserByIdController, updateUserController, updateUserProfileController } from '../controllers/users';

const router = Router();

// Validation schemas
const createTenantSchema = z.object({
  email: z.string().optional(),
  userName: z.string().min(1),
  password: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().regex(/^[0-9+\-\s()]+$/),
});

const createTenantWithLeaseSchema = z.object({
  email: z.string().optional(),
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
  email: z.string().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().regex(/^[0-9+\-\s()]+$/).optional(),
  isActive: z.boolean().optional(),
});

// Get all users (admin only) with optional filtering
router.get('/', authenticate, authorize('admin'), getAllUsersController);

// Create tenant account only (landlords can use this to create tenant first)
router.post('/tenants', authenticate, authorize('landlord'), validateBody(createTenantSchema), createTenantController);

// Create tenant with lease
router.post('/tenants/with-lease', authenticate, authorize('landlord'), validateBody(createTenantWithLeaseSchema), createTenantWithLease);

// Get landlord's tenants
router.get('/tenants/my-tenants', authenticate, authorize('landlord'), getLandlordTenantsController);

// Get detailed tenant information
router.get('/tenants/:tenantId/details', authenticate, authorize('landlord'), getTenantDetailsController);

// Get user by ID 
router.get('/:id', authenticate, requireTenantSelfAccess(), getUserByIdController);

// Update user
router.put('/:id', authenticate, validateBody(updateUserSchema), updateUserController);

// Update user profile (self-update)
router.put('/profile', authenticate, validateBody(updateUserSchema), updateUserProfileController);

// Delete user (admin only)
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  res.json({
    success: true,
    message: 'Delete user endpoint - to be implemented',
  });
});

export default router;