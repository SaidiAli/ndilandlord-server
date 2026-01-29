import { Router, Response } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { AmenityService } from '../services/amenityService';
import { validateBody } from '../middleware/validation';
import { createAmenitySchema } from '../common/validationsSchemas';

const router = Router();

// Get all amenities
router.get('/', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
        const { type } = req.query;

        let amenitiesList;

        if (type === 'residential') {
            amenitiesList = await AmenityService.getResidentialAmenities();
        } else if (type === 'commercial') {
            amenitiesList = await AmenityService.getCommercialAmenities();
        } else {
            amenitiesList = await AmenityService.getAllAmenities();
        }

        res.json({
            success: true,
            data: amenitiesList,
            message: 'Amenities retrieved successfully',
        });
    } catch (error) {
        console.error('Error fetching amenities:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch amenities',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// Get residential amenities
router.get('/residential', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
        const amenitiesList = await AmenityService.getResidentialAmenities();

        res.json({
            success: true,
            data: amenitiesList,
            message: 'Residential amenities retrieved successfully',
        });
    } catch (error) {
        console.error('Error fetching residential amenities:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch residential amenities',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// Get commercial amenities
router.get('/commercial', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
        const amenitiesList = await AmenityService.getCommercialAmenities();

        res.json({
            success: true,
            data: amenitiesList,
            message: 'Commercial amenities retrieved successfully',
        });
    } catch (error) {
        console.error('Error fetching commercial amenities:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch commercial amenities',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// Get amenity by ID
router.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
        const amenity = await AmenityService.getAmenityById(req.params.id);

        if (!amenity) {
            return res.status(404).json({
                success: false,
                error: 'Amenity not found',
            });
        }

        res.json({
            success: true,
            data: amenity,
            message: 'Amenity retrieved successfully',
        });
    } catch (error) {
        console.error('Error fetching amenity:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch amenity',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// Create amenity (admin or landlord)
router.post('/', authenticate, authorize('admin', 'landlord'), validateBody(createAmenitySchema), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
        const amenity = await AmenityService.createAmenity(req.body);

        res.status(201).json({
            success: true,
            data: amenity,
            message: 'Amenity created successfully',
        });
    } catch (error) {
        console.error('Error creating amenity:', error);
        res.status(400).json({
            success: false,
            error: 'Failed to create amenity',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// Update amenity (admin only)
router.put('/:id', authenticate, authorize('admin'), validateBody(createAmenitySchema.partial()), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
        const amenity = await AmenityService.updateAmenity(req.params.id, req.body);

        if (!amenity) {
            return res.status(404).json({
                success: false,
                error: 'Amenity not found',
            });
        }

        res.json({
            success: true,
            data: amenity,
            message: 'Amenity updated successfully',
        });
    } catch (error) {
        console.error('Error updating amenity:', error);
        res.status(400).json({
            success: false,
            error: 'Failed to update amenity',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// Delete amenity (admin only)
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
        await AmenityService.deleteAmenity(req.params.id);

        res.json({
            success: true,
            message: 'Amenity deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting amenity:', error);
        res.status(400).json({
            success: false,
            error: 'Failed to delete amenity',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

export default router;