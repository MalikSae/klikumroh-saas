// API Client for KlikUmroh Staff / Master Admin
import { API_BASE } from './api';

export interface StaffUser {
  id: number;
  email: string;
  name: string;
  role?: string;
  status: string;
  created_at?: string;
}

export interface StaffUserInput {
  name: string;
  email: string;
  password?: string;
  status?: string;
}

export interface StaffTenantItem {
  id: number;
  name: string;
  slug: string;
  status?: string;
  whatsapp_number?: string | null;
  custom_domain: string | null;
  subscription_status: string;
  current_plan_id?: number | null;
  current_plan?: string | null;
  plan_name: string | null;
  subscription_expires_at: string | null;
  created_at: string;
}

export interface PricingPlan {
  id: number;
  name: string;
  period_months: number;
  price: number;
  created_at: string;
  updated_at: string;
}

export interface PricingPlanInput {
  name: string;
  period_months: number;
  price: number;
}

const STAFF_TOKEN_KEY = 'staff_token';
const STAFF_USER_KEY = 'staff_user';

export const getStoredStaffToken = (): string | null => {
  return localStorage.getItem(STAFF_TOKEN_KEY);
};

export const getStoredStaffUser = (): StaffUser | null => {
  const userStr = localStorage.getItem(STAFF_USER_KEY);
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
};

export const setStaffAuthSession = (token: string, user: StaffUser) => {
  localStorage.setItem(STAFF_TOKEN_KEY, token);
  localStorage.setItem(STAFF_USER_KEY, JSON.stringify(user));
};

export const clearStaffAuthSession = () => {
  localStorage.removeItem(STAFF_TOKEN_KEY);
  localStorage.removeItem(STAFF_USER_KEY);
};

export const getStaffAuthHeader = (): Record<string, string> => {
  const token = getStoredStaffToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
};

export const loginStaff = async (email: string, password: string): Promise<{ token: string; user: StaffUser }> => {
  const res = await fetch(`${API_BASE}/api/staff/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Login staff gagal');
  }

  const staff = json.staff || json.user;
  setStaffAuthSession(json.token, staff);
  return { token: json.token, user: staff };
};

export const fetchStaffMe = async (): Promise<StaffUser> => {
  const res = await fetch(`${API_BASE}/api/staff/me`, {
    headers: {
      ...getStaffAuthHeader(),
    },
  });

  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      clearStaffAuthSession();
    }
    throw new Error(json.error || 'Gagal memuat profil staff');
  }

  return json.staff || json.user;
};

export const fetchStaffTenants = async (status?: string): Promise<StaffTenantItem[]> => {
  const query = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
  const res = await fetch(`${API_BASE}/api/staff/tenants${query}`, {
    headers: {
      ...getStaffAuthHeader(),
    },
  });

  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      clearStaffAuthSession();
    }
    throw new Error(json.error || 'Gagal memuat daftar tenant');
  }

  return json.tenants || [];
};

export const fetchPricingPlans = async (): Promise<PricingPlan[]> => {
  const res = await fetch(`${API_BASE}/api/staff/pricing-plans`, {
    headers: {
      ...getStaffAuthHeader(),
    },
  });

  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      clearStaffAuthSession();
    }
    throw new Error(json.error || 'Gagal memuat plan harga');
  }

  return json.plans || [];
};

export const createPricingPlan = async (input: PricingPlanInput): Promise<PricingPlan> => {
  const res = await fetch(`${API_BASE}/api/staff/pricing-plans`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getStaffAuthHeader(),
    },
    body: JSON.stringify(input),
  });

  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      clearStaffAuthSession();
    }
    throw new Error(json.error || 'Gagal membuat plan harga');
  }

  return json.plan;
};

export const updatePricingPlan = async (id: number, input: PricingPlanInput): Promise<PricingPlan> => {
  const res = await fetch(`${API_BASE}/api/staff/pricing-plans/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getStaffAuthHeader(),
    },
    body: JSON.stringify(input),
  });

  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      clearStaffAuthSession();
    }
    throw new Error(json.error || 'Gagal memperbarui plan harga');
  }

  return json.plan;
};

export const deletePricingPlan = async (id: number): Promise<void> => {
  const res = await fetch(`${API_BASE}/api/staff/pricing-plans/${id}`, {
    method: 'DELETE',
    headers: {
      ...getStaffAuthHeader(),
    },
  });

  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      clearStaffAuthSession();
    }
    throw new Error(json.error || 'Gagal menghapus plan harga');
  }
};

export interface Coupon {
  id: number;
  code: string;
  discount_percentage: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  plan_id?: number | null;
  plan_name?: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface CouponInput {
  code: string;
  discount_percentage: number;
  max_uses?: number | null;
  expires_at?: string | null;
  plan_id?: number | null;
}

export interface PaymentVerificationItem {
  id: number;
  tenant_id: number;
  tenant_name?: string;
  tenant_slug?: string;
  tenant_whatsapp?: string | null;
  tenant_email?: string | null;
  plan_id: number;
  plan_name?: string;
  plan_period_months?: number;
  coupon_code: string | null;
  amount: number;
  final_amount: number;
  unique_code?: number;
  proof_url: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  reviewed_by: number | null;
  reviewed_by_name?: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const fetchStaffCoupons = async (): Promise<Coupon[]> => {
  const res = await fetch(`${API_BASE}/api/staff/coupons`, {
    headers: {
      ...getStaffAuthHeader(),
    },
  });

  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      clearStaffAuthSession();
    }
    throw new Error(json.error || 'Gagal memuat daftar kupon');
  }

  return json.coupons || [];
};

export const createStaffCoupon = async (input: CouponInput): Promise<Coupon> => {
  const res = await fetch(`${API_BASE}/api/staff/coupons`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getStaffAuthHeader(),
    },
    body: JSON.stringify(input),
  });

  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      clearStaffAuthSession();
    }
    throw new Error(json.error || 'Gagal membuat kupon');
  }

  return json.coupon;
};

export const deactivateStaffCoupon = async (id: number): Promise<void> => {
  const res = await fetch(`${API_BASE}/api/staff/coupons/${id}/deactivate`, {
    method: 'PATCH',
    headers: {
      ...getStaffAuthHeader(),
    },
  });

  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      clearStaffAuthSession();
    }
    throw new Error(json.error || 'Gagal menonaktifkan kupon');
  }
};

export const fetchStaffPaymentVerifications = async (status?: string, tenantId?: number): Promise<PaymentVerificationItem[]> => {
  const params = new URLSearchParams();
  if (status && status !== 'all') {
    params.set('status', status);
  }
  if (tenantId) {
    params.set('tenant_id', String(tenantId));
  }
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_BASE}/api/staff/payment-verifications${query}`, {
    headers: {
      ...getStaffAuthHeader(),
    },
  });

  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      clearStaffAuthSession();
    }
    throw new Error(json.error || 'Gagal memuat daftar verifikasi pembayaran');
  }

  return json.payment_verifications || [];
};

export const approvePaymentVerification = async (id: number): Promise<void> => {
  const res = await fetch(`${API_BASE}/api/staff/payment-verifications/${id}/approve`, {
    method: 'PATCH',
    headers: {
      ...getStaffAuthHeader(),
    },
  });

  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      clearStaffAuthSession();
    }
    throw new Error(json.error || 'Gagal menyetujui verifikasi');
  }
};

export const rejectPaymentVerification = async (id: number, rejectionReason: string): Promise<void> => {
  const res = await fetch(`${API_BASE}/api/staff/payment-verifications/${id}/reject`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getStaffAuthHeader(),
    },
    body: JSON.stringify({ rejection_reason: rejectionReason }),
  });

  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      clearStaffAuthSession();
    }
    throw new Error(json.error || 'Gagal menolak verifikasi');
  }
};

export const updatePaymentVerificationPlan = async (
  id: number,
  planId: number
): Promise<PaymentVerificationItem> => {
  const res = await fetch(`${API_BASE}/api/staff/payment-verifications/${id}/plan`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getStaffAuthHeader(),
    },
    body: JSON.stringify({ plan_id: planId }),
  });

  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      clearStaffAuthSession();
    }
    throw new Error(json.error || 'Gagal mengubah paket pembayaran');
  }

  return json.payment_verification;
};

export const updatePaymentVerificationCoupon = async (
  id: number,
  couponCode: string | null // null = remove coupon
): Promise<PaymentVerificationItem> => {
  const res = await fetch(`${API_BASE}/api/staff/payment-verifications/${id}/coupon`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getStaffAuthHeader(),
    },
    body: JSON.stringify({ coupon_code: couponCode }),
  });

  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      clearStaffAuthSession();
    }
    throw new Error(json.error || 'Gagal menerapkan kupon');
  }

  return json.payment_verification;
};


export interface StaffTenantDomainInfo {
  subdomain: string;
  custom_domain: string | null;
  custom_domain_status: string | null;
}

export interface StaffTenantUsageStats {
  total_packages: number;
  total_prospects: number;
  total_active_agents: number;
}

export interface StaffTenantAdminItem {
  id: number;
  name: string;
  email: string;
  status: string;
  created_at: string;
}

export interface StaffTenantDetail {
  id: number;
  name: string;
  slug: string;
  status: string;
  whatsapp_number?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  ppiu_number?: string | null;
  brand_primary_color?: string | null;
  brand_logo_url?: string | null;
  brand_icon_url?: string | null;
  tagline?: string | null;
  commission_scheme?: string | null;
  created_at: string;
  domain: StaffTenantDomainInfo;
  current_plan: string | null | { id?: number; name?: string; period_months?: number };
  current_plan_name?: string | null;
  subscription_expires_at: string | null;
  ringkasan_penggunaan?: StaffTenantUsageStats;
  usage?: StaffTenantUsageStats;
  total_packages?: number;
  total_prospects?: number;
  total_active_agents?: number;
  daftar_admin: StaffTenantAdminItem[];
}

export const fetchStaffTenantDetail = async (id: number): Promise<StaffTenantDetail> => {
  const res = await fetch(`${API_BASE}/api/staff/tenants/${id}`, {
    headers: {
      ...getStaffAuthHeader(),
    },
  });

  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      clearStaffAuthSession();
    }
    throw new Error(json.error || 'Gagal memuat detail tenant');
  }

  return json.tenant;
};

export const resetTenantAdminPassword = async (
  tenantId: number,
  adminUserId: number,
  newPassword: string
): Promise<void> => {
  const res = await fetch(`${API_BASE}/api/staff/tenants/${tenantId}/admin-users/${adminUserId}/reset-password`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getStaffAuthHeader(),
    },
    body: JSON.stringify({ new_password: newPassword }),
  });

  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      clearStaffAuthSession();
    }
    throw new Error(json.error || 'Gagal mereset password admin user');
  }
};

export interface PlatformSettings {
  whatsapp_number: string;
  bank_name: string;
  bank_account_number: string;
  bank_account_holder: string;
}

export interface PlatformSettingsInput {
  whatsapp_number: string;
  bank_name: string;
  bank_account_number: string;
  bank_account_holder: string;
}

export const fetchPlatformSettingsStaff = async (): Promise<PlatformSettings> => {
  const res = await fetch(`${API_BASE}/api/staff/platform-settings`, {
    headers: {
      ...getStaffAuthHeader(),
    },
  });

  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      clearStaffAuthSession();
    }
    throw new Error(json.error || 'Gagal memuat pengaturan platform');
  }

  return json;
};

export const updatePlatformSettingsStaff = async (input: PlatformSettingsInput): Promise<PlatformSettings> => {
  const res = await fetch(`${API_BASE}/api/staff/platform-settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getStaffAuthHeader(),
    },
    body: JSON.stringify(input),
  });

  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      clearStaffAuthSession();
    }
    throw new Error(json.error || 'Gagal memperbarui pengaturan platform');
  }

  return json.settings || json;
};

export interface PlatformOverviewMetrics {
  total_tenants: number;
  active_tenants: number;
  pending_tenants: number;
  expired_tenants: number;
  suspended_tenants: number;
  no_plan_tenants?: number;
  estimated_mrr: number;
  estimated_arr: number;
  upcoming_renewals_7d: number;
  upcoming_renewals_30d: number;
  pending_verifications_count: number;
  pending_verifications_total: number;
  total_packages: number;
  total_prospects: number;
  total_active_agents: number;
}

export const fetchStaffOverview = async (): Promise<PlatformOverviewMetrics> => {
  const res = await fetch(`${API_BASE}/api/staff/overview`, {
    headers: {
      ...getStaffAuthHeader(),
    },
  });

  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      clearStaffAuthSession();
    }
    throw new Error(json.error || 'Gagal memuat ringkasan platform');
  }

  return json.overview;
};

export interface ImpersonationResult {
  token: string;
  expires_at: string;
  tenant_id: number;
  tenant: {
    id: number;
    name: string;
    slug: string;
  };
  admin_user: {
    id: number;
    name: string;
    email: string;
  };
}

export const impersonateTenant = async (tenantId: number): Promise<ImpersonationResult> => {
  const res = await fetch(`${API_BASE}/api/staff/tenants/${tenantId}/impersonate`, {
    method: 'POST',
    headers: {
      ...getStaffAuthHeader(),
    },
  });

  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      clearStaffAuthSession();
    }
    throw new Error(json.error || 'Gagal melakukan impersonasi travel');
  }

  return json;
};

export const updateTenantSubscription = async (
  tenantId: number,
  planId: number,
  periodMonths?: number
): Promise<{ message: string }> => {
  const res = await fetch(`${API_BASE}/api/staff/tenants/${tenantId}/subscription`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getStaffAuthHeader(),
    },
    body: JSON.stringify({
      plan_id: planId,
      period_months: periodMonths,
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      clearStaffAuthSession();
    }
    throw new Error(json.error || 'Gagal memperbarui paket langganan');
  }

  return json;
};

export const fetchStaffUsers = async (): Promise<StaffUser[]> => {
  const res = await fetch(`${API_BASE}/api/staff/users`, {
    headers: {
      ...getStaffAuthHeader(),
    },
  });

  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      clearStaffAuthSession();
    }
    throw new Error(json.error || 'Gagal memuat data staf');
  }

  if (Array.isArray(json)) {
    return json;
  }
  return json.users || [];
};

export const createStaffUser = async (data: StaffUserInput): Promise<StaffUser> => {
  const res = await fetch(`${API_BASE}/api/staff/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getStaffAuthHeader(),
    },
    body: JSON.stringify(data),
  });

  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      clearStaffAuthSession();
    }
    throw new Error(json.error || 'Gagal menambahkan staf');
  }

  return json;
};

export const updateStaffUser = async (id: number, data: StaffUserInput): Promise<StaffUser> => {
  const res = await fetch(`${API_BASE}/api/staff/users/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getStaffAuthHeader(),
    },
    body: JSON.stringify(data),
  });

  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      clearStaffAuthSession();
    }
    throw new Error(json.error || 'Gagal memperbarui data staf');
  }

  return json;
};



