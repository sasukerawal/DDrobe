# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Gen Z and millennial women (18–32) who care about aesthetics. They open the app in the morning to get a polished outfit recommendation without overthinking it, or when packing for a trip. They scroll TikTok and Pinterest for style inspiration and want their wardrobe app to feel as considered as the clothes they own.

## Product Purpose

DDrobe turns your existing wardrobe into a personal AI stylist. It photographs your clothes once, then serves daily outfit recommendations calibrated to weather, formality preference, and what's actually clean. The goal is to eliminate the morning "I have nothing to wear" moment for people who own plenty.

## Positioning

The AI sees your real closet (photographs, not product images) and factors in live weather — not a generic color-wheel quiz or a marketplace to buy more. Competing apps ask users to shop; DDrobe asks the user's clothes to speak.

## Operating Context

Used primarily in the morning, on the phone, standing in front of a wardrobe. Also used for trip packing. Posts outfit results to a community Lookbook feed for inspiration. Resell nudge surfaces unworn items for Depop / Poshmark / Vinted.

## Capabilities and Constraints

- AI outfit generation via Gemini Flash (3.8, falling back to 3.5); 10 generations/day, reset at midnight UTC
- Closet photos stored in Supabase Storage; all RLS via Clerk JWT
- Background removal is done locally on-device; raw images never sent to a server
- Images downscaled to 512×512 before any AI call
- Push notifications for morning outfit reminder (06:30 UTC via pg_cron)
- Vacation packer mode generates trip-appropriate outfits
- Lookbook community feed with AI moderation (Gemini)

## Brand Commitments

Name: DDrobe (always one word, capital D)
Voice: Direct and warm — like a stylish friend, not a corporate assistant.
No purple/violet brand color going forward; replaced with premium monochrome + warm camel accent.

## Evidence on Hand

App is functional and live in development. All Edge Functions deployed to Supabase. No real user testimonials yet (greenfield).

## Product Principles

1. **The closet is the product** — every surface reinforces that what you own is enough.
2. **Clarity over decoration** — typography and white space do the design work; color is rationed.
3. **Native and effortless** — the app should feel like it belongs on iOS/Android, not like a web page.
4. **Fashion is personal, not performative** — community features are light; the daily recommendation is the core.
5. **Trust through restraint** — no dark patterns, no push to buy more, clear limits displayed honestly.
