import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
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
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import * as Haptics from 'expo-haptics';

import { createAuthenticatedClient, invokeFunction } from '@/utils/supabase';
import { colorSwatch } from '@/utils/stats';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useThemeColors, type ThemeColors } from '@/hooks/useThemeColors';
import type { ClosetItem, WardrobeGap, WishlistItem } from '@/types';

const CATEGORIES: { value: ClosetItem['category']; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'shoe', label: 'Shoes' },
  { value: 'outerwear', label: 'Outerwear' },
  { value: 'accessory', label: 'Accessory' },
];

const EMPTY_FORM = { name: '', category: null as ClosetItem['category'] | null, color: '', brand: '', price: '', url: '', notes: '' };

export default function WishlistScreen() {
  const router = useRouter();
  const { getToken, userId } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [gaps, setGaps] = useState<WardrobeGap[] | null>(null);
  const [gapsLoading, setGapsLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const getClient = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error('Not signed in');
    return createAuthenticatedClient(token);
  }, [getToken]);

  const load = useCallback(async () => {
    try {
      const client = await getClient();
      const { data, error } = await client.from('wishlist_items').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setItems((data ?? []) as WishlistItem[]);
    } catch (e) {
      Alert.alert('Could not load your wishlist', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const findGaps = async () => {
    setGapsLoading(true);
    try {
      const data = await invokeFunction<{ gaps: WardrobeGap[] }>(await getClient(), 'wardrobe-assist', { action: 'gaps' });
      setGaps(data.gaps);
    } catch (e) {
      Alert.alert('No suggestions', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setGapsLoading(false);
    }
  };

  const openForm = (prefill?: Partial<typeof EMPTY_FORM>) => {
    setForm({ ...EMPTY_FORM, ...prefill });
    setSheetOpen(true);
  };

  const handleSave = async () => {
    if (!userId) return;
    const name = form.name.trim();
    if (!name) {
      Alert.alert('Add a name', 'What do you want to buy?');
      return;
    }
    const priceText = form.price.trim().replace(',', '.');
    const price = priceText ? Number(priceText) : null;
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      Alert.alert('Check the price', 'Enter a number like 49.99, or leave it empty.');
      return;
    }
    let url = form.url.trim();
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;

    setSaving(true);
    try {
      const client = await getClient();
      const { error } = await client.from('wishlist_items').insert({
        user_id: userId,
        name,
        category: form.category,
        color: form.color.trim(),
        brand: form.brand.trim(),
        price,
        url,
        notes: form.notes.trim(),
      });
      if (error) throw error;
      setSheetOpen(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      load();
    } catch (e) {
      Alert.alert('Not saved', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const togglePurchased = async (item: WishlistItem) => {
    Haptics.selectionAsync();
    const next = !item.purchased;
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, purchased: next } : i)));
    try {
      const { error } = await (await getClient()).from('wishlist_items').update({ purchased: next }).eq('id', item.id);
      if (error) throw error;
      if (next) {
        Alert.alert('Got it!', 'Add it to your wardrobe now so the stylist can use it?', [
          { text: 'Later', style: 'cancel' },
          { text: 'Add photo', onPress: () => router.push('/add-item' as never) },
        ]);
      }
    } catch {
      setItems((list) => list.map((i) => (i.id === item.id ? { ...i, purchased: !next } : i)));
    }
  };

  const remove = (item: WishlistItem) => {
    Alert.alert('Remove from wishlist?', item.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setItems((list) => list.filter((i) => i.id !== item.id));
          try {
            const { error } = await (await getClient()).from('wishlist_items').delete().eq('id', item.id);
            if (error) throw error;
          } catch {
            load();
          }
        },
      },
    ]);
  };

  const open = items.filter((i) => !i.purchased);
  const bought = items.filter((i) => i.purchased);

  const renderItem = (item: WishlistItem) => (
    <View key={item.id} style={styles.itemRow}>
      <Pressable onPress={() => togglePurchased(item)} hitSlop={6} style={styles.check} accessibilityRole="checkbox" accessibilityState={{ checked: item.purchased }} accessibilityLabel="Bought">
        <Ionicons name={item.purchased ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={item.purchased ? Colors.success : colors.textTertiary} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={[styles.itemName, item.purchased && styles.itemNameDone]} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.itemMeta} numberOfLines={1}>
          {[item.brand, item.color, item.price != null ? Number(item.price).toFixed(2) : null].filter(Boolean).join(' · ') || 'No details'}
        </Text>
      </View>
      {item.url ? (
        <TouchableOpacity onPress={() => Linking.openURL(item.url)} hitSlop={6} style={styles.iconButton} accessibilityLabel="Open link">
          <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity onPress={() => remove(item)} hitSlop={6} style={styles.iconButton} accessibilityLabel="Remove">
        <Ionicons name="trash-outline" size={18} color={colors.textTertiary} />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.headerSide} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Wishlist</Text>
        <TouchableOpacity onPress={() => openForm()} hitSlop={8} style={[styles.headerSide, { alignItems: 'flex-end' }]} accessibilityLabel="Add to wishlist">
          <Ionicons name="add" size={26} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.gapsCard}>
          <View style={styles.gapsHead}>
            <Ionicons name="sparkles" size={16} color={Colors.accent} />
            <Text style={styles.gapsTitle}>Ideas for your wardrobe</Text>
          </View>
          <Text style={styles.muted}>
            The stylist looks at what you own and suggests a few pieces that would create the most new outfits.
          </Text>
          {gaps ? (
            <View style={{ gap: 10, marginTop: 4 }}>
              {gaps.map((g) => (
                <View key={g.title} style={styles.gapRow}>
                  <View style={[styles.swatch, { backgroundColor: colorSwatch(g.color || 'unknown') }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.gapName}>{g.title}</Text>
                    {g.reason ? <Text style={styles.gapReason}>{g.reason}</Text> : null}
                  </View>
                  <TouchableOpacity
                    style={styles.gapAdd}
                    onPress={() => openForm({ name: g.title, category: g.category, color: g.color, notes: g.reason })}
                    accessibilityLabel={`Add ${g.title} to wishlist`}
                  >
                    <Ionicons name="add" size={18} color={Colors.accent} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}
          <TouchableOpacity style={styles.gapsButton} onPress={findGaps} disabled={gapsLoading}>
            {gapsLoading ? <ActivityIndicator size="small" color={colors.background} /> : null}
            <Text style={styles.gapsButtonText}>
              {gapsLoading ? 'Looking at your wardrobe…' : gaps ? 'Suggest again' : "Show me what's missing"}
            </Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.textSecondary} />
        ) : items.length === 0 ? (
          <Text style={styles.empty}>Nothing on your wishlist yet. Tap + to add something you want.</Text>
        ) : (
          <>
            {open.length > 0 && <Text style={styles.sectionTitle}>Want</Text>}
            {open.map(renderItem)}
            {bought.length > 0 && <Text style={styles.sectionTitle}>Bought</Text>}
            {bought.map(renderItem)}
          </>
        )}
      </ScrollView>

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.backdrop} onPress={() => setSheetOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add to wishlist</Text>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: Spacing.three }}>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
                placeholder="What is it? e.g. White leather sneakers"
                placeholderTextColor={colors.textTertiary}
                maxLength={80}
              />
              <View style={styles.chipRow}>
                {CATEGORIES.map((c) => {
                  const active = form.category === c.value;
                  return (
                    <Pressable
                      key={c.value}
                      onPress={() => setForm((f) => ({ ...f, category: active ? null : c.value }))}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput style={[styles.input, { flex: 1 }]} value={form.color} onChangeText={(t) => setForm((f) => ({ ...f, color: t }))} placeholder="Colour" placeholderTextColor={colors.textTertiary} maxLength={40} />
                <TextInput style={[styles.input, { flex: 1 }]} value={form.brand} onChangeText={(t) => setForm((f) => ({ ...f, brand: t }))} placeholder="Brand" placeholderTextColor={colors.textTertiary} maxLength={60} />
              </View>
              <TextInput
                style={styles.input}
                value={form.price}
                onChangeText={(t) => setForm((f) => ({ ...f, price: t.replace(/[^0-9.,]/g, '') }))}
                placeholder="Price (optional)"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
                maxLength={10}
              />
              <TextInput
                style={styles.input}
                value={form.url}
                onChangeText={(t) => setForm((f) => ({ ...f, url: t }))}
                placeholder="Link to the product (optional)"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                maxLength={500}
              />
              <TextInput
                style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]}
                value={form.notes}
                onChangeText={(t) => setForm((f) => ({ ...f, notes: t }))}
                placeholder="Notes"
                placeholderTextColor={colors.textTertiary}
                multiline
                maxLength={300}
              />
            </ScrollView>
            <TouchableOpacity style={[styles.primaryButton, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color={colors.background} /> : <Text style={styles.primaryButtonText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.separator,
  },
  headerSide: { width: 44, height: 44, justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600', color: c.text },
  scroll: { padding: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.two },
  muted: { fontSize: 14, lineHeight: 20, color: c.textSecondary },
  empty: { fontSize: 14, lineHeight: 20, color: c.textSecondary, textAlign: 'center', marginTop: Spacing.four },

  gapsCard: { gap: 8, padding: Spacing.three, borderRadius: Radius.card, backgroundColor: c.backgroundElement, marginBottom: Spacing.two },
  gapsHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gapsTitle: { fontSize: 16, fontWeight: '700', color: c.text },
  gapRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  swatch: { width: 14, height: 14, borderRadius: 7, marginTop: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  gapName: { fontSize: 15, fontWeight: '600', color: c.text },
  gapReason: { fontSize: 13, lineHeight: 18, color: c.textSecondary, marginTop: 2 },
  gapAdd: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: Colors.accentLight, justifyContent: 'center', alignItems: 'center' },
  gapsButton: {
    marginTop: 6,
    minHeight: 46,
    flexDirection: 'row',
    gap: 8,
    borderRadius: Radius.button,
    backgroundColor: c.text,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gapsButtonText: { color: c.background, fontSize: 15, fontWeight: '700' },

  sectionTitle: { fontSize: 12, fontWeight: '700', color: c.textSecondary, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 60 },
  check: { width: 40, height: 44, justifyContent: 'center' },
  itemName: { fontSize: 15, fontWeight: '600', color: c.text },
  itemNameDone: { color: c.textTertiary, textDecorationLine: 'line-through' },
  itemMeta: { fontSize: 12, color: c.textSecondary, marginTop: 2 },
  iconButton: { width: 40, height: 44, justifyContent: 'center', alignItems: 'center' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: c.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: c.border, alignSelf: 'center' },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: c.text },
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 14, borderRadius: Radius.pill, borderWidth: 1, borderColor: c.border },
  chipActive: { backgroundColor: c.text, borderColor: c.text },
  chipText: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
  chipTextActive: { color: c.background },
  primaryButton: { minHeight: 52, borderRadius: Radius.button, backgroundColor: c.text, justifyContent: 'center', alignItems: 'center' },
  primaryButtonText: { color: c.background, fontSize: 16, fontWeight: '700' },
});
