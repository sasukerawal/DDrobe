import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import * as Haptics from 'expo-haptics';

import { createAuthenticatedClient, invokeFunction } from '@/utils/supabase';
import { fetchWearSummary, logWear, unlogWear, type WearSummary } from '@/utils/wearLog';
import { useAppStore } from '@/store/useAppStore';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useThemeColors, type ThemeColors } from '@/hooks/useThemeColors';
import type { ClosetItem } from '@/types';

const CATEGORIES: { value: ClosetItem['category']; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'shoe', label: 'Shoes' },
  { value: 'outerwear', label: 'Outerwear' },
  { value: 'accessory', label: 'Accessory' },
];
const SEASONS: ClosetItem['season'] = ['spring', 'summer', 'autumn', 'winter'];
const FORMALITIES: { value: ClosetItem['formality']; label: string }[] = [
  { value: 'casual', label: 'Casual' },
  { value: 'business_casual', label: 'Business' },
  { value: 'formal', label: 'Formal' },
];

interface Draft {
  name: string;
  category: ClosetItem['category'];
  color: string;
  pattern: string;
  season: ClosetItem['season'];
  formality: ClosetItem['formality'];
  brand: string;
  size: string;
  price: string;
  notes: string;
}

function toDraft(item: ClosetItem): Draft {
  return {
    name: item.name ?? '',
    category: item.category,
    color: item.color ?? '',
    pattern: item.pattern ?? '',
    season: item.season ?? [],
    formality: item.formality,
    brand: item.brand ?? '',
    size: item.size ?? '',
    price: item.price != null ? String(item.price) : '',
    notes: item.notes ?? '',
  };
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getToken, userId } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const storeItem = useAppStore((s) => s.closetItems.find((i) => i.id === id));
  const { updateClosetItem, removeClosetItem } = useAppStore();

  const [item, setItem] = useState<ClosetItem | null>(storeItem ?? null);
  const [draft, setDraft] = useState<Draft | null>(storeItem ? toDraft(storeItem) : null);
  const [wear, setWear] = useState<WearSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [wearBusy, setWearBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const getClient = async () => {
    const token = await getToken();
    if (!token) throw new Error('Not signed in');
    return createAuthenticatedClient(token);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const client = await getClient();
        if (!storeItem) {
          const { data, error } = await client.from('closet_items').select('*').eq('id', id).single();
          if (error) throw error;
          if (cancelled) return;
          setItem(data as ClosetItem);
          setDraft(toDraft(data as ClosetItem));
        }
        const summary = await fetchWearSummary(client, id);
        if (!cancelled) setWear(summary);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Could not load this item.');
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const dirty = useMemo(() => {
    if (!item || !draft) return false;
    return JSON.stringify(toDraft(item)) !== JSON.stringify(draft);
  }, [item, draft]);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const toggleSeason = (season: ClosetItem['season'][number]) => {
    if (!draft) return;
    Haptics.selectionAsync();
    update('season', draft.season.includes(season)
      ? draft.season.filter((s) => s !== season)
      : [...draft.season, season]);
  };

  const handleSave = async () => {
    if (!item || !draft) return;
    const priceText = draft.price.trim().replace(',', '.');
    const price = priceText === '' ? null : Number(priceText);
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      Alert.alert('Check the price', 'Enter a number like 49.99, or leave it empty.');
      return;
    }

    setSaving(true);
    try {
      const client = await getClient();
      const updates = {
        name: draft.name.trim(),
        category: draft.category,
        color: draft.color.trim(),
        pattern: draft.pattern.trim(),
        season: draft.season,
        formality: draft.formality,
        brand: draft.brand.trim(),
        size: draft.size.trim(),
        price: price === null ? null : Math.round(price * 100) / 100,
        notes: draft.notes.trim(),
      };
      const { data, error } = await client.from('closet_items').update(updates).eq('id', item.id).select().single();
      if (error) throw error;
      const saved = data as ClosetItem;
      setItem(saved);
      setDraft(toDraft(saved));
      updateClosetItem(saved.id, saved);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Not saved', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleWorn = async () => {
    if (!item || !userId || !wear) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setWearBusy(true);
    try {
      const client = await getClient();
      if (wear.wornToday) await unlogWear(client, item.id);
      else await logWear(client, userId, [item.id]);
      setWear(await fetchWearSummary(client, item.id));
    } catch (e) {
      Alert.alert('Not updated', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setWearBusy(false);
    }
  };

  const handleToggleWash = async () => {
    if (!item) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !item.is_in_wash;
    setItem({ ...item, is_in_wash: next });
    updateClosetItem(item.id, { is_in_wash: next });
    try {
      const client = await getClient();
      const { error } = await client.from('closet_items').update({ is_in_wash: next }).eq('id', item.id);
      if (error) throw error;
    } catch {
      setItem((current) => (current ? { ...current, is_in_wash: !next } : current));
      updateClosetItem(item.id, { is_in_wash: !next });
      Alert.alert('Not updated', 'Could not change the laundry status.');
    }
  };

  const handleDelete = () => {
    if (!item) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert('Delete this item?', 'It will be removed from your wardrobe and outfit history. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            const client = await getClient();
            await invokeFunction(client, 'delete-item', { itemId: item.id });
            removeClosetItem(item.id);
            router.back();
          } catch (e) {
            setDeleting(false);
            Alert.alert('Not deleted', e instanceof Error ? e.message : 'Please try again.');
          }
        },
      },
    ]);
  };

  const handleClose = () => {
    if (!dirty) {
      router.back();
      return;
    }
    Alert.alert('Discard changes?', 'Your edits to this item have not been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  if (!item || !draft) {
    return (
      <SafeAreaView style={styles.center}>
        {loadError ? (
          <>
            <Text style={styles.loadErrorText}>{loadError}</Text>
            <TouchableOpacity style={styles.textButton} onPress={() => router.back()}>
              <Text style={styles.textButtonLabel}>Go back</Text>
            </TouchableOpacity>
          </>
        ) : (
          <ActivityIndicator color={colors.textSecondary} />
        )}
      </SafeAreaView>
    );
  }

  const parsedPrice = item.price != null ? Number(item.price) : null;
  const costPerWear = parsedPrice != null && wear && wear.count > 0 ? parsedPrice / wear.count : null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} hitSlop={8} style={styles.headerIcon} accessibilityLabel="Close">
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{item.name || 'Item'}</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={!dirty || saving}
          hitSlop={8}
          style={styles.headerSave}
          accessibilityLabel="Save changes"
        >
          {saving ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <Text style={[styles.headerSaveText, (!dirty || saving) && styles.headerSaveDisabled]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* Photo */}
          <View style={styles.photoFrame}>
            <Image source={item.image_url} style={styles.photo} contentFit="contain" transition={150} />
            {item.is_in_wash && (
              <View style={styles.washBadge}>
                <Ionicons name="water" size={12} color="#fff" />
                <Text style={styles.washBadgeText}>In the wash</Text>
              </View>
            )}
          </View>

          {/* Quick actions */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionPrimary, wear?.wornToday && styles.actionPrimaryDone]}
              onPress={handleToggleWorn}
              disabled={!wear || wearBusy}
              activeOpacity={0.85}
            >
              {wearBusy || !wear ? (
                <ActivityIndicator size="small" color={wear?.wornToday ? Colors.accent : colors.background} />
              ) : (
                <>
                  <Ionicons
                    name={wear.wornToday ? 'checkmark-circle' : 'shirt-outline'}
                    size={18}
                    color={wear.wornToday ? Colors.accent : colors.background}
                  />
                  <Text style={[styles.actionPrimaryText, wear.wornToday && styles.actionPrimaryTextDone]}>
                    {wear.wornToday ? 'Worn today' : 'Wore it today'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionSecondary} onPress={handleToggleWash} activeOpacity={0.85}>
              <Ionicons name={item.is_in_wash ? 'water' : 'water-outline'} size={18} color={colors.text} />
              <Text style={styles.actionSecondaryText}>{item.is_in_wash ? 'Clean' : 'In wash'}</Text>
            </TouchableOpacity>
          </View>

          {/* Wear stats */}
          <View style={styles.statsRow}>
            <Stat label="Times worn" value={wear ? String(wear.count) : '–'} styles={styles} />
            <View style={styles.statDivider} />
            <Stat label="Last worn" value={wear?.lastWorn ? formatDate(wear.lastWorn) : 'Never'} styles={styles} />
            <View style={styles.statDivider} />
            <Stat
              label="Cost per wear"
              value={costPerWear != null ? costPerWear.toFixed(2) : parsedPrice != null ? parsedPrice.toFixed(2) : '–'}
              styles={styles}
            />
          </View>

          {/* Details */}
          <Field label="Name" styles={styles}>
            <TextInput
              style={styles.input}
              value={draft.name}
              onChangeText={(t) => update('name', t)}
              placeholder="e.g. Black leather loafers"
              placeholderTextColor={colors.textTertiary}
              maxLength={80}
            />
          </Field>

          <Field label="Category" styles={styles}>
            <View style={styles.chipRow}>
              {CATEGORIES.map((c) => (
                <Chip
                  key={c.value}
                  label={c.label}
                  active={draft.category === c.value}
                  onPress={() => { Haptics.selectionAsync(); update('category', c.value); }}
                  styles={styles}
                />
              ))}
            </View>
          </Field>

          <View style={styles.twoCol}>
            <Field label="Colour" styles={styles} flex>
              <TextInput
                style={styles.input}
                value={draft.color}
                onChangeText={(t) => update('color', t)}
                placeholder="Black"
                placeholderTextColor={colors.textTertiary}
                maxLength={40}
              />
            </Field>
            <Field label="Pattern" styles={styles} flex>
              <TextInput
                style={styles.input}
                value={draft.pattern}
                onChangeText={(t) => update('pattern', t)}
                placeholder="Solid"
                placeholderTextColor={colors.textTertiary}
                maxLength={40}
              />
            </Field>
          </View>

          <Field label="Seasons" styles={styles}>
            <View style={styles.chipRow}>
              {SEASONS.map((s) => (
                <Chip
                  key={s}
                  label={s.charAt(0).toUpperCase() + s.slice(1)}
                  active={draft.season.includes(s)}
                  onPress={() => toggleSeason(s)}
                  styles={styles}
                />
              ))}
            </View>
          </Field>

          <Field label="Dress code" styles={styles}>
            <View style={styles.chipRow}>
              {FORMALITIES.map((f) => (
                <Chip
                  key={f.value}
                  label={f.label}
                  active={draft.formality === f.value}
                  onPress={() => { Haptics.selectionAsync(); update('formality', f.value); }}
                  styles={styles}
                />
              ))}
            </View>
          </Field>

          <View style={styles.twoCol}>
            <Field label="Brand" styles={styles} flex>
              <TextInput
                style={styles.input}
                value={draft.brand}
                onChangeText={(t) => update('brand', t)}
                placeholder="Optional"
                placeholderTextColor={colors.textTertiary}
                maxLength={60}
              />
            </Field>
            <Field label="Size" styles={styles} flex>
              <TextInput
                style={styles.input}
                value={draft.size}
                onChangeText={(t) => update('size', t)}
                placeholder="M, 8, 42…"
                placeholderTextColor={colors.textTertiary}
                maxLength={20}
              />
            </Field>
          </View>

          <Field label="Price paid" hint="Used for cost per wear" styles={styles}>
            <TextInput
              style={styles.input}
              value={draft.price}
              onChangeText={(t) => update('price', t.replace(/[^0-9.,]/g, ''))}
              placeholder="0.00"
              placeholderTextColor={colors.textTertiary}
              keyboardType="decimal-pad"
              maxLength={10}
            />
          </Field>

          <Field label="Notes" styles={styles}>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={draft.notes}
              onChangeText={(t) => update('notes', t)}
              placeholder="Fit, care instructions, where you bought it…"
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={500}
            />
          </Field>

          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} disabled={deleting} activeOpacity={0.8}>
            {deleting ? (
              <ActivityIndicator size="small" color={Colors.danger} />
            ) : (
              <>
                <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                <Text style={styles.deleteText}>Delete item</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type Styles = ReturnType<typeof createStyles>;

function Field({
  label,
  hint,
  flex,
  styles,
  children,
}: {
  label: string;
  hint?: string;
  flex?: boolean;
  styles: Styles;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.field, flex && { flex: 1 }]}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Chip({ label, active, onPress, styles }: { label: string; active: boolean; onPress: () => void; styles: Styles }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Stat({ label, value, styles }: { label: string; value: string; styles: Styles }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  center: {
    flex: 1,
    backgroundColor: c.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  loadErrorText: { color: c.textSecondary, fontSize: 15, textAlign: 'center' },
  textButton: { paddingVertical: 10, paddingHorizontal: 16 },
  textButtonLabel: { color: Colors.accent, fontSize: 15, fontWeight: '600' },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.separator,
  },
  headerIcon: { width: 44, height: 44, justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600', color: c.text, letterSpacing: -0.2 },
  headerSave: { minWidth: 44, height: 44, justifyContent: 'center', alignItems: 'flex-end' },
  headerSaveText: { fontSize: 16, fontWeight: '700', color: Colors.accent },
  headerSaveDisabled: { color: c.textTertiary },

  scroll: { padding: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.three },

  // ── Photo ──
  photoFrame: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: Radius.card,
    backgroundColor: c.backgroundElement,
    overflow: 'hidden',
  },
  photo: { width: '100%', height: '100%' },
  washBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  washBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // ── Actions ──
  actionsRow: { flexDirection: 'row', gap: Spacing.two },
  actionPrimary: {
    flex: 2,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: c.text,
    borderRadius: Radius.button,
    borderWidth: 1.5,
    borderColor: c.text,
  },
  actionPrimaryDone: { backgroundColor: 'transparent', borderColor: Colors.accent },
  actionPrimaryText: { color: c.background, fontSize: 16, fontWeight: '700' },
  actionPrimaryTextDone: { color: Colors.accent },
  actionSecondary: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: c.border,
  },
  actionSecondaryText: { color: c.text, fontSize: 15, fontWeight: '600' },

  // ── Stats ──
  statsRow: {
    flexDirection: 'row',
    backgroundColor: c.backgroundElement,
    borderRadius: Radius.card,
    paddingVertical: Spacing.three,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 18, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 11, color: c.textSecondary, textAlign: 'center' },
  statDivider: { width: StyleSheet.hairlineWidth, backgroundColor: c.separator, marginVertical: 4 },

  // ── Fields ──
  field: { gap: 6 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: c.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  fieldHint: { fontSize: 12, color: c.textTertiary },
  twoCol: { flexDirection: 'row', gap: Spacing.two },
  input: {
    backgroundColor: c.backgroundElement,
    borderRadius: Radius.input,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    minHeight: 48,
    fontSize: 16,
    color: c.text,
  },
  notesInput: { minHeight: 96, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.background,
  },
  chipActive: { backgroundColor: c.text, borderColor: c.text },
  chipText: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
  chipTextActive: { color: c.background },

  // ── Delete ──
  deleteButton: {
    marginTop: Spacing.two,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
  },
  deleteText: { color: Colors.danger, fontSize: 15, fontWeight: '600' },
});
