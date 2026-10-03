import { ClerkProvider, useAuth, useUser } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import Constants from 'expo-constants';
import { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { syncUserToSupabase } from '@/utils/userSync';
import { useAuthStore } from '@/store/useAuthStore';
import { useAppStore } from '@/store/useAppStore';
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

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      setDbUser(null);
      const app = useAppStore.getState();
      app.setClosetItems([]);
      app.setDailyOutfits([]);
      app.resetDailyGenerations();
    }
  }, [isLoaded, isSignedIn]);

  // Sync user row to Supabase on sign-in, populate dbUser store, register push token
  useEffect(() => {
    if (!isSignedIn || !userId || !user) return;

    const sync = async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const email = user.primaryEmailAddress?.emailAddress ?? '';
        const dbUser = await syncUserToSupabase(token, userId, email);
        if (dbUser) setDbUser(dbUser);

        // Register push token only in dev/prod builds — not in Expo Go (removed SDK 53+)
        if (Platform.OS !== 'web' && Constants.appOwnership !== 'expo') {
          try {
            const Notifications = await import('expo-notifications');
            const { status } = await Notifications.requestPermissionsAsync();
            if (status === 'granted') {
              const { data: pushToken } = await Notifications.getExpoPushTokenAsync();
              if (pushToken) {
                const client = createAuthenticatedClient(token);
                await client.from('users').update({ push_token: pushToken }).eq('id', userId);
              }
            }
          } catch {
            // Push registration is best-effort; silently skip on error
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
        <Stack.Screen name="change-password" options={{ presentation: 'modal' }} />
        <Stack.Screen name="email-import" options={{ presentation: 'fullScreenModal', headerShown: false }} />
        <Stack.Screen name="sso-callback" options={{ headerShown: false }} />
      </Stack>
      <AnimatedSplashOverlay />
    </ThemeProvider>
  );
}
