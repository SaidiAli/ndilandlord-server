import { Router } from 'express';
import {
  authenticate,
  authorize,
  requireResourceOwnership
} from '../middleware/auth';
import { validateBody } from '../middleware/validation';
import { z } from 'zod';
import { createProperty, deleteProperty, getLandlordDashboard, getLandlordProperties, getPropertyAnalytics, getPropertyById, getPropertyDetails, updateProperty } from '../controllers/properties';

const router = Router();

// Validation schemas
const createPropertySchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().optional(),
  description: z.string().optional(),
});

const updatePropertySchema = createPropertySchema.optional();

// Get all properties (filtered by landlord)
router.get('/', authenticate, authorize('landlord'), getLandlordProperties);

// Get landlord dashboard summary
router.get('/dashboard', authenticate, authorize('landlord'), getLandlordDashboard);

// Get property analytics
router.get('/analytics', authenticate, authorize('landlord'), getPropertyAnalytics);

// Get property details with stats
router.get('/:id/details', authenticate, requireResourceOwnership('property', 'id', 'read'), getPropertyDetails);

// Get property by ID
router.get('/:id', authenticate, requireResourceOwnership('property', 'id', 'read'), getPropertyById);

// Create property
router.post('/', authenticate, authorize('landlord'), validateBody(createPropertySchema), createProperty);

// Update property
router.put('/:id', authenticate, requireResourceOwnership('property', 'id', 'write'), validateBody(updatePropertySchema), updateProperty);

// Delete property
router.delete('/:id', authenticate, requireResourceOwnership('property', 'id', 'delete'), deleteProperty);

export default router;