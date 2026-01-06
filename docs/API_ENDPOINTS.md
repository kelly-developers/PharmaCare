# PharmaCare API Documentation

Base URL: `https://your-backend-url.onrender.com/api`

## Authentication

All endpoints (except auth) require a JWT token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

---

## 1. Authentication (`/api/auth`)

### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "uuid",
      "username": "admin",
      "email": "admin@example.com",
      "name": "Admin User",
      "role": "ADMIN"
    }
  }
}
```

### Register
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "newuser",
  "email": "user@example.com",
  "password": "password123",
  "name": "New User",
  "phone": "+254700000000",
  "role": "CASHIER"
}
```

### Get Current User
```http
GET /api/auth/me
Authorization: Bearer <token>
```

---

## 2. Medicines (`/api/medicines`)

### Get All Medicines (Paginated)
```http
GET /api/medicines?page=0&size=20&search=paracetamol&category=Tablets
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "content": [
      {
        "id": "uuid",
        "name": "Paracetamol 500mg",
        "generic_name": "Acetaminophen",
        "category": "Tablets",
        "description": "Pain reliever",
        "manufacturer": "Pharma Co",
        "unit_price": 10.00,
        "cost_price": 5.00,
        "stock_quantity": 100,
        "reorder_level": 20,
        "expiry_date": "2025-12-31",
        "batch_number": "BATCH001",
        "requires_prescription": false,
        "product_type": "Tablets",
        "units": [
          { "id": "1", "type": "Box", "label": "Box (100 tablets)", "quantity": 100, "price": 500 },
          { "id": "2", "type": "Strip", "label": "Strip (10 tablets)", "quantity": 10, "price": 60 },
          { "id": "3", "type": "Tablet", "label": "Single Tablet", "quantity": 1, "price": 10 }
        ]
      }
    ],
    "totalElements": 150,
    "totalPages": 8,
    "page": 0,
    "size": 20
  }
}
```

### Create Medicine
```http
POST /api/medicines
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Paracetamol 500mg",
  "generic_name": "Acetaminophen",
  "category": "Tablets",
  "description": "Pain reliever and fever reducer",
  "manufacturer": "Pharma Co",
  "unit_price": 10.00,
  "cost_price": 5.00,
  "stock_quantity": 100,
  "reorder_level": 20,
  "expiry_date": "2025-12-31",
  "batch_number": "BATCH001",
  "requires_prescription": false,
  "product_type": "Tablets",
  "units": [
    { "id": "1", "type": "Box", "label": "Box (100 tablets)", "quantity": 100, "price": 500 },
    { "id": "2", "type": "Strip", "label": "Strip (10 tablets)", "quantity": 10, "price": 60 },
    { "id": "3", "type": "Tablet", "label": "Tablet", "quantity": 1, "price": 10 }
  ]
}
```

### Update Medicine
```http
PUT /api/medicines/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Paracetamol 500mg",
  "category": "Tablets",
  "unit_price": 12.00,
  "cost_price": 6.00,
  "stock_quantity": 150,
  "expiry_date": "2026-06-30",
  "batch_number": "BATCH002",
  "product_type": "Tablets",
  "units": [...]
}
```

### Get Medicine by ID
```http
GET /api/medicines/:id
Authorization: Bearer <token>
```

### Delete Medicine (Admin only)
```http
DELETE /api/medicines/:id
Authorization: Bearer <token>
```

### Add Stock to Medicine
```http
POST /api/medicines/:id/add-stock
Authorization: Bearer <token>
Content-Type: application/json

{
  "quantity": 50,
  "batch_number": "BATCH003",
  "expiry_date": "2026-12-31",
  "cost_price": 5.50,
  "notes": "New shipment from supplier"
}
```

### Deduct Stock from Medicine
```http
POST /api/medicines/:id/deduct-stock
Authorization: Bearer <token>
Content-Type: application/json

{
  "quantity": 10,
  "notes": "Damaged items",
  "reference_id": "optional-sale-id"
}
```

### Get Low Stock Medicines
```http
GET /api/medicines/low-stock
Authorization: Bearer <token>
```

### Get Expiring Medicines
```http
GET /api/medicines/expiring?days=90
Authorization: Bearer <token>
```

### Get Medicine Statistics
```http
GET /api/medicines/stats
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalMedicines": 150,
    "lowStock": 12,
    "expiringSoon": 5,
    "outOfStock": 3
  }
}
```

---

## 3. Categories (`/api/categories`)

### Get All Categories
```http
GET /api/categories
Authorization: Bearer <token>
```

### Create Category
```http
POST /api/categories
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Antibiotics",
  "description": "Antimicrobial medications"
}
```

### Update Category
```http
PUT /api/categories/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Antibiotics",
  "description": "Updated description"
}
```

### Delete Category
```http
DELETE /api/categories/:id
Authorization: Bearer <token>
```

### Get Category Statistics
```http
GET /api/categories/stats
Authorization: Bearer <token>
```

---

## 4. Sales (`/api/sales`)

### Get All Sales (Paginated)
```http
GET /api/sales?page=0&size=20
Authorization: Bearer <token>
```

### Create Sale (POS Transaction)
```http
POST /api/sales
Authorization: Bearer <token>
Content-Type: application/json

{
  "items": [
    {
      "medicine_id": "uuid",
      "medicine_name": "Paracetamol 500mg",
      "quantity": 2,
      "unit_type": "Strip",
      "unit_label": "Strip (10 tablets)",
      "unit_price": 60,
      "cost_price": 30,
      "subtotal": 120
    }
  ],
  "total_amount": 120,
  "discount": 10,
  "final_amount": 110,
  "payment_method": "CASH",
  "customer_name": "John Doe",
  "customer_phone": "+254700123456",
  "notes": "Regular customer"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "cashier_id": "uuid",
    "cashier_name": "Cashier Name",
    "total_amount": 120,
    "discount": 10,
    "final_amount": 110,
    "profit": 50,
    "payment_method": "CASH",
    "items": [...]
  }
}
```

### Get Sale by ID
```http
GET /api/sales/:id
Authorization: Bearer <token>
```

### Get Today's Sales Summary
```http
GET /api/sales/today
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalSales": 15000,
    "transactionCount": 25,
    "profit": 5000
  }
}
```

### Get Cashier's Today Sales
```http
GET /api/sales/cashier/:cashierId/today
Authorization: Bearer <token>
```

### Get Sales Report
```http
GET /api/sales/report?startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <token>
```

### Delete/Void Sale (Admin only)
```http
DELETE /api/sales/:id
Authorization: Bearer <token>
```

---

## 5. Stock Management (`/api/stock`)

### Get Stock Movements (Paginated)
```http
GET /api/stock/movements?page=0&size=20
Authorization: Bearer <token>
```

### Record Stock Loss
```http
POST /api/stock/loss
Authorization: Bearer <token>
Content-Type: application/json

{
  "medicine_id": "uuid",
  "quantity": 5,
  "reason": "Expired",
  "notes": "Disposed expired items"
}
```

### Record Stock Adjustment
```http
POST /api/stock/adjustment
Authorization: Bearer <token>
Content-Type: application/json

{
  "medicine_id": "uuid",
  "quantity": 95,
  "reason": "Physical count correction",
  "notes": "Adjusted after inventory count"
}
```

### Get Monthly Stock Summary
```http
GET /api/stock/monthly?year=2024&month=12
Authorization: Bearer <token>
```

### Get Stock Breakdown by Category
```http
GET /api/stock/breakdown
Authorization: Bearer <token>
```

### Get Recent Stock Movements
```http
GET /api/stock/recent?limit=10
Authorization: Bearer <token>
```

### Get Movements by Medicine
```http
GET /api/stock/movements/medicine/:medicineId?page=0&size=20
Authorization: Bearer <token>
```

### Delete Stock Movement (Admin only)
```http
DELETE /api/stock/movements/:id
Authorization: Bearer <token>
```

---

## 6. Suppliers (`/api/suppliers`)

### Get All Suppliers (Paginated)
```http
GET /api/suppliers?page=0&size=20
Authorization: Bearer <token>
```

### Create Supplier
```http
POST /api/suppliers
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "PharmSupply Ltd",
  "contact_person": "Jane Smith",
  "email": "jane@pharmsupply.com",
  "phone": "+254711000000",
  "address": "123 Main Street",
  "city": "Nairobi",
  "country": "Kenya",
  "notes": "Reliable supplier"
}
```

### Update Supplier
```http
PUT /api/suppliers/:id
Authorization: Bearer <token>
Content-Type: application/json
```

### Get Active Suppliers
```http
GET /api/suppliers/active
Authorization: Bearer <token>
```

### Deactivate Supplier
```http
DELETE /api/suppliers/:id
Authorization: Bearer <token>
```

### Activate Supplier
```http
PATCH /api/suppliers/:id/activate
Authorization: Bearer <token>
```

---

## 7. Purchase Orders (`/api/purchase-orders`)

### Get All Purchase Orders (Paginated)
```http
GET /api/purchase-orders?page=0&size=20
Authorization: Bearer <token>
```

### Create Purchase Order
```http
POST /api/purchase-orders
Authorization: Bearer <token>
Content-Type: application/json

{
  "supplier_id": "uuid",
  "supplier_name": "PharmSupply Ltd",
  "items": [
    {
      "medicine_id": "uuid",
      "medicine_name": "Paracetamol 500mg",
      "quantity": 100,
      "unit_cost": 5.00
    }
  ],
  "expected_delivery_date": "2024-12-15",
  "notes": "Urgent order"
}
```

### Get Purchase Order by ID
```http
GET /api/purchase-orders/:id
Authorization: Bearer <token>
```

### Update Purchase Order
```http
PUT /api/purchase-orders/:id
Authorization: Bearer <token>
Content-Type: application/json
```

### Submit Purchase Order
```http
PATCH /api/purchase-orders/:id/submit
Authorization: Bearer <token>
```

### Approve Purchase Order
```http
PATCH /api/purchase-orders/:id/approve
Authorization: Bearer <token>
```

### Receive Purchase Order (Adds Stock)
```http
PATCH /api/purchase-orders/:id/receive
Authorization: Bearer <token>
```

**Note:** This endpoint automatically:
- Updates stock quantities for all items
- Creates stock movement records for tracking

### Cancel Purchase Order
```http
PATCH /api/purchase-orders/:id/cancel
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "Supplier unavailable"
}
```

### Get Orders by Supplier
```http
GET /api/purchase-orders/supplier/:supplierId
Authorization: Bearer <token>
```

### Get Orders by Status
```http
GET /api/purchase-orders/status/APPROVED
Authorization: Bearer <token>
```

---

## 8. Expenses (`/api/expenses`)

### Get All Expenses (Paginated)
```http
GET /api/expenses?page=0&size=20
Authorization: Bearer <token>
```

### Create Expense
```http
POST /api/expenses
Authorization: Bearer <token>
Content-Type: application/json

{
  "category": "UTILITIES",
  "description": "Electricity bill",
  "amount": 5000,
  "expense_date": "2024-12-01",
  "vendor": "Kenya Power",
  "receipt_number": "INV-12345",
  "notes": "Monthly bill"
}
```

### Update Expense
```http
PUT /api/expenses/:id
Authorization: Bearer <token>
Content-Type: application/json
```

### Approve Expense
```http
PATCH /api/expenses/:id/approve
Authorization: Bearer <token>
```

### Reject Expense
```http
PATCH /api/expenses/:id/reject
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "Invalid receipt"
}
```

### Get Pending Expenses
```http
GET /api/expenses/pending
Authorization: Bearer <token>
```

---

## 9. Prescriptions (`/api/prescriptions`)

### Get All Prescriptions (Paginated)
```http
GET /api/prescriptions?page=0&size=20
Authorization: Bearer <token>
```

### Create Prescription
```http
POST /api/prescriptions
Authorization: Bearer <token>
Content-Type: application/json

{
  "patient_name": "John Doe",
  "patient_phone": "+254700123456",
  "doctor_name": "Dr. Smith",
  "diagnosis": "Common cold",
  "items": [
    {
      "medicine_id": "uuid",
      "medicine_name": "Amoxicillin 500mg",
      "quantity": 21,
      "dosage": "500mg",
      "frequency": "3 times daily",
      "duration": "7 days",
      "instructions": "Take after meals"
    }
  ],
  "notes": "Follow up in 1 week"
}
```

### Update Prescription Status
```http
PATCH /api/prescriptions/:id/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "DISPENSED"
}
```

### Get Pending Prescriptions
```http
GET /api/prescriptions/pending
Authorization: Bearer <token>
```

### Get Prescriptions by Patient Phone
```http
GET /api/prescriptions/patient/:phone
Authorization: Bearer <token>
```

---

## 10. Reports (`/api/reports`)

### Get Dashboard Summary
```http
GET /api/reports/dashboard
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "todaySales": 25000,
    "todayTransactions": 30,
    "totalMedicines": 150,
    "lowStock": 12,
    "expiringSoon": 5,
    "pendingPrescriptions": 3,
    "monthlyRevenue": 750000,
    "monthlyProfit": 250000
  }
}
```

### Get Sales Summary
```http
GET /api/reports/sales-summary?startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <token>
```

### Get Stock Summary
```http
GET /api/reports/stock-summary
Authorization: Bearer <token>
```

### Get Balance Sheet
```http
GET /api/reports/balance-sheet
Authorization: Bearer <token>
```

### Get Income Statement
```http
GET /api/reports/income-statement?startDate=2024-01-01&endDate=2024-12-31
Authorization: Bearer <token>
```

### Get Inventory Value
```http
GET /api/reports/inventory-value
Authorization: Bearer <token>
```

### Get Inventory Breakdown
```http
GET /api/reports/inventory-breakdown
Authorization: Bearer <token>
```

---

## 11. Profit Reports (`/api/reports/profit`)

### Get Monthly Profit Report
```http
GET /api/reports/profit/monthly/2024-12
```

### Get Daily Profit
```http
GET /api/reports/profit/daily?date=2024-12-01
```

### Get Profit Summary
```http
GET /api/reports/profit/summary?startDate=2024-01-01&endDate=2024-12-31
```

---

## 12. Users (`/api/users`)

### Get All Users (Paginated, Admin only)
```http
GET /api/users?page=0&size=20
Authorization: Bearer <token>
```

### Create User (Admin only)
```http
POST /api/users
Authorization: Bearer <token>
Content-Type: application/json

{
  "username": "newuser",
  "email": "user@example.com",
  "password": "password123",
  "name": "New User",
  "phone": "+254700000000",
  "role": "PHARMACIST"
}
```

### Update User
```http
PUT /api/users/:id
Authorization: Bearer <token>
Content-Type: application/json
```

### Deactivate User (Admin only)
```http
DELETE /api/users/:id
Authorization: Bearer <token>
```

### Activate User (Admin only)
```http
PATCH /api/users/:id/activate
Authorization: Bearer <token>
```

### Get User Profile
```http
GET /api/users/profile
Authorization: Bearer <token>
```

### Get Users by Role
```http
GET /api/users/role/CASHIER?page=0&size=20
Authorization: Bearer <token>
```

---

## 13. Employees (`/api/employees`)

### Get All Employees (Paginated)
```http
GET /api/employees?page=0&size=20
Authorization: Bearer <token>
```

### Create Employee
```http
POST /api/employees
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@pharmacy.com",
  "phone": "+254700123456",
  "department": "Pharmacy",
  "position": "Pharmacist",
  "hire_date": "2024-01-15",
  "salary": 50000,
  "bank_account": "1234567890",
  "bank_name": "KCB",
  "address": "Nairobi, Kenya"
}
```

### Get Employee Payroll
```http
GET /api/employees/:id/payroll?page=0&size=12
Authorization: Bearer <token>
```

### Create Payroll Entry
```http
POST /api/employees/payroll
Authorization: Bearer <token>
Content-Type: application/json

{
  "employee_id": "uuid",
  "pay_period": "2024-12",
  "basic_salary": 50000,
  "allowances": 5000,
  "deductions": 2500,
  "notes": "December salary"
}
```

### Update Payroll Status
```http
PATCH /api/employees/payroll/:id/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "PAID"
}
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

### Common HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Invalid or missing token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 500 | Server Error - Something went wrong |

---

## Frontend Integration Examples

### Login and Store Token
```typescript
const login = async (email: string, password: string) => {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  
  const data = await response.json();
  if (data.success) {
    localStorage.setItem('token', data.data.token);
    localStorage.setItem('user', JSON.stringify(data.data.user));
  }
  return data;
};
```

### Create Sale (POS)
```typescript
const createSale = async (saleData: SaleRequest) => {
  const token = localStorage.getItem('token');
  
  const response = await fetch(`${API_URL}/sales`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(saleData)
  });
  
  return response.json();
};
```

### Add Stock to Medicine
```typescript
const addStock = async (medicineId: string, stockData: AddStockRequest) => {
  const token = localStorage.getItem('token');
  
  const response = await fetch(`${API_URL}/medicines/${medicineId}/add-stock`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(stockData)
  });
  
  return response.json();
};
```

### Receive Purchase Order (Auto-adds stock)
```typescript
const receivePurchaseOrder = async (orderId: string) => {
  const token = localStorage.getItem('token');
  
  const response = await fetch(`${API_URL}/purchase-orders/${orderId}/receive`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  return response.json();
};
```
