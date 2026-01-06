# PharmaCare Backend API

A complete Node.js/Express backend for the PharmaCare Pharmacy Management System.

## Features

- 🔐 JWT Authentication with role-based access control
- 👥 User Management (ADMIN, MANAGER, PHARMACIST, CASHIER roles)
- 💊 Medicine & Category Management
- 📦 Stock Management with movement tracking
- 💰 Sales & POS functionality
- 📋 Prescription Management
- 📝 Expense Tracking with approval workflow
- 🏢 Supplier Management
- 📦 Purchase Order Management
- 👨‍💼 Employee & Payroll Management
- 📊 Comprehensive Reports

## Prerequisites

- Node.js 18+ 
- MySQL 8.0+

## Setup

### 1. InstallDependencies

```bash
cd backend
npm install
```

### 2. Configure Environment

Copy the example environment file and update with your settings:

```bash
cp .env.example .env
```

Edit `.env` with your database credentials:

```env
PORT=3001
DB_HOST=localhost
DB_PORT=3306
DB_NAME=pharmacare
DB_USER=root
DB_PASSWORD=your_password
JWT_SECRET=your-super-secret-jwt-key
CORS_ORIGIN=http://localhost:5173
```

### 3. Create Database Schema

Run the SQL schema script in your MySQL client:

```bash
mysql -u root -p < src/scripts/schema.sql
```

Or manually run the contents of `src/scripts/schema.sql` in your MySQL client.

### 4. Seed Initial Data (Optional)

```bash
npm run seed
```

This creates:
- Admin user: `admin` / `admin123`
- Manager user: `manager` / `manager123`
- Pharmacist user: `pharmacist` / `pharmacist123`
- Cashier user: `cashier` / `cashier123`
- Sample categories and medicines
- Sample suppliers

### 5. Start the Server

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

The server will start on `http://localhost:3001`

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Register new user
- `GET /api/auth/me` - Get current user

### Users
- `GET /api/users` - List users (Admin only)
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create user (Admin only)
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Deactivate user (Admin only)
- `PATCH /api/users/:id/activate` - Activate user (Admin only)

### Categories
- `GET /api/categories` - List all categories
- `GET /api/categories/:id` - Get category by ID
- `POST /api/categories` - Create category
- `PUT /api/categories/:id` - Update category
- `DELETE /api/categories/:id` - Delete category
- `GET /api/categories/stats` - Get category statistics

### Medicines
- `GET /api/medicines` - List medicines (paginated)
- `GET /api/medicines/:id` - Get medicine by ID
- `POST /api/medicines` - Create medicine
- `PUT /api/medicines/:id` - Update medicine
- `DELETE /api/medicines/:id` - Delete medicine (Admin only)
- `POST /api/medicines/:id/add-stock` - Add stock
- `POST /api/medicines/:id/deduct-stock` - Deduct stock
- `GET /api/medicines/low-stock` - Get low stock items
- `GET /api/medicines/expiring` - Get expiring medicines

### Stock
- `GET /api/stock/movements` - List stock movements
- `POST /api/stock/loss` - Record stock loss
- `POST /api/stock/adjustment` - Record adjustment
- `GET /api/stock/monthly` - Monthly summary
- `GET /api/stock/breakdown` - Stock breakdown by category

### Sales
- `GET /api/sales` - List sales (paginated)
- `GET /api/sales/:id` - Get sale by ID
- `POST /api/sales` - Create sale
- `DELETE /api/sales/:id` - Void sale (Admin only)
- `GET /api/sales/today` - Today's summary
- `GET /api/sales/report` - Sales report

### Expenses
- `GET /api/expenses` - List expenses
- `POST /api/expenses` - Create expense
- `PATCH /api/expenses/:id/approve` - Approve expense
- `PATCH /api/expenses/:id/reject` - Reject expense

### Prescriptions
- `GET /api/prescriptions` - List prescriptions
- `POST /api/prescriptions` - Create prescription
- `PATCH /api/prescriptions/:id/status` - Update status

### Purchase Orders
- `GET /api/purchase-orders` - List orders
- `POST /api/purchase-orders` - Create order
- `PATCH /api/purchase-orders/:id/submit` - Submit order
- `PATCH /api/purchase-orders/:id/approve` - Approve order
- `PATCH /api/purchase-orders/:id/receive` - Receive order

### Employees & Payroll
- `GET /api/employees` - List employees
- `POST /api/employees` - Create employee
- `GET /api/employees/:id/payroll` - Get employee payroll
- `POST /api/employees/payroll` - Create payroll entry

### Reports
- `GET /api/reports/dashboard` - Dashboard summary
- `GET /api/reports/sales-summary` - Sales summary
- `GET /api/reports/stock-summary` - Stock summary
- `GET /api/reports/balance-sheet` - Balance sheet
- `GET /api/reports/income-statement` - Income statement
- `GET /api/reports/profit/summary` - Profit summary

## Deployment on Render

### 1. Create a Render Account

Go to [render.com](https://render.com) and sign up.

### 2. Create MySQL Database

1. Go to Dashboard → New → PostgreSQL (or use external MySQL)
2. Note down the connection details

For MySQL, you can use:
- PlanetScale (free tier available)
- Railway
- DigitalOcean Managed MySQL

### 3. Create Web Service

1. Go to Dashboard → New → Web Service
2. Connect your GitHub repository
3. Configure:
   - **Name**: pharmacare-api
   - **Region**: Choose closest to your users
   - **Branch**: main
   - **Root Directory**: backend
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

4. Add Environment Variables:
   - `PORT`: 10000 (Render assigns port)
   - `DB_HOST`: Your MySQL host
   - `DB_PORT`: 3306
   - `DB_NAME`: pharmacare
   - `DB_USER`: Your MySQL user
   - `DB_PASSWORD`: Your MySQL password
   - `JWT_SECRET`: Generate a secure random string
   - `CORS_ORIGIN`: Your frontend URL
   - `NODE_ENV`: production

5. Deploy!

### 4. Update Frontend

Update your frontend API base URL to point to your Render deployment URL.

## Security Notes

- Always use strong passwords in production
- Generate a secure `JWT_SECRET` (at least 32 characters)
- Enable HTTPS in production
- Regularly update dependencies
- Use connection pooling for database

## License

MIT
