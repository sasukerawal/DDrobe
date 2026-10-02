import { useColorScheme } from 'react-native';
import { Colors } from '@/constants/theme';

export type ThemeColors = typeof Colors.dark | typeof Colors.light;

export function useThemeColors(): ThemeColors {
  const scheme = useColorScheme();
  return scheme === 'dark' ? Colors.dark : Colors.light;
}
