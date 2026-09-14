// API Client for KlikUmroh Dashboard

export interface AdminUser {
  id: number;
  tenant_id: number;
  tenant_name?: string;
  email: string;
  name: string;
  status: string;
}

export interface PackagePhoto {
  id: number;
  package_id: number;
  file_path: string;
  sort_order: number;
}

export interface PackageItem {
  id: number;
  tenant_id: number;
  name: string;
  description?: string | null;
  price?: number | null;
  departure_date?: string | null;
  quota?: number | null;
  commission_amount?: number | null;
  status: 'draft' | 'published' | 'archived';
  itinerary?: string | null;
  facilities_included?: string | null;
  facilities_excluded?: string | null;
  hotel_info?: string | null;
  flight_info?: string | null;
  terms_conditions?: string | null;
  photos?: PackagePhoto[] | null;
  created_at: string;
  updated_at: string;
}

export interface AgentItem {
  id: number;
  tenant_id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  domisili?: string | null;
  photo_url?: string | null;
  referral_code: string;
  parent_agent_id?: number | null;
  status: 'pending' | 'active' | 'inactive' | 'rejected';
  payment_status: 'not_applicable' | 'awaiting_proof' | 'pending_verification' | 'verified';
  payment_proof_url?: string | null;
  rejection_reason?: string | null;
  terms_accepted_at?: string | null;
  bank_name?: string | null;
  bank_account_number?: string | null;
  bank_account_holder?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProspectItem {
  id: number;
  tenant_id: number;
  package_id?: number | null;
  package_name?: string;
  agent_id?: number | null;
  name: string;
  phone: string;
  email?: string | null;
  jumlah_jamaah?: number | null;
  source_channel: string;
  status: 'baru' | 'dihubungi' | 'tertarik' | 'closing' | 'tidak_lanjut';
  lost_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProspectStatusHistoryItem {
  id: number;
  tenant_id: number;
  prospect_id: number;
  changed_by_type: 'admin' | 'agent';
  changed_by_id: number;
  changed_by_name?: string | null;
  old_status: string;
  new_status: string;
  changed_at: string;
}

export interface ProspectNoteItem {
  id: number;
  tenant_id: number;
  prospect_id: number;
  author_type: 'admin' | 'agent';
  author_id: number;
  author_name?: string | null;
  note_text: string;
  created_at: string;
}

export interface ProspectCommissionInfo {
  type: 'potensi' | 'final';
  direct_amount: number;
  override_amount: number;
  total_amount: number;
  rate_per_jamaah: number;
}

export interface ProspectDetailResponse {
  prospect: ProspectItem;
  package?: PackageItem | null;
  agent?: AgentItem | null;
  info_komisi?: ProspectCommissionInfo | null;
  status_history: ProspectStatusHistoryItem[];
  notes: ProspectNoteItem[];
}

export interface UpdateProspectInput {
  name: string;
  phone: string;
  package_id?: number | null;
  jumlah_jamaah?: number | null;
  correction_reason?: string;
}

export interface CommissionSettingsResponse {
  commission_override_enabled: boolean;
  commission_override_percentage: number | null;
}

export const API_BASE = 'http://localhost:8080';

export const getFullImageUrl = (path?: string | null): string => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:') || path.startsWith('data:')) {
    return path;
  }
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
};

const TOKEN_KEY = 'klikumroh_token';
const USER_KEY = 'klikumroh_user';
const TRAVEL_NAME_KEY = 'klikumroh_travel_name';

export const getStoredToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

export const getStoredUser = (): AdminUser | null => {
  const userStr = localStorage.getItem(USER_KEY);
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
};

export const getStoredTravelName = (): string => {
  const custom = localStorage.getItem(TRAVEL_NAME_KEY);
  if (custom && custom.trim()) return custom.trim();
  const user = getStoredUser();
  if (user?.tenant_name && user.tenant_name.trim()) return user.tenant_name.trim();
  return 'Dashboard Travel';
};

export const setStoredTravelName = (name: string) => {
  if (name && name.trim()) {
    localStorage.setItem(TRAVEL_NAME_KEY, name.trim());
  }
};

export const setAuthSession = (token: string, user: AdminUser) => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (user.tenant_name) {
    setStoredTravelName(user.tenant_name);
  }
};

export const clearAuthSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(TRAVEL_NAME_KEY);
};

export const loginAdmin = async (email: string, password: string): Promise<{ token: string; user: AdminUser; tenant_status?: string }> => {
  const res = await dashboardFetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Login gagal' }));
    throw new Error(errorData.error || 'Login gagal');
  }

  const data = await res.json();
  setAuthSession(data.token, data.user);
  return data;
};

/**
 * Pass-through fetch wrapper for KlikUmroh Dashboard API.
 */
export const dashboardFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  return fetch(input, init);
};

/**
 * Clears the current tenant session and sends the user back to the login
 * page. Used whenever there is no valid token, or the backend rejects the
 * stored token as expired/invalid — never fall back to a different tenant's
 * account here, that would show the wrong travel's dashboard.
 */
const redirectToLogin = () => {
  clearAuthSession();
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
};

const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const token = getStoredToken();
  if (!token) {
    redirectToLogin();
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token || ''}`,
  };
};

// Packages API
export const fetchPackages = async (status?: string): Promise<PackageItem[]> => {
  const headers = await getAuthHeaders();
  const url = status ? `${API_BASE}/api/dashboard/packages?status=${status}` : `${API_BASE}/api/dashboard/packages`;
  const res = await dashboardFetch(url, { headers });
  if (!res.ok) {
    if (res.status === 401) {
      redirectToLogin();
    }
    const err = await res.json().catch(() => ({ error: 'Gagal memuat paket' }));
    throw new Error(err.error || 'Gagal memuat paket');
  }
  const data = await res.json();
  return data || [];
};

export const fetchPackageById = async (id: number): Promise<PackageItem> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/packages/${id}`, { headers });
  if (!res.ok) {
    if (res.status === 401) {
      redirectToLogin();
    }
    const err = await res.json().catch(() => ({ error: 'Gagal memuat paket' }));
    throw new Error(err.error || 'Gagal memuat paket');
  }
  return await res.json();
};

export const createPackage = async (pkg: Partial<PackageItem>): Promise<PackageItem> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/packages`, {
    method: 'POST',
    headers,
    body: JSON.stringify(pkg),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal membuat paket' }));
    throw new Error(err.error || 'Gagal membuat paket');
  }
  return await res.json();
};

export const updatePackage = async (id: number, pkg: Partial<PackageItem>): Promise<PackageItem> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/packages/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(pkg),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal memperbarui paket' }));
    throw new Error(err.error || 'Gagal memperbarui paket');
  }
  return await res.json();
};

export const deletePackage = async (id: number): Promise<void> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/packages/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal menghapus paket' }));
    throw new Error(err.error || 'Gagal menghapus paket');
  }
}

export const uploadPackagePhoto = async (packageId: number, file: File): Promise<PackagePhoto> => {
  const headers = await getAuthHeaders();
  // Remove content-type so browser sets it to multipart/form-data with boundary
  const { 'Content-Type': _, ...headersWithoutContentType } = headers as Record<string, string>;
  
  const formData = new FormData();
  formData.append('photo', file);

  const res = await dashboardFetch(`${API_BASE}/api/dashboard/packages/${packageId}/photos`, {
    method: 'POST',
    headers: headersWithoutContentType,
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal mengunggah foto' }));
    throw new Error(err.error || 'Gagal mengunggah foto');
  }
  return await res.json();
};

export const deletePackagePhoto = async (packageId: number, photoId: number): Promise<void> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/packages/${packageId}/photos/${photoId}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal menghapus foto' }));
    throw new Error(err.error || 'Gagal menghapus foto');
  }
};

export const movePackagePhoto = async (packageId: number, photoId: number, direction: 'up' | 'down'): Promise<void> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/packages/${packageId}/photos/${photoId}/move`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ direction }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal memindahkan foto' }));
    throw new Error(err.error || 'Gagal memindahkan foto');
  }
};

// Prospects API
export interface FetchProspectsParams {
  status?: string;
  source?: string;
  search?: string;
  package_id?: number | string;
}

export const fetchProspects = async (
  statusOrParams?: string | FetchProspectsParams
): Promise<ProspectItem[]> => {
  const headers = await getAuthHeaders();
  let status: string | undefined;
  let source: string | undefined;
  let search: string | undefined;
  let packageId: number | string | undefined;

  if (typeof statusOrParams === 'string') {
    status = statusOrParams;
  } else if (statusOrParams) {
    status = statusOrParams.status;
    source = statusOrParams.source;
    search = statusOrParams.search;
    packageId = statusOrParams.package_id;
  }

  const queryParams = new URLSearchParams();
  if (status && status !== 'all') queryParams.append('status', status);
  if (source && source !== 'all') queryParams.append('source', source);
  if (search && search.trim()) queryParams.append('search', search.trim());
  if (packageId && packageId !== 'all') queryParams.append('package_id', String(packageId));

  const qs = queryParams.toString();
  const url = qs ? `${API_BASE}/api/dashboard/prospects?${qs}` : `${API_BASE}/api/dashboard/prospects`;
  const res = await dashboardFetch(url, { headers });
  if (!res.ok) {
    if (res.status === 401) {
      redirectToLogin();
    }
    const err = await res.json().catch(() => ({ error: 'Gagal memuat prospek' }));
    throw new Error(err.error || 'Gagal memuat prospek');
  }
  const data = await res.json();
  return data || [];
};

export const updateProspectStatus = async (id: number, status: string, lostReason?: string): Promise<void> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/prospects/${id}/status`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      status,
      lost_reason: status === 'tidak_lanjut' ? (lostReason || null) : null,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal mengubah status prospek' }));
    throw new Error(err.error || 'Gagal mengubah status prospek');
  }
};

export const downloadProspectsCSV = async (
  params?: { status?: string; source?: string; search?: string; package_id?: number | string }
): Promise<void> => {
  const headers = await getAuthHeaders();
  const queryParams = new URLSearchParams();
  if (params?.status && params.status !== 'all') queryParams.append('status', params.status);
  if (params?.source && params.source !== 'all') queryParams.append('source', params.source);
  if (params?.search && params.search.trim()) queryParams.append('search', params.search.trim());
  if (params?.package_id && params.package_id !== 'all') queryParams.append('package_id', String(params.package_id));

  const qs = queryParams.toString();
  const url = qs ? `${API_BASE}/api/dashboard/prospects/export?${qs}` : `${API_BASE}/api/dashboard/prospects/export`;

  const res = await dashboardFetch(url, { headers });
  if (!res.ok) {
    throw new Error('Gagal mengekspor data prospek');
  }
  const blob = await res.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `prospek-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(downloadUrl);
  document.body.removeChild(a);
};

// Tenant Branding API
export interface TenantBrandingResponse {
  brand_primary_color: string | null;
}

export const fetchTenantBranding = async (): Promise<TenantBrandingResponse> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/branding`, { headers });
  if (!res.ok) {
    if (res.status === 401) {
      redirectToLogin();
    }
    const err = await res.json().catch(() => ({ error: 'Gagal memuat pengaturan branding' }));
    throw new Error(err.error || 'Gagal memuat pengaturan branding');
  }
  return await res.json();
};

export const updateTenantBranding = async (brandPrimaryColor: string): Promise<TenantBrandingResponse> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/branding`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ brand_primary_color: brandPrimaryColor }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal menyimpan pengaturan branding' }));
    throw new Error(err.error || 'Gagal menyimpan pengaturan branding');
  }
  return await res.json();
};

// Tenant WhatsApp API
export interface TenantWhatsAppResponse {
  whatsapp_number: string | null;
}

export const fetchTenantWhatsApp = async (): Promise<TenantWhatsAppResponse> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/whatsapp`, { headers });
  if (!res.ok) {
    if (res.status === 401) {
      redirectToLogin();
    }
    const err = await res.json().catch(() => ({ error: 'Gagal memuat nomor WhatsApp travel' }));
    throw new Error(err.error || 'Gagal memuat nomor WhatsApp travel');
  }
  return await res.json();
};

export const updateTenantWhatsApp = async (whatsappNumber: string): Promise<TenantWhatsAppResponse> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/whatsapp`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ whatsapp_number: whatsappNumber }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal menyimpan nomor WhatsApp travel' }));
    throw new Error(err.error || 'Gagal menyimpan nomor WhatsApp travel');
  }
  return await res.json();
};

export const fetchProspectDetail = async (id: number): Promise<ProspectDetailResponse> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/prospects/${id}`, { headers });
  if (!res.ok) {
    if (res.status === 401) {
      redirectToLogin();
    }
    const err = await res.json().catch(() => ({ error: 'Gagal memuat detail prospek' }));
    throw new Error(err.error || 'Gagal memuat detail prospek');
  }
  return await res.json();
};

export const updateProspect = async (id: number, input: UpdateProspectInput): Promise<void> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/prospects/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal memperbarui prospek' }));
    throw new Error(err.error || 'Gagal memperbarui prospek');
  }
};

export const addProspectNote = async (id: number, noteText: string): Promise<ProspectNoteItem> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/prospects/${id}/notes`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ note_text: noteText }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal menambahkan catatan' }));
    throw new Error(err.error || 'Gagal menambahkan catatan');
  }
  return await res.json();
};

export const fetchCommissionSettings = async (): Promise<CommissionSettingsResponse> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/commission-settings`, { headers });
  if (!res.ok) {
    if (res.status === 401) {
      redirectToLogin();
    }
    const err = await res.json().catch(() => ({ error: 'Gagal memuat pengaturan komisi' }));
    throw new Error(err.error || 'Gagal memuat pengaturan komisi');
  }
  return await res.json();
};

export const updateCommissionSettings = async (
  enabled: boolean,
  percentage: number | null
): Promise<CommissionSettingsResponse> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/commission-settings`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      commission_override_enabled: enabled,
      commission_override_percentage: percentage,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal menyimpan pengaturan komisi' }));
    throw new Error(err.error || 'Gagal menyimpan pengaturan komisi');
  }
  return await res.json();
};

// -------------------------------------------------------------
// PROFILE, CONTACT, LEGAL & TRUST METRICS
// -------------------------------------------------------------

export interface TenantProfile {
  name: string;
  brand_logo_url?: string | null;
  brand_icon_url?: string | null;
  tagline?: string | null;
  about_summary?: string | null;
}

export interface TenantContactLegal {
  ppiu_number?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  whatsapp_number?: string | null;
  social_instagram?: string | null;
  social_facebook?: string | null;
  social_youtube?: string | null;
}

export interface TenantTrustMetrics {
  trust_rating?: string | null;
  trust_alumni_count?: string | null;
  trust_guarantee?: string | null;
}

export const fetchTenantProfile = async (): Promise<TenantProfile> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/profile`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal memuat profil' }));
    throw new Error(err.error || 'Gagal memuat profil');
  }
  return await res.json();
};

export const updateTenantProfile = async (input: TenantProfile): Promise<TenantProfile> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/profile`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal memperbarui profil' }));
    throw new Error(err.error || 'Gagal memperbarui profil');
  }
  return await res.json();
};

export const uploadTenantIcon = async (file: File): Promise<{ brand_icon_url: string }> => {
  const headers = await getAuthHeaders();
  const { 'Content-Type': _, ...headersWithoutContentType } = headers as Record<string, string>;
  const formData = new FormData();
  formData.append('icon', file);

  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/branding/icon`, {
    method: 'POST',
    headers: headersWithoutContentType,
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal mengunggah icon' }));
    throw new Error(err.error || 'Gagal mengunggah icon');
  }
  return await res.json();
};

export const deleteTenantIcon = async (): Promise<{ message: string }> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/branding/icon`, {
    method: 'DELETE',
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal menghapus icon' }));
    throw new Error(err.error || 'Gagal menghapus icon');
  }
  return await res.json();
};

export const uploadTenantLogo = async (file: File): Promise<{ brand_logo_url: string }> => {
  const headers = await getAuthHeaders();
  const { 'Content-Type': _, ...headersWithoutContentType } = headers as Record<string, string>;
  const formData = new FormData();
  formData.append('logo', file);

  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/branding/logo`, {
    method: 'POST',
    headers: headersWithoutContentType,
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal mengunggah logo' }));
    throw new Error(err.error || 'Gagal mengunggah logo');
  }
  return await res.json();
};

export const deleteTenantLogo = async (): Promise<{ message: string }> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/branding/logo`, {
    method: 'DELETE',
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal menghapus logo' }));
    throw new Error(err.error || 'Gagal menghapus logo');
  }
  return await res.json();
};

export interface TenantSEOGeo {
  city?: string | null;
  province?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  meta_keywords?: string | null;
  og_image_url?: string | null;
}

export const fetchTenantSEOGeo = async (): Promise<TenantSEOGeo> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/seo-geo`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal memuat pengaturan SEO & GEO' }));
    throw new Error(err.error || 'Gagal memuat pengaturan SEO & GEO');
  }
  return await res.json();
};

export const updateTenantSEOGeo = async (input: {
  city?: string | null;
  province?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  meta_keywords?: string | null;
}): Promise<TenantSEOGeo> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/seo-geo`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal memperbarui pengaturan SEO & GEO' }));
    throw new Error(err.error || 'Gagal memperbarui pengaturan SEO & GEO');
  }
  return await res.json();
};

export const uploadTenantOGImage = async (file: File): Promise<{ og_image_url: string }> => {
  const headers = await getAuthHeaders();
  const { 'Content-Type': _, ...headersWithoutContentType } = headers as Record<string, string>;
  const formData = new FormData();
  formData.append('og_image', file);

  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/branding/og-image`, {
    method: 'POST',
    headers: headersWithoutContentType,
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal mengunggah gambar share medsos' }));
    throw new Error(err.error || 'Gagal mengunggah gambar share medsos');
  }
  return await res.json();
};

export const deleteTenantOGImage = async (): Promise<{ message: string }> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/branding/og-image`, {
    method: 'DELETE',
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal menghapus gambar share medsos' }));
    throw new Error(err.error || 'Gagal menghapus gambar share medsos');
  }
  return await res.json();
};

export const fetchTenantContactLegal = async (): Promise<TenantContactLegal> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/contact-legal`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal memuat data kontak' }));
    throw new Error(err.error || 'Gagal memuat data kontak');
  }
  return await res.json();
};

export const updateTenantContactLegal = async (input: TenantContactLegal): Promise<TenantContactLegal> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/contact-legal`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal memperbarui data kontak' }));
    throw new Error(err.error || 'Gagal memperbarui data kontak');
  }
  return await res.json();
};

export const fetchTenantTrustMetrics = async (): Promise<TenantTrustMetrics> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/trust-metrics`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal memuat metrik kepercayaan' }));
    throw new Error(err.error || 'Gagal memuat metrik kepercayaan');
  }
  return await res.json();
};

export const updateTenantTrustMetrics = async (input: TenantTrustMetrics): Promise<TenantTrustMetrics> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/trust-metrics`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal memperbarui metrik kepercayaan' }));
    throw new Error(err.error || 'Gagal memperbarui metrik kepercayaan');
  }
  return await res.json();
};

// -------------------------------------------------------------
// BANNERS, TESTIMONIALS & FAQS
// -------------------------------------------------------------

export interface BannerItem {
  id: number;
  tenant_id: number;
  title: string;
  image_url: string;
  subtitle?: string | null;
  cta_url?: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TestimonialItem {
  id: number;
  tenant_id: number;
  name: string;
  package_name: string;
  rating: number;
  quote: string;
  avatar_url?: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FAQItem {
  id: number;
  tenant_id: number;
  question: string;
  answer: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Banner APIs
export const fetchBanners = async (): Promise<BannerItem[]> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/banners`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal memuat daftar banner' }));
    throw new Error(err.error || 'Gagal memuat daftar banner');
  }
  return await res.json();
};

export const createBanner = async (input: Partial<BannerItem>): Promise<BannerItem> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/banners`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal membuat banner' }));
    throw new Error(err.error || 'Gagal membuat banner');
  }
  return await res.json();
};

export const updateBanner = async (id: number, input: Partial<BannerItem>): Promise<BannerItem> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/banners/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal memperbarui banner' }));
    throw new Error(err.error || 'Gagal memperbarui banner');
  }
  return await res.json();
};

export const uploadBannerImage = async (file: File): Promise<{ image_url: string }> => {
  const headers = await getAuthHeaders();
  const { 'Content-Type': _, ...headersWithoutContentType } = headers as Record<string, string>;
  const formData = new FormData();
  formData.append('image', file);

  const res = await dashboardFetch(`${API_BASE}/api/dashboard/banners/upload`, {
    method: 'POST',
    headers: headersWithoutContentType,
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal mengunggah banner' }));
    throw new Error(err.error || 'Gagal mengunggah banner');
  }
  return await res.json();
};

export const deleteBanner = async (id: number): Promise<void> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/banners/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal menghapus banner' }));
    throw new Error(err.error || 'Gagal menghapus banner');
  }
};

// Testimonial APIs
export const fetchTestimonials = async (): Promise<TestimonialItem[]> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/testimonials`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal memuat testimoni' }));
    throw new Error(err.error || 'Gagal memuat testimoni');
  }
  return await res.json();
};

export const createTestimonial = async (input: Partial<TestimonialItem>): Promise<TestimonialItem> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/testimonials`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal membuat testimoni' }));
    throw new Error(err.error || 'Gagal membuat testimoni');
  }
  return await res.json();
};

export const updateTestimonial = async (id: number, input: Partial<TestimonialItem>): Promise<TestimonialItem> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/testimonials/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal memperbarui testimoni' }));
    throw new Error(err.error || 'Gagal memperbarui testimoni');
  }
  return await res.json();
};

export const deleteTestimonial = async (id: number): Promise<void> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/testimonials/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal menghapus testimoni' }));
    throw new Error(err.error || 'Gagal menghapus testimoni');
  }
};

// FAQ APIs
export const fetchFAQs = async (): Promise<FAQItem[]> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/faqs`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal memuat FAQ' }));
    throw new Error(err.error || 'Gagal memuat FAQ');
  }
  return await res.json();
};

export const createFAQ = async (input: Partial<FAQItem>): Promise<FAQItem> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/faqs`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal membuat FAQ' }));
    throw new Error(err.error || 'Gagal membuat FAQ');
  }
  return await res.json();
};

export const updateFAQ = async (id: number, input: Partial<FAQItem>): Promise<FAQItem> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/faqs/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal memperbarui FAQ' }));
    throw new Error(err.error || 'Gagal memperbarui FAQ');
  }
  return await res.json();
};

export const deleteFAQ = async (id: number): Promise<void> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/faqs/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal menghapus FAQ' }));
    throw new Error(err.error || 'Gagal menghapus FAQ');
  }
};

export interface TenantAgentSettings {
  agent_registration_fee: number | null;
  agent_registration_benefits: string | null;
  agent_bank_name: string | null;
  agent_bank_account_number: string | null;
  agent_bank_account_holder: string | null;
  agent_terms_conditions: string | null;
  agent_poster_url?: string | null;
  minimum_payout_amount: number | null;
}

export const fetchTenantAgentSettings = async (): Promise<TenantAgentSettings> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/agent-settings`, {
    headers,
  });
  if (!res.ok) {
    throw new Error('Gagal memuat pengaturan sistem agen');
  }
  return await res.json();
};

export const updateTenantAgentSettings = async (settings: TenantAgentSettings): Promise<void> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/agent-settings`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal menyimpan pengaturan sistem agen' }));
    throw new Error(err.error || 'Gagal menyimpan pengaturan sistem agen');
  }
};

export const uploadAgentPoster = async (file: File): Promise<{ poster_url: string; message: string }> => {
  const headers = await getAuthHeaders();
  const { 'Content-Type': _, ...headersWithoutContentType } = headers as Record<string, string>;
  const formData = new FormData();
  formData.append('poster', file);

  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/agent-settings/poster`, {
    method: 'POST',
    headers: headersWithoutContentType,
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal mengunggah poster agen' }));
    throw new Error(err.error || 'Gagal mengunggah poster agen');
  }
  return await res.json();
};

export const deleteAgentPoster = async (): Promise<void> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/agent-settings/poster`, {
    method: 'DELETE',
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal menghapus poster agen' }));
    throw new Error(err.error || 'Gagal menghapus poster agen');
  }
};

export const fetchDashboardAgents = async (status?: string): Promise<AgentItem[]> => {
  const headers = await getAuthHeaders();
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/agents${query}`, {
    headers,
  });
  if (!res.ok) {
    throw new Error('Gagal memuat data agen');
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
};

export const approveAgent = async (id: number): Promise<void> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/agents/${id}/approve`, {
    method: 'PATCH',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal menyetujui agen' }));
    throw new Error(err.error || 'Gagal menyetujui agen');
  }
};

export const rejectAgent = async (id: number, reason?: string): Promise<void> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/agents/${id}/reject`, {
    method: 'PATCH',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason: reason?.trim() || '' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal menolak agen' }));
    throw new Error(err.error || 'Gagal menolak agen');
  }
};

export interface TenantTargetSettings {
  target_period_start: string | null;
  target_period_end: string | null;
  target_jamaah: number | null;
export interface AgentTarget {
  id: number;
  tenant_id: number;
  title?: string | null;
  metric_type: 'closing_pax' | 'mitra_baru_count';
  metric_value: number;
  reward_description?: string | null;
  period_start: string;
  period_end: string;
  status: 'active' | 'closed';
  created_by?: number | null;
  created_at: string;
  updated_at: string;
}

export const fetchTenantTargetSettings = async (): Promise<TenantTargetSettings> => {
export interface AgentTargetProgressRow {
  agent_id: number;
  agent_name: string;
  agent_phone?: string | null;
  achieved_value: number;
  target_value: number;
  achieved: boolean;
  achievement_id?: number | null;
  reward_status?: 'pending' | 'given' | null;
}

export interface TargetProgressResponse {
  target: AgentTarget;
  rows: AgentTargetProgressRow[];
}

export interface AchievementItem {
  id: number;
  agent_id: number;
  agent_name: string;
  achieved_value: number;
  achieved_at: string;
  reward_status: 'pending' | 'given';
  reward_given_at?: string | null;
  reward_description_snapshot?: string | null;
  notes?: string | null;
}

export interface CreateTargetInput {
  title?: string;
  metric_type: 'closing_pax' | 'mitra_baru_count';
  metric_value: number;
  reward_description?: string;
  period_start: string;
  period_end: string;
}

export interface UpdateTargetInput {
  title?: string;
  metric_value: number;
  reward_description?: string;
  period_start: string;
  period_end: string;
}

export const fetchTargets = async (status?: 'active' | 'closed'): Promise<AgentTarget[]> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/target-settings`, {
  const url = status
    ? `${API_BASE}/api/dashboard/tenant/targets?status=${status}`
    : `${API_BASE}/api/dashboard/tenant/targets`;
  const res = await dashboardFetch(url, { headers });
  if (!res.ok) {
    throw new Error('Gagal memuat daftar target');
  }
  const data = await res.json();
  return data.targets || [];
};

export const createTarget = async (input: CreateTargetInput): Promise<AgentTarget> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/targets`, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error('Gagal memuat pengaturan target bulanan');
    const err = await res.json().catch(() => ({ error: 'Gagal membuat target baru' }));
    throw new Error(err.error || 'Gagal membuat target baru');
  }
  return await res.json();
};

export const updateTenantTargetSettings = async (settings: TenantTargetSettings): Promise<TenantTargetSettings> => {
export const updateTarget = async (id: number, input: UpdateTargetInput): Promise<AgentTarget> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/target-settings`, {
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/targets/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(settings),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal menyimpan pengaturan target bulanan' }));
    throw new Error(err.error || 'Gagal menyimpan pengaturan target bulanan');
    const err = await res.json().catch(() => ({ error: 'Gagal memperbarui target' }));
    throw new Error(err.error || 'Gagal memperbarui target');
  }
  return await res.json();
};

export const deleteTarget = async (id: number): Promise<void> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/targets/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal menghapus target' }));
    throw new Error(err.error || 'Gagal menghapus target');
  }
};

export const fetchTargetProgress = async (id: number): Promise<TargetProgressResponse> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/targets/${id}/progress`, { headers });
  if (!res.ok) {
    throw new Error('Gagal memuat progres target');
  }
  return await res.json();
};

export const closeTargetPeriod = async (id: number): Promise<{ message: string; achieved_count: number }> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/targets/${id}/close`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal menutup periode target' }));
    throw new Error(err.error || 'Gagal menutup periode target');
  }
  return await res.json();
};

export const fetchTargetAchievements = async (id: number, rewardStatus?: string): Promise<AchievementItem[]> => {
  const headers = await getAuthHeaders();
  const url = rewardStatus
    ? `${API_BASE}/api/dashboard/tenant/targets/${id}/achievements?reward_status=${rewardStatus}`
    : `${API_BASE}/api/dashboard/tenant/targets/${id}/achievements`;
  const res = await dashboardFetch(url, { headers });
  if (!res.ok) {
    throw new Error('Gagal memuat daftar pencapaian');
  }
  const data = await res.json();
  return data.achievements || [];
};

export const markRewardGiven = async (achievementId: number, notes?: string): Promise<void> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/achievements/${achievementId}/reward`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status: 'given', notes }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal menandai reward' }));
    throw new Error(err.error || 'Gagal menandai reward');
  }
};

export const exportTargetAchievementsCSV = async (targetId: number): Promise<void> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/tenant/targets/${targetId}/achievements/export`, { headers });
  if (!res.ok) {
    throw new Error('Gagal mengunduh CSV pencapaian');
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pencapaian_target_${targetId}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};

export interface PayoutRequestItem {
  id: number;
  tenant_id: number;
  agent_id: number;
  agent_name?: string;
  agent_phone?: string;
  amount_requested: number;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  bank_name_snapshot: string;
  bank_account_number_snapshot: string;
  bank_account_holder_snapshot: string;
  rejection_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export const fetchPayoutRequests = async (status?: string): Promise<PayoutRequestItem[]> => {
  const headers = await getAuthHeaders();
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/payout-requests${query}`, {
    headers,
  });
  if (!res.ok) {
    throw new Error('Gagal memuat daftar pengajuan pencairan');
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
};

export const approvePayoutRequest = async (id: number): Promise<void> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/payout-requests/${id}/approve`, {
    method: 'PATCH',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal menyetujui pengajuan pencairan' }));
    throw new Error(err.error || 'Gagal menyetujui pengajuan pencairan');
  }
};

export const markPayoutRequestPaid = async (id: number): Promise<void> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/payout-requests/${id}/paid`, {
    method: 'PATCH',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal menandai pencairan sudah dibayar' }));
    throw new Error(err.error || 'Gagal menandai pencairan sudah dibayar');
  }
};

export const rejectPayoutRequest = async (id: number, rejection_reason: string): Promise<void> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/payout-requests/${id}/reject`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ rejection_reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal menolak pengajuan pencairan' }));
    throw new Error(err.error || 'Gagal menolak pengajuan pencairan');
  }
};

export interface AgentPayoutHistoryItem {
  id: number;
  created_at: string;
  amount: number;
  status: string;
}

export interface CommissionHistoryItem {
  id: number;
  source: string; // 'ledger' | 'payout'
  type: string; // 'direct' | 'override' | 'correction' | 'payout'
  description: string;
  amount: number;
  direction: string; // 'masuk' | 'keluar'
  status?: string; // 'pending' | 'approved' | 'rejected' | 'paid'
  created_at: string;
}

export interface AgentDashboardDetail {
  id: number;
  tenant_id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  domisili?: string | null;
  photo_url?: string | null;
  status: string;
  payment_status: string;
  payment_proof_url?: string | null;
  rejection_reason?: string | null;
  referral_code: string;
  created_at: string;
  parent_agent_id?: number | null;
  parent_agent_name?: string | null;
  ringkasan_jamaah: {
    baru: number;
    diproses: number;
    closing: number;
  };
  total_jamaah_closing: number;
  saldo_siap_cair: number;
  saldo_tertunda: number;
  riwayat_pencairan: AgentPayoutHistoryItem[];
  riwayat_komisi?: CommissionHistoryItem[];
}

export interface UpdateDashboardAgentInput {
  name?: string;
  phone?: string;
  email?: string;
  domisili?: string;
}

export const fetchAgentDetail = async (id: number): Promise<AgentDashboardDetail> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/agents/${id}`, {
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal memuat detail agen' }));
    throw new Error(err.error || 'Gagal memuat detail agen');
  }
  return await res.json();
};

export const updateDashboardAgentProfile = async (
  id: number,
  data: UpdateDashboardAgentInput
): Promise<AgentDashboardDetail> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/agents/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal memperbarui profil agen' }));
    throw new Error(err.error || 'Gagal memperbarui profil agen');
  }
  return await res.json();
};

export const resetAgentPassword = async (id: number, newPassword: string): Promise<void> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/agents/${id}/reset-password`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ new_password: newPassword }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal mereset password agen' }));
    throw new Error(err.error || 'Gagal mereset password agen');
  }
};

export const toggleAgentStatus = async (id: number, action: 'activate' | 'deactivate'): Promise<void> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/agents/${id}/toggle-status`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ action }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal mengubah status agen' }));
    throw new Error(err.error || 'Gagal mengubah status agen');
  }
};

export const fetchAgentCommissions = async (id: number): Promise<CommissionHistoryItem[]> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/agents/${id}/commissions`, {
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal memuat riwayat komisi agen' }));
    throw new Error(err.error || 'Gagal memuat riwayat komisi agen');
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
};

export interface DomainItem {
  id: number;
  tenant_id: number;
  hostname: string;
  type: 'subdomain' | 'custom';
  status: 'pending' | 'active' | 'failed';
  verification_failure_reason?: string | null;
  dns_verified_at?: string | null;
  last_verification_attempt_at?: string | null;
  verified_at?: string | null;
  last_check_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegisterDomainResult {
  domain: DomainItem;
  hostname: string;
  cname_target: string;
  instruction: string;
}

export const fetchDomains = async (): Promise<DomainItem[]> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/domains`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal memuat domain' }));
    throw new Error(err.error || 'Gagal memuat domain');
  }
  const data = await res.json();
  return data.domains || [];
};

export const registerCustomDomain = async (hostname: string): Promise<RegisterDomainResult> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/domains`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ hostname }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal mendaftarkan domain' }));
    throw new Error(err.error || 'Gagal mendaftarkan domain');
  }
  return await res.json();
};

export const verifyCustomDomain = async (id: number): Promise<DomainItem> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/domains/${id}/verify`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal memverifikasi domain' }));
    throw new Error(err.error || 'Gagal memverifikasi domain');
  }
  return await res.json();
};

export const deleteCustomDomain = async (id: number): Promise<void> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/domains/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal menghapus domain' }));
    throw new Error(err.error || 'Gagal menghapus domain');
  }
};

// ==========================================
// Team & Profile Management
// ==========================================

export interface TeamMemberItem {
  id: number;
  name: string;
  email: string;
  status: 'active' | 'inactive';
  created_at: string;
}

export interface MyProfileItem {
  id: number;
  tenant_id: number;
  name: string;
  email: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export const fetchTeamMembers = async (): Promise<TeamMemberItem[]> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/team`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal memuat anggota tim' }));
    throw new Error(err.error || 'Gagal memuat anggota tim');
  }
  return await res.json();
};

export const addTeamMember = async (payload: {
  name: string;
  email: string;
  password: string;
}): Promise<TeamMemberItem> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/team`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal menambahkan anggota tim' }));
    throw new Error(err.error || 'Gagal menambahkan anggota tim');
  }
  return await res.json();
};

export const toggleTeamMemberStatus = async (
  id: number,
  action: 'activate' | 'deactivate'
): Promise<TeamMemberItem> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/team/${id}/toggle-status`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ action }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal mengubah status anggota tim' }));
    throw new Error(err.error || 'Gagal mengubah status anggota tim');
  }
  return await res.json();
};

export const fetchMyProfile = async (): Promise<MyProfileItem> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/me`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal memuat profil' }));
    throw new Error(err.error || 'Gagal memuat profil');
  }
  return await res.json();
};

export const updateMyProfile = async (payload: {
  name?: string;
  email?: string;
}): Promise<MyProfileItem> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/me`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal memperbarui profil' }));
    throw new Error(err.error || 'Gagal memperbarui profil');
  }
  return await res.json();
};

export const updateMyPassword = async (payload: {
  current_password: string;
  new_password: string;
}): Promise<{ message: string }> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/me/password`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal mengubah password' }));
    throw new Error(err.error || 'Gagal mengubah password');
  }
  return await res.json();
};

// Dashboard Overview API
export interface UrgentAlerts {
  uncontacted_prospects_count: number;
  pending_payouts_count: number;
  pending_payouts_total: number;
}

export interface OverviewKPIs {
  total_prospects: number;
  total_closing_jamaah: number;
  closing_rate: number;
  agent_contribution_percentage: number;
}

export interface ChannelAttributionItem {
  channel: string;
  label: string;
  leads_count: number;
  closing_count: number;
  total_closing_pax: number;
  closing_rate: number;
}

export interface LostReasonItem {
  reason: string;
  count: number;
  percentage: number;
}

export interface PipelineFunnel {
  baru: number;
  dihubungi: number;
  tertarik: number;
  closing: number;
  tidak_lanjut: number;
  top_lost_reasons: LostReasonItem[];
}

export interface RecentProspectOverview {
  id: number;
  name: string;
  phone: string;
  jumlah_jamaah: number;
  package_name: string;
  package_departure_date?: string | null;
  source_channel: string;
  agent_name: string;
  status: string;
  created_at: string;
}

export interface TopAgentOverview {
  agent_id: number;
  name: string;
  phone: string;
  photo_url?: string | null;
  total_clicks: number;
  total_closing_jamaah: number;
}

export interface UpcomingPackageOverview {
  id: number;
  name: string;
  departure_date: string;
  price: number;
  quota: number;
  booked_seats: number;
  remaining_seats: number;
}

export interface DailyTrendItem {
  date: string;
  label: string;
  organik: number;
  meta_ads: number;
  agent: number;
  total: number;
}

export interface PendingPipelineStage {
  status: string;
  label: string;
  prospect_count: number;
  total_pax: number;
  total_value: number;
}

export interface PendingPipelineData {
  total_prospects: number;
  total_pax: number;
  total_value: number;
  avg_value_per_pax: number;
  stages: PendingPipelineStage[];
}

export interface DashboardOverviewData {
  urgent_alerts: UrgentAlerts;
  kpis: OverviewKPIs;
  channel_attribution: ChannelAttributionItem[];
  pipeline_funnel: PipelineFunnel;
  recent_prospects: RecentProspectOverview[];
  top_agents: TopAgentOverview[];
  upcoming_packages: UpcomingPackageOverview[];
  prospect_trends: DailyTrendItem[];
  pending_pipeline: PendingPipelineData;
}

export const fetchDashboardOverview = async (): Promise<DashboardOverviewData> => {
  const headers = await getAuthHeaders();
  const url = `${API_BASE}/api/dashboard/overview`;
  const res = await dashboardFetch(url, { headers });
  if (!res.ok) {
    if (res.status === 401) {
      redirectToLogin();
    }
    const err = await res.json().catch(() => ({ error: 'Gagal memuat ringkasan dashboard' }));
    throw new Error(err.error || 'Gagal memuat ringkasan dashboard');
  }
  return await res.json();
};

export interface SubscriptionPricingPlan {
  id: number;
  name: string;
  period_months: number;
  price: number;
}

export interface PaymentVerification {
  id: number;
  tenant_id: number;
  tenant_name?: string | null;
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
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenantSubscriptionInfo {
  tenant_id: number;
  tenant_name: string;
  tenant_slug: string;
  status: string;
  current_plan_id: number | null;
  current_plan_name: string | null;
  current_plan_period_months: number | null;
  subscription_expires_at: string | null;
  is_active: boolean;
  days_remaining: number;
  is_subscription_expired?: boolean;
  should_show_renewal_invoice?: boolean;
  grace_period_days_remaining?: number;
  is_suspended?: boolean;
  pending_verification?: PaymentVerification | null;
  payment_verifications: PaymentVerification[];
}

let cachedSubscriptionInfo: TenantSubscriptionInfo | null = null;
let subscriptionFetchPromise: Promise<TenantSubscriptionInfo> | null = null;

export const invalidateSubscriptionCache = () => {
  cachedSubscriptionInfo = null;
};

export const fetchTenantSubscription = async (forceRefresh = false): Promise<TenantSubscriptionInfo> => {
  if (!forceRefresh && cachedSubscriptionInfo) {
    return cachedSubscriptionInfo;
  }
  if (subscriptionFetchPromise) {
    return subscriptionFetchPromise;
  }
  const headers = await getAuthHeaders();
  subscriptionFetchPromise = dashboardFetch(`${API_BASE}/api/dashboard/subscription`, { headers })
    .then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Gagal memuat info langganan' }));
        throw new Error(err.error || 'Gagal memuat info langganan');
      }
      const data: TenantSubscriptionInfo = await res.json();
      cachedSubscriptionInfo = data;
      return data;
    })
    .finally(() => {
      subscriptionFetchPromise = null;
    });
  return subscriptionFetchPromise;
};

export const fetchPricingPlansForRenewal = async (): Promise<SubscriptionPricingPlan[]> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(`${API_BASE}/api/dashboard/pricing-plans`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Gagal memuat paket langganan' }));
    throw new Error(err.error || 'Gagal memuat paket langganan');
  }
  const json = await res.json();
  return json.plans || [];
};

export const validateCoupon = async (code: string, planId?: number): Promise<{ valid: boolean; code: string; discount_percentage: number; plan_id?: number | null; plan_name?: string | null }> => {
  const headers = await getAuthHeaders();
  let url = `${API_BASE}/api/dashboard/coupons/validate?code=${encodeURIComponent(code)}`;
  if (planId) {
    url += `&plan_id=${planId}`;
  }
  const res = await dashboardFetch(url, { headers });
  const json = await res.json().catch(() => ({ error: 'Gagal validasi kupon' }));
  if (!res.ok) {
    throw new Error(json.error || 'Kupon tidak valid');
  }
  return json;
};

export const submitRenewalRequest = async (formData: FormData): Promise<{ message: string; payment_verification: PaymentVerification }> => {
  const authHeaders = await getAuthHeaders();
  // Note: do not set Content-Type header so browser sets multipart boundary automatically
  const headers: Record<string, string> = {};
  if (authHeaders.Authorization) {
    headers['Authorization'] = authHeaders.Authorization;
  }

  const res = await dashboardFetch(`${API_BASE}/api/dashboard/subscription/renewal-request`, {
    method: 'POST',
    headers,
    body: formData,
  });

  const json = await res.json().catch(() => ({ error: 'Gagal mengajukan perpanjangan' }));
  if (!res.ok) {
    throw new Error(json.error || 'Gagal mengajukan perpanjangan');
  }
  invalidateSubscriptionCache();
  return json;
};

export const createRenewalInvoice = async (
  planId: number,
  couponCode?: string
): Promise<{ message: string; payment_verification: PaymentVerification }> => {
  const fd = new FormData();
  fd.append('plan_id', String(planId));
  if (couponCode && couponCode.trim()) {
    fd.append('coupon_code', couponCode.trim().toUpperCase());
  }
  return submitRenewalRequest(fd);
};

export const fetchPaymentVerificationDetail = async (
  id: number
): Promise<PaymentVerification> => {
  const headers = await getAuthHeaders();
  const res = await dashboardFetch(
    `${API_BASE}/api/dashboard/subscription/payment-verifications/${id}`,
    { headers }
  );
  const json = await res.json().catch(() => ({ error: 'Gagal mengambil rincian tagihan' }));
  if (!res.ok) {
    throw new Error(json.error || 'Data tagihan tidak ditemukan');
  }
  return json.payment_verification;
};

export const uploadRenewalProof = async (
  verificationId: number,
  file: File
): Promise<{ message: string; proof_url: string }> => {
  const authHeaders = await getAuthHeaders();
  const headers: Record<string, string> = {};
  if (authHeaders.Authorization) {
    headers['Authorization'] = authHeaders.Authorization;
  }

  const fd = new FormData();
  fd.append('proof_file', file);

  const res = await dashboardFetch(
    `${API_BASE}/api/dashboard/subscription/payment-verifications/${verificationId}/proof`,
    {
      method: 'POST',
      headers,
      body: fd,
    }
  );
  const json = await res.json().catch(() => ({ error: 'Gagal mengunggah bukti transfer' }));
  if (!res.ok) {
    throw new Error(json.error || 'Gagal mengunggah bukti transfer');
  }
  invalidateSubscriptionCache();
  return json;
};

export interface PlatformSettings {
  whatsapp_number: string;
  bank_name: string;
  bank_account_number: string;
  bank_account_holder: string;
}

export const fetchPlatformSettings = async (): Promise<PlatformSettings> => {
  try {
    const res = await dashboardFetch(`${API_BASE}/api/public/platform-settings`);
    if (!res.ok) {
      return {
        whatsapp_number: '6281234567890',
        bank_name: 'Bank Syariah Indonesia (BSI)',
        bank_account_number: '7123456789',
        bank_account_holder: 'PT Klik Umroh Digital',
      };
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

