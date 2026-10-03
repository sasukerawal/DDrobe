import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import * as Haptics from 'expo-haptics';

import { OutfitCollage } from '@/components/OutfitCollage';
import { ensureClosetLoaded } from '@/utils/closet';
import { saveOutfit } from '@/utils/outfits';
import { createAuthenticatedClient } from '@/utils/supabase';
import { useAppStore } from '@/store/useAppStore';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useThemeColors, type ThemeColors } from '@/hooks/useThemeColors';
import type { ClosetItem } from '@/types';

type Slot = 'top' | 'bottom' | 'shoe' | 'accessory';

const SLOTS: { key: Slot; label: string; categories: ClosetItem['category'][]; optional?: boolean }[] = [
  { key: 'top', label: 'Top', categories: ['top', 'outerwear'] },
  { key: 'bottom', label: 'Bottom', categories: ['bottom'] },
  { key: 'shoe', label: 'Shoes', categories: ['shoe'] },
  { key: 'accessory', label: 'Accessory', categories: ['accessory'], optional: true },
];

function pickRandom<T>(list: T[]): T | null {
  return list.length ? list[Math.floor(Math.random() * list.length)] : null;
}

export default function OutfitBuilderScreen() {
  const router = useRouter();
  const { getToken, userId } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const closetItems = useAppStore((s) => s.closetItems);

  const [loading, setLoading] = useState(closetItems.length === 0);
  const [selection, setSelection] = useState<Record<Slot, ClosetItem | null>>({
    top: null,
    bottom: null,
    shoe: null,
    accessory: null,
  });
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    ensureClosetLoaded(getToken)
      .catch((e) => Alert.alert('Could not load your wardrobe', e instanceof Error ? e.message : 'Please try again.'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const options = useMemo(() => {
    const clean = closetItems.filter((i) => !i.is_in_wash);
    return Object.fromEntries(
      SLOTS.map((s) => [s.key, clean.filter((i) => s.categories.includes(i.category))]),
    ) as Record<Slot, ClosetItem[]>;
  }, [closetItems]);

  const complete = Boolean(selection.top && selection.bottom && selection.shoe);

  const select = (slot: Slot, item: ClosetItem | null) => {
    Haptics.selectionAsync();
    setSelection((s) => ({ ...s, [slot]: s[slot]?.id === item?.id ? null : item }));
  };

  const shuffle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelection({
      top: pickRandom(options.top),
      bottom: pickRandom(options.bottom),
      shoe: pickRandom(options.shoe),
      accessory: Math.random() < 0.5 ? pickRandom(options.accessory) : null,
    });
  };

  const handleSave = async () => {
    if (!complete || !userId) return;
    setSaving(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const outfit = await saveOutfit(
        createAuthenticatedClient(token),
        userId,
        { top: selection.top!, bottom: selection.bottom!, shoe: selection.shoe!, accessory: selection.accessory },
        { name: name.trim() || 'My outfit', source: 'manual' },
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/outfit/${outfit.id}` as never);
    } catch (e) {
      setSaving(false);
      Alert.alert('Not saved', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.headerSide} accessibilityLabel="Close">
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New outfit</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={!complete || saving}
          hitSlop={8}
          style={[styles.headerSide, { alignItems: 'flex-end' }]}
        >
          {saving ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <Text style={[styles.saveText, !complete && styles.saveDisabled]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.previewRow}>
            <OutfitCollage {...selection} style={styles.preview} />
            <View style={styles.previewSide}>
              <TextInput
                style={styles.nameInput}
                value={name}
                onChangeText={setName}
                placeholder="Name it (optional)"
                placeholderTextColor={colors.textTertiary}
                maxLength={60}
              />
              <TouchableOpacity style={styles.shuffle} onPress={shuffle} activeOpacity={0.85}>
                <Ionicons name="shuffle" size={18} color={colors.background} />
                <Text style={styles.shuffleText}>Shuffle</Text>
              </TouchableOpacity>
              <Text style={styles.hint}>
                {complete ? 'Looks good. Tap Save.' : 'Pick a top, a bottom and shoes.'}
              </Text>
            </View>
          </View>

          {SLOTS.map((slot) => {
            const list = options[slot.key];
            return (
              <View key={slot.key} style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {slot.label}
                  {slot.optional ? <Text style={styles.optional}>  optional</Text> : null}
                </Text>
                {list.length === 0 ? (
                  <Text style={styles.emptySlot}>
                    No clean {slot.label.toLowerCase()} in your wardrobe yet.
                  </Text>
                ) : (
                  <FlatList
                    horizontal
                    data={list}
                    keyExtractor={(i) => i.id}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.carousel}
                    renderItem={({ item }) => {
                      const active = selection[slot.key]?.id === item.id;
                      return (
                        <Pressable
                          onPress={() => select(slot.key, item)}
                          style={[styles.thumb, active && styles.thumbActive]}
                          accessibilityRole="button"
                          accessibilityLabel={item.name || item.category}
                          accessibilityState={{ selected: active }}
                        >
                          <Image source={item.image_url} style={styles.thumbImage} contentFit="contain" />
                          {active && (
                            <View style={styles.check}>
                              <Ionicons name="checkmark" size={12} color="#fff" />
                            </View>
                          )}
                        </Pressable>
                      );
                    }}
                  />
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.separator,
  },
  headerSide: { minWidth: 44, height: 44, justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600', color: c.text },
  saveText: { fontSize: 16, fontWeight: '700', color: Colors.accent },
  saveDisabled: { color: c.textTertiary },

  scroll: { paddingVertical: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.four },
  previewRow: { flexDirection: 'row', gap: Spacing.three, paddingHorizontal: Spacing.three },
  preview: { width: '46%' },
  previewSide: { flex: 1, gap: Spacing.two, justifyContent: 'center' },
  nameInput: {
    backgroundColor: c.backgroundElement,
    borderRadius: Radius.input,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 12,
    minHeight: 48,
    fontSize: 15,
    color: c.text,
  },
  shuffle: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: c.text,
    borderRadius: Radius.button,
  },
  shuffleText: { color: c.background, fontSize: 15, fontWeight: '700' },
  hint: { fontSize: 12, color: c.textSecondary },

  section: { gap: Spacing.two },
  sectionTitle: {
    paddingHorizontal: Spacing.three,
    fontSize: 12,
    fontWeight: '700',
    color: c.textSecondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  optional: { fontWeight: '400', textTransform: 'none', letterSpacing: 0, color: c.textTertiary },
  emptySlot: { paddingHorizontal: Spacing.three, fontSize: 14, color: c.textTertiary },
  carousel: { paddingHorizontal: Spacing.three, gap: 10 },
  thumb: {
    width: 84,
    height: 104,
    borderRadius: Radius.button,
    backgroundColor: c.backgroundElement,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  thumbActive: { borderColor: Colors.accent },
  thumbImage: { width: '100%', height: '100%' },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
