import { pgTable, uuid, varchar, text, timestamp, decimal, integer, boolean, pgEnum, index, unique, AnyPgColumn, primaryKey } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', ['admin', 'landlord', 'tenant']);
export const leaseStatusEnum = pgEnum('lease_status', ['draft', 'active', 'expiring', 'expired', 'terminated']);
export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'completed', 'failed', 'refunded']);
export const maintenanceStatusEnum = pgEnum('maintenance_status', ['submitted', 'in_progress', 'completed', 'cancelled']);
export const mobileMoneyProviderEnum = pgEnum('mobile_money_provider', ['mtn', 'airtel', 'm-sente']);
export const propertyTypeEnum = pgEnum('property_type', ['residential', 'commercial', 'industrial', 'office', 'retail', 'apartment', 'house', 'condo', 'townhouse', 'warehouse', 'mixed_use', 'land']);

// Users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).unique(),
  userName: varchar('user_name', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 20 }).notNull(),
  role: userRoleEnum('role').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Properties table
export const properties = pgTable('properties', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  address: text('address').notNull(),
  city: varchar('city', { length: 100 }).notNull(),
  postalCode: varchar('postal_code', { length: 10 }),
  description: text('description'),
  type: propertyTypeEnum('type'),
  numberOfUnits: integer('number_of_units').default(1),
  landlordId: uuid('landlord_id').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_properties_landlord_id').on(table.landlordId),
  index('idx_properties_city').on(table.city),
]);

// Units table
export const units = pgTable('units', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id').references(() => properties.id).notNull(),
  unitNumber: varchar('unit_number', { length: 50 }).notNull(),
  bedrooms: integer('bedrooms').notNull(),
  bathrooms: decimal('bathrooms', { precision: 3, scale: 1 }).notNull(),
  squareFeet: integer('square_feet'),
  isAvailable: boolean('is_available').default(true).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_units_property_id').on(table.propertyId),
  unique('unique_unit_per_property').on(table.propertyId, table.unitNumber),
  index('idx_units_availability').on(table.isAvailable),
]);

// Amenities table
export const amenities = pgTable('amenities', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Unit Amenities Junction table
export const unitAmenities = pgTable('unit_amenities', {
  unitId: uuid('unit_id').references(() => units.id).notNull(),
  amenityId: uuid('amenity_id').references(() => amenities.id).notNull(),
}, (table) => [
  primaryKey({ columns: [table.unitId, table.amenityId] }),
  index('idx_unit_amenities_unit_id').on(table.unitId),
]);

// Leases table
export const leases = pgTable('leases', {
  id: uuid('id').primaryKey().defaultRandom(),
  unitId: uuid('unit_id').references(() => units.id).notNull(),
  tenantId: uuid('tenant_id').references(() => users.id).notNull(),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date'),
  monthlyRent: decimal('monthly_rent', { precision: 10, scale: 2 }).notNull(),
  deposit: decimal('deposit', { precision: 10, scale: 2 }).notNull(),
  paymentDay: integer('payment_day').default(1).notNull(),
  previousLeaseId: uuid('previous_lease_id').references((): AnyPgColumn => leases.id),
  status: leaseStatusEnum('status').default('draft').notNull(),
  terms: text('terms'),
  notes: text('notes'),
  autoRenew: boolean('auto_renew').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_leases_tenant_id').on(table.tenantId),
  index('idx_leases_unit_id').on(table.unitId),
  index('idx_leases_status').on(table.status),
  index('idx_leases_date_range').on(table.startDate, table.endDate)
]);

// Payment schedules table
export const paymentSchedules = pgTable('payment_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  leaseId: uuid('lease_id').references(() => leases.id, { onDelete: 'cascade' }).notNull(),
  paymentNumber: integer('payment_number').notNull(),
  dueDate: timestamp('due_date').notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),
  isPaid: boolean('is_paid').default(false).notNull(),
  paidPaymentId: uuid('paid_payment_id').references((): AnyPgColumn => payments.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_payment_schedules_lease_id').on(table.leaseId),
  index('idx_payment_schedules_due_date').on(table.dueDate),
  index('idx_payment_schedules_is_paid').on(table.isPaid),
  unique('unique_lease_payment_number').on(table.leaseId, table.paymentNumber)
]);

// Payments table
export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  leaseId: uuid('lease_id').references(() => leases.id).notNull(),
  scheduleId: uuid('schedule_id').references(() => paymentSchedules.id),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  dueDate: timestamp('due_date').notNull(),
  paidDate: timestamp('paid_date'),
  status: paymentStatusEnum('status').default('pending').notNull(),
  paymentMethod: varchar('payment_method', { length: 50 }),
  mobileMoneyProvider: mobileMoneyProviderEnum('mobile_money_provider'),
  phoneNumber: varchar('phone_number', { length: 20 }),
  transactionId: varchar('transaction_id', { length: 255 }),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_payments_lease_id').on(table.leaseId),
  index('idx_payments_status').on(table.status),
  index('idx_payments_due_date').on(table.dueDate),
  index('idx_payments_transaction_id').on(table.transactionId),
]);

// Maintenance Requests table
export const maintenanceRequests = pgTable('maintenance_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  unitId: uuid('unit_id').references(() => units.id).notNull(),
  tenantId: uuid('tenant_id').references(() => users.id).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(),
  priority: varchar('priority', { length: 20 }).default('medium').notNull(),
  status: maintenanceStatusEnum('status').default('submitted').notNull(),
  submittedAt: timestamp('submitted_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_maintenance_requests_tenant_id').on(table.tenantId),
  index('idx_maintenance_requests_unit_id').on(table.unitId),
  index('idx_maintenance_requests_status').on(table.status),
  index('idx_maintenance_requests_priority').on(table.priority),
  index('idx_maintenance_requests_submitted_at').on(table.submittedAt),
]);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  ownedProperties: many(properties),
  leases: many(leases),
  maintenanceRequests: many(maintenanceRequests),
}));

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  landlord: one(users, {
    fields: [properties.landlordId],
    references: [users.id],
  }),
  units: many(units),
}));

export const unitsRelations = relations(units, ({ one, many }) => ({
  property: one(properties, {
    fields: [units.propertyId],
    references: [properties.id],
  }),
  leases: many(leases),
  maintenanceRequests: many(maintenanceRequests),
  amenities: many(unitAmenities),
}));

export const amenitiesRelations = relations(amenities, ({ many }) => ({
  units: many(unitAmenities),
}));

export const unitAmenitiesRelations = relations(unitAmenities, ({ one }) => ({
  unit: one(units, {
    fields: [unitAmenities.unitId],
    references: [units.id],
  }),
  amenity: one(amenities, {
    fields: [unitAmenities.amenityId],
    references: [amenities.id],
  }),
}));

export const leasesRelations = relations(leases, ({ one, many }) => ({
  unit: one(units, {
    fields: [leases.unitId],
    references: [units.id],
  }),
  tenant: one(users, {
    fields: [leases.tenantId],
    references: [users.id],
  }),
  payments: many(payments),
  paymentSchedules: many(paymentSchedules),
  previousLease: one(leases, {
    fields: [leases.previousLeaseId],
    references: [leases.id],
  }),
}));

export const paymentSchedulesRelations = relations(paymentSchedules, ({ one }) => ({
  lease: one(leases, {
    fields: [paymentSchedules.leaseId],
    references: [leases.id],
  }),
  payment: one(payments, {
    fields: [paymentSchedules.paidPaymentId],
    references: [payments.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  lease: one(leases, {
    fields: [payments.leaseId],
    references: [leases.id],
  }),
  schedule: one(paymentSchedules, {
    fields: [payments.scheduleId],
    references: [paymentSchedules.id],
  }),
}));

export const maintenanceRequestsRelations = relations(maintenanceRequests, ({ one }) => ({
  unit: one(units, {
    fields: [maintenanceRequests.unitId],
    references: [units.id],
  }),
  tenant: one(users, {
    fields: [maintenanceRequests.tenantId],
    references: [users.id],
  }),
}));