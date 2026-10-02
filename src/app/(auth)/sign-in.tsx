import {
  Alert,
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSignIn, useSSO } from '@clerk/expo';
import * as WebBrowser from 'expo-web-browser';
import { useRouter, Link } from 'expo-router';
import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import { Colors, Radius, Spacing } from '@/constants/theme';

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const { signIn, fetchStatus } = useSignIn();
  const isLoaded = fetchStatus === 'idle';
  const { startSSOFlow } = useSSO();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSSO = async (strategy: 'oauth_google' | 'oauth_apple') => {
    try {
      const { createdSessionId, setActive: ssoSetActive } = await startSSOFlow({ strategy });
      if (createdSessionId && ssoSetActive) {
        await ssoSetActive({ session: createdSessionId });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Social sign-in failed.';
      Alert.alert('Sign in failed', msg);
    }
  };

  const handleSignIn = async () => {
    if (!isLoaded || !signIn) return; // button is disabled while not loaded

    if (!email.trim()) {
      const msg = 'Please enter your email address.';
      setError(msg);
      Alert.alert('Missing field', msg);
      return;
    }
    if (!password) {
      const msg = 'Please enter your password.';
      setError(msg);
      Alert.alert('Missing field', msg);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    setError(null);

    const { error } = await signIn.password({ identifier: email, password });
    if (error) {
      const clerkErr = error as any;
      const message =
        clerkErr?.longMessage ??
        clerkErr?.message ??
        'Sign in failed. Please try again.';
      setError(message);
      Alert.alert('Sign in failed', message);
      setLoading(false);
      return;
    }

    const { error: finalizeError } = await signIn.finalize();
    if (finalizeError) {
      const clerkErr = finalizeError as any;
      const message = clerkErr?.longMessage ?? clerkErr?.message ?? 'Failed to complete sign-in.';
      setError(message);
      Alert.alert('Sign in failed', message);
    } else {
      router.replace('/');
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.headerContainer}>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to your wardrobe</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={Colors.dark.textSecondary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={Colors.dark.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
              autoComplete="current-password"
            />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, (loading || !isLoaded) && styles.buttonDisabled]}
            onPress={handleSignIn}
            disabled={loading || !isLoaded}
            activeOpacity={0.8}
          >
            {(loading || !isLoaded) ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.socialButton}
            onPress={() => handleSSO('oauth_google')}
            activeOpacity={0.8}
          >
            <Text style={styles.socialButtonText}>🌐  Continue with Google</Text>
          </TouchableOpacity>

          {Platform.OS === 'ios' && (
            <TouchableOpacity
              style={styles.socialButton}
              onPress={() => handleSSO('oauth_apple')}
              activeOpacity={0.8}
            >
              <Text style={styles.socialButtonText}>🍎  Continue with Apple</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <Link href="/(auth)/sign-up" asChild>
            <TouchableOpacity>
              <Text style={styles.footerLink}>Sign up</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.dark.background },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.four,
  },
  headerContainer: { marginBottom: Spacing.five },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.dark.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
    marginTop: Spacing.one,
  },
  form: { gap: Spacing.three },
  inputGroup: { gap: Spacing.one },
  label: { fontSize: 14, fontWeight: '600', color: Colors.dark.textSecondary },
  input: {
    backgroundColor: Colors.dark.backgroundElement,
    borderRadius: Radius.input,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 4,
    fontSize: 16,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    minHeight: 48,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 14,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.button,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginVertical: Spacing.one,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.dark.border,
  },
  dividerText: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
  },
  socialButton: {
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: Radius.button,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    backgroundColor: Colors.dark.backgroundElement,
  },
  socialButtonText: {
    color: Colors.dark.text,
    fontWeight: '600',
    fontSize: 16,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing.five,
  },
  footerText: { color: Colors.dark.textSecondary, fontSize: 14 },
  footerLink: { color: Colors.primaryLight, fontWeight: '600', fontSize: 14 },
});
