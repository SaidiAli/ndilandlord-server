import { OwnershipService } from '../db/ownership';
import { 
  OwnershipVerificationResult, 
  OwnershipValidationError,
  UserRoleWithOwnership,
  OwnableResourceType,
  OwnershipContext
} from '../types/ownership';

/**
 * Ownership validation utilities for the new tenant workflow
 */

export class OwnershipValidation {
  /**
   * Verify if a user has access to a specific resource
   */
  static async verifyResourceAccess(
    userId: string,
    userRole: UserRoleWithOwnership,
    resourceType: OwnableResourceType,
    resourceId: string,
    action: 'read' | 'write' | 'delete' = 'read'
  ): Promise<OwnershipVerificationResult> {
    // Admins have access to everything
    if (userRole === 'admin') {
      return { isAuthorized: true };
    }

    // Landlord ownership verification
    if (userRole === 'landlord') {
      return await this.verifyLandlordOwnership(userId, resourceType, resourceId, action);
    }

    // Tenant access verification
    if (userRole === 'tenant') {
      return await this.verifyTenantAccess(userId, resourceType, resourceId, action);
    }

    return { 
      isAuthorized: false, 
      reason: 'Invalid user role',
      alternativeAction: 'Contact administrator'
    };
  }

  /**
   * Verify landlord ownership of a resource
   */
  private static async verifyLandlordOwnership(
    landlordId: string,
    resourceType: OwnableResourceType,
    resourceId: string,
    action: 'read' | 'write' | 'delete'
  ): Promise<OwnershipVerificationResult> {
    let isOwner = false;

    switch (resourceType) {
      case 'property':
        isOwner = await OwnershipService.isLandlordOwnerOfProperty(landlordId, resourceId);
        break;
      case 'unit':
        isOwner = await OwnershipService.isLandlordOwnerOfUnit(landlordId, resourceId);
        break;
      case 'lease':
        isOwner = await OwnershipService.isLandlordOwnerOfLease(landlordId, resourceId);
        break;
      case 'payment':
        isOwner = await OwnershipService.isLandlordOwnerOfPayment(landlordId, resourceId);
        break;
      case 'maintenance_request':
        isOwner = await OwnershipService.isLandlordOwnerOfMaintenanceRequest(landlordId, resourceId);
        break;
      case 'tenant':
        isOwner = await OwnershipService.isLandlordOwnerOfTenant(landlordId, resourceId);
        break;
      default:
        return { 
          isAuthorized: false, 
          reason: 'Unknown resource type',
          alternativeAction: 'Check resource type'
        };
    }

    if (!isOwner) {
      return { 
        isAuthorized: false, 
        reason: `You don't have access to this ${resourceType}`,
        alternativeAction: 'Verify resource ownership'
      };
    }

    // Check action permissions (landlords can do everything to their resources)
    return { isAuthorized: true };
  }

  /**
   * Verify tenant access to resources
   */
  private static async verifyTenantAccess(
    tenantId: string,
    resourceType: OwnableResourceType,
    resourceId: string,
    action: 'read' | 'write' | 'delete'
  ): Promise<OwnershipVerificationResult> {
    // Tenants can only read their own data and cannot delete anything
    if (action === 'delete') {
      return { 
        isAuthorized: false, 
        reason: 'Tenants cannot delete resources',
        alternativeAction: 'Contact your landlord'
      };
    }

    // For most write operations, tenants are limited
    if (action === 'write' && !['maintenance_request'].includes(resourceType)) {
      return { 
        isAuthorized: false, 
        reason: 'Tenants can only submit maintenance requests',
        alternativeAction: 'Contact your landlord for changes'
      };
    }

    // Verify tenant can access their own data
    switch (resourceType) {
      case 'lease':
        // Tenant can only access their own leases
        const tenantLeases = await OwnershipService.getLandlordTenants(tenantId);
        const hasAccess = tenantLeases.some(lease => lease.tenantId === tenantId);
        
        if (!hasAccess) {
          return { 
            isAuthorized: false, 
            reason: 'You can only access your own lease information',
            alternativeAction: 'Contact your landlord'
          };
        }
        break;

      case 'payment':
        // Verify payment belongs to tenant's lease
        const chain = await OwnershipService.getOwnershipChain('payment', resourceId);
        if (!chain || chain.tenantId !== tenantId) {
          return { 
            isAuthorized: false, 
            reason: 'You can only access your own payments',
            alternativeAction: 'Contact your landlord'
          };
        }
        break;

      case 'maintenance_request':
        // Tenant can access their own maintenance requests
        const isOwner = await OwnershipService.isLandlordOwnerOfMaintenanceRequest(tenantId, resourceId);
        if (!isOwner) {
          return { 
            isAuthorized: false, 
            reason: 'You can only access your own maintenance requests',
            alternativeAction: 'Check request ID'
          };
        }
        break;

      default:
        return { 
          isAuthorized: false, 
          reason: `Tenants cannot access ${resourceType} directly`,
          alternativeAction: 'Contact your landlord'
        };
    }

    return { isAuthorized: true };
  }

  /**
   * Create ownership context for middleware
   */
  static async createOwnershipContext(
    userId: string,
    userRole: UserRoleWithOwnership
  ): Promise<OwnershipContext> {
    if (userRole === 'admin') {
      return {
        type: 'admin',
        allowedActions: ['read', 'write', 'delete']
      };
    }

    if (userRole === 'landlord') {
      return {
        type: 'landlord_owned',
        landlordId: userId,
        allowedActions: ['read', 'write', 'delete']
      };
    }

    if (userRole === 'tenant') {
      const landlordId = await OwnershipService.getTenantLandlord(userId);
      return {
        type: 'tenant_owned',
        tenantId: userId,
        landlordId: landlordId || undefined,
        allowedActions: ['read', 'write'] // Limited write access
      };
    }

    return {
      type: 'unauthorized',
      allowedActions: []
    };
  }

  /**
   * Validate workflow transitions
   */
  static validateWorkflowTransition(
    fromState: string,
    toState: string,
    userRole: UserRoleWithOwnership
  ): OwnershipVerificationResult {
    const allowedTransitions: Record<string, string[]> = {
      'created_by_landlord': ['lease_assigned'],
      'lease_assigned': ['lease_active', 'created_by_landlord'],
      'lease_active': ['lease_expired', 'lease_terminated'],
      'lease_expired': ['lease_active'], // Lease renewal
      'lease_terminated': [] // Terminal state
    };

    // Check if transition is allowed
    const allowed = allowedTransitions[fromState]?.includes(toState);
    if (!allowed) {
      return {
        isAuthorized: false,
        reason: `Invalid transition from ${fromState} to ${toState}`,
        alternativeAction: 'Check workflow requirements'
      };
    }

    // Check role permissions for transitions
    if (userRole === 'tenant' && !['lease_active'].includes(toState)) {
      return {
        isAuthorized: false,
        reason: 'Tenants cannot modify lease status',
        alternativeAction: 'Contact your landlord'
      };
    }

    return { isAuthorized: true };
  }

  /**
   * Generate ownership validation error
   */
  static createOwnershipError(
    code: OwnershipValidationError['code'],
    message: string,
    resourceType: OwnableResourceType,
    resourceId: string,
    userId: string,
    userRole: UserRoleWithOwnership
  ): OwnershipValidationError {
    return {
      code,
      message,
      details: {
        resourceType,
        resourceId,
        userId,
        userRole
      }
    };
  }

  /**
   * Check if landlord can create tenant in their property
   */
  static async canLandlordCreateTenantInUnit(
    landlordId: string,
    unitId: string
  ): Promise<OwnershipVerificationResult> {
    // Verify landlord owns the unit
    const ownsUnit = await OwnershipService.isLandlordOwnerOfUnit(landlordId, unitId);
    if (!ownsUnit) {
      return {
        isAuthorized: false,
        reason: 'You can only create tenants for your own units',
        alternativeAction: 'Select a unit you own'
      };
    }

    // Check if unit is available (no active lease)
    // This would require additional logic to check for active leases
    // For now, we'll assume the business logic handles this
    
    return { isAuthorized: true };
  }

  /**
   * Validate payment belongs to landlord
   */
  static async validatePaymentOwnership(
    landlordId: string,
    paymentId: string
  ): Promise<OwnershipVerificationResult> {
    const ownsPayment = await OwnershipService.isLandlordOwnerOfPayment(landlordId, paymentId);
    
    if (!ownsPayment) {
      return {
        isAuthorized: false,
        reason: 'This payment does not belong to your properties',
        alternativeAction: 'Check payment ID'
      };
    }

    return { isAuthorized: true };
  }
}