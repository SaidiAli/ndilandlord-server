import { db } from '../db';
import { amenities } from '../db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

export const createAmenitySchema = z.object({
    name: z.string().min(1, 'Amenity name is required'),
});

export class AmenityService {
    /**
     * Get all amenities
     */
    static async getAllAmenities() {
        try {
            const allAmenities = await db.select().from(amenities).orderBy(amenities.name);
            return allAmenities;
        } catch (error) {
            console.error('Error fetching amenities:', error);
            throw error;
        }
    }

    /**
     * Create a new amenity (if it doesn't exist)
     */
    static async createAmenity(name: string) {
        try {
            // Check if exists
            const existing = await db
                .select()
                .from(amenities)
                .where(eq(amenities.name, name))
                .limit(1);

            if (existing.length > 0) {
                return existing[0];
            }

            const newAmenity = await db.insert(amenities).values({ name }).returning();
            return newAmenity[0];
        } catch (error) {
            console.error('Error creating amenity:', error);
            throw error;
        }
    }
}
