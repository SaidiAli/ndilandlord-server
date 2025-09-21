# NDI Landlord 2 - Property Management Backend

A multi-tenant SaaS platform for rental property management built with Express.js, TypeScript, and Drizzle ORM.

## Features

- **Authentication & Authorization** - JWT-based auth with role-based access control
- **Multi-tenant Architecture** - Support for admins, landlords, and tenants
- **Property Management** - Manage properties, units, leases, and payments
- **Maintenance Tracking** - Handle maintenance requests and status updates
- **Type Safety** - Full TypeScript implementation with Drizzle ORM
- **Database Migrations** - Automated database schema management

## Tech Stack

- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: JWT tokens
- **Validation**: Zod schemas
- **Development**: Docker Compose for local database

## Getting Started

### Prerequisites

- Node.js 18+
- Docker and Docker Compose
- PostgreSQL (via Docker)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start PostgreSQL database:
```bash
docker-compose up -d
```

3. Copy environment variables:
```bash
cp .env.example .env
```

4. Generate and run database migrations:
```bash
npm run db:generate
npm run db:migrate
```

5. Start development server:
```bash
npm run dev
```

The API will be available at `http://localhost:3000`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Properties
- `GET /api/properties` - List properties
- `POST /api/properties` - Create property (landlord/admin)
- `GET /api/properties/:id` - Get property details
- `PUT /api/properties/:id` - Update property
- `DELETE /api/properties/:id` - Delete property

### Units
- `GET /api/units` - List units
- `POST /api/units` - Create unit (landlord/admin)
- `GET /api/units/:id` - Get unit details
- `PUT /api/units/:id` - Update unit
- `DELETE /api/units/:id` - Delete unit

### Leases
- `GET /api/leases` - List leases
- `POST /api/leases` - Create lease (landlord/admin)
- `GET /api/leases/:id` - Get lease details
- `PUT /api/leases/:id` - Update lease
- `DELETE /api/leases/:id` - Delete lease

### Payments
- `GET /api/payments` - List payments
- `POST /api/payments` - Create payment
- `GET /api/payments/:id` - Get payment details
- `PUT /api/payments/:id` - Update payment status

### Maintenance
- `GET /api/maintenance` - List maintenance requests
- `POST /api/maintenance` - Create maintenance request
- `GET /api/maintenance/:id` - Get maintenance request
- `PUT /api/maintenance/:id` - Update maintenance request
- `DELETE /api/maintenance/:id` - Delete maintenance request

## Database Schema

- **users** - System users (admin, landlord, tenant)
- **properties** - Property information
- **units** - Individual rental units
- **leases** - Tenant lease agreements
- **payments** - Rent payment tracking
- **maintenance_requests** - Maintenance request management

## Development Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run db:generate` - Generate database migrations
- `npm run db:migrate` - Run pending migrations
- `npm run db:studio` - Open Drizzle Studio (database GUI)

## User Roles

- **Admin** - Full system access
- **Landlord** - Manage own properties, units, leases
- **Tenant** - View lease info, make payments, submit maintenance requests