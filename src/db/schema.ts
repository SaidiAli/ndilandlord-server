import { pgTable, uuid, varchar, text, timestamp, decimal, integer, boolean, pgEnum, index, unique } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', ['admin', 'landlord', 'tenant']);
export const leaseStatusEnum = pgEnum('lease_status', ['draft', 'active', 'expired', 'terminated']);
export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'completed', 'failed', 'refunded']);
export const maintenanceStatusEnum = pgEnum('maintenance_status', ['submitted', 'in_progress', 'completed', 'cancelled']);
export const mobileMoneyProviderEnum = pgEnum('mobile_money_provider', ['mtn', 'airtel', 'm-sente']);

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
  state: varchar('state', { length: 50 }).notNull(),
  zipCode: varchar('zip_code', { length: 10 }).notNull(),
  description: text('description'),
  landlordId: uuid('landlord_id').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  // Index for efficient landlord property lookups
  landlordIdIdx: index('idx_properties_landlord_id').on(table.landlordId),
  // Index for property searches by city
  cityIdx: index('idx_properties_city').on(table.city),
}));

// Units table
export const units = pgTable('units', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id').references(() => properties.id).notNull(),
  unitNumber: varchar('unit_number', { length: 50 }).notNull(),
  bedrooms: integer('bedrooms').notNull(),
  bathrooms: decimal('bathrooms', { precision: 3, scale: 1 }).notNull(),
  squareFeet: integer('square_feet'),
  monthlyRent: decimal('monthly_rent', { precision: 10, scale: 2 }).notNull(),
  deposit: decimal('deposit', { precision: 10, scale: 2 }).notNull(),
  isAvailable: boolean('is_available').default(true).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  // Index for efficient property unit lookups
  propertyIdIdx: index('idx_units_property_id').on(table.propertyId),
  // Unique constraint for unit number within a property
  uniqueUnitNumber: unique('unique_unit_per_property').on(table.propertyId, table.unitNumber),
  // Index for available units
  availabilityIdx: index('idx_units_availability').on(table.isAvailable),
}));

// Leases table
export const leases = pgTable('leases', {
  id: uuid('id').primaryKey().defaultRandom(),
  unitId: uuid('unit_id').references(() => units.id).notNull(),
  tenantId: uuid('tenant_id').references(() => users.id).notNull(),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  monthlyRent: decimal('monthly_rent', { precision: 10, scale: 2 }).notNull(),
  deposit: decimal('deposit', { precision: 10, scale: 2 }).notNull(),
  status: leaseStatusEnum('status').default('draft').notNull(),
  terms: text('terms'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  // Index for efficient tenant lease lookups
  tenantIdIdx: index('idx_leases_tenant_id').on(table.tenantId),
  // Index for unit lease lookups
  unitIdIdx: index('idx_leases_unit_id').on(table.unitId),
  // Index for lease status queries
  statusIdx: index('idx_leases_status').on(table.status),
  // Unique constraint: Only one active lease per unit at a time
  uniqueActiveLeasePerUnit: unique('unique_active_lease_per_unit').on(table.unitId, table.status),
  // Index for date range queries
  dateRangeIdx: index('idx_leases_date_range').on(table.startDate, table.endDate),
}));

// Payments table
export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  leaseId: uuid('lease_id').references(() => leases.id).notNull(),
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
}, (table) => ({
  // Index for efficient lease payment lookups
  leaseIdIdx: index('idx_payments_lease_id').on(table.leaseId),
  // Index for payment status queries
  statusIdx: index('idx_payments_status').on(table.status),
  // Index for due date queries (overdue payments)
  dueDateIdx: index('idx_payments_due_date').on(table.dueDate),
  // Index for transaction tracking
  transactionIdIdx: index('idx_payments_transaction_id').on(table.transactionId),
}));

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
}, (table) => ({
  // Index for efficient tenant maintenance request lookups
  tenantIdIdx: index('idx_maintenance_requests_tenant_id').on(table.tenantId),
  // Index for unit maintenance request lookups
  unitIdIdx: index('idx_maintenance_requests_unit_id').on(table.unitId),
  // Index for status-based queries
  statusIdx: index('idx_maintenance_requests_status').on(table.status),
  // Index for priority-based queries
  priorityIdx: index('idx_maintenance_requests_priority').on(table.priority),
  // Index for submission date queries
  submittedAtIdx: index('idx_maintenance_requests_submitted_at').on(table.submittedAt),
}));

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
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  lease: one(leases, {
    fields: [payments.leaseId],
    references: [leases.id],
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