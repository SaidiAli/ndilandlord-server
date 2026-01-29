import { AmenityType, CreateAmenityInput } from '../common/types';
import { db } from '../db';
import { amenities } from '../db/schema';
import { eq, or } from 'drizzle-orm';

export class AmenityService {
    /**
     * Get all amenities
     */
    static async getAllAmenities() {
        return db.select().from(amenities).orderBy(amenities.name);
    }

    /**
     * Get amenities by type (for filtering based on property type)
     */
    static async getAmenitiesByType(type: AmenityType) {
        return db
            .select()
            .from(amenities)
            .where(
                or(
                    eq(amenities.type, type),
                    eq(amenities.type, 'common')
                )
            )
            .orderBy(amenities.name);
    }

    /**
     * Get amenities for residential properties
     */
    static async getResidentialAmenities() {
        return this.getAmenitiesByType('residential');
    }

    /**
     * Get amenities for commercial properties
     */
    static async getCommercialAmenities() {
        return this.getAmenitiesByType('commercial');
    }

    /**
     * Create a new amenity
     */
    static async createAmenity(data: CreateAmenityInput) {
        // Check if exists
        const [existing] = await db
            .select()
            .from(amenities)
            .where(eq(amenities.name, data.name))
            .limit(1);

        if (existing) {
            return existing;
        }

        const [newAmenity] = await db
            .insert(amenities)
            .values({
                name: data.name,
                type: data.type || 'common',
            })
            .returning();

        return newAmenity;
    }

    /**
     * Get amenity by ID
     */
    static async getAmenityById(id: string) {
        const [amenity] = await db
            .select()
            .from(amenities)
            .where(eq(amenities.id, id))
            .limit(1);

        return amenity || null;
    }

    /**
     * Update amenity
     */
    static async updateAmenity(id: string, data: Partial<CreateAmenityInput>) {
        const [updated] = await db
            .update(amenities)
            .set(data)
            .where(eq(amenities.id, id))
            .returning();

        return updated || null;
    }

    /**
     * Delete amenity
     */
    static async deleteAmenity(id: string) {
        await db.delete(amenities).where(eq(amenities.id, id));
        return { success: true };
    }
}