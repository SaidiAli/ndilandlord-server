import { z } from 'zod';

// Residential unit details schema
export const residentialUnitDetailsSchema = z.object({
    unitType: z.enum(['apartment', 'studio', 'house', 'condo', 'townhouse', 'duplex', 'room', 'other']).default('apartment'),
    bedrooms: z.number().int().min(0, 'Bedrooms must be non-negative').default(1),
    bathrooms: z.number().int().min(0, 'Bathrooms must be non-negative').default(1),
    hasBalcony: z.boolean().optional().default(false),
    floorNumber: z.string().optional(),
    isFurnished: z.boolean().optional().default(false),
});

// Commercial unit details schema
export const commercialUnitDetailsSchema = z.object({
    unitType: z.enum(['office', 'retail', 'warehouse', 'restaurant', 'medical', 'industrial', 'flex_space', 'coworking', 'other']).default('office'),
    floorNumber: z.string().optional(),
    suiteNumber: z.string().max(50).optional(),
    ceilingHeight: z.number().positive().optional(),
    maxOccupancy: z.number().int().positive().optional()
});

// Base unit creation schema (common fields)
export const baseUnitSchema = z.object({
    propertyId: z.string().uuid('Invalid property ID'),
    unitNumber: z.string().min(1, 'Unit number is required'),
    squareFeet: z.number().int().positive('Square feet must be positive').optional(),
    description: z.string().optional(),
    amenityIds: z.array(z.string().uuid()).optional(),
});

// Combined unit creation schema (discriminated by property type)
export const createUnitSchema = z.discriminatedUnion('propertyType', [
    z.object({
        propertyType: z.literal('residential'),
        ...baseUnitSchema.shape,
        residentialDetails: residentialUnitDetailsSchema,
    }),
    z.object({
        propertyType: z.literal('commercial'),
        ...baseUnitSchema.shape,
        commercialDetails: commercialUnitDetailsSchema,
    }),
]);

// Unit update schemas
export const updateResidentialUnitSchema = z.object({
    unitNumber: z.string().min(1).optional(),
    squareFeet: z.number().int().positive().optional(),
    isAvailable: z.boolean().optional(),
    description: z.string().optional(),
    amenityIds: z.array(z.string().uuid()).optional(),
    residentialDetails: residentialUnitDetailsSchema.partial().optional(),
});

export const updateCommercialUnitSchema = z.object({
    unitNumber: z.string().min(1).optional(),
    squareFeet: z.number().int().positive().optional(),
    isAvailable: z.boolean().optional(),
    description: z.string().optional(),
    amenityIds: z.array(z.string().uuid()).optional(),
    commercialDetails: commercialUnitDetailsSchema.partial().optional(),
});

// Bulk unit creation schemas
export const bulkCreateResidentialUnitsSchema = z.object({
    propertyId: z.string().uuid('Invalid property ID'),
    units: z.array(z.object({
        unitNumber: z.string().min(1),
        squareFeet: z.number().int().positive().optional(),
        description: z.string().optional(),
        amenityIds: z.array(z.string().uuid()).optional(),
        residentialDetails: residentialUnitDetailsSchema,
    })).min(1, 'At least one unit is required'),
});

export const bulkCreateCommercialUnitsSchema = z.object({
    propertyId: z.string().uuid('Invalid property ID'),
    units: z.array(z.object({
        unitNumber: z.string().min(1),
        squareFeet: z.number().int().positive().optional(),
        description: z.string().optional(),
        amenityIds: z.array(z.string().uuid()).optional(),
        commercialDetails: commercialUnitDetailsSchema,
    })).min(1, 'At least one unit is required'),
});

// Property creation schema (updated)
export const createPropertySchema = z.object({
    name: z.string().min(1, 'Property name is required'),
    address: z.string().min(1, 'Address is required'),
    city: z.string().min(1, 'City is required'),
    postalCode: z.string().optional(),
    description: z.string().optional(),
    type: z.enum(['residential', 'commercial']).default('residential'),
    numberOfUnits: z.number().int().positive().optional(),
});

// Amenity schemas
export const createAmenitySchema = z.object({
    name: z.string().min(1, 'Amenity name is required'),
    type: z.enum(['residential', 'commercial', 'common']).default('common'),
});