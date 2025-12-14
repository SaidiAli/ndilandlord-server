import { db } from '../db';
import { users, properties, units, leases } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { OwnershipService } from '../db/ownership';
import { OptimizedQueries } from './optimizedQueries';
import { PaymentScheduleService } from './paymentScheduleService';

/**
 * User service for landlord-tenant management in the new workflow
 */

export interface TenantCreationData {
  email?: string;
  userName: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
}

export interface LeaseCreationData {
  startDate: string;
  endDate?: string;
  monthlyRent: number;
  deposit: number;
  terms?: string;
}

export interface TenantWithLeaseCreation extends TenantCreationData {
  unitId: string;
  leaseData: LeaseCreationData;
}

export interface UserProfileUpdateData {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

export const userProfileUpdateSchema = z.object({
  firstName: z.string().min(1, 'First name is required').optional(),
  lastName: z.string().min(1, 'Last name is required').optional(),
  email: z.string().email('Invalid email address').optional(),
  phone: z.string().regex(/^[0-9+\-\s()]+$/, 'Invalid phone number').optional(),
});

export class UserService {
  /**
   * Create a new tenant account by a landlord
   */
  static async createTenant(tenantData: TenantCreationData): Promise<any> {
    try {

      // Check if user already exists
      const existingUser = await db
        .select()
        .from(users)
        .where(and(eq(users.phone, tenantData.phone), eq(users.userName, tenantData.userName)))
        .limit(1);

      if (existingUser.length > 0) {
        throw new Error('User with this username or phone number already exists');
      }

      // Hash password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(tenantData.password, saltRounds);

      // Create user with tenant role
      const newUser = await db
        .insert(users)
        .values({
          ...tenantData,
          email: tenantData.email || null,
          password: hashedPassword,
          role: 'tenant',
          isActive: true,
        })
        .returning({
          id: users.id,
          email: users.email,
          userName: users.userName,
          firstName: users.firstName,
          lastName: users.lastName,
          phone: users.phone,
          role: users.role,
          isActive: users.isActive,
          createdAt: users.createdAt,
        });

      return newUser[0];
    } catch (error) {
      console.error('Error creating tenant:', error);
      throw error;
    }
  }

  /**
   * Create a tenant account and assign them to a unit with lease (landlord workflow)
   */
  static async createTenantWithLease(
    landlordId: string,
    data: TenantWithLeaseCreation
  ): Promise<{
    tenant: any;
    lease: any;
    unit: any;
  }> {
    try {

      // Verify landlord owns the unit
      const ownsUnit = await OwnershipService.isLandlordOwnerOfUnit(
        landlordId,
        data.unitId
      );

      if (!ownsUnit) {
        throw new Error('You can only create tenants for your own units');
      }

      // Check if unit is available (no active lease)
      const existingActiveLease = await db
        .select()
        .from(leases)
        .where(
          and(
            eq(leases.unitId, data.unitId),
            eq(leases.status, 'active')
          )
        )
        .limit(1);

      if (existingActiveLease.length > 0) {
        throw new Error('Unit already has an active lease');
      }

      // Create the tenant
      const tenant = await this.createTenant(data);

      // Get unit information
      const unitInfo = await db
        .select()
        .from(units)
        .where(eq(units.id, data.unitId))
        .limit(1);

      if (unitInfo.length === 0) {
        throw new Error('Unit not found');
      }

      // Create the lease
      const newLease = await db
        .insert(leases)
        .values({
          unitId: data.unitId,
          tenantId: tenant.id,
          startDate: new Date(data.leaseData.startDate),
          endDate: data.leaseData.endDate ? new Date(data.leaseData.endDate) : null,
          monthlyRent: data.leaseData.monthlyRent.toString(),
          deposit: data.leaseData.deposit.toString(),
          status: 'draft', // Start as draft, can be activated later
          terms: data.leaseData.terms,
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

      // Mark unit as unavailable
      await db
        .update(units)
        .set({ isAvailable: false, updatedAt: new Date() })
        .where(eq(units.id, data.unitId));


      // Generate the payment schedule upon activation
      await PaymentScheduleService.generatePaymentSchedule(newLease[0].id);

      return {
        tenant,
        lease: newLease[0],
        unit: unitInfo[0],
      };
    } catch (error) {
      console.error('Error creating tenant with lease:', error);
      throw error;
    }
  }

  /**
   * Get all tenants for a specific landlord with complete details
   */
  static async getLandlordTenants(landlordId: string) {
    try {
      return await OptimizedQueries.getLandlordTenantsWithDetails(landlordId);
    } catch (error) {
      console.error('Error fetching landlord tenants:', error);
      throw error;
    }
  }

  /**
   * Get detailed tenant information including lease and unit details
   */
  static async getTenantDetails(landlordId: string, tenantId: string) {
    try {
      // Verify landlord owns this tenant
      const ownsTenantsrents = await OwnershipService.isLandlordOwnerOfTenant(
        landlordId,
        tenantId
      );

      if (!ownsTenantsrents) {
        throw new Error('You can only view details of your own tenants');
      }

      const tenantDetails = await db
        .select({
          tenant: {
            id: users.id,
            email: users.email,
            userName: users.userName,
            firstName: users.firstName,
            lastName: users.lastName,
            phone: users.phone,
            isActive: users.isActive,
            createdAt: users.createdAt,
          },
          lease: {
            id: leases.id,
            startDate: leases.startDate,
            endDate: leases.endDate,
            monthlyRent: leases.monthlyRent,
            deposit: leases.deposit,
            status: leases.status,
            terms: leases.terms,
          },
          unit: {
            id: units.id,
            unitNumber: units.unitNumber,
            bedrooms: units.bedrooms,
            bathrooms: units.bathrooms,
            squareFeet: units.squareFeet,
          },
          property: {
            id: properties.id,
            name: properties.name,
            address: properties.address,
          },
        })
        .from(users)
        .innerJoin(leases, eq(users.id, leases.tenantId))
        .innerJoin(units, eq(leases.unitId, units.id))
        .innerJoin(properties, eq(units.propertyId, properties.id))
        .where(
          and(
            eq(users.id, tenantId),
            eq(properties.landlordId, landlordId)
          )
        )
        .limit(1);

      return tenantDetails.length > 0 ? tenantDetails[0] : null;
    } catch (error) {
      console.error('Error fetching tenant details:', error);
      throw error;
    }
  }

  /**
   * Update user information (with ownership validation)
   */
  static async updateUser(
    requestingUserId: string,
    requestingUserRole: string,
    targetUserId: string,
    updates: Partial<{
      email: string;
      firstName: string;
      lastName: string;
      phone: string;
      isActive: boolean;
    }>
  ) {
    try {
      // Self-update is always allowed
      if (requestingUserId === targetUserId) {
        const updatedUser = await db
          .update(users)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(users.id, targetUserId))
          .returning({
            id: users.id,
            email: users.email,
            userName: users.userName,
            firstName: users.firstName,
            lastName: users.lastName,
            phone: users.phone,
            role: users.role,
            isActive: users.isActive,
            updatedAt: users.updatedAt,
          });

        return updatedUser[0];
      }

      // Admin can update anyone
      if (requestingUserRole === 'admin') {
        const updatedUser = await db
          .update(users)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(users.id, targetUserId))
          .returning({
            id: users.id,
            email: users.email,
            userName: users.userName,
            firstName: users.firstName,
            lastName: users.lastName,
            phone: users.phone,
            role: users.role,
            isActive: users.isActive,
            updatedAt: users.updatedAt,
          });

        return updatedUser[0];
      }

      // Landlord can update their tenants
      if (requestingUserRole === 'landlord') {
        const ownsTenant = await OwnershipService.isLandlordOwnerOfTenant(
          requestingUserId,
          targetUserId
        );

        if (!ownsTenant) {
          throw new Error('You can only update your own tenants');
        }

        const updatedUser = await db
          .update(users)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(users.id, targetUserId))
          .returning({
            id: users.id,
            email: users.email,
            userName: users.userName,
            firstName: users.firstName,
            lastName: users.lastName,
            phone: users.phone,
            role: users.role,
            isActive: users.isActive,
            updatedAt: users.updatedAt,
          });

        return updatedUser[0];
      }

      throw new Error('Insufficient permissions to update this user');
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  /**
     * Update user profile information (self-update)
     */
  static async updateProfile(userId: string, updates: UserProfileUpdateData) {
    try {
      const validatedData = userProfileUpdateSchema.parse(updates);

      const updatedUser = await db
        .update(users)
        .set({ ...validatedData, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          email: users.email,
          userName: users.userName,
          firstName: users.firstName,
          lastName: users.lastName,
          phone: users.phone,
          role: users.role,
          isActive: users.isActive,
          updatedAt: users.updatedAt,
        });

      return updatedUser[0];

    } catch (error) {
      console.error('Error updating user profile:', error);
      throw error;
    }
  }

  /**
   * Get user by ID with ownership validation
   */
  static async getUserById(
    requestingUserId: string,
    requestingUserRole: string,
    targetUserId: string
  ) {
    try {
      // Admin can view anyone
      if (requestingUserRole === 'admin') {
        const user = await db
          .select({
            id: users.id,
            email: users.email,
            userName: users.userName,
            firstName: users.firstName,
            lastName: users.lastName,
            phone: users.phone,
            role: users.role,
            isActive: users.isActive,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(eq(users.id, targetUserId))
          .limit(1);

        return user.length > 0 ? user[0] : null;
      }

      // Self-view is always allowed
      if (requestingUserId === targetUserId) {
        const user = await db
          .select({
            id: users.id,
            email: users.email,
            userName: users.userName,
            firstName: users.firstName,
            lastName: users.lastName,
            phone: users.phone,
            role: users.role,
            isActive: users.isActive,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(eq(users.id, targetUserId))
          .limit(1);

        return user.length > 0 ? user[0] : null;
      }

      // Landlord can view their tenants
      if (requestingUserRole === 'landlord') {
        const ownsTenant = await OwnershipService.isLandlordOwnerOfTenant(
          requestingUserId,
          targetUserId
        );

        if (!ownsTenant) {
          throw new Error('You can only view your own tenants');
        }

        const user = await db
          .select({
            id: users.id,
            email: users.email,
            userName: users.userName,
            firstName: users.firstName,
            lastName: users.lastName,
            phone: users.phone,
            role: users.role,
            isActive: users.isActive,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(eq(users.id, targetUserId))
          .limit(1);

        return user.length > 0 ? user[0] : null;
      }

      throw new Error('Insufficient permissions to view this user');
    } catch (error) {
      console.error('Error fetching user:', error);
      throw error;
    }
  }

  /**
   * Get all users (admin only) or filtered users based on role
   */
  static async getAllUsers(
    requestingUserRole: string,
    requestingUserId?: string,
    filters?: {
      role?: 'admin' | 'landlord' | 'tenant';
      isActive?: boolean;
    }
  ) {
    try {
      if (requestingUserRole !== 'admin') {
        throw new Error('Only administrators can view all users');
      }

      // Build where conditions
      let whereConditions = [];

      if (filters?.role) {
        whereConditions.push(eq(users.role, filters.role));
      }

      if (filters?.isActive !== undefined) {
        whereConditions.push(eq(users.isActive, filters.isActive));
      }

      let query = db.select({
        id: users.id,
        email: users.email,
        userName: users.userName,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
      }).from(users);

      // Apply filters if provided
      if (whereConditions.length > 0) {
        query = (query as any).where(and(...whereConditions));
      }

      return await query;
    } catch (error) {
      console.error('Error fetching all users:', error);
      throw error;
    }
  }
}