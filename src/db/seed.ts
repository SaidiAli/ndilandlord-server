import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { users, properties, units, leases, payments } from './schema';

dotenv.config();

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ndilandlord2';
const migrationClient = postgres(connectionString, { max: 1 });
const db = drizzle(migrationClient);

const seedData = async () => {
  console.log('🌱 Starting database seeding...');

  try {
    // Clear existing data (in correct order to respect foreign keys)
    console.log('🧹 Clearing existing data...');
    try {
      await db.delete(payments);
      await db.delete(leases);
      await db.delete(units);
      await db.delete(properties);
      await db.delete(users);
    } catch (error: any) {
      // Ignore table doesn't exist errors - means it's first run
      if (!error.message?.includes('does not exist')) {
        throw error;
      }
      console.log('ℹ️  Tables don\'t exist yet - first setup');
    }

    // Create admin user
    console.log('👤 Creating admin user...');
    const adminPassword = await bcrypt.hash('admin123', 12);
    const adminUsers = await db.insert(users).values({
      userName: 'admin',
      email: 'admin@ndilandlord.com',
      password: adminPassword,
      firstName: 'System',
      lastName: 'Administrator',
      phone: '+256700000000',
      role: 'admin',
      isActive: true,
    }).returning();
    
    const adminId = adminUsers[0].id;
    console.log(`✅ Admin user created: ${adminId}`);

    // Create landlord users
    console.log('🏠 Creating landlord users...');
    const landlordPassword = await bcrypt.hash('landlord123', 12);
    
    const landlordData = [
      {
        userName: 'james_landlord',
        email: 'james@ndilandlord.com',
        firstName: 'James',
        lastName: 'Mukwaya',
        phone: '+256701234567',
      },
      {
        userName: 'sarah_properties',
        email: 'sarah@ndilandlord.com',
        firstName: 'Sarah',
        lastName: 'Nakato',
        phone: '+256702345678',
      },
      {
        userName: 'robert_estates',
        email: 'robert@ndilandlord.com',
        firstName: 'Robert',
        lastName: 'Kiwanuka',
        phone: '+256703456789',
      }
    ];

    const landlords = await db.insert(users).values(
      landlordData.map(landlord => ({
        ...landlord,
        password: landlordPassword,
        role: 'landlord' as const,
        isActive: true,
      }))
    ).returning();

    console.log(`✅ Created ${landlords.length} landlord users`);

    // Create properties
    console.log('🏢 Creating properties...');
    const propertiesData = [
      // James's properties
      {
        name: 'Nakawa Heights Apartments',
        address: 'Plot 123, Nakawa Road',
        city: 'Kampala',
        state: 'Central Region',
        zipCode: '00256',
        description: 'Modern apartment complex in Nakawa with excellent amenities',
        landlordId: landlords[0].id,
      },
      {
        name: 'Bugolobi Executive Suites',
        address: 'Plot 45, Bugolobi Street',
        city: 'Kampala',
        state: 'Central Region',
        zipCode: '00256',
        description: 'Luxury executive apartments near the lake',
        landlordId: landlords[0].id,
      },
      // Sarah's properties
      {
        name: 'Ntinda Family Homes',
        address: 'Plot 67, Ntinda Road',
        city: 'Kampala',
        state: 'Central Region',
        zipCode: '00256',
        description: 'Family-friendly residential complex in Ntinda',
        landlordId: landlords[1].id,
      },
      {
        name: 'Kololo Garden Apartments',
        address: 'Plot 89, Kololo Hill',
        city: 'Kampala',
        state: 'Central Region',
        zipCode: '00256',
        description: 'Premium apartments in the heart of Kololo',
        landlordId: landlords[1].id,
      },
      // Robert's properties
      {
        name: 'Muyenga Hillside Villas',
        address: 'Plot 12, Muyenga Hill',
        city: 'Kampala',
        state: 'Central Region',
        zipCode: '00256',
        description: 'Exclusive villas with city views',
        landlordId: landlords[2].id,
      }
    ];

    const createdProperties = await db.insert(properties).values(propertiesData).returning();
    console.log(`✅ Created ${createdProperties.length} properties`);

    // Create units
    console.log('🏠 Creating units...');
    const unitsData = [];

    // Nakawa Heights Apartments (Property 1) - 8 units
    for (let i = 1; i <= 8; i++) {
      unitsData.push({
        propertyId: createdProperties[0].id,
        unitNumber: `A${i}`,
        bedrooms: i <= 4 ? 2 : 3,
        bathrooms: (i <= 4 ? 2.0 : 2.5).toString(),
        squareFeet: i <= 4 ? 900 : 1200,
        monthlyRent: (i <= 4 ? 800000 : 1200000).toString(), // 800k or 1.2M UGX
        deposit: (i <= 4 ? 1600000 : 2400000).toString(),
        isAvailable: i > 6, // Last 2 units available
        description: `${i <= 4 ? '2' : '3'} bedroom apartment with modern amenities`,
      });
    }

    // Bugolobi Executive Suites (Property 2) - 6 units
    for (let i = 1; i <= 6; i++) {
      unitsData.push({
        propertyId: createdProperties[1].id,
        unitNumber: `B${i}`,
        bedrooms: 3,
        bathrooms: '3.0',
        squareFeet: 1500,
        monthlyRent: '1800000', // 1.8M UGX
        deposit: '3600000',
        isAvailable: i > 4, // Last 2 units available
        description: 'Luxury 3 bedroom executive suite with lake view',
      });
    }

    // Ntinda Family Homes (Property 3) - 10 units
    for (let i = 1; i <= 10; i++) {
      unitsData.push({
        propertyId: createdProperties[2].id,
        unitNumber: `C${i}`,
        bedrooms: i <= 6 ? 2 : 4,
        bathrooms: (i <= 6 ? 2.0 : 3.0).toString(),
        squareFeet: i <= 6 ? 1000 : 1600,
        monthlyRent: (i <= 6 ? 900000 : 1500000).toString(),
        deposit: (i <= 6 ? 1800000 : 3000000).toString(),
        isAvailable: i > 7, // Last 3 units available
        description: `Family-friendly ${i <= 6 ? '2' : '4'} bedroom home`,
      });
    }

    // Kololo Garden Apartments (Property 4) - 5 units
    for (let i = 1; i <= 5; i++) {
      unitsData.push({
        propertyId: createdProperties[3].id,
        unitNumber: `D${i}`,
        bedrooms: 3,
        bathrooms: '2.5',
        squareFeet: 1300,
        monthlyRent: '2200000', // 2.2M UGX
        deposit: '4400000',
        isAvailable: i > 3, // Last 2 units available
        description: 'Premium garden apartment in Kololo',
      });
    }

    // Muyenga Hillside Villas (Property 5) - 4 units
    for (let i = 1; i <= 4; i++) {
      unitsData.push({
        propertyId: createdProperties[4].id,
        unitNumber: `E${i}`,
        bedrooms: 4,
        bathrooms: '4.0',
        squareFeet: 2000,
        monthlyRent: '3000000', // 3M UGX
        deposit: '6000000',
        isAvailable: i > 2, // Last 2 units available
        description: 'Luxury 4 bedroom villa with city views',
      });
    }

    const createdUnits = await db.insert(units).values(unitsData).returning();
    console.log(`✅ Created ${createdUnits.length} units`);

    // Create tenant users
    console.log('👥 Creating tenant users...');
    const tenantPassword = await bcrypt.hash('tenant123', 12);
    
    const tenantData = [
      {
        userName: 'mary_tenant',
        email: 'mary@example.com',
        firstName: 'Mary',
        lastName: 'Namugga',
        phone: '+256704567890',
      },
      {
        userName: 'john_renter',
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Ssemakula',
        phone: '+256705678901',
      },
      {
        userName: 'grace_tenant',
        email: 'grace@example.com',
        firstName: 'Grace',
        lastName: 'Nakimuli',
        phone: '+256706789012',
      },
      {
        userName: 'peter_resident',
        email: 'peter@example.com',
        firstName: 'Peter',
        lastName: 'Mugisha',
        phone: '+256707890123',
      },
      {
        userName: 'jane_occupant',
        email: 'jane@example.com',
        firstName: 'Jane',
        lastName: 'Achieng',
        phone: '+256708901234',
      },
      {
        userName: 'david_lessee',
        email: 'david@example.com',
        firstName: 'David',
        lastName: 'Okello',
        phone: '+256709012345',
      },
      {
        userName: 'susan_tenant',
        email: 'susan@example.com',
        firstName: 'Susan',
        lastName: 'Namatovu',
        phone: '+256700123456',
      },
      {
        userName: 'michael_renter',
        email: 'michael@example.com',
        firstName: 'Michael',
        lastName: 'Tumusiime',
        phone: '+256701234567',
      },
    ];

    const tenants = await db.insert(users).values(
      tenantData.map(tenant => ({
        ...tenant,
        password: tenantPassword,
        role: 'tenant' as const,
        isActive: true,
      }))
    ).returning();

    console.log(`✅ Created ${tenants.length} tenant users`);

    // Create leases for occupied units
    console.log('📋 Creating leases...');
    const occupiedUnits = createdUnits.filter(unit => !unit.isAvailable);
    const leasesData = [];

    for (let i = 0; i < occupiedUnits.length && i < tenants.length; i++) {
      const unit = occupiedUnits[i];
      const tenant = tenants[i];
      
      // Create lease start dates (some recent, some older)
      const leaseStartDate = new Date();
      leaseStartDate.setMonth(leaseStartDate.getMonth() - (i % 12)); // Vary start dates
      
      const leaseEndDate = new Date(leaseStartDate);
      leaseEndDate.setFullYear(leaseStartDate.getFullYear() + 1); // 1 year lease

      leasesData.push({
        unitId: unit.id,
        tenantId: tenant.id,
        startDate: leaseStartDate,
        endDate: leaseEndDate,
        monthlyRent: unit.monthlyRent.toString(),
        deposit: unit.deposit.toString(),
        status: 'active' as const,
        terms: 'Standard rental agreement. Rent due by 1st of each month. 30 days notice required for termination.',
      });
    }

    const createdLeases = await db.insert(leases).values(leasesData).returning();
    console.log(`✅ Created ${createdLeases.length} leases`);

    // Create payment records
    console.log('💰 Creating payment records...');
    const paymentsData = [];

    for (const lease of createdLeases) {
      const leaseStart = new Date(lease.startDate);
      const currentDate = new Date();
      const monthlyRent = parseFloat(lease.monthlyRent);
      
      // Calculate months since lease start
      let paymentDate = new Date(leaseStart);
      let paymentCount = 0;
      
      while (paymentDate <= currentDate && paymentCount < 12) {
        const dueDate = new Date(paymentDate);
        dueDate.setDate(1); // Due on 1st of month
        
        const isLastPayment = paymentCount === Math.floor((currentDate.getTime() - leaseStart.getTime()) / (1000 * 60 * 60 * 24 * 30));
        const isOverdue = Math.random() < 0.1; // 10% chance of being overdue
        
        let status: 'pending' | 'completed' | 'failed';
        let paidDate: Date | null = null;
        
        if (isLastPayment && isOverdue) {
          status = 'pending'; // Current month overdue
        } else if (isLastPayment) {
          status = 'pending'; // Current month not yet paid
        } else {
          status = Math.random() < 0.95 ? 'completed' : 'failed'; // 95% success rate
          if (status === 'completed') {
            paidDate = new Date(dueDate);
            paidDate.setDate(paidDate.getDate() + Math.floor(Math.random() * 5)); // Paid within 5 days
          }
        }

        paymentsData.push({
          leaseId: lease.id,
          amount: monthlyRent.toString(),
          dueDate,
          paidDate,
          status,
          paymentMethod: status === 'completed' ? (Math.random() < 0.7 ? 'mobile_money' : 'bank_transfer') : null,
          transactionId: status === 'completed' ? `TXN${Date.now()}${Math.random().toString(36).substr(2, 9)}` : null,
          notes: status === 'failed' ? 'Payment failed - insufficient funds' : null,
        });

        paymentDate.setMonth(paymentDate.getMonth() + 1);
        paymentCount++;
      }
    }

    const createdPayments = await db.insert(payments).values(paymentsData).returning();
    console.log(`✅ Created ${createdPayments.length} payment records`);

    // Create some draft leases (pending assignments)
    console.log('📝 Creating draft leases...');
    const availableUnits = createdUnits.filter(unit => unit.isAvailable).slice(0, 3);
    
    const draftLeasesData = availableUnits.map(unit => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 7); // Start next week
      
      const endDate = new Date(startDate);
      endDate.setFullYear(startDate.getFullYear() + 1);
      
      return {
        unitId: unit.id,
        tenantId: tenants[Math.floor(Math.random() * 3)].id, // Random tenant from first 3
        startDate,
        endDate,
        monthlyRent: unit.monthlyRent.toString(),
        deposit: unit.deposit.toString(),
        status: 'draft' as const,
        terms: 'Draft lease agreement pending approval.',
      };
    });

    if (draftLeasesData.length > 0) {
      await db.insert(leases).values(draftLeasesData);
      console.log(`✅ Created ${draftLeasesData.length} draft leases`);
    }

    console.log('\n🎉 Database seeding completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`👤 Users: 1 admin, ${landlords.length} landlords, ${tenants.length} tenants`);
    console.log(`🏢 Properties: ${createdProperties.length}`);
    console.log(`🏠 Units: ${createdUnits.length} (${createdUnits.filter(u => !u.isAvailable).length} occupied)`);
    console.log(`📋 Leases: ${createdLeases.length} active, ${draftLeasesData.length} draft`);
    console.log(`💰 Payments: ${createdPayments.length} records`);
    
    console.log('\n🔑 Login Credentials:');
    console.log('Admin: admin / admin123');
    console.log('Landlords: james_landlord, sarah_properties, robert_estates / landlord123');
    console.log('Tenants: mary_tenant, john_renter, etc. / tenant123');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    await migrationClient.end();
  }
};

// Run seeding if called directly
if (require.main === module) {
  seedData()
    .then(() => {
      console.log('✅ Seeding process completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seeding process failed:', error);
      process.exit(1);
    });
}

export { seedData };