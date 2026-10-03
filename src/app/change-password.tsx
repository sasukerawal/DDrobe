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
import { useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '@/constants/theme';

export default function ChangePasswordScreen() {
  const { user } = useUser();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = async () => {
    if (!user) return;
    if (!currentPassword) { setError('Enter your current password.'); return; }
    if (newPassword.length < 15) {
      setError(`New password must be at least 15 characters (yours is ${newPassword.length}).`);
      return;
    }
    if (newPassword !== confirmPassword) { setError('New passwords do not match.'); return; }
    if (newPassword === currentPassword) { setError('New password must differ from current.'); return; }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setError(null);
    try {
      await user.updatePassword({ currentPassword, newPassword });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Password updated', 'Your password has been changed successfully.', [
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      const clerkErr = e as any;
      const msg =
        clerkErr?.errors?.[0]?.longMessage ??
        clerkErr?.errors?.[0]?.message ??
        clerkErr?.longMessage ??
        clerkErr?.message ??
        'Could not update password. Check your current password.';
      setError(msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={Colors.dark.text} />
        </TouchableOpacity>

        <View style={styles.headerContainer}>
          <Text style={styles.title}>Change password</Text>
          <Text style={styles.subtitle}>
            Choose a strong password that's hard to guess.
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Current Password</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.inputFlex}
                placeholder="Your current password"
                placeholderTextColor={Colors.dark.textSecondary}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                secureTextEntry={!showCurrent}
                textContentType="password"
                autoComplete="current-password"
              />
              <TouchableOpacity onPress={() => setShowCurrent(v => !v)} style={styles.eyeBtn} activeOpacity={0.7}>
                <Ionicons name={showCurrent ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.dark.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.inputGroup}>
            <Text style={styles.label}>New Password</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.inputFlex}
                placeholder="Min. 15 characters"
                placeholderTextColor={Colors.dark.textSecondary}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showNew}
                textContentType="newPassword"
                autoComplete="new-password"
              />
              <TouchableOpacity onPress={() => setShowNew(v => !v)} style={styles.eyeBtn} activeOpacity={0.7}>
                <Ionicons name={showNew ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.dark.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>Must be at least 15 characters</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Confirm New Password</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.inputFlex}
                placeholder="Repeat new password"
                placeholderTextColor={Colors.dark.textSecondary}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showNew}
                textContentType="newPassword"
                autoComplete="new-password"
              />
            </View>
          </View>

          {/* Strength indicator */}
          {newPassword.length > 0 && (
            <View style={styles.strengthRow}>
              {[4, 8, 12, 15].map((threshold, i) => (
                <View
                  key={i}
                  style={[
                    styles.strengthBar,
                    newPassword.length >= threshold && { backgroundColor: strengthColor(newPassword) },
                  ]}
                />
              ))}
              <Text style={[styles.strengthLabel, { color: strengthColor(newPassword) }]}>
                {strengthLabel(newPassword)}
              </Text>
            </View>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleChange}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Update Password</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function strengthColor(pw: string): string {
  if (pw.length < 8) return Colors.danger;
  if (pw.length < 12) return Colors.warning;
  if (pw.length < 15) return Colors.accent;
  return Colors.success;
}

function strengthLabel(pw: string): string {
  if (pw.length < 8) return 'Weak';
  if (pw.length < 12) return 'Fair';
  if (pw.length < 15) return 'Good';
  return 'Strong';
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.dark.background },
  container: { flexGrow: 1, padding: Spacing.four, paddingTop: Spacing.five },
  backBtn: { marginBottom: Spacing.four },
  headerContainer: { marginBottom: Spacing.five },
  title: { fontSize: 32, fontWeight: 'bold', color: Colors.dark.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: Colors.dark.textSecondary, marginTop: Spacing.one, lineHeight: 22 },
  form: { gap: Spacing.three },
  inputGroup: { gap: Spacing.one },
  label: { fontSize: 14, fontWeight: '600', color: Colors.dark.textSecondary },
  hint: { fontSize: 12, color: Colors.dark.textSecondary, marginTop: 2 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.backgroundElement,
    borderRadius: Radius.input,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
  },
  inputFlex: { flex: 1, fontSize: 16, color: Colors.dark.text, paddingVertical: Spacing.two + 4 },
  eyeBtn: { padding: 4 },
  divider: { height: 0.5, backgroundColor: Colors.dark.border },
  strengthRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -4 },
  strengthBar: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.dark.backgroundSelected,
  },
  strengthLabel: { fontSize: 12, fontWeight: '600', minWidth: 44 },
  errorText: { color: Colors.danger, fontSize: 14 },
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
});
