import { pgTable, uuid, varchar, text, timestamp, decimal, integer, boolean, pgEnum, index, unique, AnyPgColumn, primaryKey } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', ['admin', 'landlord', 'tenant']);
export const propertyTypeEnum = pgEnum('property_type', ['residential', 'commercial']);
export const leaseStatusEnum = pgEnum('lease_status', ['draft', 'active', 'expiring', 'expired', 'terminated']);
export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'completed', 'failed', 'refunded']);
export const maintenanceStatusEnum = pgEnum('maintenance_status', ['submitted', 'in_progress', 'completed', 'cancelled']);
export const mobileMoneyProviderEnum = pgEnum('mobile_money_provider', ['mtn', 'airtel', 'm-sente']);
export const paymentGatewayEnum = pgEnum('payment_gateway', ['iotec', 'yo']);

// Wallet enums
export const walletTransactionTypeEnum = pgEnum('wallet_transaction_type', ['deposit', 'withdrawal', 'adjustment']);
export const walletTransactionStatusEnum = pgEnum('wallet_transaction_status', ['pending', 'completed', 'failed']);

// Residential unit subtypes
export const residentialUnitTypeEnum = pgEnum('residential_unit_type', [
  'apartment', 'studio', 'house', 'condo', 'townhouse', 'duplex', 'room', 'other'
]);

// Commercial unit subtypes
export const commercialUnitTypeEnum = pgEnum('commercial_unit_type', [
  'office', 'retail', 'warehouse', 'restaurant', 'medical', 'industrial', 'flex_space', 'coworking', 'other'
]);

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
  type: propertyTypeEnum('type').notNull().default('residential'),
  numberOfUnits: integer('number_of_units').default(1),
  landlordId: uuid('landlord_id').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_properties_landlord_id').on(table.landlordId),
  index('idx_properties_city').on(table.city),
  index('idx_properties_type').on(table.type),
]);

// Units table - base table with common fields
export const units = pgTable('units', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id').references(() => properties.id).notNull(),
  unitNumber: varchar('unit_number', { length: 50 }).notNull(),
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

// Residential unit details - type-specific attributes for residential units
export const residentialUnitDetails = pgTable('residential_unit_details', {
  id: uuid('id').primaryKey().defaultRandom(),
  unitId: uuid('unit_id').references(() => units.id, { onDelete: 'cascade' }).notNull().unique(),
  unitType: residentialUnitTypeEnum('unit_type').notNull().default('apartment'),
  bedrooms: integer().notNull().default(1),
  bathrooms: integer().notNull().default(0),
  hasBalcony: boolean('has_balcony').default(false),
  floorNumber: varchar('floor_number', { length: 50 }),
  isFurnished: boolean('is_furnished').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull()
}, (table) => [
  index('idx_residential_unit_details_unit_id').on(table.unitId),
  index('idx_residential_unit_details_type').on(table.unitType),
  index('idx_residential_unit_details_bedrooms').on(table.bedrooms),
]);

// Commercial unit details - type-specific attributes for commercial units
export const commercialUnitDetails = pgTable('commercial_unit_details', {
  id: uuid('id').primaryKey().defaultRandom(),
  unitId: uuid('unit_id').references(() => units.id, { onDelete: 'cascade' }).notNull().unique(),
  unitType: commercialUnitTypeEnum('unit_type').notNull().default('office'),
  floorNumber: varchar('floor_number', { length: 50 }),
  suiteNumber: varchar('suite_number', { length: 50 }),
  ceilingHeight: decimal('ceiling_height', { precision: 5, scale: 2 }), // in feet
  maxOccupancy: integer('max_occupancy'),
  createdAt: timestamp('created_at').defaultNow().notNull()
}, (table) => [
  index('idx_commercial_unit_details_unit_id').on(table.unitId),
  index('idx_commercial_unit_details_type').on(table.unitType),
]);

// Amenities table - now with category to distinguish residential vs commercial
export const amenityTypeEnum = pgEnum('amenity_type', ['residential', 'commercial', 'common']);

export const amenities = pgTable('amenities', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  type: amenityTypeEnum('type').notNull().default('common'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_amenities_type').on(table.type),
]);

// Unit Amenities Junction table
export const unitAmenities = pgTable('unit_amenities', {
  unitId: uuid('unit_id').references(() => units.id, { onDelete: 'cascade' }).notNull(),
  amenityId: uuid('amenity_id').references(() => amenities.id, { onDelete: 'cascade' }).notNull(),
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
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  paidDate: timestamp('paid_date'),
  status: paymentStatusEnum('status').default('pending').notNull(),
  paymentMethod: varchar('payment_method', { length: 50 }),
  mobileMoneyProvider: mobileMoneyProviderEnum('mobile_money_provider'),
  phoneNumber: varchar('phone_number', { length: 20 }),
  transactionId: varchar('transaction_id', { length: 255 }),
  gateway: paymentGatewayEnum('gateway').default('yo'),
  gatewayReference: varchar('gateway_reference', { length: 255 }),
  gatewayRawResponse: text('gateway_raw_response'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_payments_lease_id').on(table.leaseId),
  index('idx_payments_status').on(table.status),
  index('idx_payments_transaction_id').on(table.transactionId),
  index('idx_payments_gateway').on(table.gateway),
]);

// Payment Schedule Payments Junction table (Many-to-Many)
export const paymentSchedulePayments = pgTable('payment_schedule_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'cascade' }).notNull(),
  scheduleId: uuid('schedule_id').references(() => paymentSchedules.id, { onDelete: 'cascade' }).notNull(),
  amountApplied: decimal('amount_applied', { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_payment_schedule_payments_payment_id').on(table.paymentId),
  index('idx_payment_schedule_payments_schedule_id').on(table.scheduleId),
  unique('unique_payment_schedule').on(table.paymentId, table.scheduleId)
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

// Landlord Wallets table - tracks collected rent funds
export const landlordWallets = pgTable('landlord_wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  landlordId: uuid('landlord_id').references(() => users.id).notNull().unique(),
  balance: decimal('balance', { precision: 12, scale: 2 }).default('0').notNull(),
  totalDeposited: decimal('total_deposited', { precision: 12, scale: 2 }).default('0').notNull(),
  totalWithdrawn: decimal('total_withdrawn', { precision: 12, scale: 2 }).default('0').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_landlord_wallets_landlord_id').on(table.landlordId),
]);

// Wallet Transactions table - tracks all wallet activity
export const walletTransactions = pgTable('wallet_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletId: uuid('wallet_id').references(() => landlordWallets.id).notNull(),
  type: walletTransactionTypeEnum('type').notNull(),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  balanceAfter: decimal('balance_after', { precision: 12, scale: 2 }).notNull(),
  status: walletTransactionStatusEnum('status').default('pending').notNull(),
  paymentId: uuid('payment_id').references(() => payments.id),
  gatewayReference: varchar('gateway_reference', { length: 255 }),
  destinationType: varchar('destination_type', { length: 50 }), // mobile_money, bank_account
  destinationDetails: text('destination_details'), // JSON: phone/account number, provider, etc.
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_wallet_transactions_wallet_id').on(table.walletId),
  index('idx_wallet_transactions_type').on(table.type),
  index('idx_wallet_transactions_status').on(table.status),
  index('idx_wallet_transactions_payment_id').on(table.paymentId),
  index('idx_wallet_transactions_created_at').on(table.createdAt),
]);

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  ownedProperties: many(properties),
  leases: many(leases),
  maintenanceRequests: many(maintenanceRequests),
  wallet: one(landlordWallets),
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
  residentialDetails: one(residentialUnitDetails, {
    fields: [units.id],
    references: [residentialUnitDetails.unitId],
  }),
  commercialDetails: one(commercialUnitDetails, {
    fields: [units.id],
    references: [commercialUnitDetails.unitId],
  }),
  leases: many(leases),
  maintenanceRequests: many(maintenanceRequests),
  amenities: many(unitAmenities),
}));

export const residentialUnitDetailsRelations = relations(residentialUnitDetails, ({ one }) => ({
  unit: one(units, {
    fields: [residentialUnitDetails.unitId],
    references: [units.id],
  }),
}));

export const commercialUnitDetailsRelations = relations(commercialUnitDetails, ({ one }) => ({
  unit: one(units, {
    fields: [commercialUnitDetails.unitId],
    references: [units.id],
  }),
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

export const paymentSchedulesRelations = relations(paymentSchedules, ({ one, many }) => ({
  lease: one(leases, {
    fields: [paymentSchedules.leaseId],
    references: [leases.id],
  }),
  paymentSchedulePayments: many(paymentSchedulePayments),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  lease: one(leases, {
    fields: [payments.leaseId],
    references: [leases.id],
  }),
  paymentSchedulePayments: many(paymentSchedulePayments),
  walletTransactions: many(walletTransactions),
}));

export const paymentSchedulePaymentsRelations = relations(paymentSchedulePayments, ({ one }) => ({
  payment: one(payments, {
    fields: [paymentSchedulePayments.paymentId],
    references: [payments.id],
  }),
  schedule: one(paymentSchedules, {
    fields: [paymentSchedulePayments.scheduleId],
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

export const landlordWalletsRelations = relations(landlordWallets, ({ one, many }) => ({
  landlord: one(users, {
    fields: [landlordWallets.landlordId],
    references: [users.id],
  }),
  transactions: many(walletTransactions),
}));

export const walletTransactionsRelations = relations(walletTransactions, ({ one }) => ({
  wallet: one(landlordWallets, {
    fields: [walletTransactions.walletId],
    references: [landlordWallets.id],
  }),
  payment: one(payments, {
    fields: [walletTransactions.paymentId],
    references: [payments.id],
  }),
}));