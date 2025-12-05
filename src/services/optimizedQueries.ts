import { db } from '../db';
import { users, properties, units, leases, payments } from '../db/schema';
import { eq, and, desc, asc, sum, count, sql, gte, lte, isNotNull } from 'drizzle-orm';

/**
 * Optimized database queries for better performance
 * Combines multiple operations into single queries where possible
 */

export interface LandlordDashboardStats {
  totalProperties: number;
  totalUnits: number;
  occupiedUnits: number;
  totalTenants: number;
  totalMonthlyRevenue: number;
  occupancyRate: number;
  overduePayments: number;
  totalOverdueAmount: number;
  completedPaymentsThisMonth: number;
  pendingPaymentsThisMonth: number;
}

export interface PropertyWithFullDetails {
  property: any;
  units: Array<{
    unit: any;
    currentLease?: any;
    tenant?: any;
  }>;
  statistics: {
    totalUnits: number;
    occupiedUnits: number;
    monthlyRevenue: number;
    occupancyRate: number;
  };
}

export interface TenantWithFullDetails {
  tenant: any;
  leases: Array<{
    lease: any;
    unit: any;
    property: any;
  }>;
  paymentSummary: {
    totalPaid: number;
    outstandingBalance: number;
    lastPaymentDate?: string;
    paymentStatus: 'current' | 'overdue' | 'advance';
  };
}

export class OptimizedQueries {
  /**
   * Get complete landlord dashboard statistics in a single optimized query
   */
  static async getLandlordDashboardStats(landlordId: string): Promise<LandlordDashboardStats> {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Single complex query to get all dashboard stats
    const dashboardQuery = db
      .select({
        totalProperties: count(properties.id).as('total_properties'),
        totalUnits: count(units.id).as('total_units'),
        occupiedUnits: sql<number>`COUNT(CASE WHEN ${units.isAvailable} = false THEN 1 END)`.as('occupied_units'),
        totalTenants: sql<number>`COUNT(DISTINCT CASE WHEN ${leases.status} = 'active' THEN ${leases.tenantId} END)`.as('total_tenants'),
        totalMonthlyRevenue: sql<number>`SUM(CASE WHEN ${leases.status} = 'active' THEN ${leases.monthlyRent}::numeric ELSE 0 END)`.as('total_monthly_revenue'),
        overduePayments: sql<number>`COUNT(CASE WHEN ${payments.status} = 'pending' AND ${payments.dueDate} < NOW() - INTERVAL '5 days' THEN 1 END)`.as('overdue_payments'),
        totalOverdueAmount: sql<number>`SUM(CASE WHEN ${payments.status} = 'pending' AND ${payments.dueDate} < NOW() - INTERVAL '5 days' THEN ${payments.amount}::numeric ELSE 0 END)`.as('total_overdue_amount'),
        completedPaymentsThisMonth: sql<number>`COUNT(CASE WHEN ${payments.status} = 'completed' AND ${payments.paidDate} >= ${thisMonthStart} THEN 1 END)`.as('completed_payments_this_month'),
        pendingPaymentsThisMonth: sql<number>`COUNT(CASE WHEN ${payments.status} = 'pending' AND ${payments.dueDate} >= ${thisMonthStart} THEN 1 END)`.as('pending_payments_this_month'),
      })
      .from(properties)
      .leftJoin(units, eq(properties.id, units.propertyId))
      .leftJoin(leases, and(eq(units.id, leases.unitId), eq(leases.status, 'active')))
      .leftJoin(payments, eq(leases.id, payments.leaseId))
      .where(eq(properties.landlordId, landlordId));

    const result = await dashboardQuery;
    const stats = result[0];

    return {
      totalProperties: Number(stats.totalProperties) || 0,
      totalUnits: Number(stats.totalUnits) || 0,
      occupiedUnits: Number(stats.occupiedUnits) || 0,
      totalTenants: Number(stats.totalTenants) || 0,
      totalMonthlyRevenue: Number(stats.totalMonthlyRevenue) || 0,
      occupancyRate: stats.totalUnits > 0 ? (Number(stats.occupiedUnits) / Number(stats.totalUnits)) * 100 : 0,
      overduePayments: Number(stats.overduePayments) || 0,
      totalOverdueAmount: Number(stats.totalOverdueAmount) || 0,
      completedPaymentsThisMonth: Number(stats.completedPaymentsThisMonth) || 0,
      pendingPaymentsThisMonth: Number(stats.pendingPaymentsThisMonth) || 0,
    };
  }

  /**
   * Get property with complete details including all units and their status
   */
  static async getPropertyWithFullDetails(landlordId: string, propertyId: string): Promise<PropertyWithFullDetails | null> {
    // First verify ownership
    const propertyOwnership = await db
      .select({ id: properties.id })
      .from(properties)
      .where(and(eq(properties.id, propertyId), eq(properties.landlordId, landlordId)))
      .limit(1);

    if (propertyOwnership.length === 0) {
      return null;
    }

    // Get property with all units and their current status
    const propertyWithUnits: any[] = await db
      .select({
        // Property data
        property: properties,
        // Unit data
        unit: units,
        // Current lease data
        lease: leases,
        // Tenant data
        tenant: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          phone: users.phone,
        },
      })
      .from(properties)
      .innerJoin(units, eq(properties.id, units.propertyId))
      .leftJoin(leases, and(eq(units.id, leases.unitId), eq(leases.status, 'active')))
      .leftJoin(users, eq(leases.tenantId, users.id))
      .where(eq(properties.id, propertyId))
      .orderBy(asc(units.unitNumber));

    if (propertyWithUnits.length === 0) {
      return null;
    }

    const property = propertyWithUnits[0].property;
    const propertyUnits: any[] = propertyWithUnits.map((row: any) => ({
      unit: row.unit,
      currentLease: row.lease,
      tenant: row.tenant,
    }));

    // Calculate statistics
    const totalUnits = propertyUnits.length;
    const occupiedUnits = propertyUnits.filter((u: any) => u.currentLease).length;
    const monthlyRevenue = propertyUnits
      .filter((u: any) => u.currentLease)
      .reduce((sum: number, u: any) => sum + parseFloat(u.unit.monthlyRent), 0);
    const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

    return {
      property,
      units: propertyUnits,
      statistics: {
        totalUnits,
        occupiedUnits,
        monthlyRevenue,
        occupancyRate,
      },
    };
  }

  /**
   * Get all tenants for a landlord with complete details in optimized query
   */
  static async getLandlordTenantsWithDetails(landlordId: string): Promise<TenantWithFullDetails[]> {
    // First, get all unique tenants for this landlord
    const tenantIds = await db
      .selectDistinct({
        tenantId: users.id,
      })
      .from(users)
      .innerJoin(leases, eq(users.id, leases.tenantId))
      .innerJoin(units, eq(leases.unitId, units.id))
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .where(
        and(
          eq(properties.landlordId, landlordId),
          eq(users.role, 'tenant')
        )
      );

    const results: TenantWithFullDetails[] = [];

    // For each tenant, get their complete details with all leases
    for (const { tenantId } of tenantIds) {
      // Get tenant basic info
      const tenantInfo = await db
        .select({
          id: users.id,
          userName: users.userName,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          phone: users.phone,
          isActive: users.isActive,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, tenantId))
        .limit(1);

      if (tenantInfo.length === 0) continue;

      // Get all leases for this tenant under this landlord
      const tenantLeases = await db
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
            eq(properties.landlordId, landlordId)
          )
        )
        .orderBy(desc(leases.createdAt));

      // Get payment summary across all leases for this tenant
      const paymentSummary = await db
        .select({
          totalPaid: sql<number>`COALESCE(SUM(CASE WHEN ${payments.status} = 'completed' THEN ${payments.amount}::numeric ELSE 0 END), 0)`.as('total_paid'),
          lastPaymentDate: sql<string>`MAX(CASE WHEN ${payments.status} = 'completed' THEN ${payments.paidDate} END)`.as('last_payment_date'),
          overdueAmount: sql<number>`COALESCE(SUM(CASE WHEN ${payments.status} = 'pending' AND ${payments.dueDate} < NOW() - INTERVAL '5 days' THEN ${payments.amount}::numeric ELSE 0 END), 0)`.as('overdue_amount'),
        })
        .from(payments)
        .innerJoin(leases, eq(payments.leaseId, leases.id))
        .innerJoin(units, eq(leases.unitId, units.id))
        .innerJoin(properties, eq(units.propertyId, properties.id))
        .where(
          and(
            eq(leases.tenantId, tenantId),
            eq(properties.landlordId, landlordId)
          )
        );

      const summary = paymentSummary[0];

      results.push({
        tenant: tenantInfo[0],
        leases: tenantLeases.map(row => ({
          lease: row.lease,
          unit: row.unit,
          property: row.property,
        })),
        paymentSummary: {
          totalPaid: Number(summary?.totalPaid) || 0,
          outstandingBalance: Number(summary?.overdueAmount) || 0,
          lastPaymentDate: summary?.lastPaymentDate || undefined,
          paymentStatus: Number(summary?.overdueAmount) > 0 ? 'overdue' : 'current',
        },
      });
    }

    // Sort results by tenant name
    return results.sort((a, b) => {
      const nameA = `${a.tenant.firstName} ${a.tenant.lastName}`.toLowerCase();
      const nameB = `${b.tenant.firstName} ${b.tenant.lastName}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }

  /**
   * Get payment analytics for landlord with optimized aggregation
   */
  static async getLandlordPaymentAnalytics(
    landlordId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    totalRevenue: number;
    pendingRevenue: number;
    overdueRevenue: number;
    completedPayments: number;
    pendingPayments: number;
    overduePayments: number;
    monthlyTrend: Array<{ month: string; revenue: number; payments: number }>;
    propertyBreakdown: Array<{ propertyId: string; propertyName: string; revenue: number }>;
  }> {
    const dateConditions = [];
    if (startDate) {
      dateConditions.push(gte(payments.createdAt, startDate));
    }
    if (endDate) {
      dateConditions.push(lte(payments.createdAt, endDate));
    }

    // Overall analytics
    const overallAnalytics = await db
      .select({
        totalRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${payments.status} = 'completed' THEN ${payments.amount}::numeric ELSE 0 END), 0)`.as('total_revenue'),
        pendingRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${payments.status} = 'pending' AND ${payments.dueDate} >= NOW() - INTERVAL '5 days' THEN ${payments.amount}::numeric ELSE 0 END), 0)`.as('pending_revenue'),
        overdueRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${payments.status} = 'pending' AND ${payments.dueDate} < NOW() - INTERVAL '5 days' THEN ${payments.amount}::numeric ELSE 0 END), 0)`.as('overdue_revenue'),
        completedPayments: sql<number>`COUNT(CASE WHEN ${payments.status} = 'completed' THEN 1 END)`.as('completed_payments'),
        pendingPayments: sql<number>`COUNT(CASE WHEN ${payments.status} = 'pending' AND ${payments.dueDate} >= NOW() - INTERVAL '5 days' THEN 1 END)`.as('pending_payments'),
        overduePayments: sql<number>`COUNT(CASE WHEN ${payments.status} = 'pending' AND ${payments.dueDate} < NOW() - INTERVAL '5 days' THEN 1 END)`.as('overdue_payments'),
      })
      .from(payments)
      .innerJoin(leases, eq(payments.leaseId, leases.id))
      .innerJoin(units, eq(leases.unitId, units.id))
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .where(
        and(
          eq(properties.landlordId, landlordId),
          ...dateConditions
        )
      );

    // Property breakdown
    const propertyBreakdown = await db
      .select({
        propertyId: properties.id,
        propertyName: properties.name,
        revenue: sql<number>`COALESCE(SUM(CASE WHEN ${payments.status} = 'completed' THEN ${payments.amount}::numeric ELSE 0 END), 0)`.as('revenue'),
      })
      .from(payments)
      .innerJoin(leases, eq(payments.leaseId, leases.id))
      .innerJoin(units, eq(leases.unitId, units.id))
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .where(
        and(
          eq(properties.landlordId, landlordId),
          eq(payments.status, 'completed'),
          ...dateConditions
        )
      )
      .groupBy(properties.id, properties.name)
      .orderBy(desc(sql`revenue`));

    // Monthly trend (last 12 months)
    const monthlyTrend = await db
      .select({
        month: sql<string>`TO_CHAR(${payments.paidDate}, 'YYYY-MM')`.as('month'),
        revenue: sql<number>`COALESCE(SUM(${payments.amount}::numeric), 0)`.as('revenue'),
        payments: sql<number>`COUNT(*)`.as('payments'),
      })
      .from(payments)
      .innerJoin(leases, eq(payments.leaseId, leases.id))
      .innerJoin(units, eq(leases.unitId, units.id))
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .where(
        and(
          eq(properties.landlordId, landlordId),
          eq(payments.status, 'completed'),
          gte(payments.paidDate, sql`NOW() - INTERVAL '12 months'`)
        )
      )
      .groupBy(sql`month`)
      .orderBy(sql`month`);

    const analytics = overallAnalytics[0];

    return {
      totalRevenue: Number(analytics.totalRevenue) || 0,
      pendingRevenue: Number(analytics.pendingRevenue) || 0,
      overdueRevenue: Number(analytics.overdueRevenue) || 0,
      completedPayments: Number(analytics.completedPayments) || 0,
      pendingPayments: Number(analytics.pendingPayments) || 0,
      overduePayments: Number(analytics.overduePayments) || 0,
      monthlyTrend: monthlyTrend.map(row => ({
        month: row.month,
        revenue: Number(row.revenue) || 0,
        payments: Number(row.payments) || 0,
      })),
      propertyBreakdown: propertyBreakdown.map(row => ({
        propertyId: row.propertyId,
        propertyName: row.propertyName,
        revenue: Number(row.revenue) || 0,
      })),
    };
  }

  /**
   * Get units with complete occupancy and financial data
   */
  static async getUnitsWithOccupancyData(landlordId: string, propertyId?: string) {
    const conditions = [eq(properties.landlordId, landlordId)];
    if (propertyId) {
      conditions.push(eq(properties.id, propertyId));
    }

    return await db
      .select({
        unit: units,
        property: {
          id: properties.id,
          name: properties.name,
        },
        currentLease: leases,
        tenant: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
        },
        totalRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${payments.status} = 'completed' THEN ${payments.amount}::numeric ELSE 0 END), 0)`.as('total_revenue'),
        pendingAmount: sql<number>`COALESCE(SUM(CASE WHEN ${payments.status} = 'pending' THEN ${payments.amount}::numeric ELSE 0 END), 0)`.as('pending_amount'),
        lastPaymentDate: sql<string>`MAX(CASE WHEN ${payments.status} = 'completed' THEN ${payments.paidDate} END)`.as('last_payment_date'),
      })
      .from(units)
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .leftJoin(leases, and(eq(units.id, leases.unitId), eq(leases.status, 'active')))
      .leftJoin(users, eq(leases.tenantId, users.id))
      .leftJoin(payments, eq(leases.id, payments.leaseId))
      .where(and(...conditions))
      .groupBy(units.id, properties.id, properties.name, leases.id, users.id, users.firstName, users.lastName)
      .orderBy(asc(properties.name), asc(units.unitNumber));
  }

  /**
   * Get leases expiring within specified days
   */
  static async getLeasesExpiringBefore(landlordId: string, days: number) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

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
        daysUntilExpiry: sql<number>`EXTRACT(DAY FROM ${leases.endDate} - NOW())`.as('days_until_expiry'),
      })
      .from(leases)
      .innerJoin(units, eq(leases.unitId, units.id))
      .innerJoin(properties, eq(units.propertyId, properties.id))
      .innerJoin(users, eq(leases.tenantId, users.id))
      .where(
        and(
          eq(properties.landlordId, landlordId),
          eq(leases.status, 'active'),
          isNotNull(leases.endDate),
          lte(leases.endDate, futureDate),
          gte(leases.endDate, new Date())
        )
      )
      .orderBy(asc(leases.endDate));
  }
}