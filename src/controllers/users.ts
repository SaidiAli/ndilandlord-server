import { Response } from 'express';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { UserService } from '../services/userService';

export const getAllUsersController = async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
        const { role, isActive } = req.query;

        const filters = {
            role: role as any,
            isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
        };

        const users = await UserService.getAllUsers(req.user!.role, req.user!.id, filters);

        res.json({
            success: true,
            data: users,
            message: 'Users retrieved successfully',
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch users',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

export const createTenantController = async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
        const tenant = await UserService.createTenant(req.body);

        res.status(201).json({
            success: true,
            data: tenant,
            message: 'Tenant created successfully',
        });
    } catch (error) {
        console.error('Error creating tenant:', error);
        res.status(400).json({
            success: false,
            error: 'Failed to create tenant',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

export const createTenantWithLease = async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
        const result = await UserService.createTenantWithLease(req.user!.id, req.body);

        res.status(201).json({
            success: true,
            data: result,
            message: 'Tenant created and lease assigned successfully',
        });
    } catch (error) {
        console.error('Error creating tenant with lease:', error);
        res.status(400).json({
            success: false,
            error: 'Failed to create tenant with lease',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

export const getLandlordTenantsController = async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
        const tenants = await UserService.getLandlordTenants(req.user!.id);

        res.json({
            success: true,
            data: tenants,
            message: 'Tenants retrieved successfully',
        });
    } catch (error) {
        console.error('Error fetching tenants:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch tenants',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

export const getTenantDetailsController = async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
        const tenantDetails = await UserService.getTenantDetails(req.user!.id, req.params.tenantId);

        if (!tenantDetails) {
            return res.status(404).json({
                success: false,
                error: 'Tenant not found or not accessible',
            });
        }

        res.json({
            success: true,
            data: tenantDetails,
            message: 'Tenant details retrieved successfully',
        });
    } catch (error) {
        console.error('Error fetching tenant details:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch tenant details',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

export const getUserByIdController = async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
        const user = await UserService.getUserById(
            req.user!.id,
            req.user!.role,
            req.params.id
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found or not accessible',
            });
        }

        res.json({
            success: true,
            data: user,
            message: 'User retrieved successfully',
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch user',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

export const updateUserController = async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
        const updatedUser = await UserService.updateUser(
            req.user!.id,
            req.user!.role,
            req.params.id,
            req.body
        );

        res.json({
            success: true,
            data: updatedUser,
            message: 'User updated successfully',
        });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(400).json({
            success: false,
            error: 'Failed to update user',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

export const updateUserProfileController = async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const updatedUser = await UserService.updateProfile(req.user!.id, req.body);
    res.json({
      success: true,
      data: updatedUser,
      message: 'Profile updated successfully',
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to update profile',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}