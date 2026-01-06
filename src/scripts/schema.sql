-- PharmaCare Database Schema for PostgreSQL
-- This file is for reference only - tables are auto-created by initDatabase.js

-- Schema
CREATE SCHEMA IF NOT EXISTS spotmedpharmacare;
SET search_path TO spotmedpharmacare, public;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(50),
  role VARCHAR(20) DEFAULT 'CASHIER' CHECK (role IN ('ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER')),
  active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Medicines table with ALL columns
CREATE TABLE IF NOT EXISTS medicines (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  generic_name VARCHAR(255),
  category VARCHAR(100),
  category_id VARCHAR(36),
  description TEXT,
  manufacturer VARCHAR(255),
  unit_price DECIMAL(10, 2) DEFAULT 0,
  cost_price DECIMAL(10, 2) DEFAULT 0,
  stock_quantity INT DEFAULT 0,
  reorder_level INT DEFAULT 10,
  expiry_date DATE,
  batch_number VARCHAR(100),
  requires_prescription BOOLEAN DEFAULT FALSE,
  product_type VARCHAR(50),
  units JSONB,
  image_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  contact_person VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  city VARCHAR(100),
  country VARCHAR(100),
  notes TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Stock movements table
CREATE TABLE IF NOT EXISTS stock_movements (
  id VARCHAR(36) PRIMARY KEY,
  medicine_id VARCHAR(36) NOT NULL,
  medicine_name VARCHAR(255),
  type VARCHAR(20) NOT NULL CHECK (type IN ('ADDITION', 'SALE', 'LOSS', 'ADJUSTMENT', 'PURCHASE')),
  quantity INT NOT NULL,
  batch_number VARCHAR(100),
  reference_id VARCHAR(36),
  reason TEXT,
  notes TEXT,
  created_by VARCHAR(36),
  performed_by_name VARCHAR(100),
  performed_by_role VARCHAR(50),
  previous_stock INT DEFAULT 0,
  new_stock INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sales table
CREATE TABLE IF NOT EXISTS sales (
  id VARCHAR(36) PRIMARY KEY,
  cashier_id VARCHAR(36) NOT NULL,
  cashier_name VARCHAR(100),
  total_amount DECIMAL(10, 2) DEFAULT 0,
  discount DECIMAL(10, 2) DEFAULT 0,
  final_amount DECIMAL(10, 2) DEFAULT 0,
  profit DECIMAL(10, 2) DEFAULT 0,
  payment_method VARCHAR(20) DEFAULT 'CASH' CHECK (payment_method IN ('CASH', 'CARD', 'MPESA', 'CREDIT')),
  customer_name VARCHAR(100),
  customer_phone VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sale items table
CREATE TABLE IF NOT EXISTS sale_items (
  id VARCHAR(36) PRIMARY KEY,
  sale_id VARCHAR(36) NOT NULL,
  medicine_id VARCHAR(36) NOT NULL,
  medicine_name VARCHAR(255),
  quantity INT NOT NULL,
  unit_type VARCHAR(50),
  unit_label VARCHAR(100),
  unit_price DECIMAL(10, 2) NOT NULL,
  cost_price DECIMAL(10, 2) DEFAULT 0,
  subtotal DECIMAL(10, 2) NOT NULL,
  profit DECIMAL(10, 2) DEFAULT 0
);

-- Expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id VARCHAR(36) PRIMARY KEY,
  category VARCHAR(100) NOT NULL,
  description TEXT,
  amount DECIMAL(10, 2) NOT NULL,
  expense_date DATE NOT NULL,
  vendor VARCHAR(255),
  receipt_number VARCHAR(100),
  notes TEXT,
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  rejection_reason TEXT,
  created_by VARCHAR(36),
  created_by_name VARCHAR(100),
  approved_by VARCHAR(36),
  approved_by_name VARCHAR(100),
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Prescriptions table
CREATE TABLE IF NOT EXISTS prescriptions (
  id VARCHAR(36) PRIMARY KEY,
  patient_name VARCHAR(100) NOT NULL,
  patient_phone VARCHAR(50),
  doctor_name VARCHAR(100),
  diagnosis TEXT,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DISPENSED', 'CANCELLED')),
  created_by VARCHAR(36),
  created_by_name VARCHAR(100),
  dispensed_by VARCHAR(36),
  dispensed_by_name VARCHAR(100),
  dispensed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Prescription items table
CREATE TABLE IF NOT EXISTS prescription_items (
  id VARCHAR(36) PRIMARY KEY,
  prescription_id VARCHAR(36) NOT NULL,
  medicine_id VARCHAR(36) NOT NULL,
  medicine_name VARCHAR(255),
  quantity INT NOT NULL,
  dosage VARCHAR(100),
  frequency VARCHAR(100),
  duration VARCHAR(100),
  instructions TEXT
);

-- Purchase orders table
CREATE TABLE IF NOT EXISTS purchase_orders (
  id VARCHAR(36) PRIMARY KEY,
  order_number VARCHAR(50) UNIQUE NOT NULL,
  supplier_id VARCHAR(36) NOT NULL,
  supplier_name VARCHAR(255),
  subtotal DECIMAL(10, 2) DEFAULT 0,
  tax DECIMAL(10, 2) DEFAULT 0,
  total DECIMAL(10, 2) DEFAULT 0,
  total_amount DECIMAL(10, 2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'RECEIVED', 'CANCELLED')),
  notes TEXT,
  expected_delivery_date DATE,
  cancellation_reason TEXT,
  created_by VARCHAR(36),
  created_by_name VARCHAR(100),
  approved_by VARCHAR(36),
  approved_by_name VARCHAR(100),
  approved_at TIMESTAMP,
  received_by VARCHAR(36),
  received_by_name VARCHAR(100),
  received_at TIMESTAMP,
  submitted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Purchase order items table
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id VARCHAR(36) PRIMARY KEY,
  purchase_order_id VARCHAR(36) NOT NULL,
  medicine_id VARCHAR(36) NOT NULL,
  medicine_name VARCHAR(255),
  quantity INT NOT NULL,
  unit_price DECIMAL(10, 2) DEFAULT 0,
  unit_cost DECIMAL(10, 2) DEFAULT 0,
  subtotal DECIMAL(10, 2) DEFAULT 0,
  total_cost DECIMAL(10, 2) DEFAULT 0
);

-- Employees table
CREATE TABLE IF NOT EXISTS employees (
  id VARCHAR(36) PRIMARY KEY,
  employee_id VARCHAR(50) UNIQUE NOT NULL,
  user_id VARCHAR(36),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  department VARCHAR(100),
  position VARCHAR(100),
  hire_date DATE,
  salary DECIMAL(10, 2),
  bank_account VARCHAR(50),
  bank_name VARCHAR(100),
  tax_id VARCHAR(50),
  address TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payroll table
CREATE TABLE IF NOT EXISTS payroll (
  id VARCHAR(36) PRIMARY KEY,
  employee_id VARCHAR(36) NOT NULL,
  employee_name VARCHAR(100),
  pay_period VARCHAR(7) NOT NULL,
  basic_salary DECIMAL(10, 2) NOT NULL,
  allowances DECIMAL(10, 2) DEFAULT 0,
  deductions DECIMAL(10, 2) DEFAULT 0,
  net_salary DECIMAL(10, 2) NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'PAID')),
  notes TEXT,
  paid_by VARCHAR(36),
  paid_by_name VARCHAR(100),
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_medicines_category ON medicines(category);
CREATE INDEX IF NOT EXISTS idx_medicines_expiry ON medicines(expiry_date);
CREATE INDEX IF NOT EXISTS idx_medicines_batch ON medicines(batch_number);
CREATE INDEX IF NOT EXISTS idx_stock_movements_medicine ON stock_movements(medicine_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(type);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_cashier ON sales(cashier_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON prescriptions(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_payroll_period ON payroll(pay_period);
CREATE INDEX IF NOT EXISTS idx_payroll_employee ON payroll(employee_id);
