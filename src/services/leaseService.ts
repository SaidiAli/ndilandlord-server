import { db } from '../db';
import { users, properties, units, leases, payments } from '../db/schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import { z } from 'zod';
import { OwnershipService } from '../db/ownership';

/**
 * Lease service for complete lease management workflow
 */

export interface LeaseCreationData {
  unitId: string;
  tenantId: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  deposit: number;
  terms?: string;
}

export interface LeaseUpdateData {
  startDate?: string;
  endDate?: string;
  monthlyRent?: number;
  deposit?: number;
  status?: 'draft' | 'active' | 'expired' | 'terminated';
  terms?: string;
}

export interface LeaseAssignmentData {
  tenantId: string;
  unitId: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  deposit: number;
  terms?: string;
}

// Validation schemas
export const leaseCreationSchema = z.object({
  unitId: z.string().uuid('Invalid unit ID'),
  tenantId: z.string().uuid('Invalid tenant ID'),
  startDate: z.string().datetime('Invalid start date'),
  endDate: z.string().datetime('Invalid end date'),
  monthlyRent: z.number().positive('Monthly rent must be positive'),
  deposit: z.number().min(0, 'Deposit cannot be negative'),
  terms: z.string().optional(),
});

export const leaseUpdateSchema = z.object({
  startDate: z.string().datetime('Invalid start date').optional(),
  endDate: z.string().datetime('Invalid end date').optional(),
  monthlyRent: z.number().positive('Monthly rent must be positive').optional(),
  deposit: z.number().min(0, 'Deposit cannot be negative').optional(),
  status: z.enum(['draft', 'active', 'expired', 'terminated']).optional(),
  terms: z.string().optional(),
});

export const leaseAssignmentSchema = z.object({
  tenantId: z.string().uuid('Invalid tenant ID'),
  unitId: z.string().uuid('Invalid unit ID'),
  startDate: z.string().datetime('Invalid start date'),
  endDate: z.string().datetime('Invalid end date'),
  monthlyRent: z.number().positive('Monthly rent must be positive'),
  deposit: z.number().min(0, 'Deposit cannot be negative'),
  terms: z.string().optional(),
});

export class LeaseService {
  /**
   * Create a new lease (landlord workflow)
   */
  static async createLease(landlordId: string, leaseData: LeaseCreationData) {
    try {
      // Validate input
      const validatedData = leaseCreationSchema.parse(leaseData);

      // Verify landlord owns the unit
      const ownsUnit = await OwnershipService.isLandlordOwnerOfUnit(
        landlordId,
        validatedData.unitId
      );

      if (!ownsUnit) {
        throw new Error('You can only create leases for your own units');
      }

      // Verify tenant belongs to the landlord (if not admin scenario)
      const ownsTenant = await OwnershipService.isLandlordOwnerOfTenant(
        landlordId,
        validatedData.tenantId
      );

      // Allow creating lease for external tenants (they become part of landlord's tenant list)
      // if (!ownsTenant) {
      //   throw new Error('You can only create leases for your own tenants');
      // }

      // Check if unit already has an active lease
      const existingActiveLease = await db
        .select()
        .from(leases)
        .where(
          and(
            eq(leases.unitId, validatedData.unitId),
            eq(leases.status, 'active')
          )
        )
        .limit(1);

      if (existingActiveLease.length > 0) {
        throw new Error('Unit already has an active lease');
      }

      // Create the lease
      const newLease = await db
        .insert(leases)
        .values({
          unitId: validatedData.unitId,
          tenantId: validatedData.tenantId,
          startDate: new Date(validatedData.startDate),
          endDate: new Date(validatedData.endDate),
          monthlyRent: validatedData.monthlyRent.toString(),
          deposit: validatedData.deposit.toString(),
          status: 'draft',
          terms: validatedData.terms,
        })
        .returning({
          id: leases.id,
          unitId: leases.unitId,
          tenantId: leases.tenantId,
          startDate: leases.startDate,
          endDate: leases.endDate,
          monthlyRent: leases.monthlyRent,
          deposit: leases.deposit,
          status: leases.status,
          terms: leases.terms,
          createdAt: leases.createdAt,
        });

      // Get detailed lease information
      const detailedLease = await this.getLeaseDetails(landlordId, newLease[0].id);

      return detailedLease;
    } catch (error) {
      console.error('Error creating lease:', error);
      throw error;
    }
  }

  /**
   * Assign existing tenant to unit with lease creation
   */
  static async assignLeaseToTenant(landlordId: string, assignmentData: LeaseAssignmentData) {
    try {
      // Validate input
      const validatedData = leaseAssignmentSchema.parse(assignmentData);

      // Create lease using existing tenant
      const lease = await this.createLease(landlordId, validatedData);

      // Mark unit as unavailable
      await db
        .update(units)
        .set({ isAvailable: false, updatedAt: new Date() })
        .where(eq(units.id, validatedData.unitId));

      return lease;
    } catch (error) {
      console.error('Error assigning lease to tenant:', error);
      throw error;
    }
  }

  /**
   * Get all leases for a landlord
   */
  static async getLandlordLeases(landlordId: string, filters?: {
    status?: string;
    propertyId?: string;
    unitId?: string;
  }) {
    try {
      let query = db
        .select({
          lease: {
            id: leases.id,
            startDate: leases.startDate,
            endDate: leases.endDate,
            monthlyRent: leases.monthlyRent,
            deposit: leases.deposit,
            status: leases.status,
            terms: leases.terms,
            createdAt: leases.createdAt,
          },
          tenant: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            phone: users.phone,
          },
          unit: {
            id: units.id,
            unitNumber: units.unitNumber,
            bedrooms: units.bedrooms,
            bathrooms: units.bathrooms,
            monthlyRent: units.monthlyRent,
          },
          property: {
            id: properties.id,
            name: properties.name,
            address: properties.address,
          },
        })
        .from(leases)
        .innerJoin(units, eq(leases.unitId, units.id))
        .innerJoin(properties, eq(units.propertyId, properties.id))
        .innerJoin(users, eq(leases.tenantId, users.id))
        .where(eq(properties.landlordId, landlordId))
        .orderBy(desc(leases.createdAt));

      // Apply filters if provided
      let whereConditions = [eq(properties.landlordId, landlordId)];
      
      if (filters?.status) {
        whereConditions.push(eq(leases.status, filters.status as any));
      }

      if (filters?.propertyId) {
        whereConditions.push(eq(properties.id, filters.propertyId));
      }

      if (filters?.unitId) {
        whereConditions.push(eq(units.id, filters.unitId));
      }

      // Rebuild query with all conditions if there are additional filters
      if (whereConditions.length > 1) {
        query = db
          .select({
            lease: {
              id: leases.id,
              startDate: leases.startDate,
              endDate: leases.endDate,
              monthlyRent: leases.monthlyRent,
              deposit: leases.deposit,
              status: leases.status,
              terms: leases.terms,
              createdAt: leases.createdAt,
            },
            tenant: {
              id: users.id,
              firstName: users.firstName,
              lastName: users.lastName,
              email: users.email,
              phone: users.phone,
            },
            unit: {
              id: units.id,
              unitNumber: units.unitNumber,
              bedrooms: units.bedrooms,
              bathrooms: units.bathrooms,
              monthlyRent: units.monthlyRent,
            },
            property: {
              id: properties.id,
              name: properties.name,
              address: properties.address,
            },
          })
          .from(leases)
          .innerJoin(units, eq(leases.unitId, units.id))
          .innerJoin(properties, eq(units.propertyId, properties.id))
          .innerJoin(users, eq(leases.tenantId, users.id))
          .where(and(...whereConditions))
          .orderBy(desc(leases.createdAt));
      }

      return await query;
    } catch (error) {
      console.error('Error fetching landlord leases:', error);
      throw error;
    }
  }

  /**
   * Get detailed lease information
   */
  static async getLeaseDetails(landlordId: string, leaseId: string) {
    try {
      // Verify ownership
      const ownsLease = await OwnershipService.isLandlordOwnerOfLease(landlordId, leaseId);
      if (!ownsLease) {
        throw new Error('You can only view your own leases');
      }

      const leaseDetails = await db
        .select({
          lease: {
            id: leases.id,
            startDate: leases.startDate,
            endDate: leases.endDate,
            monthlyRent: leases.monthlyRent,
            deposit: leases.deposit,
            status: leases.status,
            terms: leases.terms,
            createdAt: leases.createdAt,
            updatedAt: leases.updatedAt,
          },
          tenant: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            phone: users.phone,
            userName: users.userName,
            isActive: users.isActive,
          },
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
          },
          property: {
            id: properties.id,
            name: properties.name,
            address: properties.address,
            city: properties.city,
            state: properties.state,
            zipCode: properties.zipCode,
            description: properties.description,
          },
        })
        .from(leases)
        .innerJoin(units, eq(leases.unitId, units.id))
        .innerJoin(properties, eq(units.propertyId, properties.id))
        .innerJoin(users, eq(leases.tenantId, users.id))
        .where(
          and(
            eq(leases.id, leaseId),
            eq(properties.landlordId, landlordId)
          )
        )
        .limit(1);

      return leaseDetails.length > 0 ? leaseDetails[0] : null;
    } catch (error) {
      console.error('Error fetching lease details:', error);
      throw error;
    }
  }

  /**
   * Update lease information
   */
  static async updateLease(landlordId: string, leaseId: string, updates: LeaseUpdateData) {
    try {
      // Validate input
      const validatedUpdates = leaseUpdateSchema.parse(updates);

      // Verify ownership
      const ownsLease = await OwnershipService.isLandlordOwnerOfLease(landlordId, leaseId);
      if (!ownsLease) {
        throw new Error('You can only update your own leases');
      }

      // Convert dates to Date objects if provided
      const updateData: any = { ...validatedUpdates };
      if (updateData.startDate) {
        updateData.startDate = new Date(updateData.startDate);
      }
      if (updateData.endDate) {
        updateData.endDate = new Date(updateData.endDate);
      }
      if (updateData.monthlyRent) {
        updateData.monthlyRent = updateData.monthlyRent.toString();
      }
      if (updateData.deposit) {
        updateData.deposit = updateData.deposit.toString();
      }

      updateData.updatedAt = new Date();

      // Handle status transitions
      if (updates.status) {
        await this.handleLeaseStatusTransition(leaseId, updates.status);
      }

      const updatedLease = await db
        .update(leases)
        .set(updateData)
        .where(eq(leases.id, leaseId))
        .returning({
          id: leases.id,
          unitId: leases.unitId,
          tenantId: leases.tenantId,
          startDate: leases.startDate,
          endDate: leases.endDate,
          monthlyRent: leases.monthlyRent,
          deposit: leases.deposit,
          status: leases.status,
          terms: leases.terms,
          updatedAt: leases.updatedAt,
        });

      // Get detailed lease information
      const detailedLease = await this.getLeaseDetails(landlordId, leaseId);

      return detailedLease;
    } catch (error) {
      console.error('Error updating lease:', error);
      throw error;
    }
  }

  /**
   * Handle lease status transitions and side effects
   */
  private static async handleLeaseStatusTransition(leaseId: string, newStatus: string) {
    try {
      // Get current lease information
      const currentLease = await db
        .select({
          id: leases.id,
          unitId: leases.unitId,
          status: leases.status,
        })
        .from(leases)
        .where(eq(leases.id, leaseId))
        .limit(1);

      if (currentLease.length === 0) {
        throw new Error('Lease not found');
      }

      const lease = currentLease[0];

      // Handle status-specific side effects
      switch (newStatus) {
        case 'active':
          // Mark unit as unavailable when lease becomes active
          await db
            .update(units)
            .set({ isAvailable: false, updatedAt: new Date() })
            .where(eq(units.id, lease.unitId));
          break;

        case 'expired':
        case 'terminated':
          // Mark unit as available when lease ends
          await db
            .update(units)
            .set({ isAvailable: true, updatedAt: new Date() })
            .where(eq(units.id, lease.unitId));
          break;

        case 'draft':
          // Unit availability depends on whether there are other active leases
          // For now, we'll leave it as is
          break;
      }
    } catch (error) {
      console.error('Error handling lease status transition:', error);
      // Don't throw here to avoid breaking the main update operation
    }
  }

  /**
   * Get lease by ID (for tenants to view their own lease)
   */
  static async getTenantLease(tenantId: string, leaseId?: string) {
    try {
      let query = db
        .select({
          lease: {
            id: leases.id,
            startDate: leases.startDate,
            endDate: leases.endDate,
            monthlyRent: leases.monthlyRent,
            deposit: leases.deposit,
            status: leases.status,
            terms: leases.terms,
            createdAt: leases.createdAt,
          },
          unit: {
            id: units.id,
            unitNumber: units.unitNumber,
            bedrooms: units.bedrooms,
            bathrooms: units.bathrooms,
            squareFeet: units.squareFeet,
            description: units.description,
          },
          property: {
            id: properties.id,
            name: properties.name,
            address: properties.address,
            city: properties.city,
            state: properties.state,
            zipCode: properties.zipCode,
            description: properties.description,
          },
          landlord: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            phone: users.phone,
            email: users.email,
          },
        })
        .from(leases)
        .innerJoin(units, eq(leases.unitId, units.id))
        .innerJoin(properties, eq(units.propertyId, properties.id))
        .innerJoin(users, eq(properties.landlordId, users.id))
        .where(eq(leases.tenantId, tenantId));

      // If specific lease ID requested, filter by it
      if (leaseId) {
        const specificLeaseQuery = db
          .select({
            lease: {
              id: leases.id,
              startDate: leases.startDate,
              endDate: leases.endDate,
              monthlyRent: leases.monthlyRent,
              deposit: leases.deposit,
              status: leases.status,
              terms: leases.terms,
              createdAt: leases.createdAt,
            },
            unit: {
              id: units.id,
              unitNumber: units.unitNumber,
              bedrooms: units.bedrooms,
              bathrooms: units.bathrooms,
              squareFeet: units.squareFeet,
              description: units.description,
            },
            property: {
              id: properties.id,
              name: properties.name,
              address: properties.address,
              city: properties.city,
              state: properties.state,
              zipCode: properties.zipCode,
              description: properties.description,
            },
            landlord: {
              id: users.id,
              firstName: users.firstName,
              lastName: users.lastName,
              phone: users.phone,
              email: users.email,
            },
          })
          .from(leases)
          .innerJoin(units, eq(leases.unitId, units.id))
          .innerJoin(properties, eq(units.propertyId, properties.id))
          .innerJoin(users, eq(properties.landlordId, users.id))
          .where(
            and(
              eq(leases.tenantId, tenantId),
              eq(leases.id, leaseId)
            )
          )
          .limit(1);

        const result = await specificLeaseQuery;
        return result.length > 0 ? result[0] : null;
      }

      // Return all tenant's leases
      return await query.orderBy(desc(leases.createdAt));
    } catch (error) {
      console.error('Error fetching tenant lease:', error);
      throw error;
    }
  }

  /**
   * Activate a lease (change from draft to active)
   */
  static async activateLease(landlordId: string, leaseId: string) {
    try {
      return await this.updateLease(landlordId, leaseId, { status: 'active' });
    } catch (error) {
      console.error('Error activating lease:', error);
      throw error;
    }
  }

  /**
   * Terminate a lease
   */
  static async terminateLease(landlordId: string, leaseId: string) {
    try {
      return await this.updateLease(landlordId, leaseId, { status: 'terminated' });
    } catch (error) {
      console.error('Error terminating lease:', error);
      throw error;
    }
  }

  /**
   * Get lease analytics for a landlord
   */
  static async getLeaseAnalytics(landlordId: string) {
    try {
      const allLeases = await this.getLandlordLeases(landlordId);

      const analytics = {
        totalLeases: allLeases.length,
        activeLeases: allLeases.filter(l => l.lease.status === 'active').length,
        draftLeases: allLeases.filter(l => l.lease.status === 'draft').length,
        expiredLeases: allLeases.filter(l => l.lease.status === 'expired').length,
        terminatedLeases: allLeases.filter(l => l.lease.status === 'terminated').length,
        totalMonthlyRevenue: allLeases
          .filter(l => l.lease.status === 'active')
          .reduce((sum, l) => sum + parseFloat(l.lease.monthlyRent), 0),
        averageLeaseValue: allLeases.length > 0 
          ? allLeases.reduce((sum, l) => sum + parseFloat(l.lease.monthlyRent), 0) / allLeases.length 
          : 0,
        expiringThisMonth: allLeases.filter(l => {
          const endDate = new Date(l.lease.endDate);
          const now = new Date();
          const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          return endDate >= thisMonth && endDate < nextMonth;
        }).length,
      };

      return analytics;
    } catch (error) {
      console.error('Error calculating lease analytics:', error);
      throw error;
    }
  }
}