import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@clerk/expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import { createAuthenticatedClient } from '@/utils/supabase';
import { useAppStore } from '@/store/useAppStore';
import { Colors, Spacing } from '@/constants/theme';
import type { ClosetItem } from '@/types';

type FilterCategory = 'all' | 'top' | 'bottom' | 'shoe' | 'outerwear' | 'accessory';

export default function ClosetScreen() {
  const router = useRouter();
  const { getToken, userId } = useAuth();
  const { closetItems, setClosetItems } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all');
  const [resellCount, setResellCount] = useState(0);

  useEffect(() => {
    fetchCloset();
  }, []);

  const fetchCloset = async (force = false) => {
    if (!userId || (!force && closetItems.length > 0)) return;
    setLoading(true);
    try {
      const token = await getToken({ template: 'supabase' });
      if (!token) throw new Error('No auth token');
      const client = createAuthenticatedClient(token);

      const { data, error } = await client
        .from('closet_items')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const items = data || [];
      setClosetItems(items);

      // Count items older than 6 months for resell nudge
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      setResellCount(items.filter(i => new Date(i.created_at) < sixMonthsAgo).length);
    } catch (e: unknown) {
      console.error('[Closet] fetchCloset error:', e);
      const msg = e instanceof Error ? e.message : 'Failed to load your closet.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  const toggleWash = async (item: ClosetItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newStatus = !item.is_in_wash;
    setClosetItems(closetItems.map(i => (i.id === item.id ? { ...i, is_in_wash: newStatus } : i)));

    try {
      const token = await getToken({ template: 'supabase' });
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
      setClosetItems(closetItems.map(i => (i.id === item.id ? { ...i, is_in_wash: !newStatus } : i)));
    }
  };

  const filteredItems =
    activeFilter === 'all'
      ? closetItems
      : closetItems.filter(item => item.category === activeFilter);

  const categories: FilterCategory[] = ['all', 'top', 'bottom', 'shoe', 'outerwear', 'accessory'];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>My Closet</Text>
        <Text style={styles.hint}>Long-press to mark as In Wash</Text>
      </View>

      {resellCount > 0 && (
        <TouchableOpacity
          style={styles.nudgeBanner}
          activeOpacity={0.85}
          onPress={() =>
            Alert.alert(
              'Time to Resell?',
              `You have ${resellCount} item${resellCount > 1 ? 's' : ''} that ${resellCount > 1 ? 'have' : 'has'} been sitting in your closet for over 6 months. Consider selling on Depop, Poshmark, or Vinted to make some money!`,
              [{ text: 'Got it', style: 'cancel' }],
            )
          }
        >
          <Text style={styles.nudgeText}>
            🛍️ {resellCount} item{resellCount > 1 ? 's' : ''} ready to resell — tap to learn more
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.filterContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={categories}
          keyExtractor={item => item}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.filterPill, activeFilter === item && styles.filterPillActive]}
              onPress={() => setActiveFilter(item)}
            >
              <Text style={[styles.filterText, activeFilter === item && styles.filterTextActive]}>
                {item.charAt(0).toUpperCase() + item.slice(1)}
              </Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={{ paddingHorizontal: Spacing.four, gap: Spacing.two }}
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={item => item.id}
          numColumns={3}
          contentContainerStyle={styles.gridContainer}
          columnWrapperStyle={styles.gridRow}
          onRefresh={() => fetchCloset(true)}
          refreshing={loading}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>Your closet is empty.</Text>
              <Text style={styles.emptySubtext}>Tap + to add your first item.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.gridItem}
              onLongPress={() => toggleWash(item)}
              activeOpacity={0.8}
            >
              <Image
                source={item.image_url}
                style={[styles.image, item.is_in_wash && styles.washedImage]}
                contentFit="cover"
              />
              {item.is_in_wash && (
                <View style={styles.washOverlay}>
                  <Text style={styles.washIcon}>🧺</Text>
                  <Text style={styles.washText}>In Wash</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      )}

      {/* Floating Action Button — opens the camera to add an item */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/add-item' as never);
        }}
        activeOpacity={0.85}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerRow: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
  },
  hint: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  nudgeBanner: {
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.two,
    backgroundColor: '#2D1B69',
    borderRadius: 12,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  nudgeText: {
    color: '#E9D5FF',
    fontSize: 13,
    fontWeight: '500',
  },
  filterContainer: {
    marginBottom: Spacing.three,
  },
  filterPill: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 20,
    backgroundColor: Colors.backgroundElement,
  },
  filterPillActive: {
    backgroundColor: Colors.primary,
  },
  filterText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#FFF',
    fontWeight: '600',
  },
  gridContainer: {
    paddingHorizontal: Spacing.three,
    paddingBottom: 100,
    gap: Spacing.two,
  },
  gridRow: {
    gap: Spacing.two,
  },
  gridItem: {
    flex: 1,
    aspectRatio: 3 / 4,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
    paddingTop: 80,
  },
  emptyText: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: Spacing.one,
  },
  emptySubtext: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  washedImage: {
    opacity: 0.4,
  },
  washOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  washIcon: {
    fontSize: 32,
    marginBottom: 4,
  },
  washText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  fabIcon: {
    fontSize: 30,
    color: '#FFF',
    lineHeight: 34,
  },
});
