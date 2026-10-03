import { useEffect } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Colors } from '@/constants/theme';

/*
 * Expo Router needs a rendered route at /sso-callback so Clerk's OAuth redirect
 * (exp://host/~/sso-callback) resolves to a page rather than "Unmatched Route".
 * WebBrowser.maybeCompleteAuthSession() closes the in-app browser and hands the
 * session token back to the startSSOFlow() call in sign-in / sign-up.
 */
export default function SSOCallback() {
  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();
  }, []);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: Colors.accent,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <ActivityIndicator color="#FFFFFF" size="large" />
      <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 14, letterSpacing: 0.1 }}>
        Completing sign in…
      </Text>
    </View>
  );
}
