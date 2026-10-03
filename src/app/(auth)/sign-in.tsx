import {
  Alert,
  StyleSheet,
  Text,
  View,
  TextInput,
  ActivityIndicator,
  Platform,
  ScrollView,
  Pressable,
} from 'react-native';
import { useSignIn, useSSO } from '@clerk/expo';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useRouter, Link } from 'expo-router';
import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Colors, Radius } from '@/constants/theme';
import { AuthShell } from '@/components/AuthShell';

WebBrowser.maybeCompleteAuthSession();

// Animated wrapper for Pressable so scale works via Reanimated
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function SignInScreen() {
  const { signIn, fetchStatus } = useSignIn();
  const isLoaded = fetchStatus === 'idle';
  const { startSSOFlow } = useSSO();
  const router = useRouter();

  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [loading,      setLoading]      = useState(false);

  // Field focus state
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);

  // CTA button press scale
  const scale = useSharedValue(1);
  const btnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const disabled = loading || !isLoaded;

  const handleSSO = async (strategy: 'oauth_google' | 'oauth_apple') => {
    try {
      const result = await startSSOFlow({
        strategy,
        // Provide the registered route so Clerk knows where to redirect after OAuth
        redirectUrl: Linking.createURL('/sso-callback'),
      });
      const { createdSessionId, setActive: ssoSetActive, error } = result as any;
      if (error) {
        const msg = error?.longMessage ?? error?.message ?? 'Social sign-in failed.';
        Alert.alert('Sign in failed', msg);
        return;
      }
      if (createdSessionId && ssoSetActive) {
        await ssoSetActive({ session: createdSessionId });
      } else if ((result as any).authSessionResult?.type === 'success') {
        Alert.alert(
          "Couldn't finish sign-in",
          'Your account needs a few more details. Please sign in with email and password for now.',
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Social sign-in failed.';
      Alert.alert('Sign in failed', msg);
    }
  };

  const handleSignIn = async () => {
    if (!isLoaded || !signIn) return;

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
      const message = clerkErr?.longMessage ?? clerkErr?.message ?? 'Sign in failed. Please try again.';
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
    <AuthShell>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      >
        <Text style={styles.heading}>Welcome back</Text>
        <Text style={styles.sub}>Sign in to your wardrobe</Text>

        <View style={styles.fields}>
          {/* Email */}
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <View style={[styles.inputWrap, focused === 'email' && styles.inputFocused]}>
              <TextInput
                style={styles.inputText}
                placeholder="you@example.com"
                placeholderTextColor={Colors.light.textTertiary}
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused(null)}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
              />
            </View>
          </View>

          {/* Password */}
          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Password</Text>
              <Link href="/(auth)/forgot-password" asChild>
                <Pressable hitSlop={8}>
                  <Text style={styles.forgotLink}>Forgot?</Text>
                </Pressable>
              </Link>
            </View>
            <View style={[styles.inputWrap, focused === 'password' && styles.inputFocused]}>
              <TextInput
                style={[styles.inputText, { flex: 1 }]}
                placeholder="••••••••••••"
                placeholderTextColor={Colors.light.textTertiary}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
                secureTextEntry={!showPassword}
                textContentType="password"
                autoComplete="current-password"
              />
              <Pressable
                style={styles.eyeBtn}
                onPress={() => setShowPassword(v => !v)}
                hitSlop={8}
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={Colors.light.textSecondary}
                />
              </Pressable>
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* Primary CTA with Reanimated press scale */}
          <AnimatedPressable
            style={[styles.primaryBtn, disabled && styles.btnDisabled, btnAnimStyle]}
            onPressIn={() => {
              if (!disabled) scale.value = withSpring(0.96, { damping: 12, stiffness: 400 });
            }}
            onPressOut={() => {
              scale.value = withSpring(1, { damping: 10, stiffness: 200 });
            }}
            onPress={handleSignIn}
            disabled={disabled}
            android_ripple={null}
          >
            {disabled ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Sign In</Text>
            )}
          </AnimatedPressable>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.divLine} />
            <Text style={styles.divText}>or</Text>
            <View style={styles.divLine} />
          </View>

          {/* Google */}
          <Pressable
            style={({ pressed }) => [styles.socialBtn, pressed && styles.socialBtnPressed]}
            onPress={() => handleSSO('oauth_google')}
            android_ripple={{ color: 'rgba(0,0,0,0.06)', borderless: false }}
          >
            <Ionicons name="logo-google" size={18} color={Colors.light.text} />
            <Text style={styles.socialBtnText}>Continue with Google</Text>
          </Pressable>

          {/* Apple (iOS only) */}
          {Platform.OS === 'ios' && (
            <Pressable
              style={({ pressed }) => [styles.socialBtn, pressed && styles.socialBtnPressed]}
              onPress={() => handleSSO('oauth_apple')}
            >
              <Ionicons name="logo-apple" size={18} color={Colors.light.text} />
              <Text style={styles.socialBtnText}>Continue with Apple</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <Link href="/(auth)/sign-up" asChild>
            <Pressable hitSlop={4}>
              <Text style={styles.footerLink}>Sign up</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 56,
  },

  heading: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.light.text,
    letterSpacing: -0.6,
    marginBottom: 6,
  },
  sub: {
    fontSize: 15,
    color: Colors.light.textSecondary,
    marginBottom: 32,
  },

  fields: { gap: 16 },
  field:  { gap: 7 },

  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    letterSpacing: 0.1,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  forgotLink: { fontSize: 13, fontWeight: '600', color: Colors.accent },

  // Input container: border lives here so it animates with focus state
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.backgroundElement,
    borderRadius: Radius.input,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    minHeight: 50,
    paddingHorizontal: 14,
    // Transition handled by React Native's layout engine on iOS; instant on Android
  },
  inputFocused: {
    borderColor: Colors.accent,
    backgroundColor: '#FFFFFF',
  },
  inputText: {
    flex: 1,
    fontSize: 16,
    color: Colors.light.text,
    backgroundColor: 'transparent',
    paddingVertical: Platform.OS === 'ios' ? 13 : 10,
  },
  eyeBtn: { paddingLeft: 8, paddingVertical: 6 },

  error: { fontSize: 13, color: Colors.danger, marginTop: -4 },

  // CTA
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.pill,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.55 },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16, letterSpacing: 0.1 },

  // Divider
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
  divLine: { flex: 1, height: 1, backgroundColor: Colors.light.separator },
  divText: { fontSize: 13, color: Colors.light.textTertiary },

  // Social buttons
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    borderRadius: Radius.pill,
    paddingVertical: 14,
    minHeight: 50,
    backgroundColor: Colors.light.background,
  },
  socialBtnPressed: {
    backgroundColor: Colors.light.backgroundElement,
  },
  socialBtnText: { color: Colors.light.text, fontWeight: '600', fontSize: 15 },

  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 36 },
  footerText: { color: Colors.light.textSecondary, fontSize: 14 },
  footerLink: { color: Colors.accent, fontWeight: '700', fontSize: 14 },
});
