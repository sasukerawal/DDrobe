# UI Context & Design System

## Core Aesthetic
- **Vibe:** Modern, premium, Gen Z/Millennial focused. It should not look like a basic database app.
- **Visuals:** Glassmorphism, smooth gradients, subtle micro-animations (e.g., when swiping or liking), and dynamic layouts.
- **Theme:** Strict support for Light and Dark modes.

## Color Palette (Tokens)
Use these semantic tokens throughout the app to ensure consistency. Do not hardcode hex values in components.

### Primary Colors
- `primary`: `#6D28D9` (Vibrant Purple - for primary buttons, active tabs, highlights)
- `primary-light`: `#8B5CF6`
- `primary-dark`: `#5B21B6`

### Backgrounds
- `background-light`: `#FAFAFA`
- `background-dark`: `#121212`
- `surface-light`: `#FFFFFF`
- `surface-dark`: `#1E1E1E` (for cards, modals)

### Text
- `text-primary-light`: `#1A1A1A`
- `text-secondary-light`: `#6B7280`
- `text-primary-dark`: `#F9FAFB`
- `text-secondary-dark`: `#9CA3AF`

### Functional Colors
- `success`: `#10B981` (for approved looks)
- `danger`: `#EF4444` (for rejections or "In the Wash")
- `warning`: `#F59E0B`
- `glow`: `rgba(139, 92, 246, 0.4)` (for Amazon/Pinterest trending item injection)

## Typography
- **Primary Font:** `Inter` or `Outfit` (sans-serif, clean, modern).
- **Headings (H1):** 32px, Bold, tight tracking.
- **Subheadings (H2):** 24px, SemiBold.
- **Body:** 16px, Regular, 1.5 line height.
- **Small/Caption:** 12px, Medium.

## Component Geometry
- **Cards (e.g., Outfit Swipe Cards):** Border radius `16px`. Soft drop shadow in light mode, subtle 1px border (`#333`) in dark mode.
- **Buttons:** Border radius `12px` (pill-shaped). Min height `48px` for tap targets.
- **Images:** Aspect ratio varies, but usually 3:4 for clothing items on cards.

## Interaction & Animation
- **Swipe Cards:** Must use smooth spring physics (e.g., via Reanimated or standard Animated API).
- **Haptic Feedback:** Trigger light haptics on button presses, and medium haptics on successful background removal or outfit swipe.
- **Transitions:** Use Expo Router's built-in shared element transitions or layout animations when navigating between the grid and item detail views.
