import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
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

import { ensureClosetLoaded } from '@/utils/closet';
import { colorSwatch, computeStats, type Breakdown, type ItemStat, type WardrobeStats, type WearRow } from '@/utils/stats';
import { formatDay } from '@/utils/outfits';
import { createAuthenticatedClient } from '@/utils/supabase';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useThemeColors, type ThemeColors } from '@/hooks/useThemeColors';

const CATEGORY_LABEL: Record<string, string> = {
  top: 'Tops', bottom: 'Bottoms', shoe: 'Shoes', outerwear: 'Outerwear', accessory: 'Accessories',
};

const PAGE_SIZE = 1000;

const RESALE_SITES = [
  { name: 'Vinted', url: 'https://www.vinted.com' },
  { name: 'Depop', url: 'https://www.depop.com' },
  { name: 'Poshmark', url: 'https://poshmark.com' },
];

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

export default function StatsScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [stats, setStats] = useState<WardrobeStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (force = false) => {
    try {
      setError(null);
      const items = await ensureClosetLoaded(getToken, force);
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      // Supabase caps each response at 1000 rows, so page through the full log.
      const client = createAuthenticatedClient(token);
      const wears: WearRow[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error: wearError } = await client
          .from('wear_log')
          .select('item_id, worn_on')
          .order('worn_on', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (wearError) throw wearError;
        wears.push(...((data ?? []) as WearRow[]));
        if (!data || data.length < PAGE_SIZE) break;
      }
      setStats(computeStats(items, wears));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your stats.');
    } finally {
      setRefreshing(false);
    }
  }, [getToken]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openItem = (id: string) => router.push(`/item/${id}` as never);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.headerSide} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Wardrobe stats</Text>
        <View style={styles.headerSide} />
      </View>

      {!stats ? (
        <View style={styles.center}>
          {error ? (
            <>
              <Text style={styles.muted}>{error}</Text>
              <TouchableOpacity onPress={() => load(true)} style={styles.retry}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </>
          ) : (
            <ActivityIndicator color={colors.textSecondary} />
          )}
        </View>
      ) : stats.totalItems === 0 ? (
        <View style={styles.center}>
          <Ionicons name="stats-chart-outline" size={36} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>No stats yet</Text>
          <Text style={styles.muted}>Add clothes and log what you wear to see your wardrobe in numbers.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
        >
          {/* Summary */}
          <View style={styles.summaryGrid}>
            <Summary label="Items" value={String(stats.totalItems)} styles={styles} />
            <Summary
              label="Wardrobe value"
              value={stats.pricedItems ? money(stats.totalValue) : '–'}
              note={stats.pricedItems < stats.totalItems ? `${stats.pricedItems} of ${stats.totalItems} priced` : undefined}
              styles={styles}
            />
            <Summary label="Wears, last 30 days" value={String(stats.wearsLast30)} styles={styles} />
            <Summary
              label="Worn in last 90 days"
              value={`${Math.round(stats.utilization90 * 100)}%`}
              note="of your items"
              styles={styles}
            />
          </View>

          {stats.wearsLast30 === 0 && stats.mostWorn.length === 0 ? (
            <View style={styles.tip}>
              <Ionicons name="bulb-outline" size={18} color={Colors.accent} />
              <Text style={styles.tipText}>
                Tap "Wore it today" on an item or outfit, or swipe right in Stylist, to start tracking what you wear.
              </Text>
            </View>
          ) : null}

          <Section title="Most worn" styles={styles}>
            {stats.mostWorn.length === 0 ? (
              <Text style={styles.muted}>Nothing logged yet.</Text>
            ) : (
              stats.mostWorn.map((s) => (
                <ItemRow key={s.item.id} stat={s} detail={`${s.wears} wear${s.wears === 1 ? '' : 's'}`} onPress={openItem} styles={styles} />
              ))
            )}
          </Section>

          {stats.bestValue.length > 0 ? (
            <Section title="Best value" subtitle="Lowest cost per wear" styles={styles}>
              {stats.bestValue.map((s) => (
                <ItemRow key={s.item.id} stat={s} detail={`${money(s.costPerWear!)} per wear`} onPress={openItem} styles={styles} />
              ))}
            </Section>
          ) : null}

          {stats.neverWorn.length > 0 ? (
            <Section title="Never worn" subtitle="Added over a month ago" styles={styles}>
              {stats.neverWorn.map((s) => (
                <ItemRow key={s.item.id} stat={s} detail="0 wears" onPress={openItem} styles={styles} />
              ))}
            </Section>
          ) : null}

          <Section title="Colours" styles={styles}>
            <Bars data={stats.colors.slice(0, 8)} swatch styles={styles} />
          </Section>

          <Section title="Categories" styles={styles}>
            <Bars data={stats.categories.map((c) => ({ ...c, label: CATEGORY_LABEL[c.label] ?? c.label }))} styles={styles} />
          </Section>

          {stats.unwornSixMonths.length > 0 ? (
            <Section title="Time to resell?" subtitle="Not worn in 6+ months" styles={styles}>
              {stats.unwornSixMonths.slice(0, 10).map((s) => (
                <ItemRow
                  key={s.item.id}
                  stat={s}
                  detail={s.lastWorn ? `Last worn ${formatDay(s.lastWorn, { month: 'short', year: 'numeric' })}` : 'Never worn'}
                  onPress={openItem}
                  styles={styles}
                />
              ))}
              <View style={styles.resaleRow}>
                {RESALE_SITES.map((site) => (
                  <TouchableOpacity key={site.name} style={styles.resaleChip} onPress={() => Linking.openURL(site.url)}>
                    <Text style={styles.resaleText}>{site.name}</Text>
                    <Ionicons name="open-outline" size={12} color={colors.textSecondary} />
                  </TouchableOpacity>
                ))}
              </View>
            </Section>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

type Styles = ReturnType<typeof createStyles>;

function Summary({ label, value, note, styles }: { label: string; value: string; note?: string; styles: Styles }) {
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
      {note ? <Text style={styles.summaryNote}>{note}</Text> : null}
    </View>
  );
}

function Section({ title, subtitle, styles, children }: { title: string; subtitle?: string; styles: Styles; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function ItemRow({ stat, detail, onPress, styles }: { stat: ItemStat; detail: string; onPress: (id: string) => void; styles: Styles }) {
  return (
    <TouchableOpacity style={styles.itemRow} onPress={() => onPress(stat.item.id)} activeOpacity={0.8}>
      <Image source={stat.item.image_url} style={styles.itemThumb} contentFit="contain" />
      <Text style={styles.itemName} numberOfLines={1}>{stat.item.name || stat.item.category}</Text>
      <Text style={styles.itemDetail}>{detail}</Text>
    </TouchableOpacity>
  );
}

function Bars({ data, swatch, styles }: { data: Breakdown[]; swatch?: boolean; styles: Styles }) {
  return (
    <View style={{ gap: 10 }}>
      {data.map((d) => (
        <View key={d.label} style={styles.barRow}>
          {swatch ? <View style={[styles.swatch, { backgroundColor: colorSwatch(d.label) }]} /> : null}
          <Text style={styles.barLabel} numberOfLines={1}>{d.label}</Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.max(d.share * 100, 4)}%` }]} />
          </View>
          <Text style={styles.barCount}>{d.count}</Text>
        </View>
      ))}
    </View>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, padding: Spacing.four },
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
  muted: { fontSize: 14, lineHeight: 20, color: c.textSecondary, textAlign: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: c.text },
  retry: { padding: 10 },
  retryText: { color: Colors.accent, fontWeight: '600', fontSize: 15 },
  scroll: { padding: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.four },

  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryCell: {
    flexGrow: 1,
    flexBasis: '45%',
    padding: Spacing.three,
    borderRadius: Radius.card,
    backgroundColor: c.backgroundElement,
    gap: 2,
  },
  summaryValue: { fontSize: 26, fontWeight: '700', color: c.text, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  summaryLabel: { fontSize: 13, color: c.textSecondary },
  summaryNote: { fontSize: 11, color: c.textTertiary },

  tip: {
    flexDirection: 'row',
    gap: 10,
    padding: Spacing.three,
    borderRadius: Radius.card,
    backgroundColor: 'rgba(184,147,106,0.10)',
  },
  tipText: { flex: 1, fontSize: 14, lineHeight: 20, color: c.text },

  section: { gap: Spacing.two },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: c.text },
  sectionSubtitle: { fontSize: 12, color: c.textTertiary },

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  itemThumb: { width: 48, height: 48, borderRadius: Radius.small, backgroundColor: c.backgroundElement },
  itemName: { flex: 1, fontSize: 15, fontWeight: '500', color: c.text, textTransform: 'capitalize' },
  itemDetail: { fontSize: 13, color: c.textSecondary, fontVariant: ['tabular-nums'] },

  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 14, height: 14, borderRadius: 7, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  barLabel: { width: 96, fontSize: 14, color: c.text, textTransform: 'capitalize' },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: c.backgroundElement, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4, backgroundColor: Colors.accent },
  barCount: { width: 28, textAlign: 'right', fontSize: 13, color: c.textSecondary, fontVariant: ['tabular-nums'] },

  resaleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  resaleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: c.border,
  },
  resaleText: { fontSize: 14, fontWeight: '600', color: c.text },
});
