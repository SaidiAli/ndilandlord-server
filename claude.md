# Verit Server - Property Management API

## Project Overview

Express.js backend API for property management SaaS targeting the Uganda market. Handles properties, units, tenants, leases, and rent payments with mobile money integration (MTN, Airtel).

### Ecosystem

| Project | Description | Port | Path |
|---------|-------------|------|------|
| **verit-server** (this) | Express.js backend API | 4000 | `../verit-server` |
| **verit-admin** | Dashboard for landlords | 4001 | `../verit-admin` |
| **verit-tenant-mobile-app** | React Native app for tenants | - | `../verit-tenant-mobile-app` |

API base URL: `http://localhost:4000/api`

## Tech Stack

- **Framework**: Express.js
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Validation**: Zod
- **Auth**: JWT (jsonwebtoken) + bcryptjs
- **Job Queue**: BullMQ with Redis (ioredis)
- **Security**: Helmet, CORS
- **HTTP Logging**: Morgan

## Key File Locations

```
/src
├── app.ts                     # Express app setup, middleware, routes
├── common/
│   ├── types.ts               # Shared type definitions
│   └── validationsSchemas.ts  # Zod validation schemas
├── controllers/               # Request handlers (thin layer)
│   └── units.ts               # Example: unit controller
├── db/
│   ├── schema.ts              # Drizzle schema definitions
│   ├── index.ts               # Database client (postgres)
│   ├── ownership.ts           # Ownership verification helpers
│   ├── migrate.ts             # Migration runner
│   ├── setup.ts               # DB setup/seed script
│   └── seed-amenities.ts      # Amenities seeder
├── domain/
│   └── config.ts              # Environment configuration
├── jobs/
│   ├── worker.ts              # BullMQ worker
│   └── connections.ts         # Redis/queue connections
├── middleware/
│   ├── auth.ts                # JWT auth & authorization
│   ├── errorHandler.ts        # Global error handler
│   └── notFound.ts            # 404 handler
├── routes/                    # API route definitions
│   ├── auth.ts                # /api/auth
│   ├── users.ts               # /api/users
│   ├── properties.ts          # /api/properties
│   ├── units.ts               # /api/units
│   ├── leases.ts              # /api/leases
│   ├── payments.ts            # /api/payments
│   ├── landlords.ts           # /api/landlords
│   ├── tenant.ts              # /api/tenant
│   ├── amenities.ts           # /api/amenities
│   └── paymentSchedules.ts    # /api/payment-schedules
├── services/                  # Business logic layer
│   ├── propertyService.ts
│   ├── unitService.ts
│   ├── leaseService.ts
│   ├── paymentService.ts
│   ├── paymentScheduleService.ts
│   ├── tenantService.ts
│   ├── userService.ts
│   ├── amenityService.ts
│   ├── iotecService.ts        # Mobile money integration
│   └── optimizedQueries.ts    # Query optimizations
├── types/
│   ├── index.ts               # Core TypeScript types
│   └── ownership.ts           # Ownership context types
└── utils/
    └── ownershipValidation.ts # Resource access validation
```

## Development Commands

```bash
npm run dev           # Start with hot reload (tsx watch)
npm run build         # TypeScript compilation
npm run start         # Run production build

# Database
npm run db:generate   # Generate Drizzle migrations
npm run db:migrate    # Run migrations
npm run db:studio     # Open Drizzle Studio
npm run db:seed       # Seed sample data
npm run db:setup      # Full DB setup
npm run db:setup-seed # Setup + seed
npm run db:reset      # Reset database
npm run db:full       # Full reset + setup + seed
npm run db:indexes    # Create indexes
npm run db:seed:amenities # Seed amenities only

# Linting
npm run lint          # Run ESLint
npm run lint:fix      # Fix ESLint issues
```

## Architecture Pattern

**MVC-like with Service Layer**: Routes → Controllers → Services → Database

- **Routes**: Define endpoints, apply middleware, call controllers
- **Controllers**: Thin layer - parse requests, call services, format responses
- **Services**: Business logic, database operations, validation
- **Database**: Drizzle ORM queries

```typescript
// Route (routes/units.ts)
router.get('/', authenticate, authorize('landlord'), getLandlordUnits);

// Controller (controllers/units.ts)
export const getLandlordUnits = async (req, res) => {
  const units = await UnitService.getLandlordUnits(req.user!.id, filters);
  res.json({ success: true, data: units });
};

// Service (services/unitService.ts)
static async getLandlordUnits(landlordId: string, filters?: Filters) {
  return await db.select()...
}
```

## API Response Format

All endpoints return a consistent JSON structure:

```typescript
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;              // Response payload
  error?: string;        // Error message
  message?: string;      // Success/info message
}

// Paginated responses
interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}
```

**Example responses:**
```json
// Success
{ "success": true, "data": [...], "message": "Units retrieved successfully" }

// Error
{ "success": false, "error": "Unit not found", "message": "Details..." }
```

## Database Conventions

### Schema Patterns
- **Primary keys**: UUID with `defaultRandom()`
- **Column naming**: snake_case (`landlord_id`, `created_at`)
- **Timestamps**: `createdAt`, `updatedAt` on all tables
- **Enums**: For constrained values (roles, statuses, types)


## Type Conventions

### Discriminated Unions for Units
Units have type-specific details based on property type:

```typescript
// Residential details
interface ResidentialUnitDetails {
  unitType: 'apartment' | 'studio' | 'house' | ...;
  bedrooms: number;
  bathrooms: number;
  hasBalcony?: boolean;
  floorNumber?: number;
  isFurnished?: boolean;
}

// Commercial details
interface CommercialUnitDetails {
  unitType: 'office' | 'retail' | 'warehouse' | ...;
  floorNumber?: number;
  suiteNumber?: string;
  ceilingHeight?: number; // in feet
  maxOccupancy?: number;
}
```

## Key Domain Concepts

### Properties
- Can be `residential` or `commercial`
- Owned by a landlord
- Contains multiple units

### Units
- Belong to a property
- Type-specific details in separate tables (residential vs commercial)
- Have amenities (M:M relationship)
- Track availability status

### Leases
- Connect tenant to unit
- **Lifecycle**: `draft` → `active` → `expiring` → `expired`/`terminated`
- Support auto-renewal
- Link to previous lease for renewals

### Payment Schedules
- Auto-generated when lease is created
- Support proration for partial periods
- Track `isPaid` status
- Unique constraint on `(leaseId, paymentNumber)`

### Payments
- Linked to lease
- Support mobile money providers (MTN, Airtel)
- Track transaction IDs
- Many-to-many with payment schedules (partial payments)

### Mobile Money
- **Providers**: MTN, Airtel, M-Sente
- Phone number prefixes:
  - MTN: 77x, 78x
  - Airtel: 70x, 74x, 75x

## Important Rules

1. **Always use services for business logic** - Controllers should be thin wrappers

2. **Validate inputs with Zod schemas** - Never trust client data

4. **Parse decimal strings from database** - Drizzle returns decimals as strings
   ```typescript
   const amount = parseFloat(payment.amount);
   ```

5. **Handle dates as ISO 8601 strings** - Consistent across API

6. **Include landlordId filtering** - Landlords should only see their own data
   ```typescript
   .where(eq(properties.landlordId, landlordId))
   ```

7. **Use transactions for multi-table operations** - Ensure data consistency

8. **Always return consistent API responses** - Use the `ApiResponse` type

9. After each task, review and asses if the changes call for changes to be made on the admin dashboard and tenant mobile app. If so,
 create separate plan documents in markdown for each platform detailing the changes needed and put the files in the docs directory.