/**
 * DDrobe Design Tokens
 * Source of truth for all colors, spacing, and typography.
 * All components MUST import from this file. Never hardcode hex values.
 * Tokens sourced from context/ui_context.md
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — global.css is processed by the Expo web bundler, not by tsc
import '@/global.css';
import { Platform } from 'react-native';

export const Colors = {
  // Light / Dark mode surfaces
  light: {
    text: '#1A1A1A',
    textSecondary: '#6B7280',
    background: '#FAFAFA',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#F3F0FF',
    surface: '#FFFFFF',
    border: 'rgba(0,0,0,0.08)',
  },
  dark: {
    text: '#F9FAFB',
    textSecondary: '#9CA3AF',
    background: '#121212',
    backgroundElement: '#1E1E1E',
    backgroundSelected: '#2D2040',
    surface: '#1E1E1E',
    border: '#333333',
  },
  // Brand palette
  primary: '#6D28D9',
  primaryLight: '#8B5CF6',
  primaryDark: '#5B21B6',
  // Functional
  success: '#10B981',
  danger: '#EF4444',
  warning: '#F59E0B',
  glow: 'rgba(139, 92, 246, 0.4)',
  // Flat convenience tokens (dark-mode defaults for screens without useColorScheme)
  background: '#121212',
  text: '#F9FAFB',
  surface: '#1E1E1E',
  backgroundElement: '#1E1E1E',
  textSecondary: '#9CA3AF',
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

// Border radiuses from ui_context.md
export const Radius = {
  card: 16,
  button: 12,
  input: 10,
  small: 6,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
