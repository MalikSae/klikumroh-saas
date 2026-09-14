export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8080';

export interface PricingPlan {
  id: number;
  name: string;
  period_months: number;
  price: number;
  created_at?: string;
  updated_at?: string;
}

export interface CouponValidationResult {
  valid: boolean;
  code: string;
  discount_percentage: number;
  plan_id?: number | null;
  plan_name?: string | null;
}

export interface TenantSignupPayload {
  travel_name: string;
  slug: string;
  admin_name: string;
  admin_email: string;
  admin_password: string;
  admin_whatsapp?: string;
  plan_id: number;
  coupon_code?: string;
}

export interface TenantSignupResponse {
  payment_verification_id: number;
  final_amount: number;
  tenant_id: number;
  travel_name: string;
}

export const fetchPricingPlans = async (): Promise<PricingPlan[]> => {
  try {
    const res = await fetch(`${API_BASE}/api/public/pricing-plans`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error('Gagal memuat paket harga');
    }
    const data = await res.json();
    return data.plans || [];
  } catch {
    // Fallback static plans if API is unavailable during SSR build
    return [
      { id: 1, name: '3 Bulan', period_months: 3, price: 1500000 },
      { id: 2, name: '6 Bulan', period_months: 6, price: 2700000 },
      { id: 3, name: '12 Bulan', period_months: 12, price: 4800000 },
    ];
  }
};

export const checkSlugAvailability = async (slug: string): Promise<{ available: boolean; reason?: string }> => {
  const res = await fetch(`${API_BASE}/api/public/check-slug?slug=${encodeURIComponent(slug)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { available: false, reason: err.reason || err.error || 'Slug tidak valid' };
  }
  return res.json();
};

export const validateCoupon = async (code: string, planId?: number): Promise<CouponValidationResult> => {
  const res = await fetch(`${API_BASE}/api/public/coupons/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, plan_id: planId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Kupon tidak valid' }));
    throw new Error(err.error || 'Kupon tidak valid');
  }
  return res.json();
};

export const submitTenantSignup = async (payload: TenantSignupPayload): Promise<TenantSignupResponse> => {
  const res = await fetch(`${API_BASE}/api/public/tenant-signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Pendaftaran gagal' }));
    throw new Error(err.error || 'Gagal memproses pendaftaran');
  }
  return res.json();
};

export const uploadPaymentProof = async (verificationId: number, file: File): Promise<{ message: string; proof_url: string }> => {
  const formData = new FormData();
  formData.append('proof_file', file);

  const res = await fetch(`${API_BASE}/api/public/tenant-signup/${verificationId}/proof`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal mengunggah bukti pembayaran' }));
    throw new Error(err.error || 'Gagal mengunggah bukti');
  }
  return res.json();
};

export const formatRupiah = (amount: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export interface PlatformSettings {
  whatsapp_number: string;
  bank_name: string;
  bank_account_number: string;
  bank_account_holder: string;
}

export const fetchPlatformSettings = async (): Promise<PlatformSettings> => {
  try {
    const res = await fetch(`${API_BASE}/api/public/platform-settings`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error('Gagal memuat pengaturan platform');
    }
    return await res.json();
  } catch {
    return {
      whatsapp_number: '6281234567890',
      bank_name: 'Bank Syariah Indonesia (BSI)',
      bank_account_number: '7123456789',
      bank_account_holder: 'PT Klik Umroh Digital',
    };
  }
};
