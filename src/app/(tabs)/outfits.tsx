import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import * as Haptics from 'expo-haptics';

import { OutfitCollage } from '@/components/OutfitCollage';
import {
  fetchPlans,
  fetchSavedOutfits,
  fetchWornDays,
  formatDay,
  isoDate,
  planOutfit,
  removePlan,
  type WornDay,
} from '@/utils/outfits';
import { createAuthenticatedClient } from '@/utils/supabase';
import { todayISO } from '@/utils/wearLog';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useThemeColors, type ThemeColors } from '@/hooks/useThemeColors';
import type { PlannedOutfit, SavedOutfit } from '@/types';

type View_ = 'saved' | 'calendar';
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(isoDate(new Date(year, month, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function OutfitsScreen() {
  const router = useRouter();
  const { getToken, userId } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [view, setView] = useState<View_>('saved');
  const [outfits, setOutfits] = useState<SavedOutfit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [plans, setPlans] = useState<PlannedOutfit[]>([]);
  const [worn, setWorn] = useState<WornDay[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [planBusy, setPlanBusy] = useState(false);

  const grid = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const monthRange = useMemo(() => {
    const from = isoDate(new Date(cursor.year, cursor.month, 1));
    const to = isoDate(new Date(cursor.year, cursor.month + 1, 0));
    return { from, to };
  }, [cursor]);

  const getClient = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error('Not signed in');
    return createAuthenticatedClient(token);
  }, [getToken]);

  const load = useCallback(async () => {
    try {
      setError(null);
      const client = await getClient();
      const [o, p, w] = await Promise.all([
        fetchSavedOutfits(client),
        fetchPlans(client, monthRange.from, monthRange.to),
        fetchWornDays(client, monthRange.from, monthRange.to),
      ]);
      setOutfits(o);
      setPlans(p);
      setWorn(w);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your outfits.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getClient, monthRange]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const planOn = (date: string) => plans.find((p) => p.plan_date === date);
  const wornOn = (date: string) => worn.find((w) => w.date === date);
  const today = todayISO();

  const changeMonth = (delta: number) => {
    Haptics.selectionAsync();
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const choosePlan = async (outfit: SavedOutfit) => {
    if (!userId) return;
    setPlanBusy(true);
    try {
      const client = await getClient();
      await planOutfit(client, userId, outfit.id, selectedDate);
      setPlans(await fetchPlans(client, monthRange.from, monthRange.to));
      setPickerOpen(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Not planned', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setPlanBusy(false);
    }
  };

  const clearPlan = async () => {
    try {
      const client = await getClient();
      await removePlan(client, selectedDate);
      setPlans(await fetchPlans(client, monthRange.from, monthRange.to));
    } catch (e) {
      Alert.alert('Not removed', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const selectedPlan = planOn(selectedDate);
  const selectedWorn = wornOn(selectedDate);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Outfits</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/outfit-builder' as never);
          }}
          accessibilityLabel="Build an outfit"
        >
          <Ionicons name="add" size={22} color={colors.background} />
        </TouchableOpacity>
      </View>

      <View style={styles.segment}>
        {(['saved', 'calendar'] as View_[]).map((v) => (
          <Pressable
            key={v}
            onPress={() => { Haptics.selectionAsync(); setView(v); }}
            style={[styles.segmentItem, view === v && styles.segmentItemActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: view === v }}
          >
            <Text style={[styles.segmentText, view === v && styles.segmentTextActive]}>
              {v === 'saved' ? 'Saved' : 'Calendar'}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? (
        <TouchableOpacity style={styles.errorBanner} onPress={() => { setLoading(true); load(); }}>
          <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
          <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
          <Text style={styles.errorRetry}>Retry</Text>
        </TouchableOpacity>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      ) : view === 'saved' ? (
        <FlatList
          data={outfits}
          keyExtractor={(o) => o.id}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="albums-outline" size={32} color={colors.textTertiary} />
              </View>
              <Text style={styles.emptyTitle}>No saved outfits yet</Text>
              <Text style={styles.emptyText}>
                Build one from your clothes, or tap the heart on a Stylist suggestion to keep it.
              </Text>
              <TouchableOpacity style={styles.emptyAction} onPress={() => router.push('/outfit-builder' as never)}>
                <Ionicons name="add" size={16} color={Colors.accent} />
                <Text style={styles.emptyActionText}>Build an outfit</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => router.push(`/outfit/${item.id}` as never)}
            >
              <OutfitCollage {...item} radius={Radius.card} />
              <View style={styles.cardMeta}>
                <Text style={styles.cardName} numberOfLines={1}>{item.name || 'Outfit'}</Text>
                {item.source === 'ai' ? (
                  <View style={styles.aiBadge}>
                    <Ionicons name="sparkles" size={10} color={Colors.accent} />
                    <Text style={styles.aiBadgeText}>Stylist</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          )}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.calendarContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.monthRow}>
            <TouchableOpacity onPress={() => changeMonth(-1)} hitSlop={8} style={styles.monthArrow} accessibilityLabel="Previous month">
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.monthTitle}>
              {new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </Text>
            <TouchableOpacity onPress={() => changeMonth(1)} hitSlop={8} style={styles.monthArrow} accessibilityLabel="Next month">
              <Ionicons name="chevron-forward" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((d) => <Text key={d} style={styles.weekday}>{d}</Text>)}
          </View>

          <View style={styles.monthGrid}>
            {grid.map((date, i) => {
              if (!date) return <View key={`blank-${i}`} style={styles.dayCell} />;
              const selected = date === selectedDate;
              const isToday = date === today;
              const hasPlan = Boolean(planOn(date));
              const hasWorn = Boolean(wornOn(date));
              return (
                <Pressable
                  key={date}
                  style={styles.dayCell}
                  onPress={() => { Haptics.selectionAsync(); setSelectedDate(date); }}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatDay(date)}${hasWorn ? ', outfit logged' : ''}${hasPlan ? ', outfit planned' : ''}`}
                >
                  <View style={[styles.dayCircle, selected && styles.dayCircleSelected, isToday && !selected && styles.dayCircleToday]}>
                    <Text style={[styles.dayText, selected && styles.dayTextSelected]}>{Number(date.slice(8))}</Text>
                  </View>
                  <View style={styles.dotRow}>
                    {hasWorn ? <View style={[styles.dot, { backgroundColor: colors.text }]} /> : null}
                    {hasPlan ? <View style={[styles.dot, { backgroundColor: Colors.accent }]} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.legend}>
            <View style={[styles.dot, { backgroundColor: colors.text }]} />
            <Text style={styles.legendText}>Worn</Text>
            <View style={[styles.dot, { backgroundColor: Colors.accent, marginLeft: 12 }]} />
            <Text style={styles.legendText}>Planned</Text>
          </View>

          <View style={styles.dayPanel}>
            <Text style={styles.dayPanelTitle}>
              {selectedDate === today ? 'Today' : formatDay(selectedDate, { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>

            <Text style={styles.panelLabel}>Planned</Text>
            {selectedPlan ? (
              <View style={styles.planCard}>
                <TouchableOpacity
                  style={styles.planCardMain}
                  onPress={() => router.push(`/outfit/${selectedPlan.outfit_id}` as never)}
                  activeOpacity={0.85}
                >
                  <OutfitCollage {...selectedPlan.outfit} style={styles.planThumb} radius={Radius.small} />
                  <Text style={styles.planName} numberOfLines={2}>{selectedPlan.outfit?.name || 'Outfit'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={clearPlan} hitSlop={8} style={styles.planRemove} accessibilityLabel="Remove plan">
                  <Ionicons name="close-circle" size={22} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.planEmpty}
                onPress={() => {
                  if (outfits.length === 0) {
                    Alert.alert('No saved outfits', 'Build or save an outfit first, then plan it here.');
                    return;
                  }
                  setPickerOpen(true);
                }}
              >
                <Ionicons name="add-circle-outline" size={18} color={Colors.accent} />
                <Text style={styles.planEmptyText}>Plan an outfit</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.panelLabel}>Worn</Text>
            {selectedWorn ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {selectedWorn.items.map((item) => (
                  <TouchableOpacity key={item.id} onPress={() => router.push(`/item/${item.id}` as never)}>
                    <Image source={item.image_url} style={styles.wornThumb} contentFit="contain" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.panelEmpty}>
                {selectedDate > today ? 'Nothing yet.' : 'Nothing logged. Use "Wore it today" on an item or outfit.'}
              </Text>
            )}
          </View>
        </ScrollView>
      )}

      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setPickerOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Plan for {formatDay(selectedDate)}</Text>
          <FlatList
            data={outfits}
            keyExtractor={(o) => o.id}
            style={{ maxHeight: 420 }}
            contentContainerStyle={{ gap: 8 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.sheetRow} onPress={() => choosePlan(item)} disabled={planBusy}>
                <OutfitCollage {...item} style={styles.sheetThumb} radius={Radius.small} />
                <Text style={styles.sheetRowText} numberOfLines={1}>{item.name || 'Outfit'}</Text>
                {planBusy ? <ActivityIndicator size="small" color={Colors.accent} /> : <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />}
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
  },
  headerTitle: { fontSize: 28, fontWeight: '700', color: c.text, letterSpacing: -0.5 },
  addButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.text, justifyContent: 'center', alignItems: 'center' },

  segment: {
    flexDirection: 'row',
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.three,
    padding: 3,
    borderRadius: Radius.button,
    backgroundColor: c.backgroundElement,
  },
  segmentItem: { flex: 1, minHeight: 38, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  segmentItemActive: { backgroundColor: c.background },
  segmentText: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
  segmentTextActive: { color: c.text },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.two,
    padding: 10,
    borderRadius: Radius.button,
    backgroundColor: 'rgba(239,68,68,0.10)',
  },
  errorText: { flex: 1, color: Colors.danger, fontSize: 13 },
  errorRetry: { color: Colors.danger, fontSize: 13, fontWeight: '700' },

  gridContent: { paddingHorizontal: Spacing.four, paddingBottom: 120, flexGrow: 1 },
  gridRow: { gap: 12, marginBottom: 16 },
  card: { flex: 1, maxWidth: '50%', gap: 8 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardName: { flex: 1, fontSize: 14, fontWeight: '600', color: c.text },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(184,147,106,0.12)',
  },
  aiBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.accent },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: Spacing.four, gap: 8 },
  emptyIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: c.backgroundElement,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: c.text },
  emptyText: { fontSize: 14, lineHeight: 20, color: c.textSecondary, textAlign: 'center' },
  emptyAction: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: Colors.accentLight,
  },
  emptyActionText: { fontSize: 14, fontWeight: '600', color: Colors.accent },

  calendarContent: { paddingHorizontal: Spacing.four, paddingBottom: 120 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.two },
  monthArrow: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  monthTitle: { fontSize: 17, fontWeight: '700', color: c.text },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: c.textTertiary, paddingVertical: 6 },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, height: 52, alignItems: 'center', justifyContent: 'center' },
  dayCircle: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  dayCircleSelected: { backgroundColor: c.text },
  dayCircleToday: { borderWidth: 1.5, borderColor: Colors.accent },
  dayText: { fontSize: 15, fontWeight: '500', color: c.text, fontVariant: ['tabular-nums'] },
  dayTextSelected: { color: c.background, fontWeight: '700' },
  dotRow: { flexDirection: 'row', gap: 3, height: 6, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, marginBottom: Spacing.three },
  legendText: { fontSize: 12, color: c.textSecondary },

  dayPanel: { gap: 8, padding: Spacing.three, borderRadius: Radius.card, backgroundColor: c.backgroundElement },
  dayPanelTitle: { fontSize: 17, fontWeight: '700', color: c.text, marginBottom: 4 },
  panelLabel: { fontSize: 11, fontWeight: '700', color: c.textSecondary, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 4 },
  panelEmpty: { fontSize: 14, color: c.textTertiary },
  planCard: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planCardMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  planThumb: { width: 64 },
  planName: { flex: 1, fontSize: 15, fontWeight: '600', color: c.text },
  planRemove: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  planEmpty: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  planEmptyText: { fontSize: 15, fontWeight: '600', color: Colors.accent },
  wornThumb: { width: 64, height: 64, borderRadius: Radius.small, backgroundColor: c.background },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
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
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 },
  sheetThumb: { width: 56 },
  sheetRowText: { flex: 1, fontSize: 15, fontWeight: '600', color: c.text },
});
