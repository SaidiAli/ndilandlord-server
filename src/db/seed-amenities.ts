import { db } from './index';
import { amenities } from './schema';
import { eq, and } from 'drizzle-orm';

type AmenityType = 'residential' | 'commercial' | 'common';

interface AmenityDefinition {
    name: string;
    type: AmenityType;
}

// Residential-specific amenities
const RESIDENTIAL_AMENITIES: string[] = [
    'Balcony',
    'Dishwasher',
    'Washer/Dryer',
    'Pet Friendly',
    'Furnished',
    'Walk-in Closet',
    'Fireplace',
    'Patio',
    'Garden',
    'Storage Unit'
];

// Commercial-specific amenities
const COMMERCIAL_AMENITIES: string[] = [
    'Loading Dock',
    'Conference Room',
    'Reception Area',
    'Server Room',
    'Kitchenette',
    'Private Restroom',
    'Signage Rights',
    'Drive-Through',
    'High Ceilings',
    'Open Floor Plan'
];

// Common amenities (applicable to both residential and commercial)
const COMMON_AMENITIES: string[] = [
    'WiFi',
    'Air Conditioning',
    'Parking',
    'Gym',
    'Pool',
    'Elevator',
    'Security System',
    'Doorman',
    'Wheelchair Accessible',
    '24/7 Access',
    'CCTV',
    'Backup Generator',
    'Water Tank',
    'Intercom'
];

function buildAmenityList(): AmenityDefinition[] {
    const list: AmenityDefinition[] = [];

    for (const name of RESIDENTIAL_AMENITIES) {
        list.push({ name, type: 'residential' });
    }

    for (const name of COMMERCIAL_AMENITIES) {
        list.push({ name, type: 'commercial' });
    }

    for (const name of COMMON_AMENITIES) {
        list.push({ name, type: 'common' });
    }

    return list;
}

async function seedAmenities() {
    console.log('Seeding amenities...');

    const amenityList = buildAmenityList();

    try {
        let added = 0;
        let skipped = 0;

        for (const { name, type } of amenityList) {
            // Check if amenity with this name already exists
            const existing = await db.select().from(amenities).where(eq(amenities.name, name));

            if (existing.length === 0) {
                await db.insert(amenities).values({ name, type });
                console.log(`  Added [${type}]: ${name}`);
                added++;
            } else {
                // Update type if it changed
                if (existing[0].type !== type) {
                    await db.update(amenities)
                        .set({ type })
                        .where(eq(amenities.name, name));
                    console.log(`  Updated [${type}]: ${name}`);
                    added++;
                } else {
                    skipped++;
                }
            }
        }

        console.log(`\nAmenities seeding completed: ${added} added/updated, ${skipped} skipped`);
        process.exit(0);
    } catch (error) {
        console.error('Error seeding amenities:', error);
        process.exit(1);
    }
}

seedAmenities();
