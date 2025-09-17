import { db } from '../db';
import { users, properties, units, leases, payments } from '../db/schema';
import { eq, and, desc, asc, sum } from 'drizzle-orm';
import { PaymentService } from './paymentService';

/**
 * Tenant service for tenant-specific data retrieval and dashboard
 */

export interface TenantDashboardData {
  tenant: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
    phone: string;
  };
  lease: {
    id: string;
    startDate: string;
    endDate: string;
    monthlyRent: number;
    deposit: number;
    status: string;
    terms?: string;
  } | null;
  unit: {
    id: string;
    unitNumber: string;
    bedrooms: number;
    bathrooms: string;
    squareFeet?: number;
    description?: string;
  } | null;
  property: {
    id: string;
    name: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
    description?: string;
  } | null;
  payments: {
    currentBalance: number;
    nextDueDate?: string;
    isOverdue: boolean;
    minimumPayment: number;
    recentPayments: Array<{
      payment: any;
      lease: any;
      tenant: any;
    }>;
  };
  quickStats: {
    daysInLease: number;
    paymentsOnTime: number;
    totalPaid: number;
    leaseProgress: number;
  };
  landlord: {
    name: string;
    phone: string;
    email?: string;
  } | null;
}

export interface TenantLeaseInfo {
  lease: any;
  unit: any;
  property: any;
  landlord: {
    name: string;
    phone: string;
    email?: string;
  };
  paymentInfo: {
    currentBalance: number;
    nextDueDate?: string;
    isOverdue: boolean;
  };
}

export interface TenantPropertyInfo {
  property: any;
  unit: any;
  landlord: {
    name: string;
    phone: string;
    email?: string;
  };
  amenities: string[];
  rules?: string;
  emergencyContacts: Array<{
    name: string;
    phone: string;
    type: string;
  }>;
}

export class TenantService {
  /**
   * Get comprehensive tenant dashboard data
   */
  static async getTenantDashboard(tenantId: string): Promise<TenantDashboardData | null> {
    try {
      // Get tenant basic info
      const tenantInfo = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          phone: users.phone,
        })
        .from(users)
        .where(eq(users.id, tenantId))
        .limit(1);

      if (tenantInfo.length === 0) {
        return null;
      }

      // Get current active lease with unit and property details
      const currentLeaseInfo = await db
        .select({
          // Lease data
          leaseId: leases.id,
          leaseStartDate: leases.startDate,
          leaseEndDate: leases.endDate,
          leaseMonthlyRent: leases.monthlyRent,
          leaseDeposit: leases.deposit,
          leaseStatus: leases.status,
          leaseTerms: leases.terms,
          // Unit data
          unitId: units.id,
          unitNumber: units.unitNumber,
          unitBedrooms: units.bedrooms,
          unitBathrooms: units.bathrooms,
          unitSquareFeet: units.squareFeet,
          unitDescription: units.description,
          // Property data
          propertyId: properties.id,
          propertyName: properties.name,
          propertyAddress: properties.address,
          propertyCity: properties.city,
          propertyState: properties.state,
          propertyPostalCode: properties.postalCode,
          propertyDescription: properties.description,
          // Landlord data
          landlordId: properties.landlordId,
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

      let leaseData = null;
      let unitData = null;
      let propertyData = null;
      let landlordId = null;

      if (currentLeaseInfo.length > 0) {
        const info = currentLeaseInfo[0];
        landlordId = info.landlordId;

        leaseData = {
          id: info.leaseId,
          startDate: info.leaseStartDate.toISOString(),
          endDate: info.leaseEndDate.toISOString(),
          monthlyRent: parseFloat(info.leaseMonthlyRent),
          deposit: parseFloat(info.leaseDeposit),
          status: info.leaseStatus,
          terms: info.leaseTerms,
        };

        unitData = {
          id: info.unitId,
          unitNumber: info.unitNumber,
          bedrooms: info.unitBedrooms,
          bathrooms: info.unitBathrooms,
          squareFeet: info.unitSquareFeet,
          description: info.unitDescription,
        };

        propertyData = {
          id: info.propertyId,
          name: info.propertyName,
          address: info.propertyAddress,
          city: info.propertyCity,
          state: info.propertyState,
          postalCode: info.propertyPostalCode,
          description: info.propertyDescription,
        };
      }

      // Get landlord information if we have a lease
      let landlordInfo = null;
      if (landlordId) {
        const landlordData = await db
          .select({
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            phone: users.phone,
          })
          .from(users)
          .where(eq(users.id, landlordId))
          .limit(1);

        if (landlordData.length > 0) {
          landlordInfo = {
            name: `${landlordData[0].firstName} ${landlordData[0].lastName}`,
            phone: landlordData[0].phone,
            email: landlordData[0].email,
          };
        }
      }

      // Get payment information
      let paymentInfo = {
        currentBalance: 0,
        nextDueDate: undefined as string | undefined,
        isOverdue: false,
        minimumPayment: 0,
        recentPayments: [] as Array<{
          payment: any;
          lease: any;
          tenant: any;
        }>,
      };

      if (leaseData) {
        try {
          const balance = await PaymentService.calculateBalance(leaseData.id);
          if (balance) {
            paymentInfo = {
              currentBalance: balance.outstandingBalance,
              nextDueDate: balance.dueDate,
              isOverdue: balance.isOverdue,
              minimumPayment: balance.minimumPayment,
              recentPayments: [],
            };
          }

          // Get recent payments (last 5)
          const recentPayments = await PaymentService.getPaymentHistory(leaseData.id);
          paymentInfo.recentPayments = recentPayments.slice(0, 5);
        } catch (error) {
          console.error('Error fetching payment info:', error);
        }
      }

      // Calculate quick stats
      let quickStats = {
        daysInLease: 0,
        paymentsOnTime: 0,
        totalPaid: 0,
        leaseProgress: 0,
      };

      if (leaseData) {
        const now = new Date();
        const startDate = new Date(leaseData.startDate);
        const endDate = new Date(leaseData.endDate);
        
        // Days in lease
        quickStats.daysInLease = Math.max(0, Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
        
        // Lease progress (percentage)
        const totalLeaseDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        quickStats.leaseProgress = totalLeaseDays > 0 ? Math.min(100, (quickStats.daysInLease / totalLeaseDays) * 100) : 0;

        // Payment statistics
        const allPayments = paymentInfo.recentPayments;
        const completedPayments = allPayments.filter(p => p.payment.status === 'completed');
        const onTimePayments = completedPayments.filter(p => {
          if (p.payment.paidDate && p.payment.dueDate) {
            const paidDate = new Date(p.payment.paidDate);
            const dueDate = new Date(p.payment.dueDate);
            return paidDate <= dueDate;
          }
          return false;
        });

        quickStats.paymentsOnTime = onTimePayments.length;
        quickStats.totalPaid = completedPayments.reduce((sum, p) => sum + parseFloat(p.payment.amount), 0);
      }

      const dashboardData: TenantDashboardData = {
        tenant: {
          ...tenantInfo[0],
          email: tenantInfo[0].email || undefined,
        },
        lease: leaseData ? {
          ...leaseData,
          terms: leaseData.terms || undefined,
        } : null,
        unit: unitData ? {
          ...unitData,
          squareFeet: unitData.squareFeet || undefined,
          description: unitData.description || undefined,
        } : null,
        property: propertyData ? {
          ...propertyData,
          description: propertyData.description || undefined,
        } : null,
        payments: paymentInfo,
        quickStats,
        landlord: landlordInfo ? {
          ...landlordInfo,
          email: landlordInfo.email || undefined,
        } : null,
      };

      return dashboardData;
    } catch (error) {
      console.error('Error fetching tenant dashboard:', error);
      throw new Error('Failed to fetch tenant dashboard data');
    }
  }

  /**
   * Get detailed tenant lease information
   */
  static async getTenantLeaseInfo(tenantId: string): Promise<TenantLeaseInfo | null> {
    try {
      // Get current active lease with full details
      const leaseInfo = await db
        .select({
          // Full lease data
          lease: leases,
          // Unit data
          unit: units,
          // Property data  
          property: properties,
          // Landlord ID for fetching landlord info
          landlordId: properties.landlordId,
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

      if (leaseInfo.length === 0) {
        return null;
      }

      const info = leaseInfo[0];

      // Get landlord information
      const landlordData = await db
        .select({
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          phone: users.phone,
        })
        .from(users)
        .where(eq(users.id, info.landlordId))
        .limit(1);

      const landlord = landlordData.length > 0 ? {
        name: `${landlordData[0].firstName} ${landlordData[0].lastName}`,
        phone: landlordData[0].phone,
        email: landlordData[0].email || undefined,
      } : {
        name: 'Unknown',
        phone: '',
        email: undefined,
      };

      // Get payment information
      let paymentInfo = {
        currentBalance: 0,
        nextDueDate: undefined as string | undefined,
        isOverdue: false,
      };

      try {
        const balance = await PaymentService.calculateBalance(info.lease.id);
        if (balance) {
          paymentInfo = {
            currentBalance: balance.outstandingBalance,
            nextDueDate: balance.dueDate,
            isOverdue: balance.isOverdue,
          };
        }
      } catch (error) {
        console.error('Error fetching payment info for lease:', error);
      }

      return {
        lease: info.lease,
        unit: info.unit,
        property: info.property,
        landlord,
        paymentInfo,
      };
    } catch (error) {
      console.error('Error fetching tenant lease info:', error);
      throw new Error('Failed to fetch tenant lease information');
    }
  }

  /**
   * Get tenant property information
   */
  static async getTenantPropertyInfo(tenantId: string): Promise<TenantPropertyInfo | null> {
    try {
      // Get property info through current lease
      const propertyInfo = await db
        .select({
          property: properties,
          unit: units,
          landlordId: properties.landlordId,
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

      if (propertyInfo.length === 0) {
        return null;
      }

      const info = propertyInfo[0];

      // Get landlord information
      const landlordData = await db
        .select({
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          phone: users.phone,
        })
        .from(users)
        .where(eq(users.id, info.landlordId))
        .limit(1);

      const landlord = landlordData.length > 0 ? {
        name: `${landlordData[0].firstName} ${landlordData[0].lastName}`,
        phone: landlordData[0].phone,
        email: landlordData[0].email || undefined,
      } : {
        name: 'Unknown',
        phone: '',
        email: undefined,
      };

      // For now, return basic structure - amenities and emergency contacts can be enhanced later
      return {
        property: info.property,
        unit: info.unit,
        landlord,
        amenities: [
          'Water Supply',
          'Electricity',
          'Parking',
        ], // Placeholder - this could be stored in database later
        rules: info.property.description || 'Please contact your landlord for property rules and regulations.',
        emergencyContacts: [
          {
            name: landlord.name,
            phone: landlord.phone,
            type: 'Landlord',
          },
          {
            name: 'Emergency Services',
            phone: '999',
            type: 'Emergency',
          },
          {
            name: 'Police',
            phone: '999',
            type: 'Police',
          },
        ],
      };
    } catch (error) {
      console.error('Error fetching tenant property info:', error);
      throw new Error('Failed to fetch tenant property information');
    }
  }

  /**
   * Verify tenant has access to data (has active lease)
   */
  static async verifyTenantAccess(tenantId: string): Promise<boolean> {
    try {
      const activeLease = await db
        .select({ id: leases.id })
        .from(leases)
        .where(
          and(
            eq(leases.tenantId, tenantId),
            eq(leases.status, 'active')
          )
        )
        .limit(1);

      return activeLease.length > 0;
    } catch (error) {
      console.error('Error verifying tenant access:', error);
      return false;
    }
  }
}