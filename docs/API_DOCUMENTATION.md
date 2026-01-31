# PharmaCare Multi-Tenant API Documentation

## Overview

This backend uses **business_id-based multi-tenancy** (not schema-per-business). All data is stored in a single schema with `business_id` columns for tenant isolation.

## Base URL

```
https://your-backend-url.com/api
```

## Authentication Flow

### User Types

| User Type | Role | business_id | Description |
|-----------|------|-------------|-------------|
| Super Admin | `SUPER_ADMIN` | `null` | Platform owner, manages all businesses |
| Business Admin | `ADMIN` | `{uuid}` | Business owner, manages their business |
| Manager | `MANAGER` | `{uuid}` | Business manager |
| Pharmacist | `PHARMACIST` | `{uuid}` | Staff member |
| Cashier | `CASHIER` | `{uuid}` | Staff member |

### Login Endpoint

**POST `/api/auth/login`**

```typescript
// Request
interface LoginRequest {
  email?: string;     // Either email or username required
  username?: string;  // Either email or username required
  password: string;
}

// Response
interface LoginResponse {
  success: boolean;
  data: {
    token: string;           // JWT access token
    refreshToken: string;    // JWT refresh token
    user: {
      id: string;
      username: string;
      email: string;
      name: string;
      role: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'PHARMACIST' | 'CASHIER';
      business_id: string | null;
      isSuperAdmin: boolean;  // true if SUPER_ADMIN role
      active: boolean;
    };
    business: BusinessInfo | null;  // null for Super Admin
  };
}

interface BusinessInfo {
  id: string;
  name: string;
  businessType: 'pharmacy' | 'general' | 'supermarket' | 'retail';
  status: 'active' | 'inactive' | 'suspended' | 'pending';
  subscriptionPlan: 'free' | 'basic' | 'premium' | 'enterprise';
  logo: string | null;
}
```

### Frontend Login Implementation

```typescript
// services/authService.ts
const API_BASE = 'https://your-backend-url.com/api';

interface AuthState {
  user: User | null;
  business: Business | null;
  token: string | null;
  isSuperAdmin: boolean;
}

async function login(email: string, password: string): Promise<AuthState> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  const result = await response.json();
  
  if (!result.success) {
    throw new Error(result.error || 'Login failed');
  }

  const { token, refreshToken, user, business } = result.data;

  // Store tokens securely
  await AsyncStorage.setItem('accessToken', token);
  await AsyncStorage.setItem('refreshToken', refreshToken);
  await AsyncStorage.setItem('user', JSON.stringify(user));
  if (business) {
    await AsyncStorage.setItem('business', JSON.stringify(business));
  }

  return {
    user,
    business,
    token,
    isSuperAdmin: user.isSuperAdmin
  };
}
```

### Frontend Routing After Login

```typescript
// After successful login, route based on user type
function handleLoginSuccess(authState: AuthState, navigation: any) {
  const { user, isSuperAdmin, business } = authState;

  if (isSuperAdmin) {
    // Super Admin → Super Admin Dashboard
    navigation.navigate('SuperAdminDashboard');
  } else if (user.role === 'ADMIN') {
    // Business Admin → Business Admin Dashboard
    navigation.navigate('BusinessAdminDashboard', { business });
  } else {
    // Staff → POS/Main App
    navigation.navigate('MainApp', { business });
  }
}
```

---

## Super Admin Endpoints

All Super Admin endpoints require `Authorization: Bearer {token}` header and `SUPER_ADMIN` role.

### List All Businesses

**GET `/api/businesses`**

```typescript
// Query params
interface ListBusinessesParams {
  page?: number;      // Default: 1
  limit?: number;     // Default: 20
  status?: 'active' | 'inactive' | 'suspended' | 'pending';
  type?: 'pharmacy' | 'general' | 'supermarket' | 'retail';
  search?: string;    // Search by name or email
}

// Response
interface ListBusinessesResponse {
  success: boolean;
  data: {
    businesses: Business[];
    total: number;
    page: number;
    pages: number;
  };
}
```

### Get Business Statistics

**GET `/api/businesses/stats`**

```typescript
interface BusinessStatsResponse {
  success: boolean;
  data: {
    totalBusinesses: number;
    activeBusinesses: number;
    suspendedBusinesses: number;
    inactiveBusinesses: number;
    pendingBusinesses: number;
    pharmacyCount: number;
    generalCount: number;
    supermarketCount: number;
    retailCount: number;
    totalUsers: number;
    adminCount: number;
    businessUsers: number;
  };
}
```

### Create New Business

**POST `/api/businesses`**

```typescript
// Request
interface CreateBusinessRequest {
  name: string;           // Business name
  email: string;          // Business email
  phone?: string;
  businessType: 'pharmacy' | 'general' | 'supermarket' | 'retail';
  address?: string;
  city?: string;
  country?: string;
  subscriptionPlan?: 'free' | 'basic' | 'premium' | 'enterprise';
  // Admin user details (will be created as business admin)
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}

// Response
interface CreateBusinessResponse {
  success: boolean;
  data: {
    id: string;            // Auto-generated business ID
    name: string;
    email: string;
    businessType: string;
    status: 'active';
    adminUser: {
      id: string;
      username: string;
      email: string;
      role: 'ADMIN';
    };
  };
  message: string;
}
```

### Get Business Details

**GET `/api/businesses/:id`**

### Update Business

**PUT `/api/businesses/:id`**

### Suspend Business

**POST `/api/businesses/:id/suspend`**

```typescript
// Request
interface SuspendBusinessRequest {
  reason: string;
}
```

### Activate Business

**POST `/api/businesses/:id/activate`**

### Deactivate Business

**DELETE `/api/businesses/:id`**

---

## Business Admin Endpoints

Business Admins can manage their own business users.

### Create User for Business

**POST `/api/businesses/:businessId/users`**

Available to: Super Admin (any business) or Business Admin (own business only)

```typescript
// Request
interface CreateBusinessUserRequest {
  email: string;
  password: string;
  name: string;
  username?: string;   // Auto-generated if not provided
  phone?: string;
  role: 'ADMIN' | 'MANAGER' | 'PHARMACIST' | 'CASHIER';
}

// Response
interface CreateBusinessUserResponse {
  success: boolean;
  data: {
    id: string;
    username: string;
    email: string;
    name: string;
    role: string;
    businessId: string;
    active: boolean;
  };
}
```

### List Business Users

**GET `/api/businesses/:id/users`** (Super Admin only)

---

## Data Endpoints with Business Context

All data endpoints (medicines, sales, expenses, etc.) automatically filter by `business_id` based on the authenticated user.

### Headers Required

```typescript
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${accessToken}`
};
```

### Automatic Business Filtering

The `requireBusinessContext` middleware:
- Super Admin: Can access all data (no filter)
- Business Users: Only see their business's data

---

## Token Refresh

**POST `/api/auth/refresh`**

```typescript
// Request
interface RefreshTokenRequest {
  refreshToken: string;
}

// Response
interface RefreshTokenResponse {
  success: boolean;
  data: {
    token: string;  // New access token
  };
}
```

### Auto-Refresh Implementation

```typescript
// services/apiClient.ts
async function apiRequest(url: string, options: RequestInit = {}) {
  let token = await AsyncStorage.getItem('accessToken');
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  // If token expired, try to refresh
  if (response.status === 401) {
    const refreshToken = await AsyncStorage.getItem('refreshToken');
    
    const refreshResponse = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });

    if (refreshResponse.ok) {
      const { data } = await refreshResponse.json();
      await AsyncStorage.setItem('accessToken', data.token);
      
      // Retry original request with new token
      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${data.token}`,
          'Content-Type': 'application/json'
        }
      });
    }
    
    // Refresh failed - redirect to login
    throw new Error('SESSION_EXPIRED');
  }

  return response;
}
```

---

## Error Responses

```typescript
interface ErrorResponse {
  success: false;
  error: string;      // Error code
  message?: string;   // Human-readable message
}

// Common error codes:
// - BUSINESS_SUSPENDED: Business account suspended
// - BUSINESS_INACTIVE: Business account inactive
// - BUSINESS_PENDING: Business pending activation
// - NO_BUSINESS_CONTEXT: User not associated with any business
// - BUSINESS_NOT_FOUND: Business doesn't exist
// - BUSINESS_EMAIL_EXISTS: Business email already registered
// - ADMIN_EMAIL_EXISTS: Admin email already registered
```

---

## Frontend State Management Example

```typescript
// stores/authStore.ts (Zustand example)
interface AuthStore {
  user: User | null;
  business: Business | null;
  token: string | null;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
}

const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  business: null,
  token: null,
  isAuthenticated: false,
  isSuperAdmin: false,

  login: async (email, password) => {
    const response = await authService.login(email, password);
    
    set({
      user: response.user,
      business: response.business,
      token: response.token,
      isAuthenticated: true,
      isSuperAdmin: response.user.isSuperAdmin
    });
  },

  logout: async () => {
    await AsyncStorage.multiRemove(['accessToken', 'refreshToken', 'user', 'business']);
    set({
      user: null,
      business: null,
      token: null,
      isAuthenticated: false,
      isSuperAdmin: false
    });
  }
}));
```

---

## Environment Variables Required

```env
# Database
DATASOURCE_URL=jdbc:postgresql://host:5432/database
DATASOURCE_USER=username
DATASOURCE_PASSWORD=password
DB_SCHEMA=public

# Super Admin (created on startup)
SUPER_ADMIN_EMAIL=superadmin@example.com
SUPER_ADMIN_PASSWORD=securepassword
SUPER_ADMIN_NAME=Super Administrator

# JWT
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=24h
JWT_REFRESH_SECRET=your-refresh-secret
JWT_REFRESH_EXPIRES_IN=7d

# Frontend
FRONTEND_URL=https://your-frontend-url.com
```

---

## Database Migrations

Migrations run automatically on server startup. The database version is tracked in the `schema_version` table.

When you deploy updates:
1. The server checks current DB version
2. Runs any pending migrations
3. Updates super admin user (creates if missing, updates password if changed)
4. Creates default categories if none exist

No manual migration steps required!
