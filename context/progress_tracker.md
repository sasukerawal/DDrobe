# Progress Tracker

## Current Status
**Phase:** Sprint 1 - Foundations & The "Cold Start"
**Active Task:** ✅ All Sprint 1 tasks complete. Ready for Sprint 2.

---

## Roadmap & Execution Checklist

### 🔴 Sprint 1: Foundations & The "Cold Start" (Weeks 1-2)
- [x] Create project context memory bank (6 files).
- [x] Initialize React Native Expo app with Expo Router.
- [x] Install and configure core dependencies (Zustand, Clerk, Supabase, Expo Camera).
- [x] Set up Supabase PostgreSQL tables (`users`, `closet_items`, `outfits_history`).
- [x] Write Row Level Security (RLS) policies for user data isolation.
- [x] Configure Clerk authentication (`<ClerkProvider>`, sign-in, sign-up flows).
- [x] Build the "Dump & Crop" Camera UI (`add-item.tsx`).
- [x] Implement local image resizing utility (512x512).
- [x] Write Supabase Edge Function (`process-image`) for GPT-4o-Vision low-res tagging.
- [x] Write Supabase Edge Function (`parse-receipt`) and webhook listener.

### 🟡 Sprint 2: The Brain & Daily Stylist (Weeks 3-4)
- [x] Build the Closet Grid UI (viewing and filtering all uploaded items).
- [x] Integrate OpenWeatherMap API with location permissions.
- [x] Draft and test the System Prompt for GPT-4o-mini (The Stylist Logic).
- [x] Build the Tinder-style swipe UI for morning outfit recommendations.

### ⚪ Sprint 3: Monetization & Social Feed (Weeks 5-6)
- [x] Integrate Google AdMob for "Watch Ad for 2 More Outfits" modal.
- [x] Implement Affiliate Link injection logic (Amazon/Pinterest trending items).
- [x] Build the "Lookbook" Community Feed (UI for scrolling, liking, commenting).
- [x] Add OpenAI Moderation API / Cloudflare Workers AI middleware for user uploads.

### ⚪ Sprint 4: Polish & Launch (Week 7)
- [x] Implement "In the Wash" toggle feature.
- [x] Implement "Vacation Packer" constraint-based generation feature.
- [x] Final UI polish, loading states, and haptic feedback implementation.
- [ ] Deploy backend services.
- [ ] Execute TestFlight / Google Play internal testing.
- [ ] Submit to App Store & Google Play.

---

## Architectural Decisions Log
1. **Methodology:** Adopted Spec-Driven Agentic Development via `/context` directory.
2. **Framework:** React Native + Expo Router chosen for cross-platform velocity.
3. **Cost Control:** Implemented strict rule for local background removal and 512x512 image downsizing before OpenAI API calls.
4. **Auth:** Clerk `@clerk/expo` SDK used with secure token cache via `expo-secure-store`.
5. **Schema:** 4 tables (`users`, `closet_items`, `outfits_history`, `feed_posts`) with RLS, CHECK constraints, and performance indexes.
6. **Edge Functions:** Two Deno functions deployed: `process-image` (camera pipeline) and `parse-receipt` (email webhook pipeline).
7. **Design System:** All colors centralized in `src/constants/theme.ts`. Components must never hardcode hex values.

## Active Blockers / Issues
- ✅ All Sprint 1 secrets configured.
- ✅ **2026-09-04 Bug fix + critical gap session:** Fixed 6 compile errors + 4 critical feature gaps. `npx tsc --noEmit` returns 0 errors.
  
  **Compile fixes:**
  1. `theme.ts` — added flat tokens (`Colors.background/text/surface/backgroundElement/textSecondary`) as dark-mode defaults.
  2. `_layout.tsx` — wrong `@clerk/expo` import; fixed to `@clerk/clerk-expo` with proper `AuthGate`, auth guard, and user sync on sign-in.
  3. `app-tabs.tsx` — null-unsafe `Colors[scheme]` fixed to `Colors[scheme === 'dark' ? 'dark' : 'light']`.
  4. `index.tsx` — `useAnimatedGestureHandler` (removed in reanimated v4) replaced with `Gesture.Pan()` + `GestureDetector`.
  5. `explore.tsx` — `StyleSheet.absoluteFillObject` spread replaced with explicit object.
  6. All haptics/location/manipulator package imports verified installed.

  **Critical feature gaps fixed:**
  1. **Auth → Supabase RLS bridge** (`src/utils/supabase.ts`): `createAuthenticatedClient(token)` factory passes Clerk JWT as `Authorization: Bearer` header so `auth.uid()` resolves for RLS.
  2. **User row creation** (`src/utils/userSync.ts` + `_layout.tsx`): `syncUserToSupabase()` upserts user into `users` table on every sign-in. Called in `AuthGate` useEffect.
  3. **Camera screen** (`src/app/add-item.tsx`): Full pipeline — `CameraView` capture → `processImageForUpload()` (512×512 resize + base64) → `process-image` Edge Function → `addClosetItem()` Zustand store. Frame guide, haptics, loading overlay included.
  4. **Closet FAB** (`src/app/explore.tsx`): Purple floating action button navigates to `/add-item`. Better empty state copy.

## Manual Steps Required (user must do)
1. **Clerk JWT Template** — Clerk Dashboard → Settings → JWT Templates → New → name it **"supabase"** → leave the Claims editor as `{ }` (empty object — Clerk automatically includes `sub` as a reserved field; adding it manually now causes an error) → Apply changes. Without this template existing, `getToken({ template: 'supabase' })` returns null and ALL Supabase RLS calls fail.
   
   **Modern alternative (recommended):** Clerk Dashboard → Integrations → enable the native **Supabase** toggle. This handles the JWT handshake automatically without a custom template. If you use this path, the `getToken({ template: 'supabase' })` call in our code still works because Clerk maps the integration to that template name.
2. **OpenWeatherMap API key** — Get free key at openweathermap.org → set `OPENWEATHER_API_KEY=<real_key>` in `.env`. Currently placeholder.
3. **Run SQL migration** — Supabase Dashboard → SQL Editor → paste + run `supabase/migrations/001_initial_schema.sql`. Creates all 4 tables + RLS policies.
4. **Create `closet-images` storage bucket** — Supabase Dashboard → Storage → New bucket → name: `closet-images` → set to Public → Save.
5. **Deploy Edge Functions** (run from project root after `supabase login`):
   ```
   supabase functions deploy process-image
   supabase functions deploy generate-outfit
   supabase functions deploy parse-receipt
   supabase functions deploy create-post
   ```
6. **Set Edge Function secrets** — Supabase Dashboard → Edge Functions → Manage secrets:
   - `GEMINI_API_KEY` = your key from Google AI Studio
   - `OPENWEATHER_API_KEY` = real key (not placeholder)
   - `SUPABASE_SERVICE_ROLE_KEY` = from Supabase Settings → API
7. **EAS Build for AdMob** — `npx eas build --profile development --platform ios` (or android). Google AdMob won't initialize in Expo Go — requires native build.
8. **Regenerate typed routes** — run `npx expo start` once; this regenerates `.expo/types/router.d.ts` and fixes the `as never` cast in `explore.tsx`.

## Remaining Code Gaps
- ✅ Apple/Google SSO buttons on sign-in/sign-up screens — implemented via `useSSO` from `@clerk/expo` (requires OAuth providers configured in Clerk Dashboard).
- ✅ Push notification setup — `expo-notifications` installed; Expo push token requested on sign-in and saved to `users.push_token` via Supabase.
- ✅ 6-Month Resell Nudge — purple banner in My Closet screen counts items older than 6 months and alerts user to resell options.
- ✅ `useAuthStore.dbUser` populated — `syncUserToSupabase` now returns the upserted `User` row; `_layout.tsx` calls `setDbUser()` after sync.
- Local background removal (Apple Vision API) — architecture.md lists this as the goal but requires a native Expo module; deferred to post-launch native build.

## SSO Configuration Required
To enable Google/Apple sign-in, the user must configure OAuth providers in Clerk Dashboard:
- **Google**: Clerk Dashboard → User & Authentication → Social Connections → Google → enable + add Client ID/Secret
- **Apple**: Clerk Dashboard → User & Authentication → Social Connections → Apple → enable + add credentials
- **Redirect URLs**: Add `exp://` scheme URL for Expo Go testing
