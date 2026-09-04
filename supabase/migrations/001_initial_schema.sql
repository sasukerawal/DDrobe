-- ============================================================
-- DDrobe: Initial Schema Migration
-- Run this in the Supabase Dashboard > SQL Editor
-- Schema defined in context/architecture.md
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Table: users
-- Stores app-specific user data, linked to Clerk auth uid
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY,  -- Set to Clerk user ID from the client
  email TEXT NOT NULL,
  push_token TEXT,
  style_preferences JSONB NOT NULL DEFAULT '{}',
  daily_generations_used SMALLINT NOT NULL DEFAULT 0,
  ad_credits SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Table: closet_items
-- Stores all wardrobe items for each user
-- ============================================================
CREATE TABLE IF NOT EXISTS public.closet_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('top', 'bottom', 'shoe', 'outerwear', 'accessory')),
  color TEXT NOT NULL DEFAULT '',
  pattern TEXT NOT NULL DEFAULT '',
  season TEXT[] NOT NULL DEFAULT '{}',
  formality TEXT NOT NULL DEFAULT 'casual' CHECK (formality IN ('casual', 'business_casual', 'formal')),
  is_in_wash BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Table: outfits_history
-- Logs every outfit recommendation and user rating
-- ============================================================
CREATE TABLE IF NOT EXISTS public.outfits_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  top_id UUID REFERENCES public.closet_items(id) ON DELETE SET NULL,
  bottom_id UUID REFERENCES public.closet_items(id) ON DELETE SET NULL,
  shoe_id UUID REFERENCES public.closet_items(id) ON DELETE SET NULL,
  accessory_id UUID REFERENCES public.closet_items(id) ON DELETE SET NULL,
  weather_context JSONB NOT NULL DEFAULT '{}',
  date_worn DATE NOT NULL DEFAULT CURRENT_DATE,
  rating SMALLINT CHECK (rating BETWEEN 1 AND 5)
);

-- ============================================================
-- Table: feed_posts
-- Community lookbook posts, moderated before display
-- ============================================================
CREATE TABLE IF NOT EXISTS public.feed_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  moderation_status TEXT NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Row Level Security (RLS)
-- Users can ONLY access their own data
-- ============================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closet_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outfits_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_posts ENABLE ROW LEVEL SECURITY;

-- users: user can only see/edit their own row
CREATE POLICY "users: own row" ON public.users
  FOR ALL USING (id = auth.uid()::UUID);

-- closet_items: user can only see/edit their own items
CREATE POLICY "closet_items: own items" ON public.closet_items
  FOR ALL USING (user_id = auth.uid()::UUID);

-- outfits_history: user can only see/edit their own history
CREATE POLICY "outfits_history: own history" ON public.outfits_history
  FOR ALL USING (user_id = auth.uid()::UUID);

-- feed_posts: anyone can read approved posts; user can manage their own
CREATE POLICY "feed_posts: read approved" ON public.feed_posts
  FOR SELECT USING (moderation_status = 'approved');

CREATE POLICY "feed_posts: manage own" ON public.feed_posts
  FOR ALL USING (user_id = auth.uid()::UUID);

-- ============================================================
-- Indexes for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_closet_items_user_id ON public.closet_items(user_id);
CREATE INDEX IF NOT EXISTS idx_outfits_history_user_id ON public.outfits_history(user_id);
CREATE INDEX IF NOT EXISTS idx_feed_posts_status ON public.feed_posts(moderation_status);
