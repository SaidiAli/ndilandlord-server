import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest, JwtPayload, ApiResponse } from '../types';
import { OwnershipValidation } from '../utils/ownershipValidation';
import { config } from '../domain/config';

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. No token provided.',
      });
    }

    const jwtSecret = config.jwt.secret;
    if (!jwtSecret) {
      return res.status(500).json({
        success: false,
        error: 'Server configuration error: JWT secret is undefined',
      });
    }

    const decoded = jwt.verify(token, jwtSecret) as JwtPayload;
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    };

    // Add ownership context to the request
    req.ownershipContext = await OwnershipValidation.createOwnershipContext(
      decoded.userId,
      decoded.role
    );

    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Invalid token',
    });
  }
};

export const authorize = (...roles: Array<'admin' | 'landlord' | 'tenant'>) => {
  return (
    req: AuthenticatedRequest,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
      });
    }

    return next();
  };
};

/**
 * Middleware to verify ownership of a specific resource
 */
export const requireResourceOwnership = (
  resourceType: string,
  resourceIdParam: string = 'id',
  action: 'read' | 'write' | 'delete' = 'read'
) => {
  return async (
    req: AuthenticatedRequest,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'User not authenticated',
        });
      }

      // Admins bypass ownership checks
      if (req.user.role === 'admin') {
        return next();
      }

      const resourceId = req.params[resourceIdParam];
      if (!resourceId) {
        return res.status(400).json({
          success: false,
          error: 'Resource ID not provided',
        });
      }

      const verification = await OwnershipValidation.verifyResourceAccess(
        req.user.id,
        req.user.role,
        resourceType as any,
        resourceId,
        action
      );

      if (!verification.isAuthorized) {
        return res.status(403).json({
          success: false,
          error: verification.reason || 'Access denied',
          message: verification.alternativeAction,
        });
      }

      return next();
    } catch (error) {
      console.error('Ownership verification error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to verify resource ownership',
      });
    }
  };
};

/**
 * Middleware to inject landlord filtering into query parameters
 */
export const injectLandlordFilter = () => {
  return (
    req: AuthenticatedRequest,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    // For landlords, automatically inject their ID into filters
    if (req.user.role === 'landlord') {
      req.query.landlordId = req.user.id;
    }

    // For tenants, we'll handle filtering in the specific route handlers
    // since tenant filtering is more complex (through lease relationships)

    return next();
  };
};

/**
 * Middleware to validate tenant can only access their own data
 */
export const requireTenantSelfAccess = () => {
  return (
    req: AuthenticatedRequest,
    res: Response<ApiResponse>,
    next: NextFunction
  ) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated',
      });
    }

    // Admins and landlords bypass this check
    if (req.user.role === 'admin' || req.user.role === 'landlord') {
      return next();
    }

    // Tenants can only access their own data
    if (req.user.role === 'tenant') {
      const requestedUserId = req.params.id || req.params.tenantId;
      if (requestedUserId && requestedUserId !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Tenants can only access their own data',
        });
      }
    }

    return next();
  };
};