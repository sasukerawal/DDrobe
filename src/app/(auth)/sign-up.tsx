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
import { useSignUp, useSSO } from '@clerk/expo';
import * as WebBrowser from 'expo-web-browser';
import { useRouter, Link } from 'expo-router';
import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import { Colors, Radius, Spacing } from '@/constants/theme';

WebBrowser.maybeCompleteAuthSession();

export default function SignUpScreen() {
  const { signUp, fetchStatus } = useSignUp();
  const isLoaded = fetchStatus === 'idle';
  const { startSSOFlow } = useSSO();
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState('');
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

  const handleSignUp = async () => {
    if (!isLoaded || !signUp) return; // button is disabled while not loaded

    // Client-side validation before hitting the API
    if (!username.trim()) {
      const msg = 'Please enter a username.';
      setError(msg);
      Alert.alert('Missing field', msg);
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      const msg = 'Please enter a valid email address.';
      setError(msg);
      Alert.alert('Missing field', msg);
      return;
    }
    if (password.length < 15) {
      const msg = `Password must be at least 15 characters (yours is ${password.length}).`;
      setError(msg);
      Alert.alert('Password too short', msg);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    setError(null);

    const { error: createError } = await signUp.create({ username, emailAddress: email, password });
    if (createError) {
      const clerkErr = createError as any;
      const message =
        clerkErr?.longMessage ??
        clerkErr?.message ??
        'Sign up failed. Please try again.';
      setError(message);
      Alert.alert('Sign up failed', message);
      setLoading(false);
      return;
    }

    const { error: sendError } = await signUp.verifications.sendEmailCode();
    if (sendError) {
      const clerkErr = sendError as any;
      const message = clerkErr?.longMessage ?? clerkErr?.message ?? 'Failed to send verification code.';
      setError(message);
      Alert.alert('Error', message);
      setLoading(false);
      return;
    }

    setPendingVerification(true);
    setLoading(false);
  };

  const handleVerify = async () => {
    if (!isLoaded || !signUp) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setError(null);

    const { error: verifyError } = await signUp.verifications.verifyEmailCode({ code });
    if (verifyError) {
      const clerkErr = verifyError as any;
      const message =
        clerkErr?.longMessage ??
        clerkErr?.message ??
        'Verification failed. Check your code.';
      setError(message);
      setLoading(false);
      return;
    }

    const { error: finalizeError } = await signUp.finalize();
    if (finalizeError) {
      const clerkErr = finalizeError as any;
      setError(clerkErr?.longMessage ?? clerkErr?.message ?? 'Failed to complete sign-up.');
    } else {
      router.replace('/');
    }
    setLoading(false);
  };

  if (pendingVerification) {
    return (
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.headerContainer}>
            <Text style={styles.title}>Verify your email</Text>
            <Text style={styles.subtitle}>Enter the code we sent to {email}</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Verification Code</Text>
              <TextInput
                style={styles.input}
                placeholder="123456"
                placeholderTextColor={Colors.dark.textSecondary}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                maxLength={6}
              />
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleVerify}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Verify & Enter</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Required by Clerk Smart CAPTCHA on web; harmless on native */}
      <View nativeID="clerk-captcha" style={styles.captchaAnchor} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.headerContainer}>
          <Text style={styles.title}>Build your wardrobe</Text>
          <Text style={styles.subtitle}>Create a free account to get started</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              placeholder="your_username"
              placeholderTextColor={Colors.dark.textSecondary}
              value={username}
              onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="username"
              autoComplete="username-new"
            />
          </View>

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
              placeholder="Min. 15 characters"
              placeholderTextColor={Colors.dark.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="newPassword"
              autoComplete="new-password"
            />
            <Text style={styles.hint}>Must be at least 15 characters</Text>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, (loading || !isLoaded) && styles.buttonDisabled]}
            onPress={handleSignUp}
            disabled={loading || !isLoaded}
            activeOpacity={0.8}
          >
            {(loading || !isLoaded) ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Create Account</Text>
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
          <Text style={styles.footerText}>Already have an account? </Text>
          <Link href="/(auth)/sign-in" asChild>
            <TouchableOpacity>
              <Text style={styles.footerLink}>Sign in</Text>
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
  hint: { fontSize: 12, color: Colors.dark.textSecondary, marginTop: 2 },
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
  captchaAnchor: { height: 0, overflow: 'hidden' },
});
