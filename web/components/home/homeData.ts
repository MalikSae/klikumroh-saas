// Data the travel home page receives from the public API (banners, testimonials, FAQ).
// Kept separate from any view so the home can be redesigned without touching data fetching.

export interface PublicBannerItem {
  id: number;
  title: string;
  subtitle?: string | null;
  image_url: string;
  cta_url?: string | null;
  display_order?: number;
}

export interface PublicTestimonialItem {
  id: number;
  name: string;
  city?: string | null;
  package_name?: string | null;
  year?: string | null;
  rating: number;
  quote: string;
  avatar_url?: string | null;
  display_order?: number;
}

export interface PublicFAQItem {
  id: number;
  question: string;
  answer: string;
  display_order?: number;
}
