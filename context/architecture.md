# System Architecture & Technical Specifications

## Tech Stack Overview
- **Frontend / Mobile Client:** React Native with Expo (Expo Router for navigation).
- **State Management:** Zustand (for global app state, auth state, and outfit preferences).
- **Authentication:** Clerk (`@clerk/clerk-expo` or `@clerk/expo` for Core 3). Apple/Google SSO.
- **Database & Backend:** Supabase (PostgreSQL).
- **Storage:** Supabase S3 Storage (for item images).
- **Serverless Compute:** Supabase Edge Functions (Deno) & pg_cron (for scheduled jobs).
- **Push Notifications:** Expo Push Services.
- **AI Models:** OpenAI API (GPT-4o-mini for outfits, GPT-4o-Vision for tagging, Moderation API).
- **3rd Party APIs:** OpenWeatherMap, Amazon Product API / Pinterest API, Inbound Email Webhook (e.g., SendGrid/Postmark).

## Core System Invariants & Cost Controls
1. **Zero-Cost Background Removal:** Image subject lifting must be done LOCALLY on the user's device via native APIs. Do not send images to a server to crop them.
2. **The "Low-Res" AI Tagging Hack:** Before sending to OpenAI for tagging, images must be downscaled locally to exactly `512x512` pixels. They must be sent with `detail: "low"` to strictly lock the cost at 85 tokens per image.
3. **Data Security (RLS):** All user data is isolated. Supabase Row Level Security (RLS) is strictly enforced. Users can only SELECT, INSERT, UPDATE, DELETE rows where `user_id = auth.uid()`.

## Database Schema (PostgreSQL via Supabase)

### Table: `users`
- `id` (uuid, primary key, references auth.users)
- `email` (text)
- `push_token` (text, nullable)
- `style_preferences` (jsonb, default '{}')
- `daily_generations_used` (smallint, default 0)
- `ad_credits` (smallint, default 0)
- `created_at` (timestampz)

### Table: `closet_items`
- `id` (uuid, primary key, default uuid_generate_v4())
- `user_id` (uuid, foreign key to users)
- `image_url` (text)
- `category` (text) - e.g., 'top', 'bottom', 'shoe', 'outerwear', 'accessory'
- `color` (text)
- `pattern` (text)
- `season` (text[]) - array of seasons (e.g., ['summer', 'spring'])
- `formality` (text) - e.g., 'casual', 'business_casual', 'formal'
- `is_in_wash` (boolean, default false)
- `created_at` (timestampz)

### Table: `outfits_history`
- `id` (uuid, primary key)
- `user_id` (uuid, foreign key to users)
- `top_id` (uuid, foreign key to closet_items)
- `bottom_id` (uuid, foreign key to closet_items)
- `shoe_id` (uuid, foreign key to closet_items)
- `accessory_id` (uuid, nullable)
- `weather_context` (jsonb)
- `date_worn` (date)
- `rating` (smallint, nullable) - User feedback (e.g., 1 for reject, 5 for loved)

### Table: `feed_posts`
- `id` (uuid, primary key)
- `user_id` (uuid)
- `image_url` (text)
- `caption` (text)
- `moderation_status` (text, default 'pending') - e.g., 'pending', 'approved', 'rejected'
- `created_at` (timestampz)

## Ingestion Pipeline Architectures

### 1. Camera Crop Pipeline (Local Device)
1. Device crops background and resizes image to 512x512.
2. Device uploads image to Supabase Storage -> returns `image_url`.
3. Device calls Supabase Edge Function `process-image` with `image_url`.
4. Edge Function calls OpenAI GPT-4o-Vision (detail: low).
5. OpenAI returns strictly structured JSON (category, color, pattern, season, formality).
6. Edge function inserts row into `closet_items` table and returns success.

### 2. Email Webhook Pipeline (Receipt Parsing)
1. User forwards a receipt email to the designated inbound email address (via SendGrid/Postmark webhook).
2. Webhook triggers a Supabase Edge Function (`parse-receipt`) with the parsed email payload.
3. Edge Function scrapes product image URLs and metadata from the email HTML content.
4. Edge Function downloads the images and uploads them to Supabase Storage -> returns `image_url`s.
5. Edge Function calls OpenAI GPT-4o-Vision (detail: low) for each item to generate the structured tags.
6. Edge function inserts rows into the `closet_items` table under the user's account and triggers a push notification indicating new items are ready.
