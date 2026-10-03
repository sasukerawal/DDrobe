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
import { useSignUp, useSSO } from '@clerk/expo';
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
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { Colors, Radius } from '@/constants/theme';
import { AuthShell } from '@/components/AuthShell';

WebBrowser.maybeCompleteAuthSession();

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function strengthLevel(pw: string): { label: string; color: string; pct: number } {
  if (pw.length === 0)  return { label: '',           color: Colors.light.border, pct: 0 };
  if (pw.length < 8)    return { label: 'Too short',  color: Colors.danger,       pct: 0.2 };
  if (pw.length < 12)   return { label: 'Weak',       color: Colors.warning,      pct: 0.45 };
  if (pw.length < 15)   return { label: 'Good',       color: Colors.accent,       pct: 0.7 };
  return                       { label: 'Strong',     color: Colors.success,      pct: 1 };
}

// ── Verify step ─────────────────────────────────────────────────────────────
interface VerifyProps {
  email: string;
  code: string;
  setCode: (v: string) => void;
  error: string | null;
  loading: boolean;
  isLoaded: boolean;
  onVerify: () => void;
}

function VerifyStep({ email, code, setCode, error, loading, isLoaded, onVerify }: VerifyProps) {
  const disabled = loading || !isLoaded;
  const scale = useSharedValue(1);
  const btnAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AuthShell tagline="One last step.">
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      >
        <View style={styles.checkCircle}>
          <Ionicons name="mail-outline" size={28} color={Colors.accent} />
        </View>

        <Text style={styles.heading}>Check your email</Text>
        <Text style={styles.sub}>
          We sent a 6-digit code to{'\n'}
          <Text style={{ color: Colors.light.text, fontWeight: '600' }}>{email}</Text>
        </Text>

        <View style={styles.fields}>
          <View style={styles.field}>
            <Text style={styles.label}>Verification code</Text>
            <View style={[styles.inputWrap, styles.inputFocused]}>
              <TextInput
                style={[styles.inputText, styles.otpText]}
                placeholder="1  2  3  4  5  6"
                placeholderTextColor={Colors.light.textTertiary}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                maxLength={6}
                autoFocus
              />
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <AnimatedPressable
            style={[styles.primaryBtn, disabled && styles.btnDisabled, btnAnimStyle]}
            onPressIn={() => { if (!disabled) scale.value = withSpring(0.96, { damping: 12, stiffness: 400 }); }}
            onPressOut={() => { scale.value = withSpring(1, { damping: 10, stiffness: 200 }); }}
            onPress={onVerify}
            disabled={disabled}
            android_ripple={null}
          >
            {disabled ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Verify & Enter</Text>}
          </AnimatedPressable>
        </View>
      </ScrollView>
    </AuthShell>
  );
}

// ── Main sign-up screen ──────────────────────────────────────────────────────
export default function SignUpScreen() {
  const { signUp, fetchStatus } = useSignUp();
  const isLoaded = fetchStatus === 'idle';
  const { startSSOFlow } = useSSO();
  const router = useRouter();

  const [username,     setUsername]     = useState('');
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code,   setCode]   = useState('');
  const [error,  setError]  = useState<string | null>(null);
  const [loading,setLoading]= useState(false);

  const [focused, setFocused] = useState<'username' | 'email' | 'password' | null>(null);

  const scale = useSharedValue(1);
  const btnAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const strength  = strengthLevel(password);
  const disabled  = loading || !isLoaded;

  const handleSSO = async (strategy: 'oauth_google' | 'oauth_apple') => {
    try {
      const result = await startSSOFlow({
        strategy,
        redirectUrl: Linking.createURL('/sso-callback'),
      });
      const { createdSessionId, setActive: ssoSetActive, error } = result as any;
      if (error) {
        Alert.alert('Sign in failed', error?.longMessage ?? error?.message ?? 'Social sign-in failed.');
        return;
      }
      if (createdSessionId && ssoSetActive) {
        await ssoSetActive({ session: createdSessionId });
      } else if ((result as any).authSessionResult?.type === 'success') {
        Alert.alert(
          "Couldn't finish sign-up",
          'Your account needs a few more details. Please sign up with email and password for now.',
        );
      }
    } catch (err: unknown) {
      Alert.alert('Sign in failed', err instanceof Error ? err.message : 'Social sign-in failed.');
    }
  };

  const handleSignUp = async () => {
    if (!isLoaded || !signUp) return;
    if (!username.trim()) { const m = 'Please enter a username.'; setError(m); Alert.alert('Missing field', m); return; }
    if (!email.trim() || !email.includes('@')) { const m = 'Please enter a valid email address.'; setError(m); Alert.alert('Missing field', m); return; }
    if (password.length < 15) { const m = `Password must be at least 15 characters (yours is ${password.length}).`; setError(m); Alert.alert('Password too short', m); return; }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true); setError(null);

    const { error: createError } = await signUp.create({ username, emailAddress: email, password });
    if (createError) {
      const m = (createError as any)?.longMessage ?? (createError as any)?.message ?? 'Sign up failed.';
      setError(m); Alert.alert('Sign up failed', m); setLoading(false); return;
    }

    const { error: sendError } = await signUp.verifications.sendEmailCode();
    if (sendError) {
      const m = (sendError as any)?.longMessage ?? (sendError as any)?.message ?? 'Failed to send code.';
      setError(m); Alert.alert('Error', m); setLoading(false); return;
    }

    setPendingVerification(true); setLoading(false);
  };

  const handleVerify = async () => {
    if (!isLoaded || !signUp) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true); setError(null);

    const { error: verifyError } = await signUp.verifications.verifyEmailCode({ code });
    if (verifyError) {
      setError((verifyError as any)?.longMessage ?? (verifyError as any)?.message ?? 'Verification failed.');
      setLoading(false); return;
    }

    const { error: finalizeError } = await signUp.finalize();
    if (finalizeError) {
      setError((finalizeError as any)?.longMessage ?? (finalizeError as any)?.message ?? 'Failed to complete sign-up.');
    } else {
      router.replace('/');
    }
    setLoading(false);
  };

  if (pendingVerification) {
    return <VerifyStep email={email} code={code} setCode={setCode} error={error} loading={loading} isLoaded={isLoaded} onVerify={handleVerify} />;
  }

  return (
    <AuthShell tagline="Build your wardrobe.">
      <View nativeID="clerk-captcha" style={{ height: 0, overflow: 'hidden' }} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      >
        <Text style={styles.heading}>Create account</Text>
        <Text style={styles.sub}>Free forever. No credit card needed.</Text>

        <View style={styles.fields}>
          {/* Username */}
          <View style={styles.field}>
            <Text style={styles.label}>Username</Text>
            <View style={[styles.inputWrap, focused === 'username' && styles.inputFocused]}>
              <TextInput
                style={styles.inputText}
                placeholder="your_username"
                placeholderTextColor={Colors.light.textTertiary}
                value={username}
                onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                onFocus={() => setFocused('username')}
                onBlur={() => setFocused(null)}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="username"
                autoComplete="username-new"
              />
            </View>
          </View>

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
            <Text style={styles.label}>Password</Text>
            <View style={[styles.inputWrap, focused === 'password' && styles.inputFocused]}>
              <TextInput
                style={[styles.inputText, { flex: 1 }]}
                placeholder="Min. 15 characters"
                placeholderTextColor={Colors.light.textTertiary}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
                secureTextEntry={!showPassword}
                textContentType="newPassword"
                autoComplete="new-password"
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
            {/* Strength bar */}
            {password.length > 0 && (
              <View style={styles.strengthRow}>
                <View style={styles.strengthTrack}>
                  <View style={[styles.strengthFill, { width: `${strength.pct * 100}%` as any, backgroundColor: strength.color }]} />
                </View>
                <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
              </View>
            )}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* Primary CTA */}
          <AnimatedPressable
            style={[styles.primaryBtn, disabled && styles.btnDisabled, btnAnimStyle]}
            onPressIn={() => { if (!disabled) scale.value = withSpring(0.96, { damping: 12, stiffness: 400 }); }}
            onPressOut={() => { scale.value = withSpring(1, { damping: 10, stiffness: 200 }); }}
            onPress={handleSignUp}
            disabled={disabled}
            android_ripple={null}
          >
            {disabled ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Create Account</Text>}
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

        {/* Terms */}
        <Text style={styles.terms}>
          By continuing you agree to our{' '}
          <Text style={styles.termsLink}>Terms of Service</Text>
          {' '}and{' '}
          <Text style={styles.termsLink}>Privacy Policy</Text>
        </Text>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Link href="/(auth)/sign-in" asChild>
            <Pressable hitSlop={4}>
              <Text style={styles.footerLink}>Sign in</Text>
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

  checkCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: `${Colors.accent}18`,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },

  heading: { fontSize: 26, fontWeight: '700', color: Colors.light.text, letterSpacing: -0.6, marginBottom: 6 },
  sub: { fontSize: 15, color: Colors.light.textSecondary, marginBottom: 28, lineHeight: 22 },

  fields: { gap: 16 },
  field:  { gap: 7 },
  label:  { fontSize: 13, fontWeight: '600', color: Colors.light.textSecondary, letterSpacing: 0.1 },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.backgroundElement,
    borderRadius: Radius.input,
    borderWidth: 1.5,
    borderColor: Colors.light.border,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  inputFocused: { borderColor: Colors.accent, backgroundColor: '#FFFFFF' },
  inputText: {
    flex: 1,
    fontSize: 16,
    color: Colors.light.text,
    backgroundColor: 'transparent',
    paddingVertical: Platform.OS === 'ios' ? 13 : 10,
  },
  otpText: { textAlign: 'center', letterSpacing: 10, fontSize: 20, fontWeight: '600' },
  eyeBtn: { paddingLeft: 8, paddingVertical: 6 },

  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  strengthTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: Colors.light.backgroundSelected, overflow: 'hidden' },
  strengthFill: { height: 3, borderRadius: 2 },
  strengthLabel: { fontSize: 12, fontWeight: '600', minWidth: 52, textAlign: 'right' },

  error: { fontSize: 13, color: Colors.danger, marginTop: -4 },

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

  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
  divLine: { flex: 1, height: 1, backgroundColor: Colors.light.separator },
  divText: { fontSize: 13, color: Colors.light.textTertiary },

  socialBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1.5, borderColor: Colors.light.border, borderRadius: Radius.pill,
    paddingVertical: 14, minHeight: 50, backgroundColor: Colors.light.background,
  },
  socialBtnPressed: { backgroundColor: Colors.light.backgroundElement },
  socialBtnText: { color: Colors.light.text, fontWeight: '600', fontSize: 15 },

  terms: { fontSize: 12, color: Colors.light.textSecondary, textAlign: 'center', marginTop: 20, lineHeight: 18 },
  termsLink: { color: Colors.accent, fontWeight: '600' },

  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  footerText: { color: Colors.light.textSecondary, fontSize: 14 },
  footerLink: { color: Colors.accent, fontWeight: '700', fontSize: 14 },
});
