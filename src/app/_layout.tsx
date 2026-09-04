import { ClerkProvider, useAuth, useUser } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { syncUserToSupabase } from '@/utils/userSync';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';

if (!publishableKey) {
  throw new Error('Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in .env');
}

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <InitialLayout />
      </GestureHandlerRootView>
    </ClerkProvider>
  );
}

function InitialLayout() {
  const { isSignedIn, isLoaded, userId, getToken } = useAuth();
  const { user } = useUser();
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();

  // Auth redirect
  useEffect(() => {
    if (!isLoaded) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (isSignedIn && inAuthGroup) {
      router.replace('/');
    } else if (!isSignedIn && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    }
  }, [isSignedIn, isLoaded, segments[0]]);

  // Sync user row to Supabase on sign-in
  useEffect(() => {
    if (!isSignedIn || !userId || !user) return;

    const sync = async () => {
      try {
        const token = await getToken({ template: 'supabase' });
        if (!token) return;
        const email = user.primaryEmailAddress?.emailAddress ?? '';
        await syncUserToSupabase(token, userId, email);
      } catch (e) {
        console.error('[InitialLayout] userSync error:', e);
      }
    };

    sync();
  }, [isSignedIn, userId]);

  // Hide the native splash once Clerk is ready; AnimatedSplashOverlay does its
  // own hideAsync on layout, but if it never mounts we need this as a fallback.
  useEffect(() => {
    if (isLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [isLoaded]);

  if (!isLoaded) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="add-item" options={{ presentation: 'fullScreenModal' }} />
      </Stack>
      <AnimatedSplashOverlay />
    </ThemeProvider>
  );
}
