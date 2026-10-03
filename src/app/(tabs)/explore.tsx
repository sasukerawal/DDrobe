import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { DropdownMenu, type MenuOption } from '@/components/DropdownMenu';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeIn,
  FadeOut,
  SlideInUp,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@clerk/expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { createAuthenticatedClient } from '@/utils/supabase';
import { useAppStore } from '@/store/useAppStore';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { useThemeColors, type ThemeColors } from '@/hooks/useThemeColors';
import type { ClosetItem } from '@/types';

type FilterCategory = 'all' | 'top' | 'bottom' | 'shoe' | 'outerwear' | 'accessory';
type SortOrder = 'newest' | 'oldest' | 'az';

const CATEGORY_LABELS: Record<FilterCategory, string> = {
  all: 'All',
  top: 'Tops',
  bottom: 'Bottoms',
  shoe: 'Shoes',
  outerwear: 'Outerwear',
  accessory: 'Accessories',
};

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

function FilterPill({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: ThemeColors;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedTouchable
      style={[
        {
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: Radius.pill,
          borderWidth: 1,
          borderColor: active ? colors.text : colors.border,
          backgroundColor: active ? colors.text : 'transparent',
          marginRight: 8,
          alignSelf: 'center',
        },
        animStyle,
      ]}
      activeOpacity={1}
      onPressIn={() => {
        scale.value = withSpring(0.94, { damping: 14, stiffness: 380 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 10, stiffness: 200 });
      }}
      onPress={onPress}
    >
      <Text
        style={{
          fontSize: 14,
          fontWeight: active ? '600' : '500',
          color: active ? colors.background : colors.textSecondary,
          letterSpacing: active ? 0.1 : 0,
        }}
      >
        {label}
      </Text>
    </AnimatedTouchable>
  );
}

export default function ClosetScreen() {
  const router = useRouter();
  const { getToken, userId } = useAuth();
  const { closetItems, setClosetItems } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all');
  const [resellCount, setResellCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [menuVisible, setMenuVisible] = useState(false);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    fetchCloset();
  }, []);

  const fetchCloset = async (force = false) => {
    if (!userId || (!force && closetItems.length > 0)) return;
    setLoading(true);
    setErrorMsg(null);

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // On retry: wait 2s for JWT nbf clock-skew window to pass
        if (attempt > 0) await new Promise(r => setTimeout(r, 2000));
        const token = await getToken({ skipCache: attempt > 0 });
        if (!token) throw new Error('No auth token');
        const client = createAuthenticatedClient(token);

        const { data, error } = await client
          .from('closet_items')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          // PGRST303 = JWT not yet valid (clock skew) — retry once
          if ((error as any).code === 'PGRST303' && attempt === 0) continue;
          throw error;
        }

        const items = data || [];
        setClosetItems(items);

        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        if (items.length > 0) {
          const { data: historyData } = await client
            .from('outfits_history')
            .select('top_id, bottom_id, shoe_id, accessory_id, date_worn')
            .gte('date_worn', sixMonthsAgo.toISOString().split('T')[0]);
          const recentlyWornIds = new Set<string>();
          for (const row of historyData ?? []) {
            [row.top_id, row.bottom_id, row.shoe_id, row.accessory_id].forEach(id => {
              if (id) recentlyWornIds.add(id);
            });
          }
          setResellCount(
            items.filter(i => new Date(i.created_at) < sixMonthsAgo && !recentlyWornIds.has(i.id)).length,
          );
        }
        break;
      } catch (e: unknown) {
        if ((e as any)?.code === 'PGRST303' && attempt === 0) continue;
        console.error('[Closet] fetchCloset error:', e);
        setErrorMsg(e instanceof Error ? e.message : 'Could not load wardrobe.');
        break;
      }
    }

    setLoading(false);
  };

  const toggleWash = async (item: ClosetItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newStatus = !item.is_in_wash;
    setClosetItems(closetItems.map(i => (i.id === item.id ? { ...i, is_in_wash: newStatus } : i)));

    try {
      const token = await getToken();
      if (!token) throw new Error('No auth token');
      const client = createAuthenticatedClient(token);
      const { error } = await client
        .from('closet_items')
        .update({ is_in_wash: newStatus })
        .eq('id', item.id);
      if (error) throw error;
      if (newStatus) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) {
      console.error(e);
      Alert.alert('Error', 'Could not update item status.');
      setClosetItems(useAppStore.getState().closetItems.map(i =>
        i.id === item.id ? { ...i, is_in_wash: !newStatus } : i,
      ));
    }
  };

  const filteredItems = useMemo(() => {
    let items = activeFilter === 'all'
      ? closetItems
      : closetItems.filter(item => item.category === activeFilter);

    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      items = items.filter(item =>
        item.category?.toLowerCase().includes(q) ||
        item.color?.toLowerCase().includes(q),
      );
    }

    switch (sortOrder) {
      case 'oldest':
        return [...items].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
      case 'az':
        return [...items].sort((a, b) =>
          (a.category || '').localeCompare(b.category || ''),
        );
      default:
        return items;
    }
  }, [closetItems, activeFilter, searchText, sortOrder]);

  const categories: FilterCategory[] = ['all', 'top', 'bottom', 'shoe', 'outerwear', 'accessory'];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Wardrobe</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (searchVisible) setSearchText('');
              setSearchVisible(v => !v);
            }}
            hitSlop={8}
          >
            <Ionicons name={searchVisible ? 'close' : 'search-outline'} size={22} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerBtn, sortOrder !== 'newest' && styles.headerBtnActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setMenuVisible(true);
            }}
            hitSlop={8}
          >
            <Ionicons
              name="options-outline"
              size={22}
              color={sortOrder !== 'newest' ? Colors.accent : colors.text}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Sort dropdown */}
      <DropdownMenu
        visible={menuVisible}
        onDismiss={() => setMenuVisible(false)}
        title="Sort by"
        options={[
          {
            label: 'Newest First',
            icon: 'arrow-down-outline',
            checked: sortOrder === 'newest',
            onPress: () => setSortOrder('newest'),
          },
          {
            label: 'Oldest First',
            icon: 'arrow-up-outline',
            checked: sortOrder === 'oldest',
            onPress: () => setSortOrder('oldest'),
          },
          {
            label: 'Name A–Z',
            icon: 'text-outline',
            checked: sortOrder === 'az',
            onPress: () => setSortOrder('az'),
          },
        ]}
      />

      {/* Search bar */}
      {searchVisible && (
        <Animated.View entering={SlideInUp.duration(180)} style={[styles.searchBar, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={16} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search by category, color…"
            placeholderTextColor={colors.textTertiary}
            autoFocus
            returnKeyType="search"
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </Animated.View>
      )}

      {/* Inline error banner */}
      {errorMsg && (
        <Animated.View entering={FadeIn.duration(240)} exiting={FadeOut.duration(200)} style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
          <Text style={styles.errorBannerText} numberOfLines={2}>{errorMsg}</Text>
          <TouchableOpacity onPress={() => { setErrorMsg(null); fetchCloset(true); }} hitSlop={8}>
            <Text style={styles.errorRetry}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setErrorMsg(null)} hitSlop={8}>
            <Ionicons name="close" size={16} color={Colors.danger} />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Resell nudge */}
      {resellCount > 0 && (
        <TouchableOpacity
          style={styles.nudgeBanner}
          activeOpacity={0.85}
          onPress={() =>
            Alert.alert(
              'Time to Resell?',
              `You have ${resellCount} item${resellCount > 1 ? 's' : ''} unworn for 6+ months. Consider listing on Depop, Poshmark, or Vinted.`,
              [{ text: 'Got it', style: 'cancel' }],
            )
          }
        >
          <Ionicons name="pricetag-outline" size={14} color={Colors.accent} />
          <Text style={styles.nudgeText}>
            {resellCount} item{resellCount > 1 ? 's' : ''} unworn 6+ months — resell tips
          </Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.accent} />
        </TouchableOpacity>
      )}

      {/* Category filter */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={categories}
        keyExtractor={item => item}
        style={styles.filterList}
        contentContainerStyle={styles.filterContent}
        renderItem={({ item }) => (
          <FilterPill
            label={CATEGORY_LABELS[item]}
            active={activeFilter === item}
            colors={colors}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveFilter(item);
            }}
          />
        )}
      />

      {/* Grid */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.textSecondary} />
          <Text style={styles.loadingText}>Loading wardrobe…</Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={item => item.id}
          numColumns={2}
          contentContainerStyle={styles.gridContainer}
          columnWrapperStyle={styles.gridRow}
          onRefresh={() => fetchCloset(true)}
          refreshing={loading}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Animated.View entering={FadeIn.delay(100).duration(400)} style={styles.center}>
              <View style={styles.emptyIconContainer}>
                <Ionicons name="shirt-outline" size={34} color={colors.textTertiary} />
              </View>
              <Text style={styles.emptyTitle}>Wardrobe is empty</Text>
              <Text style={styles.emptyText}>Tap + to photograph your first item.</Text>
            </Animated.View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.gridItem}
              onLongPress={() => toggleWash(item)}
              activeOpacity={0.88}
            >
              <Image
                source={item.image_url}
                style={[styles.gridImage, item.is_in_wash && styles.washedImage]}
                contentFit="cover"
              />
              {item.is_in_wash && (
                <View style={styles.washOverlay}>
                  <Ionicons name="water-outline" size={22} color="#FFFFFF" />
                  <Text style={styles.washText}>In Wash</Text>
                </View>
              )}
              <View style={styles.itemCategoryTag}>
                <Text style={styles.itemCategoryText}>{item.category}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/add-item' as never);
        }}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color={colors.background} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: c.text,
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 4,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBtnActive: {
    backgroundColor: 'rgba(184,147,106,0.12)',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.two,
    borderRadius: Radius.input,
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    borderWidth: 1,
    minHeight: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },

  // ── Error banner ──
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.two,
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderRadius: Radius.button,
    paddingVertical: 10,
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
  },
  errorBannerText: {
    flex: 1,
    color: Colors.danger,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  errorRetry: {
    color: Colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Resell nudge ──
  nudgeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.two,
    backgroundColor: c.backgroundElement,
    borderRadius: Radius.button,
    paddingVertical: 10,
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    borderColor: Colors.accentLight,
  },
  nudgeText: {
    flex: 1,
    color: c.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },

  // ── Filter ──
  filterList: {
    height: 44,
    marginBottom: Spacing.three,
    flexGrow: 0,
  },
  filterContent: {
    paddingHorizontal: Spacing.four,
    paddingRight: Spacing.four,
    alignItems: 'center',
  },

  // ── Grid ──
  gridContainer: {
    paddingHorizontal: Spacing.four,
    paddingBottom: 120,
  },
  gridRow: {
    gap: 12,
    marginBottom: 12,
  },
  gridItem: {
    flex: 1,
    aspectRatio: 3 / 4,
    borderRadius: 14,
    backgroundColor: c.backgroundElement,
    overflow: 'hidden',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  washedImage: {
    opacity: 0.35,
  },
  washOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  washText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  itemCategoryTag: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  itemCategoryText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  // ── Loading / Empty ──
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
    paddingTop: 80,
    gap: 0,
  },
  loadingText: {
    color: c.textTertiary,
    fontSize: 14,
    marginTop: 12,
    fontWeight: '500',
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: c.backgroundElement,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.three,
    borderWidth: 1,
    borderColor: c.border,
  },
  emptyTitle: {
    color: c.text,
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  emptyText: {
    color: c.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── FAB ──
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: c.text,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
});
