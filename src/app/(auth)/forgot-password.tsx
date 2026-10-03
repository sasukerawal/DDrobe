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
import { useSignIn } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Colors, Radius } from '@/constants/theme';
import { AuthShell } from '@/components/AuthShell';

type Step = 'email' | 'reset';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function ForgotPasswordScreen() {
  const { signIn, fetchStatus } = useSignIn();
  const isLoaded = fetchStatus === 'idle';
  const router = useRouter();

  const [step,            setStep]           = useState<Step>('email');
  const [email,           setEmail]          = useState('');
  const [code,            setCode]           = useState('');
  const [newPassword,     setNewPassword]    = useState('');
  const [confirmPassword, setConfirmPassword]= useState('');
  const [showNew,         setShowNew]        = useState(false);
  const [showConfirm,     setShowConfirm]    = useState(false);
  const [loading,         setLoading]        = useState(false);
  const [error,           setError]          = useState<string | null>(null);

  const [focused, setFocused] = useState<string | null>(null);

  const scale = useSharedValue(1);
  const btnAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const disabled = loading || !isLoaded;

  const handleSendCode = async () => {
    if (!isLoaded || !signIn) return;
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true); setError(null);
    try {
      const { error: createError } = await signIn.create({ identifier: email.trim() });
      if (createError) throw createError;
      const { error: sendError } = await signIn.resetPasswordEmailCode.sendCode();
      if (sendError) throw sendError;
      setStep('reset');
    } catch (e: unknown) {
      const clerkErr = e as any;
      setError(clerkErr?.longMessage ?? clerkErr?.message ?? 'Could not send reset code.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!isLoaded || !signIn) return;
    if (!code.trim())          { setError('Enter the 6-digit code from your email.'); return; }
    if (newPassword.length < 15) { setError(`Password must be at least 15 characters (yours is ${newPassword.length}).`); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true); setError(null);
    try {
      const { error: verifyError } = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() });
      if (verifyError) throw verifyError;
      const { error: submitError } = await signIn.resetPasswordEmailCode.submitPassword({ password: newPassword });
      if (submitError) throw submitError;

      if (signIn.status !== 'complete') {
        setError('Something went wrong. Please try again.');
        return;
      }
      const { error: finalizeError } = await signIn.finalize();
      if (finalizeError) throw finalizeError;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Password updated', "Your password has been reset and you're signed in.");
      router.replace('/');
    } catch (e: unknown) {
      const clerkErr = e as any;
      setError(clerkErr?.longMessage ?? clerkErr?.message ?? 'Reset failed. Check your code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell tagline={step === 'email' ? 'We will help you in.' : 'Almost there.'}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      >
        {/* Back / Resend */}
        <Pressable
          style={styles.backBtn}
          onPress={step === 'reset'
            ? () => { setStep('email'); setCode(''); setError(null); }
            : () => router.back()
          }
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.light.textSecondary} />
          <Text style={styles.backText}>{step === 'reset' ? 'Resend code' : 'Back'}</Text>
        </Pressable>

        {/* ── Email step ── */}
        {step === 'email' && (
          <>
            <Text style={styles.heading}>Forgot password?</Text>
            <Text style={styles.sub}>Enter your email and we'll send a reset code.</Text>

            <View style={styles.fields}>
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
                    autoFocus
                  />
                </View>
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <AnimatedPressable
                style={[styles.primaryBtn, disabled && styles.btnDisabled, btnAnimStyle]}
                onPressIn={() => { if (!disabled) scale.value = withSpring(0.96, { damping: 12, stiffness: 400 }); }}
                onPressOut={() => { scale.value = withSpring(1, { damping: 10, stiffness: 200 }); }}
                onPress={handleSendCode}
                disabled={disabled}
                android_ripple={null}
              >
                {disabled
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.primaryBtnText}>Send Reset Code</Text>}
              </AnimatedPressable>
            </View>
          </>
        )}

        {/* ── Reset step ── */}
        {step === 'reset' && (
          <>
            <View style={styles.sentBadge}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
              <Text style={styles.sentText}>Code sent to {email}</Text>
            </View>

            <Text style={styles.heading}>Set new password</Text>
            <Text style={styles.sub}>Enter the code from your email and choose a new password.</Text>

            <View style={styles.fields}>
              {/* Code */}
              <View style={styles.field}>
                <Text style={styles.label}>Reset code</Text>
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

              {/* New password */}
              <View style={styles.field}>
                <Text style={styles.label}>New password</Text>
                <View style={[styles.inputWrap, focused === 'new' && styles.inputFocused]}>
                  <TextInput
                    style={[styles.inputText, { flex: 1 }]}
                    placeholder="Min. 15 characters"
                    placeholderTextColor={Colors.light.textTertiary}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    onFocus={() => setFocused('new')}
                    onBlur={() => setFocused(null)}
                    secureTextEntry={!showNew}
                    textContentType="newPassword"
                    autoComplete="new-password"
                  />
                  <Pressable style={styles.eyeBtn} onPress={() => setShowNew(v => !v)} hitSlop={8}>
                    <Ionicons name={showNew ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.light.textSecondary} />
                  </Pressable>
                </View>
              </View>

              {/* Confirm */}
              <View style={styles.field}>
                <Text style={styles.label}>Confirm password</Text>
                <View style={[styles.inputWrap, focused === 'confirm' && styles.inputFocused]}>
                  <TextInput
                    style={[styles.inputText, { flex: 1 }]}
                    placeholder="Repeat new password"
                    placeholderTextColor={Colors.light.textTertiary}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    onFocus={() => setFocused('confirm')}
                    onBlur={() => setFocused(null)}
                    secureTextEntry={!showConfirm}
                    textContentType="newPassword"
                    autoComplete="new-password"
                  />
                  <Pressable style={styles.eyeBtn} onPress={() => setShowConfirm(v => !v)} hitSlop={8}>
                    <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.light.textSecondary} />
                  </Pressable>
                </View>
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <AnimatedPressable
                style={[styles.primaryBtn, disabled && styles.btnDisabled, btnAnimStyle]}
                onPressIn={() => { if (!disabled) scale.value = withSpring(0.96, { damping: 12, stiffness: 400 }); }}
                onPressOut={() => { scale.value = withSpring(1, { damping: 10, stiffness: 200 }); }}
                onPress={handleReset}
                disabled={disabled}
                android_ripple={null}
              >
                {disabled
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.primaryBtnText}>Set New Password</Text>}
              </AnimatedPressable>
            </View>
          </>
        )}
      </ScrollView>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 56,
  },

  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    marginBottom: 28, alignSelf: 'flex-start',
  },
  backText: { fontSize: 15, color: Colors.light.textSecondary, fontWeight: '500' },

  sentBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  sentText: { fontSize: 13, color: Colors.success, fontWeight: '600' },

  heading: { fontSize: 26, fontWeight: '700', color: Colors.light.text, letterSpacing: -0.6, marginBottom: 6 },
  sub: { fontSize: 15, color: Colors.light.textSecondary, marginBottom: 28, lineHeight: 22 },

  fields: { gap: 16 },
  field:  { gap: 7 },
  label:  { fontSize: 13, fontWeight: '600', color: Colors.light.textSecondary, letterSpacing: 0.1 },

  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
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
});
