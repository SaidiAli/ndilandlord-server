import { Request } from 'express';
import { OwnershipContext } from './ownership';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: 'admin' | 'landlord' | 'tenant';
  };
  ownershipContext?: OwnershipContext;
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: 'admin' | 'landlord' | 'tenant';
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface PaymentSchedule {
  id: string;
  leaseId: string;
  paymentNumber: number;
  dueDate: Date;
  amount: number;
  periodStart: Date;
  periodEnd: Date;
  isPaid: boolean;
  paidPaymentId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeaseWithSchedule {
  lease: any; // Your existing lease type
  paymentSchedule: PaymentSchedule[];
  totalScheduledAmount: number;
  totalPaidAmount: number;
  currentBalance: number;
  nextPaymentDue?: PaymentSchedule;
}

export interface PaymentScheduleCreationData {
  leaseId: string;
  paymentNumber: number;
  dueDate: Date;
  amount: number;
  periodStart: Date;
  periodEnd: Date;
}

// Re-export ownership types
export * from './ownership';