import { db } from '../db';
import { users, properties, units, leases, residentialUnitDetails, commercialUnitDetails } from '../db/schema';
import { eq, and, count, desc, asc } from 'drizzle-orm';
import { z } from 'zod';
import { OwnershipService } from '../db/ownership';

/**
 * Property service for landlord-owned property management
 */

export interface PropertyCreationData {
  name: string;
  address: string;
  city: string;
  postalCode?: string;
  description?: string;
  type?: 'residential' | 'commercial';
  numberOfUnits?: number;
}

export interface PropertyUpdateData {
  name?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  description?: string;
  type?: 'residential' | 'commercial';
  numberOfUnits?: number;
}

export interface PropertyDashboardData {
  property: any;
  stats: {
    totalUnits: number;
    occupiedUnits: number;
    availableUnits: number;
    monthlyRevenue: number;
    occupancyRate?: number;
  };
  recentActivity: {
    newLeases: number;
    expiredLeases: number;
    maintenanceRequests: number;
  };
}

export class PropertyService {
  /**
   * Create a new property for a landlord
   */
  static async createProperty(landlordId: string, propertyData: PropertyCreationData) {
    try {
      const newProperty = await db
        .insert(properties)
        .values({
          ...propertyData,
          landlordId,
        })
        .returning({
          id: properties.id,
          name: properties.name,
          address: properties.address,
          city: properties.city,
          postalCode: properties.postalCode,
          description: properties.description,
          numberOfUnits: properties.numberOfUnits,
          landlordId: properties.landlordId,
          createdAt: properties.createdAt,
        });

      return newProperty[0];
    } catch (error) {
      console.error('Error creating property:', error);
      throw error;
    }
  }

  /**
   * Get all properties for a landlord
   */
  static async getLandlordProperties(landlordId: string, filters?: {
    city?: string;
  }) {
    try {
      let query = db
        .select({
          id: properties.id,
          name: properties.name,
          address: properties.address,
          city: properties.city,
          postalCode: properties.postalCode,
          description: properties.description,
          numberOfUnits: properties.numberOfUnits,
          createdAt: properties.createdAt,
          type: properties.type,
          updatedAt: properties.updatedAt,
        })
        .from(properties)
        .where(eq(properties.landlordId, landlordId))
        .orderBy(desc(properties.createdAt));

      // Apply filters if provided
      let whereConditions = [eq(properties.landlordId, landlordId)];

      if (filters?.city) {
        whereConditions.push(eq(properties.city, filters.city));
      }

      // Rebuild query with all conditions
      if (whereConditions.length > 1) {
        query = db
          .select({
            id: properties.id,
            name: properties.name,
            address: properties.address,
            city: properties.city,
            postalCode: properties.postalCode,
            description: properties.description,
            numberOfUnits: properties.numberOfUnits,
            createdAt: properties.createdAt,
            type: properties.type,
            updatedAt: properties.updatedAt,
          })
          .from(properties)
          .where(and(...whereConditions))
          .orderBy(desc(properties.createdAt));
      }

      return await query;
    } catch (error) {
      console.error('Error fetching landlord properties:', error);
      throw error;
    }
  }

  /**
   * Get detailed property information with stats
   */
  static async getPropertyDetails(landlordId: string, propertyId: string): Promise<PropertyDashboardData | null> {
    try {
      // Verify ownership
      const ownsProperty = await OwnershipService.isLandlordOwnerOfProperty(landlordId, propertyId);
      if (!ownsProperty) {
        throw new Error('You can only view your own properties');
      }

      // Get property basic info
      const property = await db
        .select()
        .from(properties)
        .where(
          and(
            eq(properties.id, propertyId),
            eq(properties.landlordId, landlordId)
          )
        )
        .limit(1);

      if (property.length === 0) {
        return null;
      }

      // Get units with lease information and type-specific details
      const propertyUnits = await db
        .select({
          unit: {
            id: units.id,
            unitNumber: units.unitNumber,
            squareFeet: units.squareFeet,
            isAvailable: units.isAvailable,
            description: units.description,
          },
          residentialDetails: {
            unitType: residentialUnitDetails.unitType,
            bedrooms: residentialUnitDetails.bedrooms,
            bathrooms: residentialUnitDetails.bathrooms,
            hasBalcony: residentialUnitDetails.hasBalcony,
            floorNumber: residentialUnitDetails.floorNumber,
            isFurnished: residentialUnitDetails.isFurnished,
          },
          commercialDetails: {
            unitType: commercialUnitDetails.unitType,
            floorNumber: commercialUnitDetails.floorNumber,
            suiteNumber: commercialUnitDetails.suiteNumber,
            ceilingHeight: commercialUnitDetails.ceilingHeight,
            maxOccupancy: commercialUnitDetails.maxOccupancy,
          },
          lease: {
            id: leases.id,
            status: leases.status,
            monthlyRent: leases.monthlyRent,
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
        .leftJoin(residentialUnitDetails, eq(units.id, residentialUnitDetails.unitId))
        .leftJoin(commercialUnitDetails, eq(units.id, commercialUnitDetails.unitId))
        .leftJoin(
          leases,
          and(
            eq(units.id, leases.unitId),
            eq(leases.status, 'active')
          )
        )
        .leftJoin(users, eq(leases.tenantId, users.id))
        .where(eq(units.propertyId, propertyId))
        .orderBy(asc(units.unitNumber));

      // Calculate statistics
      const totalUnits = property[0].numberOfUnits || propertyUnits.length;
      const occupiedUnits = propertyUnits.filter(u => u.lease?.id).length;
      const availableUnits = totalUnits - occupiedUnits;
      const monthlyRevenue = propertyUnits
        .filter(u => u.lease?.id)
        .reduce((sum, u) => sum + parseFloat(u.lease?.monthlyRent || '0'), 0);

      // Get recent activity (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentLeases = await db
        .select({ id: leases.id, status: leases.status })
        .from(leases)
        .innerJoin(units, eq(leases.unitId, units.id))
        .where(
          and(
            eq(units.propertyId, propertyId),
            // Add date filter here if needed
          )
        );

      const newLeases = recentLeases.filter(l => l.status === 'active').length;
      const expiredLeases = recentLeases.filter(l => l.status === 'expired').length;

      const dashboardData: PropertyDashboardData = {
        property: {
          ...property[0],
          units: propertyUnits,
        },
        stats: {
          totalUnits,
          occupiedUnits,
          availableUnits,
          monthlyRevenue
        },
        recentActivity: {
          newLeases,
          expiredLeases,
          maintenanceRequests: 0, // Post-MVP: Will be implemented with maintenance service
        },
      };

      return dashboardData;
    } catch (error) {
      console.error('Error fetching property details:', error);
      throw error;
    }
  }

  /**
   * Update property information
   */
  static async updateProperty(landlordId: string, propertyId: string, updates: PropertyUpdateData) {
    try {

      // Verify ownership
      const ownsProperty = await OwnershipService.isLandlordOwnerOfProperty(landlordId, propertyId);
      if (!ownsProperty) {
        throw new Error('You can only update your own properties');
      }

      const updatedProperty = await db
        .update(properties)
        .set({ ...updates, updatedAt: new Date() })
        .where(
          and(
            eq(properties.id, propertyId),
            eq(properties.landlordId, landlordId)
          )
        )
        .returning({
          id: properties.id,
          name: properties.name,
          address: properties.address,
          city: properties.city,
          postalCode: properties.postalCode,
          description: properties.description,
          numberOfUnits: properties.numberOfUnits,
          landlordId: properties.landlordId,
          updatedAt: properties.updatedAt,
        });

      return updatedProperty[0];
    } catch (error) {
      console.error('Error updating property:', error);
      throw error;
    }
  }

  /**
   * Get property by ID (with ownership validation)
   */
  static async getPropertyById(landlordId: string, propertyId: string) {
    try {
      // Verify ownership
      const ownsProperty = await OwnershipService.isLandlordOwnerOfProperty(landlordId, propertyId);
      if (!ownsProperty) {
        throw new Error('You can only view your own properties');
      }

      const property = await db
        .select({
          id: properties.id,
          name: properties.name,
          address: properties.address,
          city: properties.city,
          postalCode: properties.postalCode,
          description: properties.description,
          numberOfUnits: properties.numberOfUnits,
          landlordId: properties.landlordId,
          createdAt: properties.createdAt,
          updatedAt: properties.updatedAt,
        })
        .from(properties)
        .where(
          and(
            eq(properties.id, propertyId),
            eq(properties.landlordId, landlordId)
          )
        )
        .limit(1);

      return property.length > 0 ? property[0] : null;
    } catch (error) {
      console.error('Error fetching property:', error);
      throw error;
    }
  }

  /**
   * Get landlord dashboard summary across all properties
   */
  static async getLandlordDashboard(landlordId: string) {
    try {
      const properties = await this.getLandlordProperties(landlordId);

      let totalUnits = 0;
      let occupiedUnits = 0;
      let totalMonthlyRevenue = 0;

      // Get detailed stats for each property
      const propertyStats = await Promise.all(
        properties.map(async (property) => {
          const details = await this.getPropertyDetails(landlordId, property.id);
          return details?.stats || {
            totalUnits: 0,
            occupiedUnits: 0,
            availableUnits: 0,
            monthlyRevenue: 0,
            occupancyRate: 0,
          };
        })
      );

      // Aggregate totals
      propertyStats.forEach(stats => {
        totalUnits += stats.totalUnits;
        occupiedUnits += stats.occupiedUnits;
        totalMonthlyRevenue += stats.monthlyRevenue;
      });

      const overallOccupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

      // Get recent activity across all properties
      const landlordLeases = await OwnershipService.getLandlordLeases(landlordId);
      const activeLeases = landlordLeases.filter(l => l.lease.status === 'active').length;
      const draftLeases = landlordLeases.filter(l => l.lease.status === 'draft').length;

      return {
        summary: {
          totalProperties: properties.length,
          totalUnits,
          occupiedUnits,
          availableUnits: totalUnits - occupiedUnits,
          totalMonthlyRevenue,
          overallOccupancyRate: Math.round(overallOccupancyRate * 100) / 100,
          activeLeases,
          draftLeases,
        },
        properties: properties.map((property, index) => ({
          ...property,
          stats: propertyStats[index],
        })),
        recentActivity: {
          newTenants: activeLeases, // Using active leases as proxy for new tenants
          pendingMaintenance: 0, // Post-MVP: Will be implemented with maintenance service
          overduePayments: 0, // Will be calculated from payment service integration
        },
      };
    } catch (error) {
      console.error('Error generating landlord dashboard:', error);
      throw error;
    }
  }

  /**
   * Get property analytics
   */
  static async getPropertyAnalytics(landlordId: string, propertyId?: string) {
    try {
      let propertiesToAnalyze: string[];

      if (propertyId) {
        // Verify ownership of specific property
        const ownsProperty = await OwnershipService.isLandlordOwnerOfProperty(landlordId, propertyId);
        if (!ownsProperty) {
          throw new Error('You can only view analytics for your own properties');
        }
        propertiesToAnalyze = [propertyId];
      } else {
        // Get all landlord properties
        const allProperties = await this.getLandlordProperties(landlordId);
        propertiesToAnalyze = allProperties.map(p => p.id);
      }

      // Generate analytics for each property
      const analytics = await Promise.all(
        propertiesToAnalyze.map(async (propId) => {
          const details = await this.getPropertyDetails(landlordId, propId);
          return {
            propertyId: propId,
            propertyName: details?.property.name || 'Unknown',
            ...details?.stats,
            performanceScore: this.calculatePropertyPerformanceScore(details?.stats),
          };
        })
      );

      return {
        propertyAnalytics: analytics,
        overallMetrics: {
          averageOccupancyRate: analytics.reduce((sum, a) => sum + (a.occupancyRate || 0), 0) / analytics.length,
          totalRevenue: analytics.reduce((sum, a) => sum + (a.monthlyRevenue || 0), 0),
          bestPerformingProperty: analytics.reduce((best, current) =>
            (current.performanceScore || 0) > (best.performanceScore || 0) ? current : best, analytics[0]
          ),
          averagePerformanceScore: analytics.reduce((sum, a) => sum + (a.performanceScore || 0), 0) / analytics.length,
        },
      };
    } catch (error) {
      console.error('Error generating property analytics:', error);
      throw error;
    }
  }

  /**
   * Calculate property performance score (0-100)
   */
  private static calculatePropertyPerformanceScore(stats?: any): number {
    if (!stats) return 0;

    const occupancyWeight = 0.6; // 60% weight for occupancy
    const revenueWeight = 0.4; // 40% weight for revenue potential

    const occupancyScore = Math.min(stats.occupancyRate || 0, 100);

    // Revenue score based on whether units are generating expected rent
    // This is a simplified calculation - could be enhanced with market comparisons
    const expectedRevenue = stats.totalUnits * 1000; // Assume $1000 average rent
    const revenueRatio = Math.min((stats.monthlyRevenue || 0) / expectedRevenue, 1);
    const revenueScore = revenueRatio * 100;

    const performanceScore = (occupancyScore * occupancyWeight) + (revenueScore * revenueWeight);

    return Math.round(performanceScore * 100) / 100;
  }

  /**
   * Delete property (admin only - implemented for completeness)
   */
  static async deleteProperty(landlordId: string, propertyId: string) {
    try {
      // Verify ownership
      const ownsProperty = await OwnershipService.isLandlordOwnerOfProperty(landlordId, propertyId);
      if (!ownsProperty) {
        throw new Error('You can only delete your own properties');
      }

      // Check if property has any units with active leases
      const activeLeases = await db
        .select({ id: leases.id })
        .from(leases)
        .innerJoin(units, eq(leases.unitId, units.id))
        .where(
          and(
            eq(units.propertyId, propertyId),
            eq(leases.status, 'active')
          )
        );

      if (activeLeases.length > 0) {
        throw new Error('Cannot delete property with active leases');
      }

      // Delete the property (units will be cascade deleted if foreign key is set up)
      await db
        .delete(properties)
        .where(
          and(
            eq(properties.id, propertyId),
            eq(properties.landlordId, landlordId)
          )
        );

      return { success: true };
    } catch (error) {
      console.error('Error deleting property:', error);
      throw error;
    }
  }
}