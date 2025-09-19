import { db } from '../db';
import { users, properties, units, leases } from '../db/schema';
import { eq, and, desc, asc, gte, lte } from 'drizzle-orm';
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
  monthlyRent: number;
  deposit: number;
  description?: string;
}

export interface UnitUpdateData {
  unitNumber?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFeet?: number;
  monthlyRent?: number;
  deposit?: number;
  isAvailable?: boolean;
  description?: string;
}

export interface UnitWithDetails {
  unit: any;
  property: any;
  currentLease?: any;
  currentTenant?: any;
  leaseHistory: any[];
  analytics: {
    occupancyRate: number;
    totalRevenue: number;
    averageLeaseLength: number;
    daysVacant: number;
  };
}

// Validation schemas
export const unitCreationSchema = z.object({
  propertyId: z.string().uuid('Invalid property ID'),
  unitNumber: z.string().min(1, 'Unit number is required'),
  bedrooms: z.number().int().min(0, 'Bedrooms must be non-negative'),
  bathrooms: z.number().min(0, 'Bathrooms must be non-negative'),
  squareFeet: z.number().int().positive('Square feet must be positive').optional(),
  monthlyRent: z.number().positive('Monthly rent must be positive'),
  deposit: z.number().min(0, 'Deposit cannot be negative'),
  description: z.string().optional(),
});

export const unitUpdateSchema = z.object({
  unitNumber: z.string().min(1, 'Unit number is required').optional(),
  bedrooms: z.number().int().min(0, 'Bedrooms must be non-negative').optional(),
  bathrooms: z.number().min(0, 'Bathrooms must be non-negative').optional(),
  squareFeet: z.number().int().positive('Square feet must be positive').optional(),
  monthlyRent: z.number().positive('Monthly rent must be positive').optional(),
  deposit: z.number().min(0, 'Deposit cannot be negative').optional(),
  isAvailable: z.boolean().optional(),
  description: z.string().optional(),
});

export const bulkUnitCreationSchema = z.object({
  propertyId: z.string().uuid('Invalid property ID'),
  units: z.array(z.object({
    unitNumber: z.string().min(1),
    bedrooms: z.number().int().min(0),
    bathrooms: z.number().min(0),
    squareFeet: z.number().int().positive().optional(),
    monthlyRent: z.number().positive(),
    deposit: z.number().min(0),
    description: z.string().optional(),
  })).min(1, 'At least one unit is required'),
});

export class UnitService {
  /**
   * Create a new unit for a landlord's property
   */
  static async createUnit(landlordId: string, unitData: UnitCreationData) {
    try {
      // Validate input
      const validatedData = unitCreationSchema.parse(unitData);

      // Verify landlord owns the property
      const ownsProperty = await OwnershipService.isLandlordOwnerOfProperty(
        landlordId,
        validatedData.propertyId
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
            eq(units.propertyId, validatedData.propertyId),
            eq(units.unitNumber, validatedData.unitNumber)
          )
        )
        .limit(1);

      if (existingUnit.length > 0) {
        throw new Error('A unit with this number already exists in this property');
      }

      // Create the unit
      const newUnit = await db
        .insert(units)
        .values({
          propertyId: validatedData.propertyId,
          unitNumber: validatedData.unitNumber,
          bedrooms: validatedData.bedrooms,
          bathrooms: validatedData.bathrooms.toString(),
          squareFeet: validatedData.squareFeet,
          monthlyRent: validatedData.monthlyRent.toString(),
          deposit: validatedData.deposit.toString(),
          description: validatedData.description,
          isAvailable: true, // New units are always available initially
        })
        .returning({
          id: units.id,
          propertyId: units.propertyId,
          unitNumber: units.unitNumber,
          bedrooms: units.bedrooms,
          bathrooms: units.bathrooms,
          squareFeet: units.squareFeet,
          monthlyRent: units.monthlyRent,
          deposit: units.deposit,
          isAvailable: units.isAvailable,
          description: units.description,
          createdAt: units.createdAt,
        });

      return newUnit[0];
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

      // Check for duplicate unit numbers within the request and existing units
      const unitNumbers = validatedData.units.map(u => u.unitNumber);
      const duplicatesInRequest = unitNumbers.filter((item, index) => unitNumbers.indexOf(item) !== index);

      if (duplicatesInRequest.length > 0) {
        throw new Error(`Duplicate unit numbers in request: ${duplicatesInRequest.join(', ')}`);
      }

      const existingUnits = await db
        .select({ unitNumber: units.unitNumber })
        .from(units)
        .where(eq(units.propertyId, validatedData.propertyId));

      const existingNumbers = existingUnits.map(u => u.unitNumber);
      const duplicatesWithExisting = unitNumbers.filter(num => existingNumbers.includes(num));

      if (duplicatesWithExisting.length > 0) {
        throw new Error(`Unit numbers already exist: ${duplicatesWithExisting.join(', ')}`);
      }

      // Create all units
      const unitsToCreate = validatedData.units.map(unit => ({
        propertyId: validatedData.propertyId,
        unitNumber: unit.unitNumber,
        bedrooms: unit.bedrooms,
        bathrooms: unit.bathrooms.toString(),
        squareFeet: unit.squareFeet,
        monthlyRent: unit.monthlyRent.toString(),
        deposit: unit.deposit.toString(),
        description: unit.description,
        isAvailable: true,
      }));

      const createdUnits = await db
        .insert(units)
        .values(unitsToCreate)
        .returning({
          id: units.id,
          propertyId: units.propertyId,
          unitNumber: units.unitNumber,
          bedrooms: units.bedrooms,
          bathrooms: units.bathrooms,
          squareFeet: units.squareFeet,
          monthlyRent: units.monthlyRent,
          deposit: units.deposit,
          isAvailable: units.isAvailable,
          description: units.description,
          createdAt: units.createdAt,
        });

      return {
        created: createdUnits.length,
        units: createdUnits,
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
          unit: {
            id: units.id,
            unitNumber: units.unitNumber,
            bedrooms: units.bedrooms,
            bathrooms: units.bathrooms,
            squareFeet: units.squareFeet,
            monthlyRent: units.monthlyRent,
            deposit: units.deposit,
            isAvailable: units.isAvailable,
            description: units.description,
            createdAt: units.createdAt,
            updatedAt: units.updatedAt,
          },
          property: {
            id: properties.id,
            name: properties.name,
            address: properties.address,
            city: properties.city,
          },
          currentLease: {
            id: leases.id,
            status: leases.status,
            startDate: leases.startDate,
            endDate: leases.endDate,
          },
          tenant: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            phone: users.phone,
          },
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
        whereConditions.push(lte(units.monthlyRent, filters.maxRent.toString()));
      }

      // Rebuild query with all conditions if there are additional filters
      if (whereConditions.length > 1) {
        query = db
          .select({
            unit: {
              id: units.id,
              unitNumber: units.unitNumber,
              bedrooms: units.bedrooms,
              bathrooms: units.bathrooms,
              squareFeet: units.squareFeet,
              monthlyRent: units.monthlyRent,
              deposit: units.deposit,
              isAvailable: units.isAvailable,
              description: units.description,
              createdAt: units.createdAt,
              updatedAt: units.updatedAt,
            },
            property: {
              id: properties.id,
              name: properties.name,
              address: properties.address,
              city: properties.city,
            },
            currentLease: {
              id: leases.id,
              status: leases.status,
              startDate: leases.startDate,
              endDate: leases.endDate,
            },
            tenant: {
              id: users.id,
              firstName: users.firstName,
              lastName: users.lastName,
              email: users.email,
              phone: users.phone,
            },
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

      // Transform the nested result to flat Unit objects with property included
      return result.map(row => ({
        id: row.unit.id,
        propertyId: row.property.id,
        unitNumber: row.unit.unitNumber,
        bedrooms: row.unit.bedrooms,
        bathrooms: parseFloat(row.unit.bathrooms), // Convert string to number
        squareFeet: row.unit.squareFeet,
        monthlyRent: parseFloat(row.unit.monthlyRent), // Convert string to number
        deposit: parseFloat(row.unit.deposit), // Convert string to number  
        isAvailable: row.unit.isAvailable,
        description: row.unit.description,
        createdAt: row.unit.createdAt,
        updatedAt: row.unit.updatedAt,
        property: {
          id: row.property.id,
          name: row.property.name,
          address: row.property.address,
          city: row.property.city,
        },
        // Include current lease and tenant info if available
        currentLease: row.currentLease?.id ? {
          id: row.currentLease.id,
          status: row.currentLease.status,
          startDate: row.currentLease.startDate,
          endDate: row.currentLease.endDate,
        } : undefined,
        currentTenant: row.tenant?.id ? {
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
          unit: {
            id: units.id,
            unitNumber: units.unitNumber,
            bedrooms: units.bedrooms,
            bathrooms: units.bathrooms,
            squareFeet: units.squareFeet,
            monthlyRent: units.monthlyRent,
            deposit: units.deposit,
            isAvailable: units.isAvailable,
            description: units.description,
            createdAt: units.createdAt,
            updatedAt: units.updatedAt,
          },
          property: {
            id: properties.id,
            name: properties.name,
            address: properties.address,
            city: properties.city,
            state: properties.state,
            postalCode: properties.postalCode,
          },
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

      // Get current active lease and tenant
      const currentLease = await db
        .select({
          lease: {
            id: leases.id,
            startDate: leases.startDate,
            endDate: leases.endDate,
            monthlyRent: leases.monthlyRent,
            deposit: leases.deposit,
            status: leases.status,
            terms: leases.terms,
          },
          tenant: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            phone: users.phone,
            userName: users.userName,
          },
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
          lease: {
            id: leases.id,
            startDate: leases.startDate,
            endDate: leases.endDate,
            monthlyRent: leases.monthlyRent,
            status: leases.status,
            createdAt: leases.createdAt,
          },
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
        unit: unitInfo[0].unit,
        property: unitInfo[0].property,
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

      const updatedUnit = await db
        .update(units)
        .set(updateData)
        .where(eq(units.id, unitId))
        .returning({
          id: units.id,
          propertyId: units.propertyId,
          unitNumber: units.unitNumber,
          bedrooms: units.bedrooms,
          bathrooms: units.bathrooms,
          squareFeet: units.squareFeet,
          monthlyRent: units.monthlyRent,
          deposit: units.deposit,
          isAvailable: units.isAvailable,
          description: units.description,
          updatedAt: units.updatedAt,
        });

      return updatedUnit[0];
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

      // Revenue calculations
      const totalMonthlyRevenue = allUnits
        .filter(u => u.currentLease?.id)
        .reduce((sum, u) => sum + u.monthlyRent, 0);

      const potentialMonthlyRevenue = allUnits
        .reduce((sum, u) => sum + u.monthlyRent, 0);

      const revenueEfficiency = potentialMonthlyRevenue > 0
        ? (totalMonthlyRevenue / potentialMonthlyRevenue) * 100
        : 0;

      // Unit type distribution
      const unitsByBedrooms = allUnits.reduce((acc, unit) => {
        const bedrooms = unit.bedrooms;
        acc[bedrooms] = (acc[bedrooms] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);

      // Top performing units (by rent)
      const topPerformingUnits = allUnits
        .sort((a, b) => b.monthlyRent - a.monthlyRent)
        .slice(0, 5)
        .map(u => ({
          unitId: u.id,
          unitNumber: u.unitNumber,
          propertyName: u.property.name,
          monthlyRent: u.monthlyRent,
          isOccupied: !!u.currentLease?.id,
        }));

      return {
        totalUnits,
        occupiedUnits,
        availableUnits,
        occupancyRate: Math.round(occupancyRate * 100) / 100,
        totalMonthlyRevenue,
        potentialMonthlyRevenue,
        revenueEfficiency: Math.round(revenueEfficiency * 100) / 100,
        unitsByBedrooms,
        topPerformingUnits,
        averageRent: totalUnits > 0
          ? allUnits.reduce((sum, u) => sum + u.monthlyRent, 0) / totalUnits
          : 0,
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
        // This is a basic calculation - could be enhanced with more detailed vacancy tracking
        const unitCreated = new Date(); // Placeholder - would need unit creation date
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
      await db
        .delete(units)
        .where(eq(units.id, unitId));

      return { success: true };
    } catch (error) {
      console.error('Error deleting unit:', error);
      throw error;
    }
  }
}