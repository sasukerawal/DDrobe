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
    text: '#111111',
    textSecondary: '#6B6B6B',
    textTertiary: '#ABABAB',
    background: '#F7F6F3',
    backgroundSecondary: '#EEECEA',
    backgroundElement: '#EEECEA',
    backgroundSelected: '#E3E1DC',
    surface: '#FFFFFF',
    border: 'rgba(0,0,0,0.07)',
    separator: 'rgba(0,0,0,0.05)',
  },
  // ── Dark mode ────────────────────────────────────────────────
  dark: {
    text: '#F5F5F0',
    textSecondary: '#8E8E93',
    textTertiary: '#48484A',
    background: '#0E0E0C',
    backgroundSecondary: '#1A1A18',
    backgroundElement: '#1A1A18',
    backgroundSelected: '#2A2A27',
    surface: '#1A1A18',
    border: 'rgba(255,255,255,0.08)',
    separator: 'rgba(255,255,255,0.05)',
  },
  // ── Brand (theme-independent) ────────────────────────────────
  primary: '#111111',       // near-black — filled buttons in light mode
  primaryLight: '#333333',
  primaryDark: '#000000',
  accent: '#B8936A',        // warm camel/leather — premium accent
  accentLight: '#CFA882',
  success: '#22C55E',
  danger: '#D94F4F',
  warning: '#C9820A',
  // ── Flat convenience tokens (dark-mode defaults) ─────────────
  background: '#0E0E0C',
  text: '#F5F5F0',
  surface: '#1A1A18',
  backgroundElement: '#1A1A18',
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
  card: 12,
  button: 8,
  input: 8,
  small: 4,
  pill: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
