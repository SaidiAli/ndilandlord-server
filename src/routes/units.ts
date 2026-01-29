import { Router, Response } from 'express';
import {
  authenticate,
  authorize,
  requireResourceOwnership
} from '../middleware/auth';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { UnitService } from '../services/unitService';
import { validateBody } from '../middleware/validation';
import {
  createResidentialUnitSchema,
  createCommercialUnitSchema
} from '../common/types';
import { z } from 'zod';
import { bulkCreateCommercialUnitsSchema, bulkCreateResidentialUnitsSchema, updateCommercialUnitSchema, updateResidentialUnitSchema } from '../common/validationsSchemas';

const router = Router();

// Legacy unit creation schema (for backward compatibility)
const legacyCreateUnitSchema = z.object({
  propertyId: z.string().uuid(),
  unitNumber: z.string().min(1),
  squareFeet: z.number().int().positive().optional(),
  description: z.string().optional(),
  amenityIds: z.array(z.string().uuid()).optional(),
  // Residential fields (optional, for backward compatibility)
  bedrooms: z.number().int().min(0).optional(),
  bathrooms: z.number().min(0).optional(),
  // Type-specific details (new way)
  residentialDetails: z.object({
    unitType: z.enum(['apartment', 'studio', 'house', 'condo', 'townhouse', 'duplex', 'room', 'other']).optional(),
    bedrooms: z.number().int().min(0).optional(),
    bathrooms: z.number().min(0).optional(),
    hasBalcony: z.boolean().optional(),
    floorNumber: z.string().optional(),
    isFurnished: z.boolean().optional(),
  }).optional(),
  commercialDetails: z.object({
    unitType: z.enum(['office', 'retail', 'warehouse', 'restaurant', 'medical', 'industrial', 'flex_space', 'coworking', 'other']).optional(),
    floorNumber: z.string().optional(),
    suiteNumber: z.string().optional(),
    ceilingHeight: z.number().positive().optional(),
    hasLoadingDock: z.boolean().optional(),
    hasStorefront: z.boolean().optional(),
    maxOccupancy: z.number().int().positive().optional(),
    zoningType: z.string().optional(),
  }).optional(),
});

const legacyUpdateUnitSchema = z.object({
  unitNumber: z.string().min(1).optional(),
  squareFeet: z.number().int().positive().optional(),
  isAvailable: z.boolean().optional(),
  description: z.string().optional(),
  amenityIds: z.array(z.string().uuid()).optional(),
  // Residential fields (optional, for backward compatibility)
  bedrooms: z.number().int().min(0).optional(),
  bathrooms: z.number().min(0).optional(),
  // Type-specific details
  residentialDetails: z.object({
    unitType: z.enum(['apartment', 'studio', 'house', 'condo', 'townhouse', 'duplex', 'room', 'other']).optional(),
    bedrooms: z.number().int().min(0).optional(),
    bathrooms: z.number().min(0).optional(),
    hasBalcony: z.boolean().optional(),
    floorNumber: z.string().optional(),
    isFurnished: z.boolean().optional(),
  }).optional(),
  commercialDetails: z.object({
    unitType: z.enum(['office', 'retail', 'warehouse', 'restaurant', 'medical', 'industrial', 'flex_space', 'coworking', 'other']).optional(),
    floorNumber: z.string().optional(),
    suiteNumber: z.string().optional(),
    ceilingHeight: z.number().positive().optional(),
    hasLoadingDock: z.boolean().optional(),
    hasStorefront: z.boolean().optional(),
    maxOccupancy: z.number().int().positive().optional(),
    zoningType: z.string().optional(),
  }).optional(),
});

const legacyBulkCreateSchema = z.object({
  propertyId: z.string().uuid(),
  units: z.array(z.object({
    unitNumber: z.string().min(1),
    squareFeet: z.number().int().positive().optional(),
    description: z.string().optional(),
    amenityIds: z.array(z.string().uuid()).optional(),
    bedrooms: z.number().int().min(0).optional(),
    bathrooms: z.number().min(0).optional(),
    residentialDetails: z.object({
      unitType: z.enum(['apartment', 'studio', 'house', 'condo', 'townhouse', 'duplex', 'room', 'other']).optional(),
      bedrooms: z.number().int().min(0).optional(),
      bathrooms: z.number().min(0).optional(),
      hasBalcony: z.boolean().optional(),
      floorNumber: z.string().optional(),
      isFurnished: z.boolean().optional(),
    }).optional(),
    commercialDetails: z.object({
      unitType: z.enum(['office', 'retail', 'warehouse', 'restaurant', 'medical', 'industrial', 'flex_space', 'coworking', 'other']).optional(),
      floorNumber: z.string().optional(),
      suiteNumber: z.string().optional(),
      ceilingHeight: z.number().positive().optional(),
      hasLoadingDock: z.boolean().optional(),
      hasStorefront: z.boolean().optional(),
      maxOccupancy: z.number().int().positive().optional(),
      zoningType: z.string().optional(),
    }).optional(),
  })).min(1),
});

// Get all units for landlord
router.get('/', authenticate, authorize('landlord'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const { propertyId, isAvailable, minBedrooms, maxRent } = req.query;

    const filters = {
      propertyId: propertyId as string,
      isAvailable: isAvailable === 'true' ? true : isAvailable === 'false' ? false : undefined,
      minBedrooms: minBedrooms ? parseInt(minBedrooms as string) : undefined,
      maxRent: maxRent ? parseFloat(maxRent as string) : undefined,
    };

    const units = await UnitService.getLandlordUnits(req.user!.id, filters);

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
router.get('/available', authenticate, authorize('landlord'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
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
router.get('/analytics', authenticate, authorize('landlord'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
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

// Create residential unit (explicit endpoint)
router.post('/residential', authenticate, authorize('landlord'), validateBody(createResidentialUnitSchema), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const unit = await UnitService.createResidentialUnit(req.user!.id, req.body);

    res.status(201).json({
      success: true,
      data: unit,
      message: 'Residential unit created successfully',
    });
  } catch (error) {
    console.error('Error creating residential unit:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to create residential unit',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Create commercial unit (explicit endpoint)
router.post('/commercial', authenticate, authorize('landlord'), validateBody(createCommercialUnitSchema), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const unit = await UnitService.createCommercialUnit(req.user!.id, req.body);

    res.status(201).json({
      success: true,
      data: unit,
      message: 'Commercial unit created successfully',
    });
  } catch (error) {
    console.error('Error creating commercial unit:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to create commercial unit',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Create unit (auto-detects property type - backward compatible)
router.post('/', authenticate, authorize('landlord'), validateBody(legacyCreateUnitSchema), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const unit = await UnitService.createUnit(req.user!.id, req.body.propertyId, req.body);

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

// Bulk create residential units
router.post('/bulk/residential', authenticate, authorize('landlord'), validateBody(bulkCreateResidentialUnitsSchema), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const result = await UnitService.createBulkResidentialUnits(req.user!.id, req.body);

    res.status(201).json({
      success: true,
      data: result,
      message: `Processed ${result.totalProcessed} units: ${result.created.length} created, ${result.failed.length} skipped`,
    });
  } catch (error) {
    console.error('Error creating bulk residential units:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to create units',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Bulk create commercial units
router.post('/bulk/commercial', authenticate, authorize('landlord'), validateBody(bulkCreateCommercialUnitsSchema), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const result = await UnitService.createBulkCommercialUnits(req.user!.id, req.body);

    res.status(201).json({
      success: true,
      data: result,
      message: `Processed ${result.totalProcessed} units: ${result.created.length} created, ${result.failed.length} skipped`,
    });
  } catch (error) {
    console.error('Error creating bulk commercial units:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to create units',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Bulk create units (auto-detects property type - backward compatible)
router.post('/bulk', authenticate, authorize('landlord'), validateBody(legacyBulkCreateSchema), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const result = await UnitService.createBulkUnits(req.user!.id, req.body);

    res.status(201).json({
      success: true,
      data: result,
      message: `Processed ${result.totalProcessed} units: ${result.created.length} created, ${result.failed.length} skipped`,
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

// Get unit details
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

// Get unit by ID
router.get('/:id', authenticate, requireResourceOwnership('unit', 'id', 'read'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
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

// Update residential unit (explicit endpoint)
router.put('/:id/residential', authenticate, requireResourceOwnership('unit', 'id', 'write'), validateBody(updateResidentialUnitSchema), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const unit = await UnitService.updateResidentialUnit(req.user!.id, req.params.id, req.body);

    res.json({
      success: true,
      data: unit,
      message: 'Residential unit updated successfully',
    });
  } catch (error) {
    console.error('Error updating residential unit:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to update residential unit',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Update commercial unit (explicit endpoint)
router.put('/:id/commercial', authenticate, requireResourceOwnership('unit', 'id', 'write'), validateBody(updateCommercialUnitSchema), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const unit = await UnitService.updateCommercialUnit(req.user!.id, req.params.id, req.body);

    res.json({
      success: true,
      data: unit,
      message: 'Commercial unit updated successfully',
    });
  } catch (error) {
    console.error('Error updating commercial unit:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to update commercial unit',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Update unit (auto-detects type - backward compatible)
router.put('/:id', authenticate, requireResourceOwnership('unit', 'id', 'write'), validateBody(legacyUpdateUnitSchema), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
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

// Delete unit
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