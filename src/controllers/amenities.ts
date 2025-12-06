import { Request, Response } from 'express';
import { ApiResponse } from '../types';
import { AmenityService } from '../services/amenityService';

export const getAllAmenities = async (req: Request, res: Response<ApiResponse>) => {
    try {
        const amenities = await AmenityService.getAllAmenities();

        res.json({
            success: true,
            data: amenities,
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
};

export const createAmenity = async (req: Request, res: Response<ApiResponse>) => {
    try {
        const { name } = req.body;
        const amenity = await AmenityService.createAmenity(name);

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
};
