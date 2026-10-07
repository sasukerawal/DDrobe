import React, { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, useUser } from '@clerk/expo';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Constants, { ExecutionEnvironment } from 'expo-constants';

import { useAuthStore } from '@/store/useAuthStore';
import { useAppStore } from '@/store/useAppStore';
import { createAuthenticatedClient } from '@/utils/supabase';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useThemeColors, type ThemeColors } from '@/hooks/useThemeColors';

type Formality = 'casual' | 'business_casual' | 'formal';

export default function ProfileScreen() {
  const { signOut, getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const { dbUser, setDbUser } = useAuthStore();
  const { closetItems } = useAppStore();

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editFirstName, setEditFirstName] = useState(user?.firstName ?? '');
  const [editLastName, setEditLastName] = useState(user?.lastName ?? '');
  const [editUsername, setEditUsername] = useState(user?.username ?? '');
  const [saving, setSaving] = useState(false);

  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
    user?.username ||
    email.split('@')[0];
  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  const preferredFormality: Formality =
    (dbUser?.style_preferences?.preferredFormality as Formality) ?? 'casual';
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const adCredits = dbUser?.ad_credits ?? 0;
  const generationsUsed = dbUser?.daily_generations_used ?? 0;

  const handleSaveProfile = async () => {
    if (!user) return;
    if (!editUsername.trim()) {
      Alert.alert('Missing field', 'Username cannot be empty.');
      return;
    }
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await user.update({
        firstName: editFirstName.trim() || undefined,
        lastName: editLastName.trim() || undefined,
        username: editUsername.trim(),
      });
      setEditModalVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to update profile.';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleFormalityChange = async (formality: Formality) => {
    if (!dbUser) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = {
      ...dbUser,
      style_preferences: { ...dbUser.style_preferences, preferredFormality: formality },
    };
    setDbUser(updated);
    try {
      const token = await getToken();
      if (!token) throw new Error('No auth token');
      const client = createAuthenticatedClient(token);
      const { error } = await client
        .from('users')
        .update({ style_preferences: updated.style_preferences })
        .eq('id', dbUser.id);
      if (error) throw error;
    } catch (e: unknown) {
      setDbUser(dbUser);
      const msg = e instanceof Error ? e.message : 'Failed to save preference.';
      Alert.alert('Error', msg);
    }
  };

  const handleNotificationsPress = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Notifications', 'Push notifications are only supported on the mobile app.');
      return;
    }
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      Alert.alert('Notifications', 'Push notifications work in the DDrobe development build, not in Expo Go.');
      return;
    }
    const Notifications = await import('expo-notifications');
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') {
      Alert.alert(
        'Notifications On',
        'Push notifications are enabled. To disable them, go to your device Settings → DDrobe.',
        [{ text: 'OK' }],
      );
    } else {
      const { status: newStatus } = await Notifications.requestPermissionsAsync();
      if (newStatus !== 'granted') {
        Alert.alert(
          'Notifications Off',
          'To enable notifications, go to your device Settings → DDrobe → Notifications.',
          [{ text: 'OK' }],
        );
      } else {
        Alert.alert('Notifications On', "You'll now receive outfit recommendations!", [{ text: 'Great!' }]);
      }
    }
  };

  const handleSignOut = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  const handleDeleteAccount = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account, wardrobe, and all data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await getToken({ skipCache: true });
              if (!token) throw new Error('Not authenticated');
              const client = createAuthenticatedClient(token);
              const { error } = await client.functions.invoke('delete-account', { body: {} });
              if (error) {
                let msg = error.message ?? 'Failed to delete account.';
                try {
                  const detail = await (error as any).context?.json?.();
                  msg = detail?.error ?? detail?.message ?? msg;
                } catch {}
                throw new Error(msg);
              }
              setDbUser(null);
              useAppStore.getState().setClosetItems([]);
              useAppStore.getState().setDailyOutfits([]);
              await signOut().catch(() => {});
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : 'Failed to delete account.';
              Alert.alert('Error', msg);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

        {/* ── Avatar header ── */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{initials || '?'}</Text>
          </View>
          <Text style={styles.displayName}>{displayName}</Text>
          {user?.username && (
            <Text style={styles.username}>@{user.username}</Text>
          )}
          <Text style={styles.email}>{email}</Text>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => {
              setEditFirstName(user?.firstName ?? '');
              setEditLastName(user?.lastName ?? '');
              setEditUsername(user?.username ?? '');
              setEditModalVisible(true);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.editButtonText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* ── Stats ── */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{closetItems.length}</Text>
            <Text style={styles.statLabel}>Items</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{generationsUsed}</Text>
            <Text style={styles.statLabel}>Outfits Today</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{adCredits}</Text>
            <Text style={styles.statLabel}>Ad Credits</Text>
          </View>
        </View>

        {/* ── Style Preferences ── */}
        <SectionHeader title="Style" />
        <View style={styles.prefCard}>
          <Text style={styles.prefHint}>
            The AI weights outfit suggestions toward your preferred dress code.
          </Text>
          <View style={styles.formalityRow}>
            {(['casual', 'business_casual', 'formal'] as Formality[]).map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.formalityChip, preferredFormality === f && styles.formalityChipActive]}
                onPress={() => handleFormalityChange(f)}
                activeOpacity={0.8}
              >
                <Text style={[styles.formalityChipText, preferredFormality === f && styles.formalityChipTextActive]}>
                  {f === 'business_casual' ? 'Business' : f.charAt(0).toUpperCase() + f.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={() => router.push('/onboarding' as never)} style={styles.quizLink}>
            <Ionicons name="sparkles-outline" size={15} color={Colors.accent} />
            <Text style={styles.quizLinkText}>Retake style quiz</Text>
          </TouchableOpacity>
        </View>

        {/* ── Insights ── */}
        <SectionHeader title="Insights" />
        <View style={styles.rowGroup}>
          <RowItem
            icon="stats-chart-outline"
            label="Wardrobe stats"
            sublabel="Most worn, cost per wear, what to resell"
            onPress={() => router.push('/stats' as never)}
            showChevron
            accent
          />
        </View>

        {/* ── Plan & shop ── */}
        <SectionHeader title="Plan & shop" />
        <View style={styles.rowGroup}>
          <RowItem
            icon="airplane-outline"
            label="Trips"
            sublabel="Packing lists from your own clothes"
            onPress={() => router.push('/trips' as never)}
            showChevron
          />
          <View style={styles.rowSeparator} />
          <RowItem
            icon="heart-outline"
            label="Wishlist"
            sublabel="Things you want, plus what's missing"
            onPress={() => router.push('/wishlist' as never)}
            showChevron
          />
        </View>

        {/* ── Import ── */}
        <SectionHeader title="Import" />
        <View style={styles.rowGroup}>
          <RowItem
            icon="mail-outline"
            label="Import from Email"
            sublabel="Scan purchase emails for clothes"
            onPress={() => router.push('/email-import' as never)}
            showChevron
            accent
          />
        </View>

        {/* ── Notifications ── */}
        <SectionHeader title="Notifications" />
        <View style={styles.rowGroup}>
          <RowItem
            icon="notifications-outline"
            label="Push Notifications"
            onPress={handleNotificationsPress}
            showChevron
          />
        </View>

        {/* ── Account ── */}
        <SectionHeader title="Account" />
        <View style={styles.rowGroup}>
          <RowItem icon="mail-outline" label="Email" value={email} />
          <View style={styles.rowSeparator} />
          {user?.passwordEnabled && (
            <>
              <RowItem
                icon="lock-closed-outline"
                label="Change Password"
                onPress={() => router.push('/change-password' as never)}
              />
              <View style={styles.rowSeparator} />
            </>
          )}
          <RowItem icon="log-out-outline" label="Sign Out" onPress={handleSignOut} danger />
        </View>

        {/* ── Danger ── */}
        <SectionHeader title="Danger Zone" />
        <View style={styles.rowGroup}>
          <RowItem icon="trash-outline" label="Delete Account" onPress={handleDeleteAccount} danger />
        </View>

        <Text style={styles.versionText}>DDrobe v1.0.0</Text>

      </ScrollView>

      {/* ── Edit Profile Modal ── */}
      <Modal visible={editModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Edit Profile</Text>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>First Name</Text>
              <TextInput
                style={styles.modalInput}
                value={editFirstName}
                onChangeText={setEditFirstName}
                placeholder="First name"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Last Name</Text>
              <TextInput
                style={styles.modalInput}
                value={editLastName}
                onChangeText={setEditLastName}
                placeholder="Last name"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Username</Text>
              <TextInput
                style={styles.modalInput}
                value={editUsername}
                onChangeText={(t) => setEditUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="your_username"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.ghostButton}
                onPress={() => setEditModalVisible(false)}
                disabled={saving}
              >
                <Text style={styles.ghostButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, saving && styles.buttonDisabled]}
                onPress={handleSaveProfile}
                disabled={saving}
              >
                <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SectionHeader({ title }: { title: string }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function RowItem({
  icon,
  label,
  sublabel,
  value,
  onPress,
  danger = false,
  accent = false,
  showChevron = false,
}: {
  icon: string;
  label: string;
  sublabel?: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  accent?: boolean;
  showChevron?: boolean;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const iconColor = danger ? Colors.danger : accent ? Colors.accent : colors.textSecondary;
  const content = (
    <View style={styles.rowItem}>
      <View style={[styles.rowIconContainer, accent && styles.rowIconContainerAccent]}>
        <Ionicons name={icon as any} size={18} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
        {sublabel && <Text style={styles.rowSublabel}>{sublabel}</Text>}
      </View>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {(onPress && !value) || showChevron ? (
        <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} />
      ) : null}
    </View>
  );

  if (!onPress) return <View>{content}</View>;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      {content}
    </TouchableOpacity>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: c.background,
  },
  container: {
    paddingBottom: 80,
  },

  // ── Avatar ──
  avatarSection: {
    alignItems: 'center',
    paddingTop: Spacing.five,
    paddingBottom: Spacing.four,
    paddingHorizontal: Spacing.four,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.three,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 1,
  },
  displayName: {
    fontSize: 22,
    fontWeight: '700',
    color: c.text,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  username: {
    fontSize: 14,
    color: Colors.accent,
    fontWeight: '500',
    marginBottom: 2,
  },
  email: {
    fontSize: 13,
    color: c.textSecondary,
    marginBottom: Spacing.three,
  },
  editButton: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: Radius.button,
    paddingVertical: 7,
    paddingHorizontal: Spacing.four,
  },
  editButtonText: {
    color: c.text,
    fontWeight: '500',
    fontSize: 14,
  },

  // ── Stats ──
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.four,
    backgroundColor: c.backgroundElement,
    borderRadius: Radius.card,
    paddingVertical: Spacing.three,
    marginBottom: Spacing.four,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: c.text,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 11,
    color: c.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: c.separator,
    marginVertical: 4,
  },

  // ── Section headers ──
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: c.textSecondary,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginHorizontal: Spacing.four,
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },

  // ── Preference card ──
  prefCard: {
    marginHorizontal: Spacing.four,
    backgroundColor: c.backgroundElement,
    borderRadius: Radius.card,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  prefHint: {
    fontSize: 13,
    color: c.textSecondary,
    lineHeight: 18,
  },
  formalityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  formalityChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: Radius.button,
    alignItems: 'center',
    backgroundColor: c.background,
    borderWidth: 1,
    borderColor: c.border,
  },
  formalityChipActive: {
    backgroundColor: c.text,
    borderColor: c.text,
  },
  formalityChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: c.textSecondary,
  },
  formalityChipTextActive: {
    color: c.background,
  },
  quizLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
  },
  quizLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.accent,
  },

  // ── Row group ──
  rowGroup: {
    marginHorizontal: Spacing.four,
    backgroundColor: c.backgroundElement,
    borderRadius: Radius.card,
    overflow: 'hidden',
  },
  rowSeparator: {
    height: 0.5,
    backgroundColor: c.separator,
    marginLeft: 52,
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: Spacing.three,
    minHeight: 50,
  },
  rowIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: c.backgroundSelected,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  rowIconContainerAccent: {
    backgroundColor: 'rgba(184,147,106,0.15)',
  },
  rowLabel: {
    fontSize: 15,
    color: c.text,
    fontWeight: '400',
  },
  rowSublabel: {
    fontSize: 12,
    color: c.textSecondary,
    marginTop: 1,
  },
  rowLabelDanger: {
    color: Colors.danger,
  },
  rowValue: {
    fontSize: 13,
    color: c.textSecondary,
    marginRight: 4,
    flexShrink: 1,
    maxWidth: '50%',
  },

  // ── Edit Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.border,
    alignSelf: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: c.text,
    letterSpacing: -0.3,
  },
  modalField: {
    gap: 6,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: c.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  modalInput: {
    backgroundColor: c.backgroundElement,
    borderRadius: Radius.input,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    fontSize: 15,
    color: c.text,
    borderWidth: 1,
    borderColor: c.border,
    minHeight: 48,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: 4,
  },
  ghostButton: {
    flex: 1,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ghostButtonText: {
    color: c.text,
    fontWeight: '500',
    fontSize: 15,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: c.text,
    borderRadius: Radius.button,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: c.background,
    fontWeight: '600',
    fontSize: 15,
  },
  buttonDisabled: {
    opacity: 0.5,
  },

  versionText: {
    textAlign: 'center',
    fontSize: 12,
    color: c.textTertiary,
    marginTop: Spacing.five,
    letterSpacing: 0.3,
  },
});
