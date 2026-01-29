import { db } from './index';
import { users, properties, units, leases, payments, maintenanceRequests } from './schema';
import { eq, and, inArray } from 'drizzle-orm';

/**
 * Ownership verification and helper functions for landlord-tenant relationships
 */

export interface OwnershipChain {
  landlordId: string;
  propertyId: string;
  unitId: string;
  tenantId: string;
  leaseId: string;
}

export interface LandlordTenant {
  tenantId: string;
  landlordId: string;
  propertyName: string;
  unitNumber: string;
  leaseStatus: string;
}

export class OwnershipService {
  /**
   * Get all tenants belonging to a specific landlord
   */
  static async getLandlordTenants(landlordId: string): Promise<LandlordTenant[]> {
    const result = await db
      .select({
        tenantId: leases.tenantId,
        landlordId: properties.landlordId,
        propertyName: properties.name,
        unitNumber: units.unitNumber,
        leaseStatus: leases.status,
        leaseId: leases.id,
      })
      .from(leases)
      .innerJoin(units, eq(leases.unitId, units.id))
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .where(eq(properties.landlordId, landlordId));

    return result;
  }

  /**
   * Validate UUID format
   */
  private static isValidUUID(id: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }

  /**
   * Get the landlord for a specific tenant based on their active lease
   */
  static async getTenantLandlord(tenantId: string, isLandlord: boolean = false): Promise<string | null> {
    if (!this.isValidUUID(tenantId)) {
      return null;
    }
    const result = await db
      .select({
        landlordId: properties.landlordId,
      })
      .from(leases)
      .innerJoin(units, eq(leases.unitId, units.id))
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .where(
        and(
          eq(leases.tenantId, tenantId)
          // !isLandlord ? eq(leases.status, 'active') : undefined
        )
      )
      .limit(1);

    return result.length > 0 ? result[0].landlordId : null;
  }

  /**
   * Verify if a landlord owns a specific property
   */
  static async isLandlordOwnerOfProperty(landlordId: string, propertyId: string): Promise<boolean> {
    if (!this.isValidUUID(landlordId) || !this.isValidUUID(propertyId)) {
      return false;
    }
    const result = await db
      .select({ id: properties.id })
      .from(properties)
      .where(
        and(
          eq(properties.id, propertyId),
          eq(properties.landlordId, landlordId)
        )
      )
      .limit(1);

    return result.length > 0;
  }

  /**
   * Verify if a landlord owns a specific unit
   */
  static async isLandlordOwnerOfUnit(landlordId: string, unitId: string): Promise<boolean> {
    if (!this.isValidUUID(landlordId) || !this.isValidUUID(unitId)) {
      return false;
    }
    const result = await db
      .select({ id: units.id })
      .from(units)
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .where(
        and(
          eq(units.id, unitId),
          eq(properties.landlordId, landlordId)
        )
      )
      .limit(1);

    return result.length > 0;
  }

  /**
   * Verify if a landlord owns a specific lease
   */
  static async isLandlordOwnerOfLease(landlordId: string, leaseId: string): Promise<boolean> {
    if (!this.isValidUUID(landlordId) || !this.isValidUUID(leaseId)) {
      return false;
    }
    const result = await db
      .select({ id: leases.id })
      .from(leases)
      .innerJoin(units, eq(leases.unitId, units.id))
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .where(
        and(
          eq(leases.id, leaseId),
          eq(properties.landlordId, landlordId)
        )
      )
      .limit(1);

    return result.length > 0;
  }

  /**
   * Verify if a landlord has access to a specific tenant's data
   */
  static async isLandlordOwnerOfTenant(landlordId: string, tenantId: string): Promise<boolean> {
    if (!this.isValidUUID(landlordId) || !this.isValidUUID(tenantId)) {
      return false;
    }
    const tenantLandlord = await this.getTenantLandlord(tenantId);
    return tenantLandlord === landlordId;
  }

  /**
   * Verify if a landlord owns a specific payment
   */
  static async isLandlordOwnerOfPayment(landlordId: string, paymentId: string): Promise<boolean> {
    if (!this.isValidUUID(landlordId) || !this.isValidUUID(paymentId)) {
      return false;
    }
    const result = await db
      .select({ id: payments.id })
      .from(payments)
      .innerJoin(leases, eq(payments.leaseId, leases.id))
      .innerJoin(units, eq(leases.unitId, units.id))
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .where(
        and(
          eq(payments.id, paymentId),
          eq(properties.landlordId, landlordId)
        )
      )
      .limit(1);

    return result.length > 0;
  }

  /**
   * Verify if a landlord owns a specific maintenance request
   */
  static async isLandlordOwnerOfMaintenanceRequest(landlordId: string, maintenanceRequestId: string): Promise<boolean> {
    if (!this.isValidUUID(landlordId) || !this.isValidUUID(maintenanceRequestId)) {
      return false;
    }
    const result = await db
      .select({ id: maintenanceRequests.id })
      .from(maintenanceRequests)
      .innerJoin(units, eq(maintenanceRequests.unitId, units.id))
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .where(
        and(
          eq(maintenanceRequests.id, maintenanceRequestId),
          eq(properties.landlordId, landlordId)
        )
      )
      .limit(1);

    return result.length > 0;
  }

  /**
   * Get all properties owned by a landlord
   */
  static async getLandlordProperties(landlordId: string) {
    return await db
      .select()
      .from(properties)
      .where(eq(properties.landlordId, landlordId));
  }

  /**
   * Get all units owned by a landlord
   */
  static async getLandlordUnits(landlordId: string) {
    return await db
      .select({
        unit: units,
        property: properties,
      })
      .from(units)
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .where(eq(properties.landlordId, landlordId));
  }

  /**
   * Get all leases for a landlord's properties
   */
  static async getLandlordLeases(landlordId: string) {
    return await db
      .select({
        lease: leases,
        unit: units,
        property: properties,
        tenant: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          phone: users.phone,
        },
      })
      .from(leases)
      .innerJoin(units, eq(leases.unitId, units.id))
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .innerJoin(users, eq(leases.tenantId, users.id))
      .where(eq(properties.landlordId, landlordId));
  }

  /**
   * Get all payments for a landlord's properties
   */
  static async getLandlordPayments(landlordId: string) {
    return await db
      .select({
        payment: payments,
        lease: leases,
        unit: units,
        property: properties,
        tenant: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          phone: users.phone,
        },
      })
      .from(payments)
      .innerJoin(leases, eq(payments.leaseId, leases.id))
      .innerJoin(units, eq(leases.unitId, units.id))
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .innerJoin(users, eq(leases.tenantId, users.id))
      .where(eq(properties.landlordId, landlordId));
  }

  /**
   * Get all maintenance requests for a landlord's properties
   */
  static async getLandlordMaintenanceRequests(landlordId: string) {
    return await db
      .select({
        maintenanceRequest: maintenanceRequests,
        unit: units,
        property: properties,
        tenant: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          phone: users.phone,
        },
      })
      .from(maintenanceRequests)
      .innerJoin(units, eq(maintenanceRequests.unitId, units.id))
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .innerJoin(users, eq(maintenanceRequests.tenantId, users.id))
      .where(eq(properties.landlordId, landlordId));
  }

  /**
   * Get complete ownership chain for a given resource
   */
  static async getOwnershipChain(resourceType: string, resourceId: string): Promise<OwnershipChain | null> {
    switch (resourceType) {
      case 'lease':
        const leaseChain = await db
          .select({
            landlordId: properties.landlordId,
            propertyId: properties.id,
            unitId: units.id,
            tenantId: leases.tenantId,
            leaseId: leases.id,
          })
          .from(leases)
          .innerJoin(units, eq(leases.unitId, units.id))
          .innerJoin(properties, eq(units.propertyId, properties.id))
          .where(eq(leases.id, resourceId))
          .limit(1);

        return leaseChain.length > 0 ? leaseChain[0] : null;

      case 'payment':
        const paymentChain = await db
          .select({
            landlordId: properties.landlordId,
            propertyId: properties.id,
            unitId: units.id,
            tenantId: leases.tenantId,
            leaseId: leases.id,
          })
          .from(payments)
          .innerJoin(leases, eq(payments.leaseId, leases.id))
          .innerJoin(units, eq(leases.unitId, units.id))
          .innerJoin(properties, eq(units.propertyId, properties.id))
          .where(eq(payments.id, resourceId))
          .limit(1);

        return paymentChain.length > 0 ? paymentChain[0] : null;

      default:
        return null;
    }
  }

  /**
   * Get tenant's active leases (for tenant-specific validation)
   */
  static async getTenantActiveLeases(tenantId: string) {
    if (!this.isValidUUID(tenantId)) {
      return [];
    }

    return await db
      .select({
        lease: leases,
        unit: units,
        property: properties,
      })
      .from(leases)
      .innerJoin(units, eq(leases.unitId, units.id))
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .where(
        and(
          eq(leases.tenantId, tenantId),
          eq(leases.status, 'active')
        )
      );
  }

  /**
   * Get tenant's payment history (tenant-specific method)
   */
  static async getTenantPayments(tenantId: string) {
    if (!this.isValidUUID(tenantId)) {
      return [];
    }

    return await db
      .select({
        payment: payments,
        lease: leases,
        unit: units,
        property: properties,
        tenant: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          phone: users.phone,
        },
      })
      .from(payments)
      .innerJoin(leases, eq(payments.leaseId, leases.id))
      .innerJoin(units, eq(leases.unitId, units.id))
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .innerJoin(users, eq(leases.tenantId, users.id))
      .where(eq(leases.tenantId, tenantId));
  }

  /**
   * Verify if a tenant owns a specific maintenance request
   */
  static async isTenantOwnerOfMaintenanceRequest(tenantId: string, maintenanceRequestId: string): Promise<boolean> {
    if (!this.isValidUUID(tenantId) || !this.isValidUUID(maintenanceRequestId)) {
      return false;
    }

    const result = await db
      .select({ id: maintenanceRequests.id })
      .from(maintenanceRequests)
      .where(
        and(
          eq(maintenanceRequests.id, maintenanceRequestId),
          eq(maintenanceRequests.tenantId, tenantId)
        )
      )
      .limit(1);

    return result.length > 0;
  }

  /**
   * Verify if a tenant has access to a specific lease (owns it)
   */
  static async isTenantOwnerOfLease(tenantId: string, leaseId: string): Promise<boolean> {
    if (!this.isValidUUID(tenantId) || !this.isValidUUID(leaseId)) {
      return false;
    }

    const result = await db
      .select({ id: leases.id })
      .from(leases)
      .where(
        and(
          eq(leases.id, leaseId),
          eq(leases.tenantId, tenantId),
          eq(leases.status, 'active') // Only active leases
        )
      )
      .limit(1);

    return result.length > 0;
  }

  /**
   * Verify if a tenant has access to a specific payment (through their lease)
   */
  static async isTenantOwnerOfPayment(tenantId: string, paymentId: string): Promise<boolean> {
    if (!this.isValidUUID(tenantId) || !this.isValidUUID(paymentId)) {
      return false;
    }

    const result = await db
      .select({ id: payments.id })
      .from(payments)
      .innerJoin(leases, eq(payments.leaseId, leases.id))
      .where(
        and(
          eq(payments.id, paymentId),
          eq(leases.tenantId, tenantId)
        )
      )
      .limit(1);

    return result.length > 0;
  }

  /**
   * Get tenant's current lease information
   */
  static async getTenantCurrentLease(tenantId: string) {
    if (!this.isValidUUID(tenantId)) {
      return null;
    }

    const result = await db
      .select({
        lease: leases,
        unit: units,
        property: properties,
      })
      .from(leases)
      .innerJoin(units, eq(leases.unitId, units.id))
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .where(
        and(
          eq(leases.tenantId, tenantId),
          eq(leases.status, 'active')
        )
      )
      .limit(1);

    return result.length > 0 ? result[0] : null;
  }
}