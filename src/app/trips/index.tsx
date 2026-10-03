import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
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
import { formatDay, isoDate } from '@/utils/outfits';
import { todayISO } from '@/utils/wearLog';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useThemeColors, type ThemeColors } from '@/hooks/useThemeColors';
import type { Trip } from '@/types';

const START_DAYS = 60;

function tripRange(trip: Trip): string {
  const [y, m, d] = trip.start_date.split('-').map(Number);
  const end = isoDate(new Date(y, m - 1, d + trip.nights));
  return `${formatDay(trip.start_date, { month: 'short', day: 'numeric' })} – ${formatDay(end, { month: 'short', day: 'numeric' })}`;
}

export default function TripsScreen() {
  const router = useRouter();
  const { getToken, userId } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', destination: '', purpose: '', startDate: todayISO(), nights: 3 });

  const startDays = useMemo(() => {
    const now = new Date();
    return Array.from({ length: START_DAYS }, (_, i) => isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)));
  }, []);

  const getClient = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error('Not signed in');
    return createAuthenticatedClient(token);
  }, [getToken]);

  const load = useCallback(async () => {
    try {
      const client = await getClient();
      const { data, error } = await client.from('trips').select('*').order('start_date', { ascending: false });
      if (error) throw error;
      setTrips((data ?? []) as Trip[]);
    } catch (e) {
      Alert.alert('Could not load trips', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [getClient]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const today = todayISO();
  const upcoming = trips.filter((t) => {
    const [y, m, d] = t.start_date.split('-').map(Number);
    return isoDate(new Date(y, m - 1, d + t.nights)) >= today;
  });
  const past = trips.filter((t) => !upcoming.includes(t));

  const handleCreate = async () => {
    if (!userId) return;
    const name = form.name.trim() || form.destination.trim();
    if (!name) {
      Alert.alert('Name your trip', 'Add a trip name or a destination.');
      return;
    }
    setCreating(true);
    try {
      const client = await getClient();
      const { data, error } = await client
        .from('trips')
        .insert({
          user_id: userId,
          name: name.slice(0, 60),
          destination: form.destination.trim(),
          purpose: form.purpose.trim(),
          start_date: form.startDate,
          nights: form.nights,
        })
        .select()
        .single();
      if (error) throw error;
      const trip = data as Trip;

      try {
        await invokeFunction(client, 'wardrobe-assist', { action: 'packing', tripId: trip.id });
      } catch (e) {
        Alert.alert(
          'Trip saved',
          `The packing list couldn't be generated (${e instanceof Error ? e.message : 'error'}). You can try again from the trip.`,
        );
      }
      setSheetOpen(false);
      setForm({ name: '', destination: '', purpose: '', startDate: todayISO(), nights: 3 });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push(`/trips/${trip.id}` as never);
    } catch (e) {
      Alert.alert('Trip not created', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const renderTrip = (trip: Trip) => (
    <TouchableOpacity
      key={trip.id}
      style={styles.tripRow}
      onPress={() => router.push(`/trips/${trip.id}` as never)}
      activeOpacity={0.85}
    >
      <View style={styles.tripIcon}>
        <Ionicons name="airplane-outline" size={20} color={Colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.tripName} numberOfLines={1}>{trip.name}</Text>
        <Text style={styles.tripMeta} numberOfLines={1}>
          {tripRange(trip)} · {trip.nights} night{trip.nights === 1 ? '' : 's'}
          {trip.destination && trip.destination !== trip.name ? ` · ${trip.destination}` : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.headerSide} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trips</Text>
        <TouchableOpacity onPress={() => setSheetOpen(true)} hitSlop={8} style={[styles.headerSide, { alignItems: 'flex-end' }]} accessibilityLabel="New trip">
          <Ionicons name="add" size={26} color={colors.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.textSecondary} /></View>
      ) : trips.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="airplane-outline" size={32} color={colors.textTertiary} />
          </View>
          <Text style={styles.emptyTitle}>No trips yet</Text>
          <Text style={styles.emptyText}>
            Add a trip and DDrobe builds a packing list from your own clothes. Tick things off as you pack.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => setSheetOpen(true)}>
            <Text style={styles.primaryButtonText}>Plan a trip</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {upcoming.length > 0 && <Text style={styles.sectionTitle}>Upcoming</Text>}
          {upcoming.map(renderTrip)}
          {past.length > 0 && <Text style={styles.sectionTitle}>Past</Text>}
          {past.map(renderTrip)}
        </ScrollView>
      )}

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => !creating && setSheetOpen(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.backdrop} onPress={() => !creating && setSheetOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>New trip</Text>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: Spacing.three }}>
              <View style={styles.field}>
                <Text style={styles.label}>Destination</Text>
                <TextInput
                  style={styles.input}
                  value={form.destination}
                  onChangeText={(t) => setForm((f) => ({ ...f, destination: t }))}
                  placeholder="e.g. Lisbon"
                  placeholderTextColor={colors.textTertiary}
                  maxLength={80}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Trip name <Text style={styles.optional}>optional</Text></Text>
                <TextInput
                  style={styles.input}
                  value={form.name}
                  onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
                  placeholder="e.g. Sam's wedding weekend"
                  placeholderTextColor={colors.textTertiary}
                  maxLength={60}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Leaving</Text>
                <FlatList
                  horizontal
                  data={startDays}
                  keyExtractor={(d) => d}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8 }}
                  renderItem={({ item: date }) => {
                    const active = form.startDate === date;
                    return (
                      <Pressable
                        style={[styles.dayChip, active && styles.dayChipActive]}
                        onPress={() => { Haptics.selectionAsync(); setForm((f) => ({ ...f, startDate: date })); }}
                      >
                        <Text style={[styles.dayWeek, active && styles.dayActiveText]}>
                          {date === todayISO() ? 'Today' : formatDay(date, { weekday: 'short' })}
                        </Text>
                        <Text style={[styles.dayNum, active && styles.dayActiveText]}>{formatDay(date, { day: 'numeric' })}</Text>
                        <Text style={[styles.dayMonth, active && styles.dayActiveText]}>{formatDay(date, { month: 'short' })}</Text>
                      </Pressable>
                    );
                  }}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>Nights</Text>
                <View style={styles.stepper}>
                  <TouchableOpacity
                    style={styles.stepButton}
                    onPress={() => setForm((f) => ({ ...f, nights: Math.max(1, f.nights - 1) }))}
                    accessibilityLabel="Fewer nights"
                  >
                    <Ionicons name="remove" size={20} color={colors.text} />
                  </TouchableOpacity>
                  <Text style={styles.stepValue}>{form.nights}</Text>
                  <TouchableOpacity
                    style={styles.stepButton}
                    onPress={() => setForm((f) => ({ ...f, nights: Math.min(30, f.nights + 1) }))}
                    accessibilityLabel="More nights"
                  >
                    <Ionicons name="add" size={20} color={colors.text} />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>What are you doing? <Text style={styles.optional}>optional</Text></Text>
                <TextInput
                  style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]}
                  value={form.purpose}
                  onChangeText={(t) => setForm((f) => ({ ...f, purpose: t }))}
                  placeholder="Beach days, one fancy dinner, lots of walking"
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  maxLength={200}
                />
              </View>
            </ScrollView>
            <TouchableOpacity style={[styles.primaryButton, creating && { opacity: 0.6 }]} onPress={handleCreate} disabled={creating}>
              {creating ? (
                <>
                  <ActivityIndicator color={colors.background} />
                  <Text style={styles.primaryButtonText}>Building packing list…</Text>
                </>
              ) : (
                <Text style={styles.primaryButtonText}>Create packing list</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.four, gap: 10 },
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
  list: { padding: Spacing.three, gap: 8, paddingBottom: Spacing.six },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: c.textSecondary, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 8 },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    minHeight: 64,
    borderRadius: Radius.card,
    backgroundColor: c.backgroundElement,
  },
  tripIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(184,147,106,0.14)', justifyContent: 'center', alignItems: 'center' },
  tripName: { fontSize: 16, fontWeight: '600', color: c.text },
  tripMeta: { fontSize: 13, color: c.textSecondary, marginTop: 2 },
  emptyIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: c.backgroundElement, justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: c.text },
  emptyText: { fontSize: 14, lineHeight: 20, color: c.textSecondary, textAlign: 'center', marginBottom: 8 },
  primaryButton: {
    minHeight: 52,
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'stretch',
    borderRadius: Radius.button,
    backgroundColor: c.text,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
  },
  primaryButtonText: { color: c.background, fontSize: 16, fontWeight: '700' },

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
  field: { gap: 6 },
  label: { fontSize: 12, fontWeight: '600', color: c.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase' },
  optional: { textTransform: 'none', fontWeight: '400', color: c.textTertiary, letterSpacing: 0 },
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
  dayChip: { width: 56, height: 72, borderRadius: Radius.button, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  dayChipActive: { backgroundColor: c.text, borderColor: c.text },
  dayWeek: { fontSize: 11, fontWeight: '600', color: c.textSecondary },
  dayNum: { fontSize: 18, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] },
  dayMonth: { fontSize: 10, color: c.textTertiary },
  dayActiveText: { color: c.background },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  stepButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.border, justifyContent: 'center', alignItems: 'center' },
  stepValue: { minWidth: 32, textAlign: 'center', fontSize: 20, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] },
});
