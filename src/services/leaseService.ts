import { db } from '../db';
import { users, properties, units, leases, payments } from '../db/schema';
import { eq, and, or, desc, asc, lte, sql, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { OwnershipService } from '../db/ownership';
import { PaymentScheduleService } from './paymentScheduleService';
import { paymentSchedules } from '../db/schema';

/**
 * Lease service for complete lease management workflow
 */

export interface LeaseCreationData {
  unitId: string;
  tenantId: string;
  startDate: string;
  endDate?: string;
  monthlyRent: number;
  paymentDay?: number;
  deposit: number;
  terms?: string;
}

export interface LeaseUpdateData {
  startDate?: string;
  endDate?: string;
  monthlyRent?: number;
  paymentDay?: number;
  deposit?: number;
  status?: 'draft' | 'active' | 'expired' | 'terminated';
  terms?: string;
}

export interface LeaseAssignmentData {
  tenantId: string;
  unitId: string;
  startDate: string;
  endDate?: string;
  monthlyRent: number;
  deposit: number;
  terms?: string;
}

export interface LeaseRenewalData {
  newEndDate: string;
  newMonthlyRent?: number;
  newTerms?: string;
}

// Validation schemas
export const leaseCreationSchema = z.object({
  unitId: z.string().uuid('Invalid unit ID'),
  tenantId: z.string().uuid('Invalid tenant ID'),
  startDate: z.string().refine((val) => {
    const date = new Date(val);
    return !isNaN(date.getTime()) && val.length >= 10;
  }, { message: "Invalid start date format" }),
  endDate: z.string().refine((val) => {
    const date = new Date(val);
    return !isNaN(date.getTime()) && val.length >= 10;
  }, { message: "Invalid end date format" }).optional(),
  monthlyRent: z.number().positive('Monthly rent must be positive'),
  paymentDay: z.number().min(1).max(31).optional(),
  deposit: z.number().min(0, 'Deposit cannot be negative'),
  terms: z.string().optional(),
  activateImmediately: z.boolean().optional(),
}).refine((data) => {
  if (data.endDate) {
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    return endDate > startDate;
  }
  return true;
}, {
  message: 'End date must be after start date',
  path: ['endDate'],
});

export const leaseUpdateSchema = z.object({
  startDate: z.string().refine((val) => {
    const date = new Date(val);
    return !isNaN(date.getTime()) && val.length >= 10;
  }, { message: "Invalid start date format" }).optional(),
  endDate: z.string().refine((val) => {
    const date = new Date(val);
    return !isNaN(date.getTime()) && val.length >= 10;
  }, { message: "Invalid end date format" }).optional(),
  monthlyRent: z.number().positive('Monthly rent must be positive').optional(),
  paymentDay: z.number().min(1).max(31).optional(),
  deposit: z.number().min(0, 'Deposit cannot be negative').optional(),
  status: z.enum(['draft', 'active', 'expired', 'terminated']).optional(),
  terms: z.string().optional(),
}).refine((data) => {
  if (data.startDate && data.endDate) {
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    return endDate > startDate;
  }
  return true;
}, {
  message: 'End date must be after start date',
  path: ['endDate'],
});

export const leaseAssignmentSchema = z.object({
  tenantId: z.string().uuid('Invalid tenant ID'),
  unitId: z.string().uuid('Invalid unit ID'),
  startDate: z.string().refine((val) => {
    const date = new Date(val);
    return !isNaN(date.getTime()) && val.length >= 10;
  }, { message: "Invalid start date format" }),
  endDate: z.string().refine((val) => {
    const date = new Date(val);
    return !isNaN(date.getTime()) && val.length >= 10;
  }, { message: "Invalid end date format" }).optional(),
  monthlyRent: z.number().positive('Monthly rent must be positive'),
  deposit: z.number().min(0, 'Deposit cannot be negative'),
  terms: z.string().optional(),
}).refine((data) => {
  if (data.endDate) {
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    return endDate > startDate;
  }
  return true;
}, {
  message: 'End date must be after start date',
  path: ['endDate'],
});

export const leaseRenewalSchema = z.object({
  newEndDate: z.string().datetime({ message: "Invalid new end date format" }),
  newMonthlyRent: z.number().positive('Monthly rent must be positive').optional(),
  newTerms: z.string().optional(),
});

export class LeaseService {
  /**
   * Create a new lease
   */
  static async createLease(landlordId: string, leaseData: LeaseCreationData) {
    try {
      // Validate input
      const validatedData = leaseCreationSchema.parse(leaseData);

      // Check for overlapping leases (active or draft leases only)
      const overlappingLeases = await db
        .select()
        .from(leases)
        .where(
          and(
            eq(leases.unitId, validatedData.unitId),
            // Check for active or draft leases that might overlap
            or(
              eq(leases.status, 'active'),
              eq(leases.status, 'draft')
            )
          )
        );

      // Check for date range overlaps
      const newStartDate = new Date(validatedData.startDate);
      // If no end date, use a far future date for overlap check
      const newEndDate = validatedData.endDate ? new Date(validatedData.endDate) : new Date('2100-01-01');

      for (const existingLease of overlappingLeases) {
        const existingStartDate = new Date(existingLease.startDate);
        // If existing lease has no end date, treat as far future
        const existingEndDate = existingLease.endDate ? new Date(existingLease.endDate) : new Date('2100-01-01');

        // Check if date ranges overlap
        const hasOverlap = (
          newStartDate < existingEndDate &&
          newEndDate > existingStartDate
        );

        if (hasOverlap) {
          const endDateStr = existingLease.endDate ? existingEndDate.toLocaleDateString() : 'Open';
          throw new Error(
            `Lease period overlaps with existing ${existingLease.status} lease (${existingStartDate.toLocaleDateString()} - ${endDateStr})`
          );
        }
      }

      // Create the lease
      const newLease = await db
        .insert(leases)
        .values({
          unitId: validatedData.unitId,
          tenantId: validatedData.tenantId,
          startDate: new Date(validatedData.startDate),
          endDate: validatedData.endDate ? new Date(validatedData.endDate) : null,
          monthlyRent: validatedData.monthlyRent.toString(),
          paymentDay: validatedData.paymentDay || 1,
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
          paymentDay: leases.paymentDay,
          status: leases.status,
          terms: leases.terms,
          createdAt: leases.createdAt,
        });

      if (validatedData.activateImmediately) {
        await this.activateLease(landlordId, newLease[0].id);
      }

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

      // Note: Unit availability will be updated when lease status changes to 'active'
      // via the handleLeaseStatusTransition method

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
            paymentDay: leases.paymentDay,
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
              paymentDay: leases.paymentDay,
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
            paymentDay: leases.paymentDay,
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
            isAvailable: units.isAvailable,
            description: units.description,
          },
          property: {
            id: properties.id,
            name: properties.name,
            address: properties.address,
            city: properties.city,
            postalCode: properties.postalCode,
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

      // Convert dates to Date objects if provided
      const updateData: any = { ...updates };
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

      await db
        .update(leases)
        .set(updateData)
        .where(eq(leases.id, leaseId));

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
            postalCode: properties.postalCode,
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
              postalCode: properties.postalCode,
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
   * Activate a lease and generate payment schedule
   */
  static async activateLease(landlordId: string, leaseId: string) {
    try {
      const ownsLease = await OwnershipService.isLandlordOwnerOfLease(landlordId, leaseId);
      if (!ownsLease) {
        throw new Error('You can only activate your own leases');
      }

      const [lease] = await db.select().from(leases).where(eq(leases.id, leaseId)).limit(1);
      if (!lease) throw new Error('Lease not found');
      if (lease.status !== 'draft') throw new Error('Only draft leases can be activated');

      await db.transaction(async (tx) => {
        await tx.update(leases).set({ status: 'active', updatedAt: new Date() }).where(eq(leases.id, leaseId));
        await tx.update(units).set({ isAvailable: false, updatedAt: new Date() }).where(eq(units.id, lease.unitId));
      });

      // Generate the payment schedule upon activation
      await PaymentScheduleService.generatePaymentSchedule(leaseId);

      return await this.getLeaseWithSchedule(landlordId, leaseId);
    } catch (error) {
      console.error('Error activating lease:', error);
      throw error;
    }
  }

  static async renewLease(landlordId: string, leaseId: string, renewalData: LeaseRenewalData) {
    try {
      const validatedData = leaseRenewalSchema.parse(renewalData);
      const ownsLease = await OwnershipService.isLandlordOwnerOfLease(landlordId, leaseId);
      if (!ownsLease) {
        throw new Error('You can only renew your own leases');
      }

      const [originalLease] = await db.select().from(leases).where(eq(leases.id, leaseId)).limit(1);
      if (!originalLease) throw new Error('Lease not found');
      if (!['active', 'expiring'].includes(originalLease.status)) {
        throw new Error('Only active or expiring leases can be renewed');
      }

      if (!originalLease.endDate) {
        throw new Error('Cannot renew an open-ended lease');
      }

      const newStartDate = new Date(originalLease.endDate);
      newStartDate.setDate(newStartDate.getDate() + 1);

      const newLeaseData: LeaseCreationData = {
        unitId: originalLease.unitId,
        tenantId: originalLease.tenantId,
        startDate: newStartDate.toISOString(),
        endDate: validatedData.newEndDate,
        monthlyRent: validatedData.newMonthlyRent || parseFloat(originalLease.monthlyRent),
        deposit: parseFloat(originalLease.deposit),
        paymentDay: originalLease.paymentDay,
        terms: validatedData.newTerms || originalLease.terms || undefined,
      };

      const newLeaseResult = await this.createLease(landlordId, newLeaseData);
      const newLeaseId = newLeaseResult!.lease.id;

      await db.update(leases).set({ previousLeaseId: originalLease.id }).where(eq(leases.id, newLeaseId));

      return newLeaseResult;
    } catch (error) {
      console.error('Error renewing lease:', error);
      throw error;
    }
  }

  /**
 * Get lease with payment schedule
 */
  static async getLeaseWithSchedule(landlordId: string, leaseId: string) {
    try {
      const leaseDetails = await this.getLeaseDetails(landlordId, leaseId);
      if (!leaseDetails) throw new Error('Lease not found or not accessible');

      const schedule = await PaymentScheduleService.getLeasePaymentSchedule(leaseId);
      const totalScheduled = schedule.reduce((sum, s) => sum + s.amount, 0);
      const totalPaid = schedule.filter(s => s.isPaid).reduce((sum, s) => sum + s.amount, 0);
      const currentBalance = totalScheduled - totalPaid;
      const nextPaymentDue = await PaymentScheduleService.getNextPaymentDue(leaseId);

      return {
        lease: leaseDetails.lease,
        unit: leaseDetails.unit,
        property: leaseDetails.property,
        tenant: leaseDetails.tenant,
        paymentSchedule: schedule,
        totalScheduledAmount: totalScheduled,
        totalPaidAmount: totalPaid,
        currentBalance,
        nextPaymentDue,
      };
    } catch (error) {
      console.error('Error fetching lease with schedule:', error);
      throw error;
    }
  }


  /**
   * Terminate a lease
   */
  static async terminateLease(landlordId: string, leaseId: string) {
    try {
      const ownsLease = await OwnershipService.isLandlordOwnerOfLease(landlordId, leaseId);
      if (!ownsLease) {
        throw new Error('You can only terminate your own leases');
      }

      await db.transaction(async (tx) => {
        const [lease] = await tx.select().from(leases).where(eq(leases.id, leaseId));
        await tx.update(leases).set({ status: 'terminated', updatedAt: new Date() }).where(eq(leases.id, leaseId));
        await tx.update(units).set({ isAvailable: true, updatedAt: new Date() }).where(eq(units.id, lease.unitId));
      });

      return await this.getLeaseDetails(landlordId, leaseId);
    } catch (error) {
      console.error('Error terminating lease:', error);
      throw error;
    }
  }

  /**
   * NEW METHOD: Automated job to update lease statuses.
   */
  static async updateLeaseStatuses() {
    try {
      const now = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(now.getDate() + 30);

      // Mark active leases as expiring 30 days before end date
      // Only for leases with an end date
      await db.update(leases).set({ status: 'expiring' }).where(and(
        eq(leases.status, 'active'),
        isNotNull(leases.endDate),
        lte(leases.endDate, thirtyDaysFromNow)
      ));

      // Mark expired leases after their end date
      // Only for leases with an end date
      const expiredLeasesResult = await db.update(leases).set({ status: 'expired' }).where(and(
        or(eq(leases.status, 'active'), eq(leases.status, 'expiring')),
        isNotNull(leases.endDate),
        lte(leases.endDate, now)
      )).returning({ unitId: leases.unitId });

      // Make units available for expired leases
      if (expiredLeasesResult.length > 0) {
        const unitIds = expiredLeasesResult.map(l => l.unitId);
        // Make unit available only if there isn't another active/draft lease for it
        await db.update(units).set({ isAvailable: true }).where(sql`${units.id} IN ${unitIds} AND NOT EXISTS (
                  SELECT 1 FROM ${leases} l2 WHERE l2.unit_id = ${units.id} AND l2.status IN ('active', 'draft')
              )`);
      }

    } catch (error) {
      console.error('Error in updateLeaseStatuses job:', error);
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
          if (!l.lease.endDate) return false;
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