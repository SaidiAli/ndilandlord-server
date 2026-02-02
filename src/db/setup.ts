import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { config } from '../domain/config';
import { eq } from 'drizzle-orm';
import * as schema from './schema';

dotenv.config();

// Amenity definitions
type AmenityType = 'residential' | 'commercial' | 'common';

const RESIDENTIAL_AMENITIES: string[] = [
  'Balcony', 'Dishwasher', 'Washer/Dryer', 'Pet Friendly', 'Furnished',
  'Walk-in Closet', 'Fireplace', 'Patio', 'Garden', 'Storage Unit'
];

const COMMERCIAL_AMENITIES: string[] = [
  'Loading Dock', 'Conference Room', 'Reception Area', 'Server Room',
  'Kitchenette', 'Private Restroom', 'Signage Rights', 'Drive-Through',
  'High Ceilings', 'Open Floor Plan'
];

const COMMON_AMENITIES: string[] = [
  'WiFi', 'Air Conditioning', 'Parking', 'Gym', 'Pool', 'Elevator',
  'Security System', 'Doorman', 'Wheelchair Accessible', '24/7 Access',
  'CCTV', 'Backup Generator', 'Water Tank', 'Intercom'
];

/**
 * Complete database setup script
 * - Runs migrations
 * - Applies performance indexes
 * - Seeds amenities
 */

const connectionString = config.database.url;

const setupDatabase = async (options: { indexes?: boolean; amenities?: boolean } = {}) => {
  const { indexes = true, amenities = true } = options;

  console.log('🚀 Starting database setup...');

  if (!connectionString) {
    throw new Error('Database URL is not configured');
  }

  const migrationClient = postgres(connectionString, { max: 1 });
  const db = drizzle(migrationClient);

  try {
    // Step 1: Run Drizzle migrations
    console.log('📋 Running Drizzle migrations...');
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('✅ Drizzle migrations completed');

    // Step 2: Apply performance indexes
    if (indexes) {
      console.log('🔍 Applying performance indexes...');
      const indexesPath = path.join(__dirname, 'migrations', 'indexes.sql');

      if (fs.existsSync(indexesPath)) {
        const indexesSQL = fs.readFileSync(indexesPath, 'utf8');

        // Split by statement separator and execute each
        const statements = indexesSQL
          .split(';\n')
          .map(stmt => stmt.trim())
          .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

        for (const statement of statements) {
          if (statement.trim()) {
            try {
              await migrationClient.unsafe(statement);
            } catch (error: any) {
              // Ignore "already exists" errors for indexes
              if (!error.message.includes('already exists')) {
                console.warn(`Warning: Index creation failed: ${error.message}`);
              }
            }
          }
        }

        console.log('✅ Performance indexes applied');
      } else {
        console.log('⚠️  Indexes file not found, skipping...');
      }
    }

    // Step 3: Seed amenities
    if (amenities) {
      await seedAmenities(migrationClient);
    }

    // Step 4: Verify setup
    console.log('🔍 Verifying database setup...');
    const verificationResult = await verifyDatabaseSetup(migrationClient);

    if (verificationResult.success) {
      console.log('✅ Database setup verification passed');
      console.log('\n📊 Database Statistics:');
      console.log(`• Tables: ${verificationResult.tableCount}`);
      console.log(`• Indexes: ${verificationResult.indexCount}`);
      console.log(`• Users: ${verificationResult.userCount}`);
      console.log(`• Properties: ${verificationResult.propertyCount}`);
      console.log(`• Units: ${verificationResult.unitCount}`);
      console.log(`• Leases: ${verificationResult.leaseCount}`);
      console.log(`• Payments: ${verificationResult.paymentCount}`);
    } else {
      console.error('❌ Database setup verification failed');
    }

    console.log('\n🎉 Database setup completed successfully!');

  } catch (error) {
    console.error('❌ Database setup failed:', error);
    throw error;
  } finally {
    await migrationClient.end();
  }
};

const verifyDatabaseSetup = async (client: postgres.Sql) => {
  try {
    // Check if all required tables exist
    const tables = await client`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `;

    const requiredTables = ['users', 'properties', 'units', 'leases', 'payments'];
    const existingTables = tables.map((t: any) => t.table_name);
    const missingTables = requiredTables.filter(table => !existingTables.includes(table));

    if (missingTables.length > 0) {
      throw new Error(`Missing required tables: ${missingTables.join(', ')}`);
    }

    // Check indexes
    const indexes = await client`
      SELECT indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public'
    `;

    // Count records
    const userCount = await client`SELECT COUNT(*) as count FROM users`;
    const propertyCount = await client`SELECT COUNT(*) as count FROM properties`;
    const unitCount = await client`SELECT COUNT(*) as count FROM units`;
    const leaseCount = await client`SELECT COUNT(*) as count FROM leases`;
    const paymentCount = await client`SELECT COUNT(*) as count FROM payments`;

    return {
      success: true,
      tableCount: tables.length,
      indexCount: indexes.length,
      userCount: Number(userCount[0].count),
      propertyCount: Number(propertyCount[0].count),
      unitCount: Number(unitCount[0].count),
      leaseCount: Number(leaseCount[0].count),
      paymentCount: Number(paymentCount[0].count),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

const seedAmenities = async (client: postgres.Sql) => {
  console.log('🌱 Seeding amenities...');

  const db = drizzle(client, { schema });
  const amenityList: { name: string; type: AmenityType }[] = [
    ...RESIDENTIAL_AMENITIES.map(name => ({ name, type: 'residential' as AmenityType })),
    ...COMMERCIAL_AMENITIES.map(name => ({ name, type: 'commercial' as AmenityType })),
    ...COMMON_AMENITIES.map(name => ({ name, type: 'common' as AmenityType })),
  ];

  let added = 0;
  let skipped = 0;

  for (const { name, type } of amenityList) {
    const existing = await db.select().from(schema.amenities).where(eq(schema.amenities.name, name));

    if (existing.length === 0) {
      await db.insert(schema.amenities).values({ name, type });
      added++;
    } else if (existing[0].type !== type) {
      await db.update(schema.amenities).set({ type }).where(eq(schema.amenities.name, name));
      added++;
    } else {
      skipped++;
    }
  }

  console.log(`✅ Amenities seeded: ${added} added/updated, ${skipped} skipped`);
};

const resetDatabase = async () => {
  console.log('⚠️  Resetting database...');

  if (!connectionString) {
    throw new Error('Database URL is not configured');
  }

  const migrationClient = postgres(connectionString, { max: 1 });

  try {
    // Drop all tables in correct order (respecting foreign keys)
    await migrationClient`DROP TABLE IF EXISTS payments CASCADE`;
    await migrationClient`DROP TABLE IF EXISTS maintenance_requests CASCADE`;
    await migrationClient`DROP TABLE IF EXISTS leases CASCADE`;
    await migrationClient`DROP TABLE IF EXISTS units CASCADE`;
    await migrationClient`DROP TABLE IF EXISTS properties CASCADE`;
    await migrationClient`DROP TABLE IF EXISTS users CASCADE`;

    // Drop custom types
    await migrationClient`DROP TYPE IF EXISTS user_role CASCADE`;
    await migrationClient`DROP TYPE IF EXISTS lease_status CASCADE`;
    await migrationClient`DROP TYPE IF EXISTS payment_status CASCADE`;
    await migrationClient`DROP TYPE IF EXISTS maintenance_status CASCADE`;
    await migrationClient`DROP TYPE IF EXISTS mobile_money_provider CASCADE`;

    console.log('✅ Database reset completed');
  } catch (error) {
    console.error('❌ Database reset failed:', error);
    throw error;
  } finally {
    await migrationClient.end();
  }
};

// Command line interface
const main = async () => {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'setup':
        await setupDatabase({
          indexes: !args.includes('--no-indexes'),
          amenities: !args.includes('--no-amenities')
        });
        break;

      case 'indexes':
        await setupDatabase({ indexes: true, amenities: false });
        break;

      case 'amenities':
        // Run amenities seeding only
        if (!connectionString) {
          throw new Error('Database URL is not configured');
        }
        const amenityClient = postgres(connectionString, { max: 1 });
        try {
          await seedAmenities(amenityClient);
        } finally {
          await amenityClient.end();
        }
        break;

      case 'reset':
        await resetDatabase();
        break;

      case 'full':
        await resetDatabase();
        await setupDatabase({ indexes: true, amenities: true });
        break;

      default:
        console.log('Usage: tsx src/db/setup.ts <command>');
        console.log('Commands:');
        console.log('  setup [--no-indexes] [--no-amenities] - Run migrations and setup');
        console.log('  indexes                               - Apply indexes only');
        console.log('  amenities                             - Seed amenities only');
        console.log('  reset                                 - Reset database (drop all tables)');
        console.log('  full                                  - Full reset and setup with seed data');
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

// Export functions for programmatic use
export { setupDatabase, resetDatabase, verifyDatabaseSetup, seedAmenities };

// Run if called directly
if (require.main === module) {
  main();
}