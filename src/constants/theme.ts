/**
 * DDrobe Design Tokens — v2
 * Clean minimal system: Apple-grade information architecture for fashion.
 * Primary CTA: near-black (#111). Warm accent: camel/leather (#B8936A).
 * All components MUST import from this file. Never hardcode hex values.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — global.css is processed by the Expo web bundler, not by tsc
import '@/global.css';
import { Platform } from 'react-native';

export const Colors = {
  // ── Light mode ──────────────────────────────────────────────
  light: {
    text: '#1C1C1E',
    textSecondary: '#6C6C70',
    textTertiary: '#AEAEB2',
    background: '#FFFFFF',
    backgroundSecondary: '#F2F2F7',
    backgroundElement: '#F2F2F7',
    backgroundSelected: '#E5E5EA',
    surface: '#FFFFFF',
    border: 'rgba(60,60,67,0.12)',
    separator: 'rgba(60,60,67,0.08)',
  },
  // ── Dark mode ────────────────────────────────────────────────
  dark: {
    text: '#FFFFFF',
    textSecondary: '#8E8E93',
    textTertiary: '#48484A',
    background: '#000000',
    backgroundSecondary: '#1C1C1E',
    backgroundElement: '#1C1C1E',
    backgroundSelected: '#2C2C2E',
    surface: '#1C1C1E',
    border: 'rgba(84,84,88,0.65)',
    separator: 'rgba(84,84,88,0.45)',
  },
  // ── Brand (theme-independent) ────────────────────────────────
  primary: '#111111',       // near-black — filled buttons in light mode
  primaryLight: '#444444',
  primaryDark: '#000000',
  accent: '#B8936A',        // warm camel/leather — premium accent
  accentLight: '#D4AF87',
  success: '#22C55E',
  danger: '#EF4444',
  warning: '#F59E0B',
  // ── Flat convenience tokens (dark-mode defaults) ─────────────
  background: '#000000',
  text: '#FFFFFF',
  surface: '#1C1C1E',
  backgroundElement: '#1C1C1E',
  textSecondary: '#8E8E93',
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  card: 16,
  button: 12,
  input: 10,
  small: 6,
  pill: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
