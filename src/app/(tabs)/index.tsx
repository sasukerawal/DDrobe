import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
  Dimensions,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useAuth } from '@clerk/expo';
import { useRouter } from 'expo-router';
import type { WeatherContext } from '@/types';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { createAuthenticatedClient } from '@/utils/supabase';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { logWear, todayISO } from '@/utils/wearLog';
import { deleteOutfit, saveOutfit } from '@/utils/outfits';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { useThemeColors, type ThemeColors } from '@/hooks/useThemeColors';
import type { GeneratedOutfit } from '@/types';
import * as Haptics from 'expo-haptics';
import { DropdownMenu } from '@/components/DropdownMenu';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;

let rewarded: { addAdEventListener: Function; load: Function; show: Function } | null = null;
let RewardedAdEventType: { LOADED: string; EARNED_REWARD: string } | null = null;

try {
  const admob = require('react-native-google-mobile-ads');
  const adUnitId = __DEV__ ? admob.TestIds.REWARDED : 'ca-app-pub-3940256099942544~3347511713';
  rewarded = admob.RewardedAd.createForAdRequest(adUnitId, { requestNonPersonalizedAdsOnly: true });
  RewardedAdEventType = admob.RewardedAdEventType;
} catch {
  // Native AdMob not available in Expo Go
}

export default function DailyStylistScreen() {
  const router = useRouter();
  const { getToken, userId } = useAuth();
  const { closetItems, setClosetItems, dailyOutfits, setDailyOutfits, removeOutfit } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [adLoaded, setAdLoaded] = useState(false);
  const [generatingMore, setGeneratingMore] = useState(false);
  const [vacationModalVisible, setVacationModalVisible] = useState(false);
  const [vacationPrompt, setVacationPrompt] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const weatherRef = useRef<WeatherContext | null>(null);
  const coordsRef = useRef<{ lat: number; lon: number } | null>(null);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    fetchClosetAndGenerate();

    let unsubscribeLoaded: (() => void) | undefined;
    let unsubscribeEarned: (() => void) | undefined;

    if (rewarded && RewardedAdEventType) {
      unsubscribeLoaded = rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
        setAdLoaded(true);
      });
      unsubscribeEarned = rewarded.addAdEventListener(
        RewardedAdEventType.EARNED_REWARD,
        () => { handleAdWatched(); },
      );
      rewarded.load();
    }

    return () => {
      unsubscribeLoaded?.();
      unsubscribeEarned?.();
    };
  }, []);

  const fetchClosetAndGenerate = async (count: number = 3, vacationContext?: string) => {
    if (!userId) return;
    setLoading(true);
    try {
      let items = closetItems;

      // Fetch closet items if not cached — retry once on PGRST303 (JWT clock-skew)
      if (items.length === 0) {
        for (let attempt = 0; attempt < 2; attempt++) {
          if (attempt > 0) await new Promise(r => setTimeout(r, 2000));
          const token = await getToken({ skipCache: attempt > 0 });
          if (!token) throw new Error('No auth token');
          const client = createAuthenticatedClient(token);
          const { data, error } = await client.from('closet_items').select('*');
          if (error) {
            if ((error as any).code === 'PGRST303' && attempt === 0) continue;
            throw error;
          }
          items = data || [];
          setClosetItems(items);
          break;
        }
      }

      if (items.length === 0) {
        setErrorMsg('Your closet is empty. Add some items first!');
        setLoading(false);
        return;
      }

      const token = await getToken({ skipCache: true });
      if (!token) throw new Error('No auth token');
      const client = createAuthenticatedClient(token);

      if (!coordsRef.current) {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const location =
              (await Location.getLastKnownPositionAsync().catch(() => null)) ??
              (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
            coordsRef.current = { lat: location.coords.latitude, lon: location.coords.longitude };
          }
        } catch (e) {
          // Location services off: outfits are still generated, just without live weather.
          console.log('[Stylist] location unavailable, continuing without weather:', e);
        }
      }

      const { data, error } = await client.functions.invoke('generate-outfit', {
        body: { ...coordsRef.current, count, vacationContext },
      });

      if (error) {
        if ((error as any).context?.status === 429) {
          setErrorMsg('daily_limit');
          return;
        }
        let msg = error.message ?? 'Failed to generate outfits';
        try {
          const detail = await (error as any).context?.json?.();
          msg = detail?.error ?? detail?.message ?? msg;
        } catch {}
        throw new Error(msg);
      }
      setErrorMsg('');
      if (data?.outfits) {
        weatherRef.current = data.weather ?? null;
        setDailyOutfits([...useAppStore.getState().dailyOutfits, ...data.outfits]);
      }
      const dbUser = useAuthStore.getState().dbUser;
      if (dbUser && typeof data?.generationsUsed === 'number') {
        useAuthStore.getState().setDbUser({ ...dbUser, daily_generations_used: data.generationsUsed });
      }
    } catch (e: any) {
      console.error('[Stylist] fetchClosetAndGenerate error:', e);
      const msg = e.message || 'Failed to generate outfits';
      setErrorMsg(msg);
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
      setGeneratingMore(false);
    }
  };

  const handleAdWatched = () => {
    setGeneratingMore(true);
    fetchClosetAndGenerate(2);
    setAdLoaded(false);
    rewarded?.load();
  };

  const onSwipe = async (direction: 'left' | 'right', outfit: GeneratedOutfit) => {
    if (direction === 'right') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    removeOutfit(outfit.id);

    try {
      const token = await getToken();
      if (!token) return;
      const client = createAuthenticatedClient(token);
      await client.from('outfits_history').insert({
        user_id: userId,
        top_id: outfit.top?.id ?? null,
        bottom_id: outfit.bottom?.id ?? null,
        shoe_id: outfit.shoe?.id ?? null,
        accessory_id: outfit.accessory?.id ?? null,
        weather_context: weatherRef.current ?? {},
        date_worn: todayISO(),
        rating: direction === 'right' ? 5 : 1,
      });
      if (direction === 'right' && userId) {
        const itemIds = [outfit.top, outfit.bottom, outfit.shoe, outfit.accessory]
          .filter((i): i is NonNullable<typeof i> => Boolean(i))
          .map((i) => i.id);
        await logWear(client, userId, itemIds);
      }
    } catch (e) {
      console.warn('[Stylist] outfits_history insert failed:', e);
    }
  };

  // Maps a suggestion's id to its saved_outfits id once the heart is tapped.
  const [savedIds, setSavedIds] = useState<Record<string, string>>({});

  const toggleSave = async (outfit: GeneratedOutfit) => {
    if (!userId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const existing = savedIds[outfit.id];
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const client = createAuthenticatedClient(token);
      if (existing) {
        await deleteOutfit(client, existing);
        setSavedIds(({ [outfit.id]: _, ...rest }) => rest);
      } else {
        const saved = await saveOutfit(client, userId, outfit, {
          name: `${outfit.style} look`,
          description: outfit.description,
          source: 'ai',
        });
        setSavedIds((s) => ({ ...s, [outfit.id]: saved.id }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      Alert.alert('Not saved', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const postToLookbook = async (outfit: GeneratedOutfit) => {
    Alert.alert('Post to Lookbook', 'This will share your outfit to the community feed. Moderation applies.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Post',
        onPress: async () => {
          try {
            const imageUrl = outfit.top?.image_url || outfit.bottom?.image_url || outfit.shoe?.image_url;
            if (!imageUrl) throw new Error('No image found for this outfit.');
            const caption = `Stylist recommended: ${outfit.style} look!`;
            const token = await getToken();
            if (!token) throw new Error('Not authenticated');
            const client = createAuthenticatedClient(token);
            const { data, error } = await client.functions.invoke('create-post', {
              body: { imageUrl, caption },
            });
            if (error) {
              let msg = error.message ?? 'Failed to post outfit';
              try {
                const detail = await (error as any).context?.json?.();
                msg = detail?.error ?? detail?.message ?? msg;
              } catch {}
              throw new Error(msg);
            }
            if (data?.isSafe) {
              Alert.alert('Success', 'Outfit posted to Lookbook!');
            } else {
              Alert.alert('Notice', 'Post was flagged by moderation and will not be displayed.');
            }
          } catch (e: any) {
            console.error(e);
            Alert.alert('Error', e.message || 'Failed to post outfit');
          }
        },
      },
    ]);
  };

  if (loading && dailyOutfits.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.text} />
        <Text style={styles.loadingText}>Styling your look…</Text>
      </View>
    );
  }

  if (errorMsg && dailyOutfits.length === 0) {
    const isDailyLimit = errorMsg === 'daily_limit';
    return (
      <SafeAreaView style={styles.center}>
        <View style={styles.errorIconContainer}>
          <Text style={styles.errorIconText}>{isDailyLimit ? '✦' : '◈'}</Text>
        </View>
        <Text style={styles.errorTitle}>
          {isDailyLimit ? "Daily limit reached" : "Couldn't load outfits"}
        </Text>
        <Text style={styles.errorText}>
          {isDailyLimit
            ? "You've used today's 10 outfit generations. New ones unlock at midnight."
            : errorMsg.includes('closet is empty')
            ? 'Add some clothes to your wardrobe first, then come back.'
            : 'Something went wrong. Check your connection and try again.'}
        </Text>
        {!isDailyLimit && (
          <TouchableOpacity style={styles.primaryButton} onPress={() => fetchClosetAndGenerate()}>
            <Text style={styles.primaryButtonText}>Try Again</Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Today</Text>
          {weatherRef.current && (
            <Text style={styles.weatherChip}>
              {weatherRef.current.temp_celsius}° · {weatherRef.current.condition}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.moreBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/chat' as never);
          }}
          hitSlop={8}
          accessibilityLabel="Ask your stylist"
        >
          <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.moreBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setMenuVisible(true);
          }}
          hitSlop={8}
          accessibilityLabel="More options"
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <DropdownMenu
        visible={menuVisible}
        onDismiss={() => setMenuVisible(false)}
        options={[
          {
            label: 'Trip outfits',
            icon: 'airplane-outline',
            onPress: () => setVacationModalVisible(true),
          },
          {
            label: 'Packing lists',
            icon: 'briefcase-outline',
            onPress: () => router.push('/trips' as never),
          },
          {
            label: 'Refresh Outfits',
            icon: 'refresh-outline',
            onPress: () => {
              setDailyOutfits([]);
              fetchClosetAndGenerate();
            },
          },
        ]}
      />

      {/* Card stack */}
      <View style={styles.cardContainer}>
        {dailyOutfits.map((outfit, index) => {
          const isFirst = index === 0;
          return (
            <SwipeableCard
              key={outfit.id}
              outfit={outfit}
              isFirst={isFirst}
              onSwipe={(dir) => onSwipe(dir, outfit)}
              onPost={() => postToLookbook(outfit)}
              saved={Boolean(savedIds[outfit.id])}
              onSave={() => toggleSave(outfit)}
            />
          );
        }).reverse()}

        {dailyOutfits.length === 0 && !loading && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>All caught up</Text>
            <Text style={styles.emptyText}>You've seen today's recommendations.</Text>
            {generatingMore ? (
              <ActivityIndicator size="small" color={colors.text} style={{ marginTop: 24 }} />
            ) : rewarded ? (
              <TouchableOpacity
                style={[styles.primaryButton, !adLoaded && styles.buttonDisabled]}
                disabled={!adLoaded}
                onPress={() => rewarded!.show()}
              >
                <Text style={styles.primaryButtonText}>
                  {adLoaded ? 'Watch Ad · 2 More Outfits' : 'Loading…'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => fetchClosetAndGenerate(2)}
              >
                <Text style={styles.primaryButtonText}>Generate 2 More</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Vacation packer modal */}
      <Modal visible={vacationModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Vacation Packer</Text>
            <Text style={styles.modalSub}>Describe your trip and we'll build outfits around it.</Text>
            <TextInput
              style={styles.modalInput}
              value={vacationPrompt}
              onChangeText={setVacationPrompt}
              placeholder="e.g. Ski trip in Aspen, 5 days"
              placeholderTextColor={colors.textTertiary}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.ghostButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setVacationModalVisible(false);
                }}
              >
                <Text style={styles.ghostButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => {
                  if (!vacationPrompt.trim()) {
                    Alert.alert('Missing info', "Describe where you're going.");
                    return;
                  }
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  setVacationModalVisible(false);
                  setDailyOutfits([]);
                  fetchClosetAndGenerate(3, vacationPrompt);
                }}
              >
                <Text style={styles.primaryButtonText}>Generate</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Swipeable Card ───────────────────────────────────────────────────────────

interface SwipeableCardProps {
  outfit: GeneratedOutfit;
  isFirst: boolean;
  onSwipe: (direction: 'left' | 'right') => void;
  onPost: () => void;
  saved: boolean;
  onSave: () => void;
}

function SwipeableCard({ outfit, isFirst, onSwipe, onPost, saved, onSave }: SwipeableCardProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      if (Math.abs(event.translationX) > SWIPE_THRESHOLD) {
        const direction = event.translationX > 0 ? 'right' : 'left';
        translateX.value = withSpring(
          direction === 'right' ? SCREEN_WIDTH * 1.5 : -SCREEN_WIDTH * 1.5,
          { velocity: event.velocityX },
        );
        runOnJS(onSwipe)(direction);
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  const rStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${translateX.value / 22}deg` },
    ],
  }));

  const wearOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, SWIPE_THRESHOLD * 0.6], [0, 1], Extrapolation.CLAMP),
  }));

  const passOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-SWIPE_THRESHOLD * 0.6, 0], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <View style={[styles.cardWrapper, { pointerEvents: isFirst ? 'auto' : 'none' }]}>
      {isFirst ? (
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.card, rStyle]}>
            {/* Swipe overlays */}
            <Animated.View style={[styles.swipeBadge, styles.swipeBadgeWear, wearOpacity]}>
              <Text style={styles.swipeBadgeText}>WEAR</Text>
            </Animated.View>
            <Animated.View style={[styles.swipeBadge, styles.swipeBadgePass, passOpacity]}>
              <Text style={styles.swipeBadgeText}>PASS</Text>
            </Animated.View>
            <CardContent outfit={outfit} onPost={onPost} saved={saved} onSave={onSave} />
          </Animated.View>
        </GestureDetector>
      ) : (
        <Animated.View style={styles.card}>
          <CardContent outfit={outfit} onPost={onPost} saved={saved} onSave={onSave} />
        </Animated.View>
      )}
    </View>
  );
}

function CardContent({
  outfit,
  onPost,
  saved,
  onSave,
}: {
  outfit: GeneratedOutfit;
  onPost: () => void;
  saved: boolean;
  onSave: () => void;
}) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const heroImage = outfit.top?.image_url || outfit.bottom?.image_url || outfit.shoe?.image_url;
  const secondaryItems = [outfit.bottom, outfit.shoe, outfit.accessory].filter(Boolean);

  return (
    <View style={styles.cardContent}>
      {/* Hero image — takes ~58% of card height */}
      <View style={styles.heroBlock}>
        {heroImage ? (
          <Image source={heroImage} style={styles.heroImage} contentFit="cover" />
        ) : (
          <View style={[styles.heroImage, styles.heroPlaceholder]}>
            <Text style={styles.heroPlaceholderText}>◈</Text>
          </View>
        )}
        {/* Style badge overlay */}
        <View style={styles.styleBadge}>
          <Text style={styles.styleBadgeText}>{outfit.style.toUpperCase()}</Text>
        </View>
        {/* Share button overlay */}
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.cardActionButton}
            onPress={onSave}
            activeOpacity={0.8}
            accessibilityLabel={saved ? 'Remove from saved outfits' : 'Save outfit'}
          >
            <Ionicons name={saved ? 'heart' : 'heart-outline'} size={22} color={saved ? Colors.accent : '#FFFFFF'} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cardActionButton}
            onPress={onPost}
            activeOpacity={0.8}
            accessibilityLabel="Share to Lookbook"
          >
            <Ionicons name="arrow-up" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Secondary items row */}
      <View style={styles.secondaryRow}>
        {secondaryItems.map((item, i) => (
          <Image
            key={i}
            source={item!.image_url}
            style={styles.secondaryImage}
            contentFit="cover"
          />
        ))}
      </View>

      {/* Description */}
      <View style={styles.descriptionBlock}>
        <Text style={styles.description} numberOfLines={3}>{outfit.description}</Text>
      </View>

      {/* Swipe hint */}
      <Text style={styles.swipeHint}>← pass  ·  wear today →</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: c.background,
    padding: Spacing.four,
  },

  // ── Header ──
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: c.text,
    letterSpacing: -0.5,
  },
  weatherChip: {
    fontSize: 13,
    color: c.textSecondary,
    fontWeight: '400',
    marginTop: 2,
  },
  moreBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Loading / Error ──
  loadingText: {
    marginTop: Spacing.three,
    color: c.textSecondary,
    fontSize: 15,
    fontWeight: '400',
    letterSpacing: 0.3,
  },
  errorIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: c.backgroundElement,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  errorIconText: {
    fontSize: 28,
    color: c.textSecondary,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: c.text,
    textAlign: 'center',
    marginBottom: Spacing.two,
    letterSpacing: -0.3,
  },
  errorText: {
    color: c.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.four,
  },

  // ── Buttons ──
  primaryButton: {
    backgroundColor: c.text,
    borderRadius: Radius.button,
    paddingVertical: 14,
    paddingHorizontal: Spacing.five,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: c.background,
    fontWeight: '600',
    fontSize: 15,
    letterSpacing: 0.2,
  },
  ghostButton: {
    borderRadius: Radius.button,
    paddingVertical: 14,
    paddingHorizontal: Spacing.five,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
  },
  ghostButtonText: {
    color: c.text,
    fontWeight: '500',
    fontSize: 15,
  },
  buttonDisabled: {
    opacity: 0.4,
  },

  // ── Card stack ──
  cardContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  cardWrapper: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    height: '100%',
    backgroundColor: c.surface,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: c.border,
  },

  // ── Swipe overlays ──
  swipeBadge: {
    position: 'absolute',
    top: 24,
    zIndex: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 2,
  },
  swipeBadgeWear: {
    left: 20,
    borderColor: Colors.success,
  },
  swipeBadgePass: {
    right: 20,
    borderColor: Colors.danger,
  },
  swipeBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: '#FFFFFF',
  },

  // ── Card content ──
  cardContent: {
    flex: 1,
  },
  heroBlock: {
    flex: 0.58,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroPlaceholder: {
    backgroundColor: c.backgroundElement,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroPlaceholderText: {
    fontSize: 40,
    color: c.textTertiary,
  },
  styleBadge: {
    position: 'absolute',
    bottom: 12,
    left: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  styleBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  cardActions: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    gap: 8,
  },
  cardActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    flex: 0.22,
  },
  secondaryImage: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: c.backgroundElement,
  },
  descriptionBlock: {
    flex: 0.14,
    paddingHorizontal: 14,
    paddingTop: 4,
    justifyContent: 'center',
  },
  description: {
    fontSize: 13,
    color: c.textSecondary,
    lineHeight: 19,
  },
  swipeHint: {
    textAlign: 'center',
    fontSize: 11,
    color: c.textTertiary,
    letterSpacing: 0.5,
    paddingBottom: 10,
    fontWeight: '400',
  },

  // ── Empty state ──
  emptyContainer: {
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: c.text,
    letterSpacing: -0.3,
  },
  emptyText: {
    color: c.textSecondary,
    fontSize: 15,
    textAlign: 'center',
  },

  // ── Vacation modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.border,
    alignSelf: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: c.text,
    letterSpacing: -0.3,
  },
  modalSub: {
    fontSize: 14,
    color: c.textSecondary,
    lineHeight: 20,
  },
  modalInput: {
    backgroundColor: c.backgroundElement,
    borderRadius: Radius.input,
    padding: Spacing.three,
    fontSize: 15,
    color: c.text,
    borderWidth: 1,
    borderColor: c.border,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
