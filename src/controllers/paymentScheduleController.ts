import { Response } from 'express';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { PaymentScheduleService } from '../services/paymentScheduleService';
import { OwnershipService } from '../db/ownership';
import { z } from 'zod';

export class PaymentScheduleController {

    /**
     * Get payment schedules for a specific lease
     */
    static async getSchedules(req: AuthenticatedRequest, res: Response<ApiResponse>) {
        try {
            const { leaseId } = req.query;

            // Validate input
            if (!leaseId || typeof leaseId !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: 'Lease ID is required as a query parameter',
                });
            }

            // Check ownership
            const user = req.user!;

            if (user.role === 'landlord') {
                const ownsLease = await OwnershipService.isLandlordOwnerOfLease(user.id, leaseId);
                if (!ownsLease) {
                    return res.status(403).json({
                        success: false,
                        error: 'You do not have permission to view schedules for this lease',
                    });
                }
            } else if (user.role === 'tenant') {
                // Tenants can only access schedules for their own leases
                const isOwner = await OwnershipService.isTenantOwnerOfLease(user.id, leaseId);
                if (!isOwner) {
                    return res.status(403).json({
                        success: false,
                        error: 'You do not have permission to view schedules for this lease',
                    });
                }
            }
            // Admin bypasses checks

            const schedules = await PaymentScheduleService.getLeasePaymentSchedule(leaseId);

            return res.json({
                success: true,
                data: schedules,
                message: 'Payment schedules retrieved successfully',
            });

        } catch (error) {
            console.error('Error fetching payment schedules:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch payment schedules',
                message: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }
}
