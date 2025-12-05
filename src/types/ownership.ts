import { z } from 'zod';

/**
 * TypeScript types and validation schemas for ownership verification
 */

// Resource types that can be owned
export type OwnableResourceType =
  | 'property'
  | 'unit'
  | 'lease'
  | 'payment'
  | 'maintenance_request'
  | 'tenant';

// User roles with ownership context
export type UserRoleWithOwnership = 'admin' | 'landlord' | 'tenant';

// Extended authentication request with ownership context
export interface AuthenticatedRequestWithOwnership {
  user?: {
    id: string;
    email: string;
    role: UserRoleWithOwnership;
    landlordId?: string; // For tenants, this is their landlord's ID
  };
}

// Ownership verification result
export interface OwnershipVerificationResult {
  isAuthorized: boolean;
  reason?: string;
  alternativeAction?: string;
}

// Landlord dashboard data structure
export interface LandlordDashboardData {
  landlordId: string;
  properties: {
    total: number;
    list: Array<{
      id: string;
      name: string;
      unitsCount: number;
      occupiedUnits: number;
      monthlyRevenue: number;
    }>;
  };
  tenants: {
    total: number;
    active: number;
    pending: number;
  };
  payments: {
    thisMonth: {
      collected: number;
      pending: number;
      overdue: number;
    };
    recentTransactions: Array<{
      id: string;
      tenantName: string;
      amount: number;
      status: string;
      date: string;
    }>;
  };
  maintenanceRequests: {
    open: number;
    inProgress: number;
    completed: number;
  };
}

// Validation schemas
export const ownershipVerificationSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  resourceType: z.enum(['property', 'unit', 'lease', 'payment', 'maintenance_request', 'tenant']),
  resourceId: z.string().uuid('Invalid resource ID'),
  action: z.enum(['read', 'write', 'delete']).optional().default('read'),
});

export const landlordResourceFilterSchema = z.object({
  landlordId: z.string().uuid('Invalid landlord ID'),
  resourceType: z.enum(['properties', 'units', 'leases', 'payments', 'maintenance_requests']),
  filters: z.object({
    status: z.string().optional(),
    dateRange: z.object({
      start: z.string().datetime().optional(),
      end: z.string().datetime().optional(),
    }).optional(),
    propertyId: z.string().uuid().optional(),
    unitId: z.string().uuid().optional(),
  }).optional(),
  pagination: z.object({
    page: z.number().min(1).default(1),
    limit: z.number().min(1).max(100).default(10),
  }).optional(),
});

// Tenant creation by landlord schema
export const landlordTenantCreationSchema = z.object({
  landlordId: z.string().uuid('Invalid landlord ID'),
  tenantData: z.object({
    email: z.string().email('Invalid email address').optional(),
    userName: z.string().min(1, 'Username is required'),
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    phone: z.string().regex(/^[0-9+\-\s]+$/, 'Invalid phone number'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  }),
  unitId: z.string().uuid('Invalid unit ID'),
  leaseData: z.object({
    startDate: z.string().datetime('Invalid start date'),
    endDate: z.string().datetime('Invalid end date').optional(),
    monthlyRent: z.number().positive('Monthly rent must be positive'),
    deposit: z.number().min(0, 'Deposit cannot be negative'),
    terms: z.string().optional(),
  }),
});

// Lease assignment schema
export const leaseAssignmentSchema = z.object({
  landlordId: z.string().uuid('Invalid landlord ID'),
  tenantId: z.string().uuid('Invalid tenant ID'),
  unitId: z.string().uuid('Invalid unit ID'),
  startDate: z.string().datetime('Invalid start date'),
  endDate: z.string().datetime('Invalid end date').optional(),
  monthlyRent: z.number().positive('Monthly rent must be positive'),
  deposit: z.number().min(0, 'Deposit cannot be negative'),
  terms: z.string().optional(),
});

// Filter for landlord-specific queries
export interface LandlordResourceFilter<T = any> {
  landlordId: string;
  additionalFilters?: T;
  pagination?: {
    page: number;
    limit: number;
  };
}

// Generic response for landlord-specific data
export interface LandlordResourceResponse<T> {
  success: boolean;
  data: T[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  landlordId: string;
  message?: string;
}

// Ownership context for middleware
export interface OwnershipContext {
  type: 'admin' | 'landlord_owned' | 'tenant_owned' | 'unauthorized';
  landlordId?: string;
  tenantId?: string;
  allowedActions: Array<'read' | 'write' | 'delete'>;
}

// Extended API response with ownership context
export interface ApiResponseWithOwnership<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  ownershipContext?: OwnershipContext;
}

// Types for ownership chain validation
export interface ResourceOwnershipChain {
  landlord: {
    id: string;
    name: string;
  };
  property: {
    id: string;
    name: string;
  };
  unit?: {
    id: string;
    unitNumber: string;
  };
  tenant?: {
    id: string;
    name: string;
  };
  lease?: {
    id: string;
    status: string;
  };
}

// Validation error types for ownership
export interface OwnershipValidationError {
  code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'RESOURCE_NOT_FOUND' | 'INVALID_OWNERSHIP';
  message: string;
  details?: {
    resourceType: OwnableResourceType;
    resourceId: string;
    userId: string;
    userRole: UserRoleWithOwnership;
  };
}

// Tenant workflow states
export type TenantWorkflowState =
  | 'created_by_landlord'
  | 'lease_assigned'
  | 'lease_active'
  | 'lease_expired'
  | 'lease_terminated';

// Workflow transition validation
export const workflowTransitionSchema = z.object({
  fromState: z.enum(['created_by_landlord', 'lease_assigned', 'lease_active', 'lease_expired', 'lease_terminated']),
  toState: z.enum(['created_by_landlord', 'lease_assigned', 'lease_active', 'lease_expired', 'lease_terminated']),
  tenantId: z.string().uuid('Invalid tenant ID'),
  landlordId: z.string().uuid('Invalid landlord ID'),
  metadata: z.record(z.any()).optional(),
});

export type OwnershipVerificationInput = z.infer<typeof ownershipVerificationSchema>;
export type LandlordResourceFilterInput = z.infer<typeof landlordResourceFilterSchema>;
export type LandlordTenantCreationInput = z.infer<typeof landlordTenantCreationSchema>;
export type LeaseAssignmentInput = z.infer<typeof leaseAssignmentSchema>;
export type WorkflowTransitionInput = z.infer<typeof workflowTransitionSchema>;