# Project Overview: AI-Powered Digital Wardrobe & Stylist

## Executive Summary
People experience "decision fatigue" when getting dressed, typically wearing 20% of their clothes 80% of the time. Existing apps fail because they require tedious manual data entry and hide core features behind paywalls.
Our solution is a frictionless mobile app (iOS/Android via React Native) where users digitize their wardrobe through automated receipt parsing and native camera tools with local background removal. A localized AI stylist delivers daily outfit recommendations based on live weather data, user schedules, and real-time fashion trends.

## Core Value Proposition & Competitive Wedge
- **True Intelligence (vs. Randomization):** We use GPT-4o-mini with strict constraints (color theory, season, formality, weather) rather than random pairing (e.g., Whering).
- **Instant & Free (vs. Paid Stylists):** AI generates styling in milliseconds for zero cost (e.g., Indyx).
- **Unlimited Free Uploads (vs. Paywalls):** Local device background removal and low-res AI tagging allows unlimited uploads without server costs (e.g., Acloset).

## Target Audience
Gen Z and Millennials (16-35) influenced by TikTok/Pinterest, highly focused on aesthetics, lacking the budget for human stylists or entirely new wardrobes.

## Core User Workflows

### 1. Ingestion / "The Cold Start"
- **Receipt Parsing:** Users forward order emails (Zara, ASOS, etc.) to an inbound email webhook. The backend parses product images/titles and saves them directly.
- **Dump & Crop Camera:** Users photograph items on their bed. The app uses native OS APIs (Apple Vision) to instantly remove the background locally.

### 2. The Daily Generator
- **Trigger:** 6:30 AM local push notification based on weather.
- **Engine:** Queries OpenWeatherMap, filters inappropriate items, and prompts GPT-4o-mini for 3 styles (Casual, Office, Trendy).
- **UX:** Tinder-style swipe cards (Right = Wear, Left = Reject).

### 3. Monetization Engine
- **Affiliate Commerce:** AI injects trending items from Amazon/Pinterest into daily recommendations. Clicking "Buy Now" uses an affiliate tag.
- **Rewarded Ads:** To generate more than 3 outfits per day, users watch a short ad (Google AdMob/AppLovin).

### 4. Retention Features
- **In the Wash:** Long-press an item to mark it dirty, temporarily hiding it from the AI.
- **Vacation Packer:** AI generates capsule wardrobes based on trip constraints (e.g., "Miami, Weekend, Carry-on").
- **6-Month Resell Nudge:** Identifies unworn items and suggests exporting to Depop/Poshmark.
- **Lookbook Community:** Users post mirror selfies to a public feed (moderated by Cloudflare AI/OpenAI).

## Out of Scope
- Server-side image background removal.
- In-app e-commerce checkout.
- Human stylist consultations.
