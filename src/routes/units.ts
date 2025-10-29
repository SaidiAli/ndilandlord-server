import { Router, Response } from 'express';
import {
  authenticate,
  authorize,
  requireResourceOwnership
} from '../middleware/auth';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { UnitService } from '../services/unitService';
import { z } from 'zod';
import { createBulkUnits, createUnit, deleteUnit, getAvailableUnits, getLandlordUnits, getUnitById, getUnitDetails, getUnitsAnalytics, updateUnit } from '../controllers/units';
import { validateBody } from '../middleware/validation';

const router = Router();

// Validation schemas
const createUnitSchema = z.object({
  propertyId: z.string().uuid(),
  unitNumber: z.string().min(1),
  bedrooms: z.number().int().min(0),
  bathrooms: z.number().min(0),
  squareFeet: z.number().int().positive().optional(),
  description: z.string().optional(),
});

const updateUnitSchema = z.object({
  unitNumber: z.string().min(1).optional(),
  bedrooms: z.number().int().min(0).optional(),
  bathrooms: z.number().min(0).optional(),
  squareFeet: z.number().int().positive().optional(),
  isAvailable: z.boolean().optional(),
  description: z.string().optional(),
});

const bulkCreateUnitsSchema = z.object({
  propertyId: z.string().uuid(),
  units: z.array(z.object({
    unitNumber: z.string().min(1),
    bedrooms: z.number().int().min(0),
    bathrooms: z.number().min(0),
    squareFeet: z.number().int().positive().optional(),
    description: z.string().optional(),
  })).min(1),
});

// Get all units
router.get('/', authenticate, authorize('landlord'), getLandlordUnits);

// Get available units for lease assignment
router.get('/available', authenticate, authorize('landlord'), getAvailableUnits);

// Get units analytics
router.get('/analytics', authenticate, authorize('landlord'), getUnitsAnalytics);

// Create multiple units at once (bulk creation)
router.post('/bulk', authenticate, authorize('landlord'), validateBody(bulkCreateUnitsSchema), createBulkUnits);

// Get unit details with analytics
router.get('/:id/details', authenticate, requireResourceOwnership('unit', 'id', 'read'), getUnitDetails);

// Get unit by ID
router.get('/:id', authenticate, requireResourceOwnership('unit', 'id', 'read'), getUnitById);

// Create unit
router.post('/', authenticate, authorize('landlord'), validateBody(createUnitSchema), createUnit);

// Update unit
router.put('/:id', authenticate, requireResourceOwnership('unit', 'id', 'write'), validateBody(updateUnitSchema), updateUnit);

// Delete unit
router.delete('/:id', authenticate, requireResourceOwnership('unit', 'id', 'delete'), deleteUnit);

export default router;