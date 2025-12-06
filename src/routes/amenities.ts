import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { createAmenity, getAllAmenities } from '../controllers/amenities';
import { z } from 'zod';
import { validateBody } from '../middleware/validation';

const router = Router();

const createAmenitySchema = z.object({
    name: z.string().min(1),
});

// Get all amenities (authenticated users)
router.get('/', authenticate, getAllAmenities);

// Create amenity (optional, mostly for testing or seeding via API)
router.post('/', authenticate, validateBody(createAmenitySchema), createAmenity);

export default router;
