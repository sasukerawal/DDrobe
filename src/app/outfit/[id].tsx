import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

import { OutfitCollage } from '@/components/OutfitCollage';
import {
  deleteOutfit,
  fetchPlans,
  fetchSavedOutfit,
  formatDay,
  isoDate,
  outfitItems,
  planOutfit,
  removePlan,
  wearOutfit,
} from '@/utils/outfits';
import { createAuthenticatedClient } from '@/utils/supabase';
import { todayISO } from '@/utils/wearLog';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useThemeColors, type ThemeColors } from '@/hooks/useThemeColors';
import type { PlannedOutfit, SavedOutfit } from '@/types';

const PLAN_DAYS = 14;

const CATEGORY_LABEL: Record<string, string> = {
  top: 'Top',
  bottom: 'Bottom',
  shoe: 'Shoes',
  outerwear: 'Outerwear',
  accessory: 'Accessory',
};

export default function OutfitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getToken, userId } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [outfit, setOutfit] = useState<SavedOutfit | null>(null);
  const [plans, setPlans] = useState<PlannedOutfit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [wearing, setWearing] = useState(false);
  const [wornToday, setWornToday] = useState(false);
  const [busyDate, setBusyDate] = useState<string | null>(null);

  const days = useMemo(() => {
    const start = new Date();
    return Array.from({ length: PLAN_DAYS }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return isoDate(d);
    });
  }, []);

  const getClient = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error('Not signed in');
    return createAuthenticatedClient(token);
  }, [getToken]);

  useEffect(() => {
    (async () => {
      try {
        const client = await getClient();
        const [o, p] = await Promise.all([
          fetchSavedOutfit(client, id),
          fetchPlans(client, days[0], days[days.length - 1]),
        ]);
        setOutfit(o);
        setPlans(p);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load this outfit.');
      }
    })();
  }, [id, days, getClient]);

  const planFor = (date: string) => plans.find((p) => p.plan_date === date);

  const handleWear = async () => {
    if (!outfit || !userId) return;
    setWearing(true);
    try {
      await wearOutfit(await getClient(), userId, outfit);
      setWornToday(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Not logged', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setWearing(false);
    }
  };

  const togglePlan = async (date: string) => {
    if (!outfit || !userId) return;
    const existing = planFor(date);
    const apply = async () => {
      Haptics.selectionAsync();
      setBusyDate(date);
      try {
        const client = await getClient();
        if (existing?.outfit_id === outfit.id) await removePlan(client, date);
        else await planOutfit(client, userId, outfit.id, date);
        setPlans(await fetchPlans(client, days[0], days[days.length - 1]));
      } catch (e) {
        Alert.alert('Not updated', e instanceof Error ? e.message : 'Please try again.');
      } finally {
        setBusyDate(null);
      }
    };

    if (existing && existing.outfit_id !== outfit.id) {
      Alert.alert(
        'Replace the plan?',
        `${formatDay(date)} already has "${existing.outfit?.name || 'another outfit'}" planned.`,
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Replace', onPress: apply }],
      );
    } else {
      apply();
    }
  };

  const handleDelete = () => {
    if (!outfit) return;
    Alert.alert('Delete this outfit?', 'Your clothes stay in your wardrobe. Any plans for this outfit are removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteOutfit(await getClient(), outfit.id);
            router.back();
          } catch (e) {
            Alert.alert('Not deleted', e instanceof Error ? e.message : 'Please try again.');
          }
        },
      },
    ]);
  };

  if (!outfit) {
    return (
      <SafeAreaView style={styles.center}>
        {error ? (
          <>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => router.back()} style={styles.textButton}>
              <Text style={styles.textButtonLabel}>Go back</Text>
            </TouchableOpacity>
          </>
        ) : (
          <ActivityIndicator color={colors.textSecondary} />
        )}
      </SafeAreaView>
    );
  }

  const today = todayISO();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.headerSide} accessibilityLabel="Close">
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{outfit.name || 'Outfit'}</Text>
        <TouchableOpacity onPress={handleDelete} hitSlop={8} style={[styles.headerSide, { alignItems: 'flex-end' }]} accessibilityLabel="Delete outfit">
          <Ionicons name="trash-outline" size={21} color={Colors.danger} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <OutfitCollage {...outfit} radius={Radius.card} />

        {outfit.description ? <Text style={styles.description}>{outfit.description}</Text> : null}

        <TouchableOpacity
          style={[styles.wearButton, wornToday && styles.wearButtonDone]}
          onPress={handleWear}
          disabled={wearing || wornToday}
          activeOpacity={0.85}
        >
          {wearing ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <>
              <Ionicons name={wornToday ? 'checkmark-circle' : 'shirt-outline'} size={18} color={wornToday ? Colors.accent : colors.background} />
              <Text style={[styles.wearText, wornToday && styles.wearTextDone]}>
                {wornToday ? 'Logged for today' : 'Wore this today'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Plan for a day</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
            {days.map((date) => {
              const plan = planFor(date);
              const mine = plan?.outfit_id === outfit.id;
              const taken = plan && !mine;
              return (
                <Pressable
                  key={date}
                  onPress={() => togglePlan(date)}
                  disabled={busyDate !== null}
                  style={[styles.dayChip, mine && styles.dayChipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: mine }}
                >
                  {busyDate === date ? (
                    <ActivityIndicator size="small" color={mine ? colors.background : Colors.accent} />
                  ) : (
                    <>
                      <Text style={[styles.dayWeek, mine && styles.dayTextActive]}>
                        {date === today ? 'Today' : formatDay(date, { weekday: 'short' })}
                      </Text>
                      <Text style={[styles.dayNum, mine && styles.dayTextActive]}>
                        {formatDay(date, { day: 'numeric' })}
                      </Text>
                      {taken ? <View style={styles.takenDot} /> : null}
                    </>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={styles.hint}>Tap a day to plan this outfit. A dot means another outfit is planned.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pieces</Text>
          {outfitItems(outfit).map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.pieceRow}
              onPress={() => router.push(`/item/${item.id}` as never)}
              activeOpacity={0.8}
            >
              <Image source={item.image_url} style={styles.pieceImage} contentFit="contain" />
              <View style={{ flex: 1 }}>
                <Text style={styles.pieceName} numberOfLines={1}>{item.name || CATEGORY_LABEL[item.category]}</Text>
                <Text style={styles.pieceMeta} numberOfLines={1}>
                  {[CATEGORY_LABEL[item.category], item.color, item.is_in_wash ? 'In the wash' : null].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  center: { flex: 1, backgroundColor: c.background, justifyContent: 'center', alignItems: 'center', gap: Spacing.three, padding: Spacing.four },
  errorText: { color: c.textSecondary, fontSize: 15, textAlign: 'center' },
  textButton: { padding: 10 },
  textButtonLabel: { color: Colors.accent, fontSize: 15, fontWeight: '600' },
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
  description: { fontSize: 15, lineHeight: 22, color: c.textSecondary },
  wearButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: Radius.button,
    backgroundColor: c.text,
    borderWidth: 1.5,
    borderColor: c.text,
  },
  wearButtonDone: { backgroundColor: 'transparent', borderColor: Colors.accent },
  wearText: { color: c.background, fontSize: 16, fontWeight: '700' },
  wearTextDone: { color: Colors.accent },
  section: { gap: Spacing.two },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: c.textSecondary, letterSpacing: 0.6, textTransform: 'uppercase' },
  dayRow: { gap: 8 },
  dayChip: {
    width: 56,
    height: 64,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dayChipActive: { backgroundColor: c.text, borderColor: c.text },
  dayWeek: { fontSize: 11, fontWeight: '600', color: c.textSecondary },
  dayNum: { fontSize: 18, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] },
  dayTextActive: { color: c.background },
  takenDot: { position: 'absolute', bottom: 6, width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.accent },
  hint: { fontSize: 12, color: c.textTertiary },
  pieceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 8,
    borderRadius: Radius.card,
    backgroundColor: c.backgroundElement,
  },
  pieceImage: { width: 56, height: 56, borderRadius: Radius.small, backgroundColor: c.background },
  pieceName: { fontSize: 15, fontWeight: '600', color: c.text },
  pieceMeta: { fontSize: 12, color: c.textSecondary, marginTop: 2, textTransform: 'capitalize' },
});
