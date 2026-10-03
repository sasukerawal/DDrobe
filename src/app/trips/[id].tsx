import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
import { ensureClosetLoaded } from '@/utils/closet';
import { formatDay, isoDate } from '@/utils/outfits';
import { useAppStore } from '@/store/useAppStore';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useThemeColors, type ThemeColors } from '@/hooks/useThemeColors';
import type { ClosetItem, Trip, TripItem } from '@/types';

const GROUPS: { key: ClosetItem['category']; label: string }[] = [
  { key: 'top', label: 'Tops' },
  { key: 'bottom', label: 'Bottoms' },
  { key: 'outerwear', label: 'Outerwear' },
  { key: 'shoe', label: 'Shoes' },
  { key: 'accessory', label: 'Accessories' },
];

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getToken, userId } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const closetItems = useAppStore((s) => s.closetItems);

  const [trip, setTrip] = useState<Trip | null>(null);
  const [items, setItems] = useState<TripItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const getClient = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error('Not signed in');
    return createAuthenticatedClient(token);
  }, [getToken]);

  const load = useCallback(async () => {
    try {
      const client = await getClient();
      const [tripRes, itemsRes] = await Promise.all([
        client.from('trips').select('*').eq('id', id).single(),
        client.from('trip_items').select('id, trip_id, item_id, packed, reason, item:closet_items(*)').eq('trip_id', id),
      ]);
      if (tripRes.error) throw tripRes.error;
      if (itemsRes.error) throw itemsRes.error;
      setTrip(tripRes.data as Trip);
      setItems(((itemsRes.data ?? []) as unknown as TripItem[]).filter((t) => t.item));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this trip.');
    }
  }, [getClient, id]);

  useEffect(() => {
    load();
    ensureClosetLoaded(getToken).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const packedCount = items.filter((i) => i.packed).length;
  const grouped = GROUPS
    .map((g) => ({ ...g, rows: items.filter((i) => i.item.category === g.key) }))
    .filter((g) => g.rows.length > 0);
  const notListed = closetItems.filter((ci) => !items.some((t) => t.item_id === ci.id));

  const togglePacked = async (row: TripItem) => {
    Haptics.selectionAsync();
    const next = !row.packed;
    setItems((list) => list.map((r) => (r.id === row.id ? { ...r, packed: next } : r)));
    try {
      const client = await getClient();
      const { error: updateError } = await client.from('trip_items').update({ packed: next }).eq('id', row.id);
      if (updateError) throw updateError;
    } catch {
      setItems((list) => list.map((r) => (r.id === row.id ? { ...r, packed: !next } : r)));
    }
  };

  const removeRow = async (row: TripItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setItems((list) => list.filter((r) => r.id !== row.id));
    try {
      const client = await getClient();
      const { error: deleteError } = await client.from('trip_items').delete().eq('id', row.id);
      if (deleteError) throw deleteError;
    } catch {
      load();
    }
  };

  const addItem = async (item: ClosetItem) => {
    if (!userId) return;
    Haptics.selectionAsync();
    try {
      const client = await getClient();
      const { error: insertError } = await client
        .from('trip_items')
        .insert({ user_id: userId, trip_id: id, item_id: item.id });
      if (insertError) throw insertError;
      await load();
    } catch (e) {
      Alert.alert('Not added', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const regenerate = () => {
    Alert.alert('Rebuild the list?', 'The AI picks a fresh set of items. Anything you ticked as packed stays ticked.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Rebuild',
        onPress: async () => {
          setRegenerating(true);
          try {
            await invokeFunction(await getClient(), 'wardrobe-assist', { action: 'packing', tripId: id });
            await load();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (e) {
            Alert.alert('Not rebuilt', e instanceof Error ? e.message : 'Please try again.');
          } finally {
            setRegenerating(false);
          }
        },
      },
    ]);
  };

  const deleteTrip = () => {
    Alert.alert('Delete this trip?', 'The packing list is removed. Your clothes stay in your wardrobe.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const client = await getClient();
            const { error: deleteError } = await client.from('trips').delete().eq('id', id);
            if (deleteError) throw deleteError;
            router.back();
          } catch (e) {
            Alert.alert('Not deleted', e instanceof Error ? e.message : 'Please try again.');
          }
        },
      },
    ]);
  };

  if (!trip) {
    return (
      <SafeAreaView style={styles.center}>
        {error ? <Text style={styles.muted}>{error}</Text> : <ActivityIndicator color={colors.textSecondary} />}
      </SafeAreaView>
    );
  }

  const [y, m, d] = trip.start_date.split('-').map(Number);
  const endDate = isoDate(new Date(y, m - 1, d + trip.nights));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.headerSide} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{trip.name}</Text>
        <TouchableOpacity onPress={deleteTrip} hitSlop={8} style={[styles.headerSide, { alignItems: 'flex-end' }]} accessibilityLabel="Delete trip">
          <Ionicons name="trash-outline" size={21} color={Colors.danger} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.summary}>
          <Text style={styles.summaryDates}>
            {formatDay(trip.start_date)} – {formatDay(endDate)}
          </Text>
          <Text style={styles.muted}>
            {trip.nights} night{trip.nights === 1 ? '' : 's'}
            {trip.destination ? ` · ${trip.destination}` : ''}
            {trip.purpose ? ` · ${trip.purpose}` : ''}
          </Text>
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${items.length ? (packedCount / items.length) * 100 : 0}%` }]} />
            </View>
            <Text style={styles.progressText}>{packedCount}/{items.length} packed</Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.ghostButton} onPress={() => setPickerOpen(true)}>
            <Ionicons name="add" size={18} color={colors.text} />
            <Text style={styles.ghostText}>Add item</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostButton} onPress={regenerate} disabled={regenerating}>
            {regenerating ? <ActivityIndicator size="small" color={Colors.accent} /> : <Ionicons name="sparkles-outline" size={18} color={Colors.accent} />}
            <Text style={styles.ghostText}>{regenerating ? 'Rebuilding…' : 'Rebuild with AI'}</Text>
          </TouchableOpacity>
        </View>

        {items.length === 0 ? (
          <Text style={styles.muted}>No items yet. Tap "Rebuild with AI" or add items yourself.</Text>
        ) : (
          grouped.map((group) => (
            <View key={group.key} style={styles.group}>
              <Text style={styles.groupTitle}>{group.label}</Text>
              {group.rows.map((row) => (
                <View key={row.id} style={styles.row}>
                  <Pressable
                    style={styles.rowMain}
                    onPress={() => togglePacked(row)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: row.packed }}
                  >
                    <Ionicons
                      name={row.packed ? 'checkmark-circle' : 'ellipse-outline'}
                      size={26}
                      color={row.packed ? Colors.success : colors.textTertiary}
                    />
                    <Image source={row.item.image_url} style={[styles.thumb, row.packed && { opacity: 0.5 }]} contentFit="contain" />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowName, row.packed && styles.rowNamePacked]} numberOfLines={1}>
                        {row.item.name || row.item.category}
                      </Text>
                      {row.reason ? <Text style={styles.rowReason} numberOfLines={1}>{row.reason}</Text> : null}
                    </View>
                  </Pressable>
                  <TouchableOpacity onPress={() => removeRow(row)} hitSlop={8} style={styles.removeButton} accessibilityLabel="Remove from list">
                    <Ionicons name="close" size={18} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ))
        )}

        {trip.extras.length > 0 ? (
          <View style={styles.group}>
            <Text style={styles.groupTitle}>Don't forget</Text>
            {trip.extras.map((extra) => (
              <View key={extra} style={styles.extraRow}>
                <View style={styles.bullet} />
                <Text style={styles.extraText}>{extra}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPickerOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Add from your wardrobe</Text>
          {notListed.length === 0 ? (
            <Text style={styles.muted}>Everything in your wardrobe is already on this list.</Text>
          ) : (
            <FlatList
              data={notListed}
              keyExtractor={(i) => i.id}
              numColumns={4}
              style={{ maxHeight: 420 }}
              columnWrapperStyle={{ gap: 8 }}
              contentContainerStyle={{ gap: 8 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.pickCell} onPress={() => addItem(item)} accessibilityLabel={`Add ${item.name || item.category}`}>
                  <Image source={item.image_url} style={styles.pickImage} contentFit="contain" />
                </TouchableOpacity>
              )}
            />
          )}
          <TouchableOpacity style={styles.doneButton} onPress={() => setPickerOpen(false)}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  center: { flex: 1, backgroundColor: c.background, justifyContent: 'center', alignItems: 'center', padding: Spacing.four },
  muted: { fontSize: 14, lineHeight: 20, color: c.textSecondary },
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
  scroll: { padding: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.three },
  summary: { gap: 4 },
  summaryDates: { fontSize: 22, fontWeight: '700', color: c.text, letterSpacing: -0.4 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: c.backgroundElement, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.success },
  progressText: { fontSize: 13, color: c.textSecondary, fontVariant: ['tabular-nums'] },
  actionsRow: { flexDirection: 'row', gap: Spacing.two },
  ghostButton: {
    flex: 1,
    minHeight: 46,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: c.border,
  },
  ghostText: { fontSize: 14, fontWeight: '600', color: c.text },
  group: { gap: 6 },
  groupTitle: { fontSize: 12, fontWeight: '700', color: c.textSecondary, letterSpacing: 0.6, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60 },
  thumb: { width: 48, height: 48, borderRadius: Radius.small, backgroundColor: c.backgroundElement },
  rowName: { fontSize: 15, fontWeight: '600', color: c.text, textTransform: 'capitalize' },
  rowNamePacked: { color: c.textTertiary, textDecorationLine: 'line-through' },
  rowReason: { fontSize: 12, color: c.textSecondary, marginTop: 2 },
  removeButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  extraRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.accent },
  extraText: { fontSize: 15, color: c.text },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: c.border, alignSelf: 'center' },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: c.text },
  pickCell: { flex: 1, maxWidth: '25%', aspectRatio: 1, borderRadius: Radius.small, backgroundColor: c.backgroundElement, overflow: 'hidden' },
  pickImage: { width: '100%', height: '100%' },
  doneButton: { minHeight: 48, borderRadius: Radius.button, backgroundColor: c.text, justifyContent: 'center', alignItems: 'center' },
  doneText: { color: c.background, fontSize: 16, fontWeight: '700' },
});
