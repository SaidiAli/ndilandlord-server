import { db } from '../db';
import { users, properties, units, leases, unitAmenities, amenities } from '../db/schema';
import { eq, and, desc, asc, gte, lte, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { OwnershipService } from '../db/ownership';

/**
 * Unit service for landlord-owned unit management and availability tracking
 */

export interface UnitCreationData {
  propertyId: string;
  unitNumber: string;
  bedrooms: number;
  bathrooms: number;
  squareFeet?: number;
  description?: string;
  amenityIds?: string[];
}

export interface UnitUpdateData {
  unitNumber?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFeet?: number;
  isAvailable?: boolean;
  description?: string;
  amenityIds?: string[];
}

export interface UnitWithDetails {
  unit: any;
  property: any;
  currentLease?: any;
  currentTenant?: any;
  amenities: any[];
  leaseHistory: any[];
  analytics: {
    occupancyRate: number;
    totalRevenue: number;
    averageLeaseLength: number;
    daysVacant: number;
  };
}

export const unitUpdateSchema = z.object({
  unitNumber: z.string().min(1, 'Unit number is required').optional(),
  bedrooms: z.number().int().min(0, 'Bedrooms must be non-negative').optional(),
  bathrooms: z.number().min(0, 'Bathrooms must be non-negative').optional(),
  squareFeet: z.number().int().positive('Square feet must be positive').optional(),
  isAvailable: z.boolean().optional(),
  description: z.string().optional(),
  amenityIds: z.array(z.string().uuid()).optional(),
});

export const bulkUnitCreationSchema = z.object({
  propertyId: z.string().uuid('Invalid property ID'),
  units: z.array(z.object({
    unitNumber: z.string().min(1),
    bedrooms: z.number().int().min(0),
    bathrooms: z.number().min(0),
    squareFeet: z.number().int().positive().optional(),
    description: z.string().optional(),
    amenityIds: z.array(z.string().uuid()).optional(),
  })).min(1, 'At least one unit is required'),
});

export class UnitService {
  /**
   * Create a new unit for a landlord's property
   */
  static async createUnit(landlordId: string, unitData: UnitCreationData) {
    try {
      // Verify landlord owns the property
      const ownsProperty = await OwnershipService.isLandlordOwnerOfProperty(
        landlordId,
        unitData.propertyId
      );

      if (!ownsProperty) {
        throw new Error('You can only create units in your own properties');
      }

      // Check for duplicate unit numbers in the same property
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

      // Create the unit
      const newUnit = await db.transaction(async (tx) => {
        const [createdUnit] = await tx
          .insert(units)
          .values({
            propertyId: unitData.propertyId,
            unitNumber: unitData.unitNumber,
            bedrooms: unitData.bedrooms,
            bathrooms: unitData.bathrooms.toString(),
            squareFeet: unitData.squareFeet,
            description: unitData.description,
            isAvailable: true, // New units are always available initially
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

        return createdUnit;
      });

      return newUnit;
    } catch (error) {
      console.error('Error creating unit:', error);
      throw error;
    }
  }

  /**
   * Create multiple units at once (bulk creation)
   */
  static async createBulkUnits(landlordId: string, bulkData: {
    propertyId: string;
    units: Array<Omit<UnitCreationData, 'propertyId'>>;
  }) {
    try {
      // Validate input
      const validatedData = bulkUnitCreationSchema.parse({
        propertyId: bulkData.propertyId,
        units: bulkData.units,
      });

      // Verify landlord owns the property
      const ownsProperty = await OwnershipService.isLandlordOwnerOfProperty(
        landlordId,
        validatedData.propertyId
      );

      if (!ownsProperty) {
        throw new Error('You can only create units in your own properties');
      }

      // Check for duplicate unit numbers within the request
      const unitNumbers = validatedData.units.map(u => u.unitNumber);
      const duplicatesInRequest = unitNumbers.filter((item, index) => unitNumbers.indexOf(item) !== index);

      if (duplicatesInRequest.length > 0) {
        throw new Error(`Duplicate unit numbers in request: ${duplicatesInRequest.join(', ')}`);
      }

      // Check for existing units in the database efficiently
      const existingUnits = await db
        .select({ unitNumber: units.unitNumber })
        .from(units)
        .where(
          and(
            eq(units.propertyId, validatedData.propertyId),
            inArray(units.unitNumber, unitNumbers)
          )
        );

      const existingNumbers = existingUnits.map(u => u.unitNumber);

      // Filter out units that already exist
      const unitsToCreate = validatedData.units
        .filter(unit => !existingNumbers.includes(unit.unitNumber));

      const failedUnits = existingNumbers.map(num => ({
        unitNumber: num,
        reason: 'Unit number already exists'
      }));

      let createdUnits: any[] = [];

      if (unitsToCreate.length > 0) {
        createdUnits = await db.transaction(async (tx) => {
          const newUnits = [];
          for (const unit of unitsToCreate) {
            const [created] = await tx
              .insert(units)
              .values({
                propertyId: validatedData.propertyId,
                unitNumber: unit.unitNumber,
                bedrooms: unit.bedrooms,
                bathrooms: unit.bathrooms.toString(),
                squareFeet: unit.squareFeet,
                description: unit.description,
                isAvailable: true,
              })
              .returning();

            if (unit.amenityIds && unit.amenityIds.length > 0) {
              await tx.insert(unitAmenities).values(
                unit.amenityIds.map(id => ({
                  unitId: created.id,
                  amenityId: id
                }))
              );
            }
            newUnits.push(created);
          }
          return newUnits;
        });
      }

      return {
        created: createdUnits,
        failed: failedUnits,
        totalProcessed: unitNumbers.length
      };
    } catch (error) {
      console.error('Error creating bulk units:', error);
      throw error;
    }
  }

  /**
   * Get all units for a landlord (across all properties or filtered by property)
   */
  static async getLandlordUnits(landlordId: string, filters?: {
    propertyId?: string;
    isAvailable?: boolean;
    minBedrooms?: number;
    maxRent?: number;
  }) {
    try {
      let query = db
        .select({
          unit: units,
          property: properties,
          currentLease: leases,
          tenant: users,
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
        .leftJoin(users, eq(leases.tenantId, users.id))
        .where(eq(properties.landlordId, landlordId))
        .orderBy(asc(properties.name), asc(units.unitNumber));

      // Apply filters if provided
      let whereConditions = [eq(properties.landlordId, landlordId)];

      if (filters?.propertyId) {
        whereConditions.push(eq(properties.id, filters.propertyId));
      }

      if (filters?.isAvailable !== undefined) {
        whereConditions.push(eq(units.isAvailable, filters.isAvailable));
      }

      // Add additional filters
      if (filters?.minBedrooms) {
        whereConditions.push(gte(units.bedrooms, filters.minBedrooms));
      }

      if (filters?.maxRent) {
        whereConditions.push(lte(leases.monthlyRent, filters.maxRent.toString()));
      }

      // Rebuild query with all conditions if there are additional filters
      if (whereConditions.length > 1) {
        query = db
          .select({
            unit: units,
            property: properties,
            currentLease: leases,
            tenant: users,
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
          .leftJoin(users, eq(leases.tenantId, users.id))
          .where(and(...whereConditions))
          .orderBy(asc(properties.name), asc(units.unitNumber));
      }

      const result = await query;

      // Ideally we would join unitAmenities here, but to avoid N+1 query complexity in a single query with Drizzle without relationships fully loaded, 
      // we can fetch amenities separately or use relations query if we used query builder.
      // For now, let's keep it simple and maybe NOT fetch amenities for the list view to keep it fast, 
      // or fetch them if needed. The list view probably doesn't show all amenities.
      // Unit details view DOES need them.
      // Let's stick to the current plan: list view doesn't necessarily need amenities.

      return result.map(row => ({
        ...row.unit,
        bathrooms: parseFloat(row.unit.bathrooms),
        property: row.property,
        currentLease: row.currentLease,
        currentTenant: row.tenant ? {
          id: row.tenant.id,
          firstName: row.tenant.firstName,
          lastName: row.tenant.lastName,
          email: row.tenant.email,
          phone: row.tenant.phone,
        } : undefined,
      }));
    } catch (error) {
      console.error('Error fetching landlord units:', error);
      throw error;
    }
  }

  /**
   * Get detailed unit information with analytics
   */
  static async getUnitDetails(landlordId: string, unitId: string): Promise<UnitWithDetails | null> {
    try {
      // Verify ownership
      const ownsUnit = await OwnershipService.isLandlordOwnerOfUnit(landlordId, unitId);
      if (!ownsUnit) {
        throw new Error('You can only view details of your own units');
      }

      // Get unit basic information
      const unitInfo = await db
        .select({
          unit: units,
          property: properties,
        })
        .from(units)
        .innerJoin(properties, eq(units.propertyId, properties.id))
        .where(
          and(
            eq(units.id, unitId),
            eq(properties.landlordId, landlordId)
          )
        )
        .limit(1);

      if (unitInfo.length === 0) {
        return null;
      }

      // Get amenities
      const unitAmenitiesList = await db
        .select({
          id: amenities.id,
          name: amenities.name
        })
        .from(unitAmenities)
        .innerJoin(amenities, eq(unitAmenities.amenityId, amenities.id))
        .where(eq(unitAmenities.unitId, unitId));

      // Get current active lease and tenant
      const currentLease = await db
        .select({
          lease: leases,
          tenant: users
        })
        .from(leases)
        .innerJoin(users, eq(leases.tenantId, users.id))
        .where(
          and(
            eq(leases.unitId, unitId),
            eq(leases.status, 'active')
          )
        )
        .limit(1);

      // Get lease history
      const leaseHistory = await db
        .select({
          lease: leases,
          tenant: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
          },
        })
        .from(leases)
        .innerJoin(users, eq(leases.tenantId, users.id))
        .where(eq(leases.unitId, unitId))
        .orderBy(desc(leases.startDate));

      // Calculate analytics
      const analytics = await this.calculateUnitAnalytics(unitId, leaseHistory);

      const unitDetails: UnitWithDetails = {
        unit: {
          ...unitInfo[0].unit,
          bathrooms: parseFloat(unitInfo[0].unit.bathrooms)
        },
        property: unitInfo[0].property,
        amenities: unitAmenitiesList,
        currentLease: currentLease.length > 0 ? currentLease[0].lease : undefined,
        currentTenant: currentLease.length > 0 ? currentLease[0].tenant : undefined,
        leaseHistory,
        analytics,
      };

      return unitDetails;
    } catch (error) {
      console.error('Error fetching unit details:', error);
      throw error;
    }
  }

  /**
   * Update unit information
   */
  static async updateUnit(landlordId: string, unitId: string, updates: UnitUpdateData) {
    try {
      // Validate input
      const validatedUpdates = unitUpdateSchema.parse(updates);

      // Verify ownership
      const ownsUnit = await OwnershipService.isLandlordOwnerOfUnit(landlordId, unitId);
      if (!ownsUnit) {
        throw new Error('You can only update your own units');
      }

      // If updating unit number, check for duplicates
      if (validatedUpdates.unitNumber) {
        const unitInfo = await db
          .select({ propertyId: units.propertyId })
          .from(units)
          .where(eq(units.id, unitId))
          .limit(1);

        if (unitInfo.length > 0) {
          const existingUnit = await db
            .select()
            .from(units)
            .where(
              and(
                eq(units.propertyId, unitInfo[0].propertyId),
                eq(units.unitNumber, validatedUpdates.unitNumber)
              )
            )
            .limit(1);

          if (existingUnit.length > 0 && existingUnit[0].id !== unitId) {
            throw new Error('A unit with this number already exists in this property');
          }
        }
      }

      // Convert numeric fields to strings for database storage
      const updateData: any = { ...validatedUpdates };
      delete updateData.amenityIds; // Remove amenityIds from unit update data as it handles separately

      if (updateData.bathrooms) {
        updateData.bathrooms = updateData.bathrooms.toString();
      }
      if (updateData.monthlyRent) {
        updateData.monthlyRent = updateData.monthlyRent.toString();
      }
      if (updateData.deposit) {
        updateData.deposit = updateData.deposit.toString();
      }
      updateData.updatedAt = new Date();

      const updatedUnit = await db.transaction(async (tx) => {
        let uUnit = null;
        if (Object.keys(updateData).length > 1) { // 1 because updatedAt is always there
          const [res] = await tx
            .update(units)
            .set(updateData)
            .where(eq(units.id, unitId))
            .returning();
          uUnit = res;
        } else {
          // Fetch existing if no update to fields
          const [res] = await tx.select().from(units).where(eq(units.id, unitId));
          uUnit = res;
        }

        // Handle amenity updates
        if (validatedUpdates.amenityIds) {
          // Delete existing
          await tx.delete(unitAmenities).where(eq(unitAmenities.unitId, unitId));

          // Insert new
          if (validatedUpdates.amenityIds.length > 0) {
            await tx.insert(unitAmenities).values(
              validatedUpdates.amenityIds.map(amenityId => ({
                unitId,
                amenityId
              }))
            );
          }
        }
        return uUnit;
      });

      return updatedUnit;
    } catch (error) {
      console.error('Error updating unit:', error);
      throw error;
    }
  }

  /**
   * Get available units for lease assignment
   */
  static async getAvailableUnits(landlordId: string, propertyId?: string) {
    try {
      const filters = {
        propertyId,
        isAvailable: true,
      };

      return await this.getLandlordUnits(landlordId, filters);
    } catch (error) {
      console.error('Error fetching available units:', error);
      throw error;
    }
  }

  /**
   * Get unit analytics for landlord dashboard
   */
  static async getUnitsAnalytics(landlordId: string, propertyId?: string) {
    try {
      const allUnits = await this.getLandlordUnits(landlordId, propertyId ? { propertyId } : undefined);

      const totalUnits = allUnits.length;
      const occupiedUnits = allUnits.filter(u => u.currentLease?.id).length;
      const availableUnits = totalUnits - occupiedUnits;
      const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

      // Unit type distribution
      const unitsByBedrooms = allUnits.reduce((acc, unit) => {
        const bedrooms = unit.bedrooms;
        acc[bedrooms] = (acc[bedrooms] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);

      return {
        totalUnits,
        occupiedUnits,
        availableUnits,
        occupancyRate: Math.round(occupancyRate * 100) / 100,
        unitsByBedrooms,
      };
    } catch (error) {
      console.error('Error calculating units analytics:', error);
      throw error;
    }
  }

  /**
   * Calculate individual unit analytics
   */
  private static async calculateUnitAnalytics(unitId: string, leaseHistory: any[]) {
    try {
      const totalLeases = leaseHistory.length;
      let totalRevenue = 0;
      let totalDaysOccupied = 0;
      let totalDaysVacant = 0;

      if (totalLeases > 0) {
        // Calculate total revenue and occupancy
        leaseHistory.forEach(({ lease }) => {
          if (lease.status === 'completed' || lease.status === 'terminated') {
            const startDate = new Date(lease.startDate);
            const endDate = new Date(lease.endDate);
            const daysOccupied = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            const monthlyRent = parseFloat(lease.monthlyRent);

            totalDaysOccupied += daysOccupied;
            totalRevenue += (daysOccupied / 30) * monthlyRent; // Approximate monthly to daily
          }
        });

        // Calculate vacancy days (simplified - time between leases)
        const unitCreated = new Date(); // Placeholder
        const totalDaysSinceCreation = Math.ceil((new Date().getTime() - unitCreated.getTime()) / (1000 * 60 * 60 * 24));
        totalDaysVacant = Math.max(0, totalDaysSinceCreation - totalDaysOccupied);
      }

      const occupancyRate = totalDaysOccupied > 0
        ? (totalDaysOccupied / (totalDaysOccupied + totalDaysVacant)) * 100
        : 0;

      const averageLeaseLength = totalLeases > 0
        ? totalDaysOccupied / totalLeases
        : 0;

      return {
        occupancyRate: Math.round(occupancyRate * 100) / 100,
        totalRevenue,
        averageLeaseLength: Math.round(averageLeaseLength),
        daysVacant: totalDaysVacant,
      };
    } catch (error) {
      console.error('Error calculating unit analytics:', error);
      return {
        occupancyRate: 0,
        totalRevenue: 0,
        averageLeaseLength: 0,
        daysVacant: 0,
      };
    }
  }

  /**
   * Delete unit (with safety checks)
   */
  static async deleteUnit(landlordId: string, unitId: string) {
    try {
      // Verify ownership
      const ownsUnit = await OwnershipService.isLandlordOwnerOfUnit(landlordId, unitId);
      if (!ownsUnit) {
        throw new Error('You can only delete your own units');
      }

      // Check if unit has any active leases
      const activeLeases = await db
        .select({ id: leases.id })
        .from(leases)
        .where(
          and(
            eq(leases.unitId, unitId),
            eq(leases.status, 'active')
          )
        );

      if (activeLeases.length > 0) {
        throw new Error('Cannot delete unit with active leases');
      }

      // Delete the unit
      // Note: cascades should handle unitAmenities but let's be safe.
      // Actually Drizzle doesn't do cascades automatically unless defined in DB.
      // We should check schema.

      await db.transaction(async (tx) => {
        await tx.delete(unitAmenities).where(eq(unitAmenities.unitId, unitId));
        await tx.delete(units).where(eq(units.id, unitId));
      });

      return { success: true };
    } catch (error) {
      console.error('Error deleting unit:', error);
      throw error;
    }
  }
}