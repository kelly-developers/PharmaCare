# PharmaCare Backend API

A complete Node.js/Express backend for the PharmaCare Pharmacy Management System with PostgreSQL.

## Features

- 🔐 JWT Authentication with role-based access control
- 👥 User Management (ADMIN, MANAGER, PHARMACIST, CASHIER roles)
- 💊 Medicine & Category Management with product types and units
- 📦 Stock Management with movement tracking
- 💰 Sales & POS functionality
- 📋 Prescription Management
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

| Variable | Example Value |
|----------|---------------|
| `DATASOURCE_URL` | `jdbc:postgresql://host:5432/db?currentSchema=myschema` |
| `DATASOURCE_USER` | `your_db_user` |
| `DATASOURCE_PASSWORD` | `your_db_password` |
| `DB_SCHEMA` | `spotmedpharmacare` |
| `JWT_SECRET` | `your-secure-jwt-secret-key` |
| `ALLOWED_ORIGINS` | `https://your-frontend.netlify.app` |
| `ADMIN_ENABLED` | `true` |
| `ADMIN_EMAIL` | `admin@example.com` |
| `ADMIN_PASSWORD` | `SecurePassword123` |
| `ADMIN_NAME` | `System Administrator` |
| `ADMIN_PHONE` | `+254700000000` |

### Render Configuration

- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Health Check Path**: `/health`

## API Documentation

See [docs/API_ENDPOINTS.md](docs/API_ENDPOINTS.md) for complete API documentation with examples.

### Key Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/auth/login` | User login |
| `GET /api/medicines` | List medicines |
| `POST /api/medicines` | Create medicine (with batch_number, expiry_date, cost_price, stock_quantity) |
| `POST /api/medicines/:id/add-stock` | Add stock to medicine |
| `POST /api/sales` | Create sale (POS) |
| `POST /api/purchase-orders` | Create purchase order |
| `PATCH /api/purchase-orders/:id/receive` | Receive order (auto-adds stock) |
| `GET /api/reports/dashboard` | Dashboard summary |

## Medicine Creation Example

```json
POST /api/medicines
{
  "name": "Paracetamol 500mg",
  "category": "Tablets",
  "manufacturer": "Pharma Co",
  "unit_price": 10.00,
  "cost_price": 5.00,
  "stock_quantity": 100,
  "reorder_level": 20,
  "expiry_date": "2025-12-31",
  "batch_number": "BATCH001",
  "product_type": "Tablets",
  "units": [
    { "id": "1", "type": "Box", "label": "Box (100 tablets)", "quantity": 100, "price": 500 },
    { "id": "2", "type": "Strip", "label": "Strip (10 tablets)", "quantity": 10, "price": 60 }
  ]
}
```

## Adding Stock Example

```json
POST /api/medicines/:id/add-stock
{
  "quantity": 50,
  "batch_number": "BATCH002",
  "notes": "New shipment"
}
```

## Purchase Order Workflow

1. Create order: `POST /api/purchase-orders`
2. Submit: `PATCH /api/purchase-orders/:id/submit`
3. Approve: `PATCH /api/purchase-orders/:id/approve`
4. Receive (auto-adds stock): `PATCH /api/purchase-orders/:id/receive`

## Scripts

```bash
npm start      # Start production server
npm run dev    # Start with nodemon (development)
npm run seed   # Seed sample data
```

## License

MIT
