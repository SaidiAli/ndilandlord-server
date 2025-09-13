import { Router, Response, Request } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { validateBody } from '../middleware/validation';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { authenticate } from '../middleware/auth';

const router = Router();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email().optional(),
  userName: z.string().min(1),
  password: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string(),
  role: z.enum(['admin', 'landlord', 'tenant']),
});

const loginSchema = z.object({
  userName: z.string().min(1),
  password: z.string().min(1),
});

// @ts-ignore
router.post('/register', validateBody(registerSchema), async (req: Request, res: Response<ApiResponse>) => {
  try {
    const { userName, password, firstName, lastName, phone, role } = req.body;

    // Check if user already exists
    const existingUser = await db.select().from(users).where(eq(users.userName, userName)).limit(1);

    if (existingUser.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'User already exists with this email',
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const newUser = await db.insert(users).values({
      userName,
      password: hashedPassword,
      firstName,
      lastName,
      phone,
      role,
    }).returning({
      id: users.id,
      userName: users.userName,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
    });

    // Generate JWT
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({
        success: false,
        error: 'Server configuration error',
      });
    }

    const token = jwt.sign(
      {
        userId: newUser[0].id,
        userName: newUser[0].userName,
        role: newUser[0].role
      },
      jwtSecret,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      success: true,
      data: {
        user: newUser[0],
        token,
      },
      message: 'User registered successfully',
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed',
    });
  }
});

// @ts-ignore
router.post('/login', validateBody(loginSchema), async (req: Request, res: Response<ApiResponse>) => {
  try {
    const { userName, password } = req.body;

    // Find user
    const user = await db.select().from(users).where(eq(users.userName, userName)).limit(1);

    if (user.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user[0].password);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
      });
    }

    // Check if user is active
    if (!user[0].isActive) {
      return res.status(401).json({
        success: false,
        error: 'Account is deactivated',
      });
    }

    // Generate JWT
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({
        success: false,
        error: 'Server configuration error',
      });
    }

    const token = jwt.sign(
      {
        userId: user[0].id,
        email: user[0].email,
        role: user[0].role
      },
      jwtSecret,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      data: {
        user: {
          id: user[0].id,
          email: user[0].email,
          firstName: user[0].firstName,
          lastName: user[0].lastName,
          role: user[0].role,
        },
        token,
      },
      message: 'Login successful',
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed',
    });
  }
});

// @ts-ignore
router.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    const user = await db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      phone: users.phone,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
    }).from(users).where(eq(users.id, req.user!.id)).limit(1);

    if (user.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.json({
      success: true,
      data: user[0],
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user',
    });
  }
});

export default router;