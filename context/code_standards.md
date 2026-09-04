# Code Standards & Best Practices

## Language & Framework Rules
- **TypeScript:** Strict mode enabled. No `any` types. Define exact interfaces for all Supabase database responses, Zustand stores, and component props.
- **React Native (Expo):** Use functional components. No class components.
- **Routing:** Use Expo Router exclusively. Rely on file-based routing in the `/app` directory.

## Directory Structure
```text
/app
  /(tabs)            # Main bottom tab navigation
  /(auth)            # Sign-in / Sign-up flows
  _layout.tsx        # Root layout, ClerkProvider, global providers
/components
  /ui                # Reusable UI elements (Buttons, Cards)
  /wardrobe          # Feature specific components (ClosetGrid, OutfitCard)
/store
  useAppStore.ts     # Zustand store for global state
  useAuthStore.ts    # Zustand store for user/auth metadata
/utils
  imageProcessing.ts # Logic for resizing/cropping
  api.ts             # Wrappers for external APIs
  supabase.ts        # Supabase client initialization
/types
  index.ts           # Global TypeScript interfaces
```

## State Management
- **Local State:** Use `useState` for simple, isolated UI state (e.g., input field values, modal open/close).
- **Global State:** Use Zustand (`useAppStore`) for data that spans multiple screens (e.g., user preferences, currently loaded closet items, network status).
- **Server State:** Use Supabase real-time subscriptions where appropriate, or SWR/React Query if complex caching is needed (otherwise fetch and store in Zustand).

## Styling Guidelines
- Use the standard React Native `StyleSheet` API.
- Do not hardcode hex colors in individual files. Import colors from a central `theme.ts` or use a UI context provider.
- Keep components small. If a component exceeds 200 lines, extract sub-components into separate files.

## Naming Conventions
- **Components:** PascalCase (e.g., `OutfitCard.tsx`).
- **Files/Folders in `/app`:** kebab-case or snake_case matching the URL route.
- **Functions/Variables:** camelCase (e.g., `handleSwipeRight`, `fetchWeather`).
- **Types/Interfaces:** PascalCase (e.g., `ClosetItem`, `UserPreferences`).

## Error Handling
- Use try/catch blocks for all async operations.
- Surface errors to the user gracefully using Toast notifications or error UI states, never crash silently.
- Console logs should be cleaned up before production.
