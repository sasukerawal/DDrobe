import React, { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, useUser } from '@clerk/expo';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';

import { useAuthStore } from '@/store/useAuthStore';
import { useAppStore } from '@/store/useAppStore';
import { createAuthenticatedClient } from '@/utils/supabase';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useThemeColors, type ThemeColors } from '@/hooks/useThemeColors';

type Formality = 'casual' | 'business_casual' | 'formal';

export default function ProfileScreen() {
  const { signOut, getToken } = useAuth();
  const { user } = useUser();
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
        Alert.alert('Notifications On', 'You\'ll now receive outfit recommendations!', [{ text: 'Great!' }]);
      }
    }
  };

  const handleSignOut = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => signOut(),
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account, closet, and all data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await user?.delete();
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

        {/* ─── Avatar & name ─── */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{initials || '?'}</Text>
          </View>
          <Text style={styles.displayName}>{displayName}</Text>
          {user?.username && <Text style={styles.username}>@{user.username}</Text>}
          <Text style={styles.email}>{email}</Text>
          <TouchableOpacity
            style={styles.editProfileButton}
            onPress={() => {
              setEditFirstName(user?.firstName ?? '');
              setEditLastName(user?.lastName ?? '');
              setEditUsername(user?.username ?? '');
              setEditModalVisible(true);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.editProfileButtonText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* ─── Stats row ─── */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{closetItems.length}</Text>
            <Text style={styles.statLabel}>Closet Items</Text>
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

        {/* ─── Style Preferences ─── */}
        <SectionHeader title="Style Preferences" />
        <View style={styles.card}>
          <Text style={styles.cardSubtitle}>
            The AI uses this to weight outfit suggestions toward your preferred dress code.
          </Text>
          <View style={styles.formalityRow}>
            {(['casual', 'business_casual', 'formal'] as Formality[]).map((f) => (
              <TouchableOpacity
                key={f}
                style={[
                  styles.formalityChip,
                  preferredFormality === f && styles.formalityChipActive,
                ]}
                onPress={() => handleFormalityChange(f)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.formalityChipText,
                    preferredFormality === f && styles.formalityChipTextActive,
                  ]}
                >
                  {f === 'business_casual' ? 'Business' : f.charAt(0).toUpperCase() + f.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ─── Notifications ─── */}
        <SectionHeader title="Notifications" />
        <RowItem
          icon="notifications-outline"
          label="Push Notifications"
          onPress={handleNotificationsPress}
          showChevron
        />

        {/* ─── Account ─── */}
        <SectionHeader title="Account" />
        <RowItem
          icon="mail-outline"
          label="Email"
          value={email}
        />
        <RowItem
          icon="shield-checkmark-outline"
          label="Password"
          value="Managed by Clerk"
        />
        <RowItem
          icon="log-out-outline"
          label="Sign Out"
          onPress={handleSignOut}
          danger
        />

        {/* ─── Danger Zone ─── */}
        <SectionHeader title="Danger Zone" />
        <RowItem
          icon="trash-outline"
          label="Delete Account"
          onPress={handleDeleteAccount}
          danger
        />

        <Text style={styles.versionText}>DDrobe v1.0.0</Text>
      </ScrollView>

      {/* ─── Edit Profile Modal ─── */}
      <Modal visible={editModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Profile</Text>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>First Name</Text>
              <TextInput
                style={styles.modalInput}
                value={editFirstName}
                onChangeText={setEditFirstName}
                placeholder="First name"
                placeholderTextColor={colors.textSecondary}
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
                placeholderTextColor={colors.textSecondary}
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
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setEditModalVisible(false)}
                disabled={saving}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveButton, saving && styles.buttonDisabled]}
                onPress={handleSaveProfile}
                disabled={saving}
              >
                <Text style={styles.modalSaveText}>{saving ? 'Saving…' : 'Save'}</Text>
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
  value,
  onPress,
  danger = false,
  showChevron = false,
}: {
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  showChevron?: boolean;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const content = (
    <View style={styles.rowItem}>
      <Ionicons
        name={icon as any}
        size={20}
        color={danger ? Colors.danger : colors.textSecondary}
        style={styles.rowIcon}
      />
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {(onPress && !value) || showChevron ? (
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
      ) : null}
    </View>
  );

  if (!onPress) return <View style={styles.rowWrapper}>{content}</View>;

  return (
    <TouchableOpacity style={styles.rowWrapper} onPress={onPress} activeOpacity={0.7}>
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
    paddingBottom: Spacing.six,
  },

  // Avatar section
  avatarSection: {
    alignItems: 'center',
    paddingTop: Spacing.five,
    paddingBottom: Spacing.four,
    paddingHorizontal: Spacing.four,
  },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.three,
    borderWidth: 3,
    borderColor: Colors.primaryLight,
  },
  avatarText: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 1,
  },
  displayName: {
    fontSize: 22,
    fontWeight: '700',
    color: c.text,
    marginBottom: 2,
  },
  username: {
    fontSize: 15,
    color: Colors.primaryLight,
    marginBottom: 2,
  },
  email: {
    fontSize: 13,
    color: c.textSecondary,
    marginBottom: Spacing.three,
  },
  editProfileButton: {
    borderWidth: 1.5,
    borderColor: c.border,
    borderRadius: Radius.button,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  editProfileButtonText: {
    color: c.text,
    fontWeight: '600',
    fontSize: 14,
  },

  // Stats
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
  },
  statLabel: {
    fontSize: 11,
    color: c.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: c.border,
    marginVertical: Spacing.one,
  },

  // Section headers
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: c.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginHorizontal: Spacing.four,
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },

  // Card (for style prefs)
  card: {
    marginHorizontal: Spacing.four,
    backgroundColor: c.backgroundElement,
    borderRadius: Radius.card,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  cardSubtitle: {
    fontSize: 13,
    color: c.textSecondary,
    lineHeight: 18,
  },
  formalityRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  formalityChip: {
    flex: 1,
    paddingVertical: Spacing.two,
    borderRadius: Radius.button,
    alignItems: 'center',
    backgroundColor: c.background,
    borderWidth: 1,
    borderColor: c.border,
  },
  formalityChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  formalityChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: c.textSecondary,
  },
  formalityChipTextActive: {
    color: '#fff',
  },

  // Row items
  rowWrapper: {
    marginHorizontal: Spacing.four,
    marginBottom: 2,
    backgroundColor: c.backgroundElement,
    borderRadius: Radius.card,
    overflow: 'hidden',
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    minHeight: 52,
  },
  rowIcon: {
    marginRight: Spacing.three,
    width: 24,
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    color: c.text,
  },
  rowLabelDanger: {
    color: Colors.danger,
  },
  rowValue: {
    fontSize: 14,
    color: c.textSecondary,
    marginRight: Spacing.two,
  },

  // Edit modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: c.backgroundElement,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: c.text,
    marginBottom: Spacing.one,
  },
  modalField: {
    gap: Spacing.one,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: c.textSecondary,
  },
  modalInput: {
    backgroundColor: c.background,
    borderRadius: Radius.input,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 4,
    fontSize: 16,
    color: c.text,
    borderWidth: 1,
    borderColor: c.border,
    minHeight: 48,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  modalCancelButton: {
    flex: 1,
    borderRadius: Radius.button,
    borderWidth: 1.5,
    borderColor: c.border,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  modalCancelText: {
    color: c.text,
    fontWeight: '600',
    fontSize: 16,
  },
  modalSaveButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: Radius.button,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  modalSaveText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },

  versionText: {
    textAlign: 'center',
    fontSize: 12,
    color: c.textSecondary,
    marginTop: Spacing.five,
  },
});
