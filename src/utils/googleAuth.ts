import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

// Google Sign-In is native code, so it only exists in a development or store build.
export const gmailSupported = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

type GoogleSigninModule = typeof import('@react-native-google-signin/google-signin');
let googleModule: GoogleSigninModule | null = null;

function load(): GoogleSigninModule['GoogleSignin'] {
  if (!gmailSupported) throw new Error('Gmail import needs the DDrobe development build.');
  if (!googleModule) {
    googleModule = require('@react-native-google-signin/google-signin') as GoogleSigninModule;
    googleModule.GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      scopes: [GMAIL_SCOPE],
    });
  }
  return googleModule.GoogleSignin;
}

// Opens the Google account picker. Returns a Gmail access token, or null if the user backed out.
export async function connectGmail(): Promise<string | null> {
  const GoogleSignin = load();
  if (Platform.OS === 'android') {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  }
  const result = await GoogleSignin.signIn();
  if (result.type !== 'success') return null;

  if (!result.data.scopes?.includes(GMAIL_SCOPE)) {
    const added = await GoogleSignin.addScopes({ scopes: [GMAIL_SCOPE] });
    if (!added || added.type !== 'success') return null;
  }
  const { accessToken } = await GoogleSignin.getTokens();
  return accessToken;
}

// Reconnects a previously linked account without showing any UI.
export async function restoreGmailToken(): Promise<string | null> {
  if (!gmailSupported) return null;
  const GoogleSignin = load();
  if (!GoogleSignin.hasPreviousSignIn()) return null;
  const result = await GoogleSignin.signInSilently();
  if (result.type !== 'success' || !result.data.scopes?.includes(GMAIL_SCOPE)) return null;
  const { accessToken } = await GoogleSignin.getTokens();
  return accessToken;
}

// Access tokens last about an hour; this swaps an expired one for a fresh one.
export async function refreshGmailToken(expiredToken: string): Promise<string | null> {
  const GoogleSignin = load();
  if (Platform.OS === 'android') await GoogleSignin.clearCachedAccessToken(expiredToken);
  return restoreGmailToken();
}

export async function disconnectGmail(): Promise<void> {
  if (!gmailSupported) return;
  const GoogleSignin = load();
  await GoogleSignin.revokeAccess().catch(() => {});
  await GoogleSignin.signOut().catch(() => {});
}
