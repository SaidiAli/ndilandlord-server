
import { db } from './index';
import { amenities } from './schema';
import { eq } from 'drizzle-orm';

const DEFAULT_AMENITIES = [
    'WiFi',
    'Air Conditioning',
    'Furnished',
    'Parking',
    'Gym',
    'Pool',
    'Balcony',
    'Dishwasher',
    'Washer/Dryer',
    'Pet Friendly',
    'Elevator',
    'Security System',
    'Doorman',
    'Wheelchair Accessible'
];

async function seedAmenities() {
    console.log('🌱 Seeding amenities...');

    try {
        for (const name of DEFAULT_AMENITIES) {
            // Check if exists
            const existing = await db.select().from(amenities).where(eq(amenities.name, name));

            if (existing.length === 0) {
                await db.insert(amenities).values({ name });
                console.log(`✅ Added amenity: ${name}`);
            } else {
                console.log(`ℹ️ Amenity already exists: ${name}`);
            }
        }

        console.log('✨ Amenities seeding completed!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding amenities:', error);
        process.exit(1);
    }
}

seedAmenities();
