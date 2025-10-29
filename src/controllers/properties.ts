import { Response } from 'express';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { PropertyService } from '../services/propertyService';

export const getLandlordProperties = async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
        const { city, state } = req.query;

        const filters = {
            city: city as string,
            state: state as string,
        };

        const landlordId = req.user!.id;
        const properties = await PropertyService.getLandlordProperties(landlordId, filters);

        res.json({
            success: true,
            data: properties,
            message: 'Properties retrieved successfully',
        });
    } catch (error) {
        console.error('Error fetching properties:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch properties',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

export const getLandlordDashboard = async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
        const dashboard = await PropertyService.getLandlordDashboard(req.user!.id);

        res.json({
            success: true,
            data: dashboard,
            message: 'Dashboard data retrieved successfully',
        });
    } catch (error) {
        console.error('Error fetching dashboard:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch dashboard data',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

export const getPropertyAnalytics = async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
        const { propertyId } = req.query;
        const analytics = await PropertyService.getPropertyAnalytics(
            req.user!.id,
            propertyId as string
        );

        res.json({
            success: true,
            data: analytics,
            message: 'Property analytics retrieved successfully',
        });
    } catch (error) {
        console.error('Error fetching property analytics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch property analytics',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

export const getPropertyDetails = async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
        const propertyDetails = await PropertyService.getPropertyDetails(req.user!.id, req.params.id);

        if (!propertyDetails) {
            return res.status(404).json({
                success: false,
                error: 'Property not found or not accessible',
            });
        }

        res.json({
            success: true,
            data: propertyDetails,
            message: 'Property details retrieved successfully',
        });
    } catch (error) {
        console.error('Error fetching property details:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch property details',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

export const getPropertyById = async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
        const property = await PropertyService.getPropertyById(req.user!.id, req.params.id);

        if (!property) {
            return res.status(404).json({
                success: false,
                error: 'Property not found or not accessible',
            });
        }

        res.json({
            success: true,
            data: property,
            message: 'Property retrieved successfully',
        });
    } catch (error) {
        console.error('Error fetching property:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch property',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

export const createProperty = async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
        const property = await PropertyService.createProperty(req.user!.id, req.body);

        res.status(201).json({
            success: true,
            data: property,
            message: 'Property created successfully',
        });
    } catch (error) {
        console.error('Error creating property:', error);
        res.status(400).json({
            success: false,
            error: 'Failed to create property',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

export const updateProperty = async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
        const property = await PropertyService.updateProperty(req.user!.id, req.params.id, req.body);

        res.json({
            success: true,
            data: property,
            message: 'Property updated successfully',
        });
    } catch (error) {
        console.error('Error updating property:', error);
        res.status(400).json({
            success: false,
            error: 'Failed to update property',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

export const deleteProperty = async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
        await PropertyService.deleteProperty(req.user!.id, req.params.id);

        res.json({
            success: true,
            message: 'Property deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting property:', error);
        res.status(400).json({
            success: false,
            error: 'Failed to delete property',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}