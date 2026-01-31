# PharmaCare Multi-Tenant Backend API

A complete Node.js/Express backend for the PharmaCare Multi-Tenant Business Management System with PostgreSQL.

## Features

- 🔐 JWT Authentication with role-based access control
- 👑 **Super Admin** for platform-wide business management
- 🏢 **Multi-Tenant Architecture** with schema isolation per business
- 🏪 Support for multiple business types: Pharmacy, General Store, Supermarket, Retail
- 👥 User Management (ADMIN, MANAGER, PHARMACIST, CASHIER roles)
- 💊 Medicine & Category Management with product types and units
- 📦 Stock Management with movement tracking
- 💰 Sales & POS functionality
- 📋 Prescription Management (Pharmacy only)
- 📝 Expense Tracking with approval workflow
- 🏢 Supplier Management
- 📦 Purchase Order Management
- 👨‍💼 Employee & Payroll Management
- 📊 Comprehensive Reports

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

### 3. Start the Server

```bash
npm start
```

**Tables are created automatically** when the server starts. No manual SQL needed!

## Deployment on Render

### Environment Variables

Set these in your Render dashboard:

| Variable | Example Value | Description |
|----------|---------------|-------------|
| `DATASOURCE_URL` | `jdbc:postgresql://host:5432/db?currentSchema=myschema` | PostgreSQL connection URL |
| `DATASOURCE_USER` | `your_db_user` | Database user |
| `DATASOURCE_PASSWORD` | `your_db_password` | Database password |
| `DB_SCHEMA` | `sme_platform` | Main schema name |
| `JWT_SECRET` | `your-secure-jwt-secret-key` | JWT signing secret |
| `ALLOWED_ORIGINS` | `https://your-frontend.netlify.app` | Allowed CORS origins |
| **Super Admin (Required)** | | |
| `SUPER_ADMIN_EMAIL` | `superadmin@system.com` | Super admin email |
| `SUPER_ADMIN_PASSWORD` | `SuperSecure123!` | Super admin password |
| `SUPER_ADMIN_NAME` | `Super Administrator` | Super admin display name |
| **Regular Admin (Optional)** | | |
| `ADMIN_ENABLED` | `true` | Enable admin user creation |
| `ADMIN_EMAIL` | `admin@example.com` | Admin email |
| `ADMIN_PASSWORD` | `SecurePassword123` | Admin password |
| `ADMIN_NAME` | `System Administrator` | Admin display name |
| `ADMIN_PHONE` | `+254700000000` | Admin phone |

### Render Configuration

- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Health Check Path**: `/health`

## API Documentation

See [docs/API_ENDPOINTS.md](docs/API_ENDPOINTS.md) for complete API documentation with examples.

### Key Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/auth/login` | User login (returns business context) |
| **Business Management (Super Admin)** | |
| `GET /api/businesses` | List all businesses |
| `POST /api/businesses` | Create new business with schema |
| `GET /api/businesses/stats` | Business statistics |
| `POST /api/businesses/:id/activate` | Activate business |
| `POST /api/businesses/:id/suspend` | Suspend business |
| **Medicine Management** | |
| `GET /api/medicines` | List medicines |
| `POST /api/medicines` | Create medicine |
| `POST /api/medicines/:id/add-stock` | Add stock to medicine |
| **Sales & POS** | |
| `POST /api/sales` | Create sale (POS) |
| `POST /api/purchase-orders` | Create purchase order |
| `PATCH /api/purchase-orders/:id/receive` | Receive order |
| **Reports** | |
| `GET /api/reports/dashboard` | Dashboard summary |

## Multi-Tenant Architecture

Each business operates in its own PostgreSQL schema for complete data isolation:

1. **Super Admin** creates a new business via `POST /api/businesses`
2. System creates a new schema (e.g., `abc_pharmacy`) and required tables
3. Business admin is created within that schema
4. All subsequent API calls operate within the business's schema context

### Business Types

| Type | Features |
|------|----------|
| `pharmacy` | Medicines, Prescriptions, Batch/Expiry tracking |
| `general` | Products, Barcode, Standard POS |
| `supermarket` | Products, Barcode, Bulk inventory |
| `retail` | Products, Barcode, Standard POS |

## Create Business Example

```json
POST /api/businesses
Authorization: Bearer <super_admin_token>

{
  "name": "ABC Pharmacy",
  "email": "abc@pharmacy.com",
  "phone": "+254712345678",
  "businessType": "pharmacy",
  "schemaName": "abc_pharmacy",
  "address": "123 Main St",
  "city": "Nairobi",
  "country": "Kenya",
  "adminName": "John Doe",
  "adminEmail": "john@abcpharmacy.com",
  "adminPassword": "securePassword123"
}
```

## Login Response (with Business Context)

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiJ9...",
    "user": {
      "id": "user_456",
      "name": "John Doe",
      "email": "john@abcpharmacy.com",
      "role": "ADMIN",
      "business_id": "bus_123"
    },
    "business": {
      "id": "bus_123",
      "name": "ABC Pharmacy",
      "businessType": "pharmacy",
      "schemaName": "abc_pharmacy",
      "status": "active"
    }
  }
}
```

## Scripts

```bash
npm start      # Start production server
npm run dev    # Start with nodemon (development)
npm run seed   # Seed sample data
```

## License

MIT
