import { db } from '../db';
import { users, properties, units, leases } from '../db/schema';
import bcrypt from 'bcryptjs';

async function seedTestData() {
  try {
    console.log('Starting test data seeding...');

    // Create a landlord
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    const landlord = await db.insert(users).values({
      email: 'landlord@test.com',
      userName: 'landlord1',
      password: hashedPassword,
      firstName: 'John',
      lastName: 'Landlord',
      phone: '+256700123456',
      role: 'landlord',
      isActive: true,
    }).returning();
    
    console.log('Created landlord:', landlord[0].id);

    // Create a tenant
    const tenant = await db.insert(users).values({
      email: 'tenant@test.com',
      userName: 'tenant1',
      password: hashedPassword,
      firstName: 'Jane',
      lastName: 'Tenant',
      phone: '+256700654321',
      role: 'tenant',
      isActive: true,
    }).returning();
    
    console.log('Created tenant:', tenant[0].id);

    // Create a property
    const property = await db.insert(properties).values({
      name: 'Sunrise Apartments',
      address: '123 Main Street',
      city: 'Kampala',
      state: 'Central',
      postalCode: '12345',
      description: 'Modern apartments in city center',
      landlordId: landlord[0].id,
    }).returning();
    
    console.log('Created property:', property[0].id);

    // Create a unit
    const unit = await db.insert(units).values({
      propertyId: property[0].id,
      unitNumber: '2A',
      bedrooms: 2,
      bathrooms: '1.5',
      squareFeet: 850,
      monthlyRent: '800000', // UGX 800,000
      deposit: '1600000', // UGX 1,600,000
      isAvailable: false, // Rented
      description: '2-bedroom apartment with balcony',
    }).returning();
    
    console.log('Created unit:', unit[0].id);

    // Create a lease
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-12-31');
    
    const lease = await db.insert(leases).values({
      unitId: unit[0].id,
      tenantId: tenant[0].id,
      startDate,
      endDate,
      monthlyRent: '800000', // UGX 800,000
      deposit: '1600000', // UGX 1,600,000
      status: 'active',
      terms: 'Standard lease agreement for 12 months',
    }).returning();
    
    console.log('Created lease:', lease[0].id);

    console.log('\n=== Test Data Created Successfully ===');
    console.log('Landlord ID:', landlord[0].id);
    console.log('Tenant ID:', tenant[0].id);
    console.log('Property ID:', property[0].id);
    console.log('Unit ID:', unit[0].id);
    console.log('Lease ID:', lease[0].id);
    console.log('Monthly Rent: UGX 800,000');
    console.log('\n=== Test Payment Scenarios ===');
    console.log('1. Full Payment: UGX 800,000');
    console.log('2. Partial Payment: UGX 400,000 (50%)');
    console.log('3. Minimum Payment: UGX 10,000');
    console.log('\nUse these credentials to test:');
    console.log('Landlord: landlord@test.com / password123');
    console.log('Tenant: tenant@test.com / password123');

    return {
      landlord: landlord[0],
      tenant: tenant[0],
      property: property[0],
      unit: unit[0],
      lease: lease[0],
    };
  } catch (error) {
    console.error('Error seeding test data:', error);
    throw error;
  }
}

// Run if this file is executed directly
if (require.main === module) {
  seedTestData()
    .then(() => {
      console.log('Seeding completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
}

export { seedTestData };