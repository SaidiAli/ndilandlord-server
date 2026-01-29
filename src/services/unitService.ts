import { db } from '../db';
import {
  properties,
  units,
  leases,
  unitAmenities,
  amenities,
  residentialUnitDetails,
  commercialUnitDetails
} from '../db/schema';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { OwnershipService } from '../db/ownership';
import { BulkCreateCommercialUnitsInput, BulkCreateResidentialUnitsInput, CreateCommercialUnitInput, CreateResidentialUnitInput, PropertyType, UpdateCommercialUnitInput, UpdateResidentialUnitInput } from '../common/types';

export class UnitService {
  /**
   * Get property type for a given property ID
   */
  static async getPropertyType(propertyId: string): Promise<PropertyType | null> {
    const [property] = await db
      .select({ type: properties.type })
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);

    return property?.type || null;
  }

  /**
   * Create a residential unit
   */
  static async createResidentialUnit(landlordId: string, unitData: CreateResidentialUnitInput) {
    // Verify landlord owns the property
    const ownsProperty = await OwnershipService.isLandlordOwnerOfProperty(
      landlordId,
      unitData.propertyId
    );

    if (!ownsProperty) {
      throw new Error('You can only create units in your own properties');
    }

    // Verify property is residential
    const propertyType = await this.getPropertyType(unitData.propertyId);
    if (propertyType !== 'residential') {
      throw new Error('Cannot create residential unit in a commercial property');
    }

    // Check for duplicate unit numbers
    const existingUnit = await db
      .select()
      .from(units)
      .where(
        and(
          eq(units.propertyId, unitData.propertyId),
          eq(units.unitNumber, unitData.unitNumber)
        )
      )
      .limit(1);

    if (existingUnit.length > 0) {
      throw new Error('A unit with this number already exists in this property');
    }

    // Create unit with details in transaction
    const result = await db.transaction(async (tx) => {
      // Create base unit
      const [createdUnit] = await tx
        .insert(units)
        .values({
          propertyId: unitData.propertyId,
          unitNumber: unitData.unitNumber,
          squareFeet: unitData.squareFeet,
          description: unitData.description,
          isAvailable: true,
        })
        .returning();

      // Create residential details
      const [details] = await tx
        .insert(residentialUnitDetails)
        .values({
          unitId: createdUnit.id,
          unitType: unitData.residentialDetails.unitType,
          bedrooms: unitData.residentialDetails.bedrooms,
          bathrooms: unitData.residentialDetails.bathrooms,
          hasBalcony: unitData.residentialDetails.hasBalcony,
          floorNumber: unitData.residentialDetails.floorNumber,
          isFurnished: unitData.residentialDetails.isFurnished,
        })
        .returning();

      // Add amenities if provided
      if (unitData.amenityIds && unitData.amenityIds.length > 0) {
        await tx.insert(unitAmenities).values(
          unitData.amenityIds.map((amenityId: any) => ({
            unitId: createdUnit.id,
            amenityId,
          }))
        );
      }

      return { unit: createdUnit, details };
    });

    return this.formatResidentialUnit(result.unit, result.details);
  }

  /**
   * Create a commercial unit
   */
  static async createCommercialUnit(landlordId: string, unitData: CreateCommercialUnitInput) {
    // Verify landlord owns the property
    const ownsProperty = await OwnershipService.isLandlordOwnerOfProperty(
      landlordId,
      unitData.propertyId
    );

    if (!ownsProperty) {
      throw new Error('You can only create units in your own properties');
    }

    // Verify property is commercial
    const propertyType = await this.getPropertyType(unitData.propertyId);
    if (propertyType !== 'commercial') {
      throw new Error('Cannot create commercial unit in a residential property');
    }

    // Check for duplicate unit numbers
    const existingUnit = await db
      .select()
      .from(units)
      .where(
        and(
          eq(units.propertyId, unitData.propertyId),
          eq(units.unitNumber, unitData.unitNumber)
        )
      )
      .limit(1);

    if (existingUnit.length > 0) {
      throw new Error('A unit with this number already exists in this property');
    }

    // Create unit with details in transaction
    const result = await db.transaction(async (tx) => {
      // Create base unit
      const [createdUnit] = await tx
        .insert(units)
        .values({
          propertyId: unitData.propertyId,
          unitNumber: unitData.unitNumber,
          squareFeet: unitData.squareFeet,
          description: unitData.description,
          isAvailable: true,
        })
        .returning();

      // Create commercial details
      const [details] = await tx
        .insert(commercialUnitDetails)
        .values({
          unitId: createdUnit.id,
          unitType: unitData.commercialDetails.unitType,
          floorNumber: unitData.commercialDetails.floorNumber,
          suiteNumber: unitData.commercialDetails.suiteNumber,
          ceilingHeight: unitData.commercialDetails.ceilingHeight?.toString(),
          maxOccupancy: unitData.commercialDetails.maxOccupancy
        })
        .returning();

      // Add amenities if provided
      if (unitData.amenityIds && unitData.amenityIds.length > 0) {
        await tx.insert(unitAmenities).values(
          unitData.amenityIds.map(amenityId => ({
            unitId: createdUnit.id,
            amenityId,
          }))
        );
      }

      return { unit: createdUnit, details };
    });

    return this.formatCommercialUnit(result.unit, result.details);
  }

  /**
   * Create a unit (auto-detects property type)
   */
  static async createUnit(landlordId: string, propertyId: string, unitData: any) {
    const propertyType = await this.getPropertyType(propertyId);

    if (!propertyType) {
      throw new Error('Property not found');
    }

    if (propertyType === 'residential') {
      return this.createResidentialUnit(landlordId, {
        ...unitData,
        propertyId,
        residentialDetails: unitData.residentialDetails || {
          unitType: 'apartment',
          bedrooms: unitData.bedrooms || 1,
          bathrooms: unitData.bathrooms || 1,
        },
      });
    } else {
      return this.createCommercialUnit(landlordId, {
        ...unitData,
        propertyId,
        commercialDetails: unitData.commercialDetails || {
          unitType: 'office',
        },
      });
    }
  }

  /**
   * Bulk create residential units
   */
  static async createBulkResidentialUnits(landlordId: string, bulkData: BulkCreateResidentialUnitsInput) {
    // Verify landlord owns the property
    const ownsProperty = await OwnershipService.isLandlordOwnerOfProperty(
      landlordId,
      bulkData.propertyId
    );

    if (!ownsProperty) {
      throw new Error('You can only create units in your own properties');
    }

    // Verify property is residential
    const propertyType = await this.getPropertyType(bulkData.propertyId);
    if (propertyType !== 'residential') {
      throw new Error('Cannot create residential units in a commercial property');
    }

    // Check for duplicates
    const unitNumbers = bulkData.units.map(u => u.unitNumber);
    const duplicatesInRequest = unitNumbers.filter((item, index) => unitNumbers.indexOf(item) !== index);
    if (duplicatesInRequest.length > 0) {
      throw new Error(`Duplicate unit numbers in request: ${duplicatesInRequest.join(', ')}`);
    }

    // Check existing units
    const existingUnits = await db
      .select({ unitNumber: units.unitNumber })
      .from(units)
      .where(
        and(
          eq(units.propertyId, bulkData.propertyId),
          inArray(units.unitNumber, unitNumbers)
        )
      );

    const existingNumbers = existingUnits.map(u => u.unitNumber);
    const unitsToCreate = bulkData.units.filter(unit => !existingNumbers.includes(unit.unitNumber));
    const failedUnits = existingNumbers.map(num => ({
      unitNumber: num,
      reason: 'Unit number already exists'
    }));

    let createdUnits: any[] = [];

    if (unitsToCreate.length > 0) {
      createdUnits = await db.transaction(async (tx) => {
        const results = [];

        for (const unitInput of unitsToCreate) {
          // Create base unit
          const [createdUnit] = await tx
            .insert(units)
            .values({
              propertyId: bulkData.propertyId,
              unitNumber: unitInput.unitNumber,
              squareFeet: unitInput.squareFeet,
              description: unitInput.description,
              isAvailable: true,
            })
            .returning();

          // Create residential details
          await tx
            .insert(residentialUnitDetails)
            .values({
              unitId: createdUnit.id,
              unitType: unitInput.residentialDetails.unitType,
              bedrooms: unitInput.residentialDetails.bedrooms,
              bathrooms: unitInput.residentialDetails.bathrooms,
              hasBalcony: unitInput.residentialDetails.hasBalcony,
              floorNumber: unitInput.residentialDetails.floorNumber,
              isFurnished: unitInput.residentialDetails.isFurnished,
            });

          // Add amenities if provided
          if (unitInput.amenityIds && unitInput.amenityIds.length > 0) {
            await tx.insert(unitAmenities).values(
              unitInput.amenityIds.map(amenityId => ({
                unitId: createdUnit.id,
                amenityId,
              }))
            );
          }

          results.push(createdUnit);
        }

        return results;
      });
    }

    return {
      created: createdUnits,
      failed: failedUnits,
      totalProcessed: unitNumbers.length,
    };
  }

  /**
   * Bulk create commercial units
   */
  static async createBulkCommercialUnits(landlordId: string, bulkData: BulkCreateCommercialUnitsInput) {
    // Verify landlord owns the property
    const ownsProperty = await OwnershipService.isLandlordOwnerOfProperty(
      landlordId,
      bulkData.propertyId
    );

    if (!ownsProperty) {
      throw new Error('You can only create units in your own properties');
    }

    // Verify property is commercial
    const propertyType = await this.getPropertyType(bulkData.propertyId);
    if (propertyType !== 'commercial') {
      throw new Error('Cannot create commercial units in a residential property');
    }

    // Check for duplicates
    const unitNumbers = bulkData.units.map(u => u.unitNumber);
    const duplicatesInRequest = unitNumbers.filter((item, index) => unitNumbers.indexOf(item) !== index);
    if (duplicatesInRequest.length > 0) {
      throw new Error(`Duplicate unit numbers in request: ${duplicatesInRequest.join(', ')}`);
    }

    // Check existing units
    const existingUnits = await db
      .select({ unitNumber: units.unitNumber })
      .from(units)
      .where(
        and(
          eq(units.propertyId, bulkData.propertyId),
          inArray(units.unitNumber, unitNumbers)
        )
      );

    const existingNumbers = existingUnits.map(u => u.unitNumber);
    const unitsToCreate = bulkData.units.filter(unit => !existingNumbers.includes(unit.unitNumber));
    const failedUnits = existingNumbers.map(num => ({
      unitNumber: num,
      reason: 'Unit number already exists'
    }));

    let createdUnits: any[] = [];

    if (unitsToCreate.length > 0) {
      createdUnits = await db.transaction(async (tx) => {
        const results = [];

        for (const unitInput of unitsToCreate) {
          // Create base unit
          const [createdUnit] = await tx
            .insert(units)
            .values({
              propertyId: bulkData.propertyId,
              unitNumber: unitInput.unitNumber,
              squareFeet: unitInput.squareFeet,
              description: unitInput.description,
              isAvailable: true,
            })
            .returning();

          // Create commercial details
          await tx
            .insert(commercialUnitDetails)
            .values({
              unitId: createdUnit.id,
              unitType: unitInput.commercialDetails.unitType,
              floorNumber: unitInput.commercialDetails.floorNumber,
              suiteNumber: unitInput.commercialDetails.suiteNumber,
              ceilingHeight: unitInput.commercialDetails.ceilingHeight?.toString(),
              maxOccupancy: unitInput.commercialDetails.maxOccupancy
            });

          // Add amenities if provided
          if (unitInput.amenityIds && unitInput.amenityIds.length > 0) {
            await tx.insert(unitAmenities).values(
              unitInput.amenityIds.map(amenityId => ({
                unitId: createdUnit.id,
                amenityId,
              }))
            );
          }

          results.push(createdUnit);
        }

        return results;
      });
    }

    return {
      created: createdUnits,
      failed: failedUnits,
      totalProcessed: unitNumbers.length,
    };
  }

  /**
   * Bulk create units (auto-detects property type)
   */
  static async createBulkUnits(landlordId: string, bulkData: { propertyId: string; units: any[] }) {
    const propertyType = await this.getPropertyType(bulkData.propertyId);

    if (!propertyType) {
      throw new Error('Property not found');
    }

    if (propertyType === 'residential') {
      // Transform units to residential format if needed
      const residentialUnits = bulkData.units.map(unit => ({
        ...unit,
        residentialDetails: unit.residentialDetails || {
          unitType: 'apartment' as const,
          bedrooms: unit.bedrooms || 1,
          bathrooms: unit.bathrooms || 1,
        },
      }));

      return this.createBulkResidentialUnits(landlordId, {
        propertyId: bulkData.propertyId,
        units: residentialUnits,
      });
    } else {
      // Transform units to commercial format if needed
      const commercialUnits = bulkData.units.map(unit => ({
        ...unit,
        commercialDetails: unit.commercialDetails || {
          unitType: 'office' as const,
        },
      }));

      return this.createBulkCommercialUnits(landlordId, {
        propertyId: bulkData.propertyId,
        units: commercialUnits,
      });
    }
  }

  /**
   * Get all units for a landlord with their type-specific details
   */
  static async getLandlordUnits(landlordId: string, filters?: {
    propertyId?: string;
    isAvailable?: boolean;
    minBedrooms?: number;
    maxRent?: number;
  }) {
    // Build base query conditions
    let whereConditions = [eq(properties.landlordId, landlordId)];

    if (filters?.propertyId) {
      whereConditions.push(eq(properties.id, filters.propertyId));
    }
    if (filters?.isAvailable !== undefined) {
      whereConditions.push(eq(units.isAvailable, filters.isAvailable));
    }

    // Get all units with property info
    const unitResults = await db
      .select({
        unit: units,
        property: properties,
        currentLease: leases,
      })
      .from(units)
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .leftJoin(
        leases,
        and(
          eq(units.id, leases.unitId),
          eq(leases.status, 'active')
        )
      )
      .where(and(...whereConditions))
      .orderBy(asc(properties.name), asc(units.unitNumber));

    // Fetch type-specific details and amenities for each unit
    const enrichedUnits = await Promise.all(
      unitResults.map(async (row) => {
        const propertyType = row.property.type;
        let details = null;

        if (propertyType === 'residential') {
          const [resDetails] = await db
            .select()
            .from(residentialUnitDetails)
            .where(eq(residentialUnitDetails.unitId, row.unit.id))
            .limit(1);
          details = resDetails ? {
            ...resDetails,
            bathrooms: resDetails.bathrooms,
          } : null;
        } else if (propertyType === 'commercial') {
          const [comDetails] = await db
            .select()
            .from(commercialUnitDetails)
            .where(eq(commercialUnitDetails.unitId, row.unit.id))
            .limit(1);
          details = comDetails ? {
            ...comDetails,
            ceilingHeight: comDetails.ceilingHeight ? parseFloat(comDetails.ceilingHeight) : null,
          } : null;
        }

        // Fetch amenities
        const unitAmenitiesList = await db
          .select({
            id: amenities.id,
            name: amenities.name,
            type: amenities.type,
          })
          .from(unitAmenities)
          .innerJoin(amenities, eq(unitAmenities.amenityId, amenities.id))
          .where(eq(unitAmenities.unitId, row.unit.id));

        return {
          ...row.unit,
          propertyType,
          property: row.property,
          currentLease: row.currentLease,
          details,
          amenities: unitAmenitiesList,
        };
      })
    );

    // Apply post-query filters (for residential-specific filters)
    let filteredUnits = enrichedUnits;

    if (filters?.minBedrooms) {
      filteredUnits = filteredUnits.filter(u => {
        if (u.propertyType === 'residential' && u.details) {
          return (u.details as any).bedrooms >= filters.minBedrooms!;
        }
        return true;
      });
    }

    return filteredUnits;
  }

  /**
   * Get unit details with all related information
   */
  static async getUnitDetails(landlordId: string, unitId: string) {
    // Verify ownership
    const ownsUnit = await OwnershipService.isLandlordOwnerOfUnit(landlordId, unitId);
    if (!ownsUnit) {
      throw new Error('You can only view details of your own units');
    }

    // Get unit with property
    const [unitInfo] = await db
      .select({
        unit: units,
        property: properties,
      })
      .from(units)
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .where(eq(units.id, unitId))
      .limit(1);

    if (!unitInfo) {
      return null;
    }

    const propertyType = unitInfo.property.type;
    let details = null;

    // Get type-specific details
    if (propertyType === 'residential') {
      const [resDetails] = await db
        .select()
        .from(residentialUnitDetails)
        .where(eq(residentialUnitDetails.unitId, unitId))
        .limit(1);
      details = resDetails ? {
        ...resDetails,
        bathrooms: resDetails.bathrooms,
      } : null;
    } else if (propertyType === 'commercial') {
      const [comDetails] = await db
        .select()
        .from(commercialUnitDetails)
        .where(eq(commercialUnitDetails.unitId, unitId))
        .limit(1);
      details = comDetails ? {
        ...comDetails,
        ceilingHeight: comDetails.ceilingHeight ? parseFloat(comDetails.ceilingHeight) : null,
      } : null;
    }

    // Get amenities
    const unitAmenitiesList = await db
      .select({
        id: amenities.id,
        name: amenities.name,
        type: amenities.type,
      })
      .from(unitAmenities)
      .innerJoin(amenities, eq(unitAmenities.amenityId, amenities.id))
      .where(eq(unitAmenities.unitId, unitId));

    // Get current lease with tenant
    const [currentLease] = await db
      .select()
      .from(leases)
      .where(
        and(
          eq(leases.unitId, unitId),
          eq(leases.status, 'active')
        )
      )
      .limit(1);

    // Get lease history
    const leaseHistory = await db
      .select()
      .from(leases)
      .where(eq(leases.unitId, unitId))
      .orderBy(asc(leases.startDate));

    return {
      unit: unitInfo.unit,
      propertyType,
      property: unitInfo.property,
      details,
      amenities: unitAmenitiesList,
      currentLease,
      leaseHistory,
    };
  }

  /**
   * Update a residential unit
   */
  static async updateResidentialUnit(landlordId: string, unitId: string, updates: UpdateResidentialUnitInput) {
    // Verify ownership
    const ownsUnit = await OwnershipService.isLandlordOwnerOfUnit(landlordId, unitId);
    if (!ownsUnit) {
      throw new Error('You can only update your own units');
    }

    // Verify unit is residential
    const unitDetails = await this.getUnitDetails(landlordId, unitId);
    if (unitDetails?.propertyType !== 'residential') {
      throw new Error('This is not a residential unit');
    }

    // Check for duplicate unit number if updating
    if (updates.unitNumber) {
      const [existingUnit] = await db
        .select()
        .from(units)
        .where(
          and(
            eq(units.propertyId, unitDetails.property.id),
            eq(units.unitNumber, updates.unitNumber)
          )
        )
        .limit(1);

      if (existingUnit && existingUnit.id !== unitId) {
        throw new Error('A unit with this number already exists in this property');
      }
    }

    await db.transaction(async (tx) => {
      // Update base unit fields
      const baseUpdates: any = { updatedAt: new Date() };
      if (updates.unitNumber !== undefined) baseUpdates.unitNumber = updates.unitNumber;
      if (updates.squareFeet !== undefined) baseUpdates.squareFeet = updates.squareFeet;
      if (updates.isAvailable !== undefined) baseUpdates.isAvailable = updates.isAvailable;
      if (updates.description !== undefined) baseUpdates.description = updates.description;

      await tx.update(units).set(baseUpdates).where(eq(units.id, unitId));

      // Update residential details if provided
      if (updates.residentialDetails) {
        const detailUpdates: any = {};
        if (updates.residentialDetails.unitType !== undefined) {
          detailUpdates.unitType = updates.residentialDetails.unitType;
        }
        if (updates.residentialDetails.bedrooms !== undefined) {
          detailUpdates.bedrooms = updates.residentialDetails.bedrooms;
        }
        if (updates.residentialDetails.bathrooms !== undefined) {
          detailUpdates.bathrooms = updates.residentialDetails.bathrooms;
        }
        if (updates.residentialDetails.hasBalcony !== undefined) {
          detailUpdates.hasBalcony = updates.residentialDetails.hasBalcony;
        }
        if (updates.residentialDetails.floorNumber !== undefined) {
          detailUpdates.floorNumber = updates.residentialDetails.floorNumber;
        }
        if (updates.residentialDetails.isFurnished !== undefined) {
          detailUpdates.isFurnished = updates.residentialDetails.isFurnished;
        }

        if (Object.keys(detailUpdates).length > 0) {
          await tx
            .update(residentialUnitDetails)
            .set(detailUpdates)
            .where(eq(residentialUnitDetails.unitId, unitId));
        }
      }

      // Update amenities if provided
      if (updates.amenityIds) {
        await tx.delete(unitAmenities).where(eq(unitAmenities.unitId, unitId));
        if (updates.amenityIds.length > 0) {
          await tx.insert(unitAmenities).values(
            updates.amenityIds.map(amenityId => ({
              unitId,
              amenityId,
            }))
          );
        }
      }
    });

    return this.getUnitDetails(landlordId, unitId);
  }

  /**
   * Update a commercial unit
   */
  static async updateCommercialUnit(landlordId: string, unitId: string, updates: UpdateCommercialUnitInput) {
    // Verify ownership
    const ownsUnit = await OwnershipService.isLandlordOwnerOfUnit(landlordId, unitId);
    if (!ownsUnit) {
      throw new Error('You can only update your own units');
    }

    // Verify unit is commercial
    const unitDetails = await this.getUnitDetails(landlordId, unitId);
    if (unitDetails?.propertyType !== 'commercial') {
      throw new Error('This is not a commercial unit');
    }

    // Check for duplicate unit number if updating
    if (updates.unitNumber) {
      const [existingUnit] = await db
        .select()
        .from(units)
        .where(
          and(
            eq(units.propertyId, unitDetails.property.id),
            eq(units.unitNumber, updates.unitNumber)
          )
        )
        .limit(1);

      if (existingUnit && existingUnit.id !== unitId) {
        throw new Error('A unit with this number already exists in this property');
      }
    }

    await db.transaction(async (tx) => {
      // Update base unit fields
      const baseUpdates: any = { updatedAt: new Date() };
      if (updates.unitNumber !== undefined) baseUpdates.unitNumber = updates.unitNumber;
      if (updates.squareFeet !== undefined) baseUpdates.squareFeet = updates.squareFeet;
      if (updates.isAvailable !== undefined) baseUpdates.isAvailable = updates.isAvailable;
      if (updates.description !== undefined) baseUpdates.description = updates.description;

      await tx.update(units).set(baseUpdates).where(eq(units.id, unitId));

      // Update commercial details if provided
      if (updates.commercialDetails) {
        const detailUpdates: any = {};
        if (updates.commercialDetails.unitType !== undefined) {
          detailUpdates.unitType = updates.commercialDetails.unitType;
        }
        if (updates.commercialDetails.floorNumber !== undefined) {
          detailUpdates.floorNumber = updates.commercialDetails.floorNumber;
        }
        if (updates.commercialDetails.suiteNumber !== undefined) {
          detailUpdates.suiteNumber = updates.commercialDetails.suiteNumber;
        }
        if (updates.commercialDetails.ceilingHeight !== undefined) {
          detailUpdates.ceilingHeight = updates.commercialDetails.ceilingHeight.toString();
        }
        if (updates.commercialDetails.maxOccupancy !== undefined) {
          detailUpdates.maxOccupancy = updates.commercialDetails.maxOccupancy;
        }

        if (Object.keys(detailUpdates).length > 0) {
          await tx
            .update(commercialUnitDetails)
            .set(detailUpdates)
            .where(eq(commercialUnitDetails.unitId, unitId));
        }
      }

      // Update amenities if provided
      if (updates.amenityIds) {
        await tx.delete(unitAmenities).where(eq(unitAmenities.unitId, unitId));
        if (updates.amenityIds.length > 0) {
          await tx.insert(unitAmenities).values(
            updates.amenityIds.map(amenityId => ({
              unitId,
              amenityId,
            }))
          );
        }
      }
    });

    return this.getUnitDetails(landlordId, unitId);
  }

  /**
   * Update a unit (auto-detects type)
   */
  static async updateUnit(landlordId: string, unitId: string, updates: any) {
    const unitDetails = await this.getUnitDetails(landlordId, unitId);

    if (!unitDetails) {
      throw new Error('Unit not found');
    }

    if (unitDetails.propertyType === 'residential') {
      return this.updateResidentialUnit(landlordId, unitId, updates);
    } else {
      return this.updateCommercialUnit(landlordId, unitId, updates);
    }
  }

  /**
   * Get available units for lease assignment
   */
  static async getAvailableUnits(landlordId: string, propertyId?: string) {
    return this.getLandlordUnits(landlordId, {
      propertyId,
      isAvailable: true,
    });
  }

  /**
   * Get unit analytics
   */
  static async getUnitsAnalytics(landlordId: string, propertyId?: string) {
    const allUnits = await this.getLandlordUnits(landlordId, propertyId ? { propertyId } : undefined);

    const totalUnits = allUnits.length;
    const occupiedUnits = allUnits.filter(u => u.currentLease?.id).length;
    const availableUnits = totalUnits - occupiedUnits;
    const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

    // Group by property type
    const residentialUnits = allUnits.filter(u => u.propertyType === 'residential');
    const commercialUnits = allUnits.filter(u => u.propertyType === 'commercial');

    // Group residential by bedrooms
    const unitsByBedrooms = residentialUnits.reduce((acc, unit) => {
      const bedrooms = (unit.details as any)?.bedrooms || 0;
      acc[bedrooms] = (acc[bedrooms] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    // Group commercial by type
    const unitsByCommercialType = commercialUnits.reduce((acc, unit) => {
      const unitType = (unit.details as any)?.unitType || 'other';
      acc[unitType] = (acc[unitType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalUnits,
      occupiedUnits,
      availableUnits,
      occupancyRate: Math.round(occupancyRate * 100) / 100,
      residentialCount: residentialUnits.length,
      commercialCount: commercialUnits.length,
      unitsByBedrooms,
      unitsByCommercialType,
    };
  }

  /**
   * Delete unit
   */
  static async deleteUnit(landlordId: string, unitId: string) {
    // Verify ownership
    const ownsUnit = await OwnershipService.isLandlordOwnerOfUnit(landlordId, unitId);
    if (!ownsUnit) {
      throw new Error('You can only delete your own units');
    }

    // Check for active leases
    const [activeLease] = await db
      .select({ id: leases.id })
      .from(leases)
      .where(
        and(
          eq(leases.unitId, unitId),
          eq(leases.status, 'active')
        )
      )
      .limit(1);

    if (activeLease) {
      throw new Error('Cannot delete unit with active leases');
    }

    // Delete (cascades will handle details and amenities)
    await db.delete(units).where(eq(units.id, unitId));

    return { success: true };
  }

  /**
   * Format residential unit for response
   */
  private static formatResidentialUnit(unit: any, details: any) {
    return {
      ...unit,
      propertyType: 'residential' as const,
      details,
    };
  }

  /**
   * Format commercial unit for response
   */
  private static formatCommercialUnit(unit: any, details: any) {
    return {
      ...unit,
      propertyType: 'commercial' as const,
      details: {
        ...details,
        ceilingHeight: details.ceilingHeight ? parseFloat(details.ceilingHeight) : null,
      },
    };
  }
}