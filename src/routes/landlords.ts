import { Router, Response } from 'express';
import {
  authenticate,
  authorize
} from '../middleware/auth';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { PropertyService } from '../services/propertyService';
import { UnitService } from '../services/unitService';
import { LeaseService } from '../services/leaseService';
import { UserService } from '../services/userService';
import { OwnershipService } from '../db/ownership';
import { validateBody } from '../middleware/validation';
import { z } from 'zod';

const router = Router();

/**
 * Landlord-specific workflow endpoints for enhanced property management
 */

const financialReportSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  propertyId: z.string().uuid().optional(),
  reportType: z.enum(['summary', 'detailed', 'tax']).default('summary'),
});

// Get complete landlord dashboard (integrated data from all services)
router.get('/dashboard/complete', authenticate, authorize('landlord'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const landlordId = req.user!.id;

    // Get data from all services in parallel for better performance
    const [
      propertyDashboard,
      unitsAnalytics,
      leaseAnalytics,
      paymentOverview,
      tenantsList
    ] = await Promise.all([
      PropertyService.getLandlordDashboard(landlordId),
      UnitService.getUnitsAnalytics(landlordId),
      LeaseService.getLeaseAnalytics(landlordId),
      OwnershipService.getLandlordPayments(landlordId),
      UserService.getLandlordTenants(landlordId)
    ]);

    // Calculate payment analytics
    const now = new Date();
    const overduePayments = paymentOverview.filter(p =>
      p.payment.status === 'pending' && new Date(p.payment.dueDate) < now
    );
    const totalOverdueAmount = overduePayments.reduce((sum, p) => sum + parseFloat(p.payment.amount), 0);

    // Calculate lease expiration alerts (next 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringLeases = await LeaseService.getLandlordLeases(landlordId);
    const leasesExpiringSoon = expiringLeases.filter(l => {
      if (!l.lease.endDate) return false;
      const endDate = new Date(l.lease.endDate);
      return endDate >= now && endDate <= thirtyDaysFromNow && l.lease.status === 'active';
    });

    const completeDashboard = {
      summary: {
        ...propertyDashboard.summary,
        totalTenants: tenantsList.length,
        overduePayments: overduePayments.length,
        totalOverdueAmount,
        leasesExpiringSoon: leasesExpiringSoon.length,
      },
      properties: propertyDashboard.properties,
      units: {
        ...unitsAnalytics,
        recentVacancies: unitsAnalytics.availableUnits,
      },
      leases: {
        ...leaseAnalytics,
        expiringSoon: leasesExpiringSoon.map(l => ({
          leaseId: l.lease.id,
          tenantName: `${l.tenant.firstName} ${l.tenant.lastName}`,
          propertyName: l.property.name,
          unitNumber: l.unit.unitNumber,
          endDate: l.lease.endDate,
          daysUntilExpiry: Math.ceil((new Date(l.lease.endDate!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
        })),
      },
      payments: {
        totalRevenue: paymentOverview.filter(p => p.payment.status === 'completed')
          .reduce((sum, p) => sum + parseFloat(p.payment.amount), 0),
        pendingAmount: paymentOverview.filter(p => p.payment.status === 'pending')
          .reduce((sum, p) => sum + parseFloat(p.payment.amount), 0),
        overdueDetails: overduePayments.map(p => ({
          paymentId: p.payment.id,
          tenantName: `${p.tenant.firstName} ${p.tenant.lastName}`,
          amount: parseFloat(p.payment.amount),
          daysPastDue: Math.ceil((now.getTime() - new Date(p.payment.dueDate).getTime()) / (1000 * 60 * 60 * 24)),
          propertyName: p.property.name,
          unitNumber: p.unit.unitNumber,
        })),
      },
      alerts: {
        overduePayments: overduePayments.length,
        expiredLeases: leasesExpiringSoon.length,
        vacantUnits: unitsAnalytics.availableUnits,
        totalAlerts: overduePayments.length + leasesExpiringSoon.length + unitsAnalytics.availableUnits,
      },
      recentActivity: {
        newLeases: leaseAnalytics.activeLeases,
        completedPayments: paymentOverview.filter(p => p.payment.status === 'completed').length,
        newTenants: tenantsList.length, // Simplified - could track recent additions
      },
    };

    res.json({
      success: true,
      data: completeDashboard,
      message: 'Complete landlord dashboard retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching complete dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch complete dashboard',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Bulk create units for a property
router.post('/properties/:propertyId/bulk-units', authenticate, authorize('landlord'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    // Validate that landlord owns the property
    const ownsProperty = await OwnershipService.isLandlordOwnerOfProperty(
      req.user!.id,
      req.params.propertyId
    );

    if (!ownsProperty) {
      return res.status(403).json({
        success: false,
        error: 'You can only create units in your own properties',
      });
    }

    const bulkData = {
      propertyId: req.params.propertyId,
      units: req.body.units,
    };

    const result = await UnitService.createBulkUnits(req.user!.id, bulkData);

    res.status(201).json({
      success: true,
      data: result,
      message: `Successfully created ${result.created} units in property`,
    });
  } catch (error) {
    console.error('Error creating bulk units:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to create bulk units',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Generate comprehensive financial report
router.post('/reports/financial', authenticate, authorize('landlord'), validateBody(financialReportSchema), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const { startDate, endDate, propertyId, reportType } = req.body;
    const landlordId = req.user!.id;

    // Get all relevant data
    const [allProperties, payments, leases] = await Promise.all([
      PropertyService.getLandlordProperties(landlordId),
      OwnershipService.getLandlordPayments(landlordId),
      LeaseService.getLandlordLeases(landlordId, propertyId ? { propertyId } : undefined)
    ]);

    // Filter properties if specific propertyId requested
    const properties = propertyId
      ? allProperties.filter(p => p.id === propertyId)
      : allProperties;

    // Filter payments by date range if provided
    let filteredPayments = payments;
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      filteredPayments = payments.filter(p => {
        const paymentDate = new Date(p.payment.createdAt);
        return paymentDate >= start && paymentDate <= end;
      });
    }

    // Calculate financial metrics
    const totalRevenue = filteredPayments
      .filter(p => p.payment.status === 'completed')
      .reduce((sum, p) => sum + parseFloat(p.payment.amount), 0);

    const pendingRevenue = filteredPayments
      .filter(p => p.payment.status === 'pending')
      .reduce((sum, p) => sum + parseFloat(p.payment.amount), 0);

    const occupancyRate = leases.length > 0
      ? (leases.filter(l => l.lease.status === 'active').length / leases.length) * 100
      : 0;

    // Revenue by property
    const revenueByProperty = properties.map(property => {
      const propertyPayments = filteredPayments.filter(p => p.property.id === property.id);
      return {
        propertyId: property.id,
        propertyName: property.name,
        totalRevenue: propertyPayments
          .filter(p => p.payment.status === 'completed')
          .reduce((sum, p) => sum + parseFloat(p.payment.amount), 0),
        pendingRevenue: propertyPayments
          .filter(p => p.payment.status === 'pending')
          .reduce((sum, p) => sum + parseFloat(p.payment.amount), 0),
        units: propertyPayments.length,
      };
    });

    // Revenue by month (for trend analysis)
    const monthlyRevenue: Record<string, number> = {};
    filteredPayments
      .filter(p => p.payment.status === 'completed')
      .forEach(p => {
        const month = new Date(p.payment.paidDate || p.payment.createdAt).toISOString().substring(0, 7);
        monthlyRevenue[month] = (monthlyRevenue[month] || 0) + parseFloat(p.payment.amount);
      });

    const report = {
      reportInfo: {
        reportType,
        dateRange: { startDate, endDate },
        generatedAt: new Date().toISOString(),
        landlordId,
        propertiesIncluded: properties.length,
      },
      summary: {
        totalRevenue,
        pendingRevenue,
        totalProperties: properties.length,
        totalActiveLeases: leases.filter(l => l.lease.status === 'active').length,
        occupancyRate: Math.round(occupancyRate * 100) / 100,
        averageRevenuePerProperty: properties.length > 0 ? totalRevenue / properties.length : 0,
      },
      breakdown: {
        revenueByProperty,
        monthlyTrends: Object.entries(monthlyRevenue)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, revenue]) => ({ month, revenue })),
      },
      ...(reportType === 'detailed' && {
        detailedTransactions: filteredPayments.map(p => ({
          paymentId: p.payment.id,
          tenantName: `${p.tenant.firstName} ${p.tenant.lastName}`,
          propertyName: p.property.name,
          unitNumber: p.unit.unitNumber,
          amount: parseFloat(p.payment.amount),
          status: p.payment.status,
          dueDate: p.payment.dueDate,
          paidDate: p.payment.paidDate,
        })),
      }),
      ...(reportType === 'tax' && {
        taxInfo: {
          totalRentalIncome: totalRevenue,
          propertiesCount: properties.length,
          note: 'Please consult with a tax professional for proper tax reporting',
        },
      }),
    };

    res.json({
      success: true,
      data: report,
      message: `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} financial report generated successfully`,
    });
  } catch (error) {
    console.error('Error generating financial report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate financial report',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get landlord alerts (overdue payments, expiring leases, vacant units)
router.get('/alerts', authenticate, authorize('landlord'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const landlordId = req.user!.id;

    const [payments, leases, unitsAnalytics] = await Promise.all([
      OwnershipService.getLandlordPayments(landlordId),
      LeaseService.getLandlordLeases(landlordId),
      UnitService.getUnitsAnalytics(landlordId)
    ]);

    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    // Overdue payments
    const overduePayments = payments.filter(p =>
      p.payment.status === 'pending' && new Date(p.payment.dueDate) < now
    );

    // Expiring leases (next 30 days)
    const expiringLeases = leases.filter(l => {
      if (!l.lease.endDate) return false;
      const endDate = new Date(l.lease.endDate);
      return endDate >= now && endDate <= thirtyDaysFromNow && l.lease.status === 'active';
    });

    const alerts = {
      summary: {
        total: overduePayments.length + expiringLeases.length + unitsAnalytics.availableUnits,
        overdue: overduePayments.length,
        expiring: expiringLeases.length,
        vacant: unitsAnalytics.availableUnits,
      },
      overduePayments: overduePayments.map(p => ({
        paymentId: p.payment.id,
        tenantName: `${p.tenant.firstName} ${p.tenant.lastName}`,
        propertyName: p.property.name,
        unitNumber: p.unit.unitNumber,
        amount: parseFloat(p.payment.amount),
        dueDate: p.payment.dueDate,
        daysPastDue: Math.ceil((now.getTime() - new Date(p.payment.dueDate).getTime()) / (1000 * 60 * 60 * 24)),
        priority: Math.ceil((now.getTime() - new Date(p.payment.dueDate).getTime()) / (1000 * 60 * 60 * 24)) > 30 ? 'high' : 'medium',
      })),
      expiringLeases: expiringLeases.map(l => ({
        leaseId: l.lease.id,
        tenantName: `${l.tenant.firstName} ${l.tenant.lastName}`,
        propertyName: l.property.name,
        unitNumber: l.unit.unitNumber,
        endDate: l.lease.endDate,
        daysUntilExpiry: Math.ceil((new Date(l.lease.endDate!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
        monthlyRent: parseFloat(l.lease.monthlyRent),
        priority: Math.ceil((new Date(l.lease.endDate!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) <= 7 ? 'high' : 'medium',
      })),
      vacantUnits: unitsAnalytics.availableUnits,
      recommendations: [
        ...(overduePayments.length > 0 ? ['Contact tenants with overdue payments'] : []),
        ...(expiringLeases.length > 0 ? ['Prepare lease renewals for expiring leases'] : []),
        ...(unitsAnalytics.availableUnits > 0 ? ['Market vacant units to potential tenants'] : []),
      ],
    };

    res.json({
      success: true,
      data: alerts,
      message: 'Landlord alerts retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch alerts',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Quick stats endpoint for mobile dashboard widgets
router.get('/quick-stats', authenticate, authorize('landlord'), async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const landlordId = req.user!.id;

    // Get essential stats quickly
    const [properties, tenants, payments, units] = await Promise.all([
      PropertyService.getLandlordProperties(landlordId),
      UserService.getLandlordTenants(landlordId),
      OwnershipService.getLandlordPayments(landlordId),
      UnitService.getLandlordUnits(landlordId)
    ]);

    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const thisMonthPayments = payments.filter(p => {
      const paymentDate = new Date(p.payment.createdAt);
      return paymentDate >= thisMonth && p.payment.status === 'completed';
    });

    const overduePayments = payments.filter(p =>
      p.payment.status === 'pending' && new Date(p.payment.dueDate) < now
    );

    const quickStats = {
      properties: properties.length,
      totalUnits: units.length,
      occupiedUnits: units.filter(u => u.currentLease?.id).length,
      totalTenants: tenants.length,
      thisMonthRevenue: thisMonthPayments.reduce((sum, p) => sum + parseFloat(p.payment.amount), 0),
      overduePayments: overduePayments.length,
      occupancyRate: units.length > 0
        ? Math.round((units.filter(u => u.currentLease?.id).length / units.length) * 100)
        : 0,
      alerts: overduePayments.length, // Simplified alert count
    };

    res.json({
      success: true,
      data: quickStats,
      message: 'Quick stats retrieved successfully',
    });
  } catch (error) {
    console.error('Error fetching quick stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch quick stats',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;