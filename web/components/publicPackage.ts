// Package shape returned by the public catalog API.
export interface PublicPackage {
  id: number;
  tenant_id: number;
  name: string;
  description?: string | null;
  price?: number | null;
  departure_date?: string | null;
  quota?: number | null;
  /** Jamaah already booked (Closing / DP paid) on this package; remaining seats = quota - seats_taken. */
  seats_taken?: number;
  status: string;
  itinerary?: string | null;
  facilities_included?: string | null;
  facilities_excluded?: string | null;
  hotel_info?: string | null;
  flight_info?: string | null;
  terms_conditions?: string | null;
  photos?: {
    id: number;
    file_path: string;
    sort_order: number;
  }[] | null;
  created_at: string;
}

/**
 * Seats label for a package: the real remaining seats (quota minus jamaah already booked), "Kursi penuh"
 * when none are left, or null when the travel did not set a quota.
 */
export function seatsLabel(pkg: Pick<PublicPackage, 'quota' | 'seats_taken'>): string | null {
  if (pkg.quota === null || pkg.quota === undefined || pkg.quota <= 0) return null;
  const left = pkg.quota - (pkg.seats_taken ?? 0);
  return left > 0 ? `Sisa ${left} kursi` : 'Kursi penuh';
}
