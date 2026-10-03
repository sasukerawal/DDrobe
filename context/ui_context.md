# UI Context & Design System

## Core Aesthetic — "System Clarity" (updated post-impeccable redesign)
- **Vibe:** Apple-grade information architecture meets fashion editorial. Premium-minimal, not database-app.
- **Visuals:** Pure white/black surfaces, warm camel accent as the sole color moment, system-ui font, no glassmorphism or gradients.
- **Theme:** Strict light/dark adaptive via `useThemeColors()` hook on tab screens. Auth screens are always light (white card on camel brand zone).
- **Design token source:** `src/constants/theme.ts` — never hardcode hex values anywhere.

## Color Palette (current — src/constants/theme.ts)
```typescript
Colors.primary      = '#111111'   // near-black; filled CTAs, tab active icons
Colors.accent       = '#B8936A'   // warm camel/leather; links, focus rings, brand zone bg
Colors.accentLight  = '#D4AF87'
Colors.danger       = '#EF4444'
Colors.warning      = '#F59E0B'
Colors.success      = '#22C55E'

// Light mode
Colors.light.text             = '#1C1C1E'
Colors.light.textSecondary    = '#6C6C70'
Colors.light.textTertiary     = '#AEAEB2'
Colors.light.background       = '#FFFFFF'
Colors.light.backgroundElement= '#F2F2F7'
Colors.light.border           = 'rgba(60,60,67,0.12)'
Colors.light.separator        = 'rgba(60,60,67,0.08)'

// Dark mode (same keys, different values)
Colors.dark.text              = '#FFFFFF'
Colors.dark.background        = '#000000'
Colors.dark.backgroundElement = '#1C1C1E'
Colors.dark.border            = 'rgba(84,84,88,0.65)'
```

> **NOTE:** The old purple palette (`#6D28D9`) is no longer in use. It was replaced during the impeccable System Clarity redesign.

## Component Geometry
- **Primary buttons:** `borderRadius: Radius.pill` (999) — pill shaped, black fill, white text.
- **Input fields:** `borderRadius: Radius.input` (10), `backgroundColor: Colors.light.backgroundElement`.
- **Cards:** `borderRadius: Radius.card` (16).
- **Min tap target:** 48px height.

## Auth Screens — AuthShell Pattern
All auth screens use `src/components/AuthShell.tsx`:
- Top brand zone: `Colors.accent` (`#B8936A`) background with DDrobe wordmark + ghost "D" editorial element.
- Bottom white card: `borderTopLeftRadius: 28, borderTopRightRadius: 28` — slides up on mount with Reanimated spring animation.
- Form interior uses `Colors.light.*` tokens.
- Tagline is customized per screen via the `tagline` prop.

## Interaction & Animation
- **Swipe Cards:** Reanimated spring physics via `Gesture.Pan()` + `GestureDetector`.
- **Auth entrance:** `useSharedValue` → `withSpring` slide-up + opacity fade for form card.
- **Haptic Feedback:** Light on button press, Medium on verification/reset success.
- **Password strength bar:** Animated width + color on sign-up and change-password screens.
