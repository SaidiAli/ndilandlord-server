import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validation';
import { authenticate } from '../middleware/auth';
import { registerationController, loginController, profileController } from '../controllers/auth';

const router = Router();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email().optional(),
  username: z.string().min(1),
  password: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string(),
  role: z.enum(['admin', 'landlord', 'tenant']),
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// @ts-ignore
router.post('/register', validateBody(registerSchema), registerationController);

// @ts-ignore
router.post('/login', validateBody(loginSchema), loginController);

// @ts-ignore
router.get('/me', authenticate, profileController);

export default router;