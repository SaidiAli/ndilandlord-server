import { Response } from 'express';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { LeaseService } from '../services/leaseService';

export const updateLease = async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const lease = await LeaseService.updateLease(req.user!.id, req.params.id, req.body);

    res.json({
      success: true,
      data: lease,
      message: 'Lease updated successfully',
    });
  } catch (error) {
    console.error('Error updating lease:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to update lease',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}