
/**
 * Types and validation schemas for property and unit management
 * Supports both residential and commercial properties
 */

import z from "zod";
import { baseUnitSchema, bulkCreateCommercialUnitsSchema, bulkCreateResidentialUnitsSchema, commercialUnitDetailsSchema, createAmenitySchema, createPropertySchema, createUnitSchema, residentialUnitDetailsSchema, updateCommercialUnitSchema, updateResidentialUnitSchema } from "./validationsSchemas";

// Property types
export type PropertyType = 'residential' | 'commercial';

// Residential unit types
export type ResidentialUnitType =
    | 'apartment'
    | 'studio'
    | 'house'
    | 'condo'
    | 'townhouse'
    | 'duplex'
    | 'room'
    | 'other';

// Commercial unit types
export type CommercialUnitType =
    | 'office'
    | 'retail'
    | 'warehouse'
    | 'restaurant'
    | 'medical'
    | 'industrial'
    | 'flex_space'
    | 'coworking'
    | 'other';

// Amenity types
export type AmenityType = 'residential' | 'commercial' | 'common';

// Base unit interface (common fields)
export interface BaseUnit {
    id: string;
    propertyId: string;
    unitNumber: string;
    squareFeet?: number;
    isAvailable: boolean;
    description?: string;
    createdAt: Date;
    updatedAt: Date;
}

// Residential unit details
export interface ResidentialUnitDetails {
    id: string;
    unitId: string;
    unitType: ResidentialUnitType;
    bedrooms: number;
    bathrooms: number;
    hasBalcony?: boolean;
    floorNumber?: number;
    isFurnished?: boolean;
    createdAt: Date;
}

// Commercial unit details
export interface CommercialUnitDetails {
    id: string;
    unitId: string;
    unitType: CommercialUnitType;
    floorNumber?: number;
    suiteNumber?: string;
    ceilingHeight?: number;
    maxOccupancy?: number;
    createdAt: Date;
}

// Combined unit with details
export interface ResidentialUnit extends BaseUnit {
    propertyType: 'residential';
    details: ResidentialUnitDetails;
    amenities?: Array<{ id: string; name: string }>;
}

export interface CommercialUnit extends BaseUnit {
    propertyType: 'commercial';
    details: CommercialUnitDetails;
    amenities?: Array<{ id: string; name: string }>;
}

export type Unit = ResidentialUnit | CommercialUnit;

// Residential unit creation schema
export const createResidentialUnitSchema = baseUnitSchema.extend({
    residentialDetails: residentialUnitDetailsSchema,
});

// Commercial unit creation schema
export const createCommercialUnitSchema = baseUnitSchema.extend({
    commercialDetails: commercialUnitDetailsSchema,
});

// Property update schema
export const updatePropertySchema = createPropertySchema.partial();

// Type exports for schema inference
export type CreateResidentialUnitInput = z.infer<typeof createResidentialUnitSchema>;
export type CreateCommercialUnitInput = z.infer<typeof createCommercialUnitSchema>;
export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export type UpdateResidentialUnitInput = z.infer<typeof updateResidentialUnitSchema>;
export type UpdateCommercialUnitInput = z.infer<typeof updateCommercialUnitSchema>;
export type BulkCreateResidentialUnitsInput = z.infer<typeof bulkCreateResidentialUnitsSchema>;
export type BulkCreateCommercialUnitsInput = z.infer<typeof bulkCreateCommercialUnitsSchema>;
export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;
export type CreateAmenityInput = z.infer<typeof createAmenitySchema>;
export type ResidentialUnitDetailsInput = z.infer<typeof residentialUnitDetailsSchema>;
export type CommercialUnitDetailsInput = z.infer<typeof commercialUnitDetailsSchema>;