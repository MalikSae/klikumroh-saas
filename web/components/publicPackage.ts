// Package shape returned by the public catalog API.
export interface PublicPackage {
  id: number;
  tenant_id: number;
  name: string;
  description?: string | null;
  price?: number | null;
  departure_date?: string | null;
  quota?: number | null;
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
