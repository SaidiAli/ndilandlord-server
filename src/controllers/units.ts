import { Response } from 'express';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { UnitService } from '../services/unitService';

export const getLandlordUnits = async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
        const { propertyId, isAvailable, minBedrooms, maxRent } = req.query;

        // Landlord logic
        const filters = {
            propertyId: propertyId as string,
            isAvailable: isAvailable === 'true' ? true : isAvailable === 'false' ? false : undefined,
            minBedrooms: minBedrooms ? parseInt(minBedrooms as string) : undefined,
            maxRent: maxRent ? parseFloat(maxRent as string) : undefined,
        };

        // Ensure we're using the authenticated user's ID for filtering
        const landlordId = req.user!.id;
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
}

export const getAvailableUnits = async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
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
}

export const getUnitsAnalytics = async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
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
}

export const createBulkUnits = async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
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
}

export const getUnitDetails = async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
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
}

export const getUnitById = async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
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
}

export const createUnit = async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
        const { propertyId, ...unitData } = req.body;
        const unit = await UnitService.createUnit(req.user!.id, propertyId, unitData);

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
}

export const updateUnit = async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
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
}

export const deleteUnit = async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
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
}