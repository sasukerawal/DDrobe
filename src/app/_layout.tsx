import { ClerkProvider, useAuth, useUser } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { syncUserToSupabase } from '@/utils/userSync';
import { useAuthStore } from '@/store/useAuthStore';
import { createAuthenticatedClient } from '@/utils/supabase';

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
  const { setDbUser } = useAuthStore();

  // Auth redirect
  useEffect(() => {
    if (!isLoaded) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (isSignedIn && inAuthGroup) {
      router.replace('/');
    } else if (!isSignedIn && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, isLoaded, segments[0]]);

  // Sync user row to Supabase on sign-in, populate dbUser store, register push token
  useEffect(() => {
    if (!isSignedIn || !userId || !user) return;

    const sync = async () => {
      try {
        const token = await getToken({ template: 'supabase' });
        if (!token) return;
        const email = user.primaryEmailAddress?.emailAddress ?? '';
        const dbUser = await syncUserToSupabase(token, userId, email);
        if (dbUser) setDbUser(dbUser);

        // Register Expo push token and save it to the users table
        if (Platform.OS !== 'web') {
          const { status } = await Notifications.requestPermissionsAsync();
          if (status === 'granted') {
            const { data: pushToken } = await Notifications.getExpoPushTokenAsync();
            if (pushToken) {
              const client = createAuthenticatedClient(token);
              await client.from('users').update({ push_token: pushToken }).eq('id', userId);
            }
          }
        }
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
