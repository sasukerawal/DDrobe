import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSignUp } from '@clerk/expo';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { AuthShell } from '@/components/AuthShell';
import { Colors, Radius } from '@/constants/theme';

// Shown after Google/Apple sign-up when Clerk still needs details (usually a username).
export default function CompleteSignUpScreen() {
  const router = useRouter();
  const { signUp, fetchStatus } = useSignUp();
  const missing = signUp?.missingFields ?? [];
  const needsUsername = missing.includes('username');
  const needsFirstName = missing.includes('first_name');
  const needsLastName = missing.includes('last_name');
  const unsupported = missing.filter((f) => !['username', 'first_name', 'last_name'].includes(f));

  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [focused, setFocused] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const message = (e: unknown, fallback: string) =>
    (e as { longMessage?: string; message?: string })?.longMessage ??
    (e as { message?: string })?.message ??
    fallback;

  const handleContinue = async () => {
    if (!signUp) return;
    if (needsUsername && username.length < 3) {
      setError('Usernames need at least 3 characters.');
      return;
    }
    if ((needsFirstName && !firstName.trim()) || (needsLastName && !lastName.trim())) {
      setError('Please fill in every field.');
      return;
    }
    setSaving(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const { error: updateError } = await signUp.update({
      ...(needsUsername ? { username } : {}),
      ...(needsFirstName ? { firstName: firstName.trim() } : {}),
      ...(needsLastName ? { lastName: lastName.trim() } : {}),
    });
    if (updateError) {
      setError(message(updateError, 'Could not save your details.'));
      setSaving(false);
      return;
    }

    if (signUp.status !== 'complete') {
      setError("Your account still needs more details. Please sign up with email and password instead.");
      setSaving(false);
      return;
    }

    const { error: finalizeError } = await signUp.finalize();
    if (finalizeError) {
      setError(message(finalizeError, 'Could not finish signing you up.'));
      setSaving(false);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/');
  };

  const field = (
    key: string,
    label: string,
    value: string,
    onChange: (t: string) => void,
    props: Partial<React.ComponentProps<typeof TextInput>> = {},
  ) => (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrap, focused === key && styles.inputFocused]}>
        <TextInput
          style={styles.inputText}
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(key)}
          onBlur={() => setFocused(null)}
          placeholderTextColor={Colors.light.textTertiary}
          {...props}
        />
      </View>
    </View>
  );

  const noAttempt = !signUp || missing.length === 0;

  return (
    <AuthShell tagline="One last step.">
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Finish your account</Text>
        <Text style={styles.sub}>
          {noAttempt
            ? 'There is no sign-up in progress. Go back and try again.'
            : 'Choose how you appear in DDrobe. You can change it later in your profile.'}
        </Text>

        {!noAttempt && (
          <View style={styles.fields}>
            {needsUsername &&
              field('username', 'Username', username, (t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, '')), {
                placeholder: 'your_username',
                autoCapitalize: 'none',
                autoCorrect: false,
                maxLength: 30,
                autoFocus: true,
              })}
            {needsFirstName && field('first', 'First name', firstName, setFirstName, { placeholder: 'First name', autoCapitalize: 'words' })}
            {needsLastName && field('last', 'Last name', lastName, setLastName, { placeholder: 'Last name', autoCapitalize: 'words' })}
            {unsupported.length > 0 && (
              <Text style={styles.error}>
                This account also needs: {unsupported.join(', ').replace(/_/g, ' ')}. Please sign up with email and password instead.
              </Text>
            )}
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              style={[styles.primaryBtn, (saving || fetchStatus !== 'idle') && styles.btnDisabled]}
              onPress={handleContinue}
              disabled={saving || fetchStatus !== 'idle' || unsupported.length > 0}
            >
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryBtnText}>Continue</Text>}
            </Pressable>
          </View>
        )}

        <Pressable style={styles.backLink} onPress={() => router.replace('/(auth)/sign-in')} hitSlop={8}>
          <Text style={styles.backLinkText}>Back to sign in</Text>
        </Pressable>
      </ScrollView>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 32 },
  heading: { fontSize: 26, fontWeight: '700', color: Colors.light.text, letterSpacing: -0.6, marginBottom: 6 },
  sub: { fontSize: 15, color: Colors.light.textSecondary, marginBottom: 28, lineHeight: 22 },
  fields: { gap: 16 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.light.textSecondary },
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
    paddingVertical: Platform.OS === 'ios' ? 13 : 10,
  },
  error: { fontSize: 13, color: Colors.danger, lineHeight: 18 },
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
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  backLink: { alignSelf: 'center', marginTop: 24, minHeight: 44, justifyContent: 'center' },
  backLinkText: { color: Colors.accent, fontWeight: '600', fontSize: 14 },
});
