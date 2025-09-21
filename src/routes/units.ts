import { Router, Response } from 'express';
import { 
  authenticate, 
  authorize, 
  requireLandlordContext,
  injectLandlordFilter,
  requireResourceOwnership 
} from '../middleware/auth';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { UnitService } from '../services/unitService';
import { validateBody } from '../middleware/validation';
import { z } from 'zod';

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

// Get all units (filtered by landlord)
router.get('/', authenticate, injectLandlordFilter(), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    const { propertyId, isAvailable, minBedrooms, maxRent } = req.query;

    // Landlord logic
    const filters = {
      propertyId: propertyId as string,
      isAvailable: isAvailable === 'true' ? true : isAvailable === 'false' ? false : undefined,
      minBedrooms: minBedrooms ? parseInt(minBedrooms as string) : undefined,
      maxRent: maxRent ? parseFloat(maxRent as string) : undefined,
    };

    // Ensure we're using the authenticated user's ID for filtering
    const landlordId = req.user.id;
    const units = await UnitService.getLandlordUnits(landlordId, filters);

    res.json({
      success: true,
      data: units,
      message: 'Units retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching units:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch units',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get available units for lease assignment
router.get('/available', authenticate, requireLandlordContext(), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const { propertyId } = req.query;
    const availableUnits = await UnitService.getAvailableUnits(
      req.user!.id,
      propertyId as string
    );

    res.json({
      success: true,
      data: availableUnits,
      message: 'Available units retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching available units:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available units',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get units analytics
router.get('/analytics', authenticate, requireLandlordContext(), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const { propertyId } = req.query;
    const analytics = await UnitService.getUnitsAnalytics(
      req.user!.id,
      propertyId as string
    );

    res.json({
      success: true,
      data: analytics,
      message: 'Units analytics retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching units analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch units analytics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Create multiple units at once (bulk creation)
router.post('/bulk', authenticate, requireLandlordContext(), validateBody(bulkCreateUnitsSchema), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const result = await UnitService.createBulkUnits(req.user!.id, req.body);

    res.status(201).json({
      success: true,
      data: result,
      message: `Successfully created ${result.created} units`,
    });
  } catch (error) {
    console.error('Error creating bulk units:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to create units',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get unit details with analytics (landlords only)
router.get('/:id/details', authenticate, requireResourceOwnership('unit', 'id', 'read'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const unitDetails = await UnitService.getUnitDetails(req.user!.id, req.params.id);

    if (!unitDetails) {
      return res.status(404).json({
        success: false,
        error: 'Unit not found or not accessible',
      });
    }

    res.json({
      success: true,
      data: unitDetails,
      message: 'Unit details retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching unit details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch unit details',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get unit by ID (with ownership validation)
router.get('/:id', authenticate, requireResourceOwnership('unit', 'id', 'read'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const units = await UnitService.getLandlordUnits(req.user!.id);
    const unit = units.find(u => u.id === req.params.id);

    if (!unit) {
      return res.status(404).json({
        success: false,
        error: 'Unit not found or not accessible',
      });
    }

    res.json({
      success: true,
      data: unit,
      message: 'Unit retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching unit:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch unit',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Create unit
router.post('/', authenticate, requireLandlordContext(), validateBody(createUnitSchema), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const unit = await UnitService.createUnit(req.user!.id, req.body);

    res.status(201).json({
      success: true,
      data: unit,
      message: 'Unit created successfully',
    });
  } catch (error) {
    console.error('Error creating unit:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to create unit',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Update unit (with ownership validation)
router.put('/:id', authenticate, requireResourceOwnership('unit', 'id', 'write'), validateBody(updateUnitSchema), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const unit = await UnitService.updateUnit(req.user!.id, req.params.id, req.body);

    res.json({
      success: true,
      data: unit,
      message: 'Unit updated successfully',
    });
  } catch (error) {
    console.error('Error updating unit:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to update unit',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Delete unit (with ownership validation and safety checks)
router.delete('/:id', authenticate, requireResourceOwnership('unit', 'id', 'delete'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    await UnitService.deleteUnit(req.user!.id, req.params.id);

    res.json({
      success: true,
      message: 'Unit deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting unit:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to delete unit',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;