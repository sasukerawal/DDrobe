// Global TypeScript interfaces for DDrobe
// Matches the exact Supabase database schema defined in context/architecture.md

export interface User {
  id: string; // uuid
  email: string;
  push_token: string | null;
  style_preferences: Record<string, unknown>;
  daily_generations_used: number;
  ad_credits: number;
  created_at: string;
}

export interface ClosetItem {
  id: string; // uuid
  user_id: string;
  image_url: string;
  name: string;
  category: 'top' | 'bottom' | 'shoe' | 'outerwear' | 'accessory';
  color: string;
  pattern: string;
  season: Array<'spring' | 'summer' | 'autumn' | 'winter'>;
  formality: 'casual' | 'business_casual' | 'formal';
  brand: string;
  size: string;
  price: number | null;
  notes: string;
  is_in_wash: boolean;
  created_at: string;
}

export interface WearLogEntry {
  id: string;
  user_id: string;
  item_id: string;
  worn_on: string; // ISO date
  created_at: string;
}

export interface OutfitHistory {
  id: string;
  user_id: string;
  top_id: string;
  bottom_id: string;
  shoe_id: string;
  accessory_id: string | null;
  weather_context: WeatherContext;
  date_worn: string; // ISO date
  rating: number | null; // 1 = reject, 5 = loved
}

export interface FeedPost {
  id: string;
  user_id: string;
  image_url: string;
  caption: string;
  moderation_status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface WeatherContext {
  temp_celsius: number;
  condition: string; // e.g. "sunny", "rainy"
  city: string;
}

export interface AITagResult {
  category: ClosetItem['category'];
  color: string;
  pattern: string;
  season: ClosetItem['season'];
  formality: ClosetItem['formality'];
}

export interface GeneratedOutfit {
  id: string; // client-side generated uuid for keying
  style: 'Casual' | 'Office' | 'Trendy';
  description: string;
  top: ClosetItem;
  bottom: ClosetItem;
  shoe: ClosetItem;
  accessory?: ClosetItem;
}
