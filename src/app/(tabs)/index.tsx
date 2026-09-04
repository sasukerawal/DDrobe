import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, Dimensions, TouchableOpacity, Linking, Alert, Modal, TextInput } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { createAuthenticatedClient } from '@/utils/supabase';
import { useAppStore } from '@/store/useAppStore';
import { Colors, Spacing } from '@/constants/theme';
import type { GeneratedOutfit } from '@/types';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;

// AdMob is only available in native builds, not Expo Go
let rewarded: { addAdEventListener: Function; load: Function; show: Function } | null = null;
let RewardedAdEventType: { LOADED: string; EARNED_REWARD: string } | null = null;

try {
  const admob = require('react-native-google-mobile-ads');
  const adUnitId = __DEV__ ? admob.TestIds.REWARDED : 'ca-app-pub-3940256099942544~3347511713';
  rewarded = admob.RewardedAd.createForAdRequest(adUnitId, { requestNonPersonalizedAdsOnly: true });
  RewardedAdEventType = admob.RewardedAdEventType;
} catch {
  // Native AdMob module not available — running in Expo Go
}

export default function DailyStylistScreen() {
  const { getToken, userId } = useAuth();
  const { closetItems, setClosetItems, dailyOutfits, setDailyOutfits, removeOutfit } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [adLoaded, setAdLoaded] = useState(false);
  const [generatingMore, setGeneratingMore] = useState(false);
  const [vacationModalVisible, setVacationModalVisible] = useState(false);
  const [vacationPrompt, setVacationPrompt] = useState('');

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
      const token = await getToken({ template: 'supabase' });
      if (!token) throw new Error('No auth token');
      const client = createAuthenticatedClient(token);

      let items = closetItems;
      if (items.length === 0) {
        const { data, error } = await client.from('closet_items').select('*');
        if (error) throw error;
        items = data || [];
        setClosetItems(items);
      }

      if (items.length === 0) {
        setErrorMsg('Your closet is empty. Add some items first!');
        setLoading(false);
        return;
      }

      if (dailyOutfits.length === 0 || count < 3) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        let lat = 0;
        let lon = 0;
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({});
          lat = location.coords.latitude;
          lon = location.coords.longitude;
        }

        const { data, error } = await client.functions.invoke('generate-outfit', {
          body: { userId, lat, lon, closetItems: items, count, vacationContext },
        });

        if (error) throw error;
        if (data && data.outfits) {
          setDailyOutfits([...dailyOutfits, ...data.outfits]);
        }
      }
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || 'Failed to generate outfits');
    } finally {
      setLoading(false);
      setGeneratingMore(false);
    }
  };

  const handleAdWatched = () => {
    setGeneratingMore(true);
    fetchClosetAndGenerate(2); // generate 2 more
    // Preload next ad
    setAdLoaded(false);
    rewarded?.load();
  };

  const onSwipe = (direction: 'left' | 'right', outfit: GeneratedOutfit) => {
    if (direction === 'right') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Automatically post to feed? Or open modal. For now, we leave it simple.
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    removeOutfit(outfit.id);
  };

  const postToLookbook = async (outfit: GeneratedOutfit) => {
    Alert.alert('Post to Lookbook', 'This will share your outfit to the community feed. Moderation applies.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Post', onPress: async () => {
          try {
            // Pick the first image as the representative image for the lookbook for now
            const imageUrl = outfit.top?.image_url || outfit.bottom?.image_url || outfit.shoe?.image_url;
            if (!imageUrl) throw new Error("No image found for this outfit.");
            
            const caption = `Stylist recommended: ${outfit.style} look!`;
            
            const token = await getToken({ template: 'supabase' });
            if (!token) throw new Error('Not authenticated');
            const client = createAuthenticatedClient(token);
            const { data, error } = await client.functions.invoke('create-post', {
              body: { userId, imageUrl, caption },
            });

            if (error) throw error;
            if (data?.isSafe) {
              Alert.alert('Success', 'Outfit posted to Lookbook!');
            } else {
              Alert.alert('Notice', 'Post was flagged by moderation and will not be displayed.');
            }
          } catch(e: any) {
            console.error(e);
            Alert.alert('Error', e.message || 'Failed to post outfit');
          }
        }
      }
    ]);
  }

  if (loading && dailyOutfits.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Your AI Stylist is thinking...</Text>
      </View>
    );
  }

  if (errorMsg && dailyOutfits.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{errorMsg}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Daily Stylist</Text>
        <TouchableOpacity style={styles.vacationButton} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setVacationModalVisible(true); }}>
          <Text style={styles.vacationButtonText}>✈️ Pack</Text>
        </TouchableOpacity>
      </View>
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
            />
          );
        }).reverse()}
        
        {dailyOutfits.length === 0 && !loading && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>You've seen all outfits for today!</Text>
            {generatingMore ? (
              <ActivityIndicator size="small" color={Colors.primary} style={{ marginTop: 20 }} />
            ) : rewarded ? (
              <TouchableOpacity
                style={[styles.adButton, !adLoaded && styles.adButtonDisabled]}
                disabled={!adLoaded}
                onPress={() => rewarded!.show()}
              >
                <Text style={styles.adButtonText}>
                  {adLoaded ? '📺 Watch Ad for 2 More Outfits' : 'Loading Ad...'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.adButton}
                onPress={() => fetchClosetAndGenerate(2)}
              >
                <Text style={styles.adButtonText}>Generate 2 More Outfits</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      <Modal visible={vacationModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Vacation Packer</Text>
            <Text style={styles.modalSub}>Where are you going? (e.g. "Miami, Weekend")</Text>
            <TextInput
              style={styles.modalInput}
              value={vacationPrompt}
              onChangeText={setVacationPrompt}
              placeholder="e.g. Ski trip in Aspen"
              placeholderTextColor={Colors.textSecondary}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setVacationModalVisible(false); }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.modalSubmit} 
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  setVacationModalVisible(false);
                  setDailyOutfits([]);
                  fetchClosetAndGenerate(3, vacationPrompt);
                }}
              >
                <Text style={styles.modalSubmitText}>Generate</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// Swipeable Card Component
interface SwipeableCardProps {
  outfit: GeneratedOutfit;
  isFirst: boolean;
  onSwipe: (direction: 'left' | 'right') => void;
  onPost: () => void;
}

function SwipeableCard({ outfit, isFirst, onSwipe, onPost }: SwipeableCardProps) {
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
          direction === 'right' ? SCREEN_WIDTH : -SCREEN_WIDTH,
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
      { rotate: `${translateX.value / 20}deg` },
    ],
  }));

  return (
    <View style={styles.cardWrapper} pointerEvents={isFirst ? 'auto' : 'none'}>
      {isFirst ? (
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.card, rStyle]}>
            <CardContent outfit={outfit} onPost={onPost} />
          </Animated.View>
        </GestureDetector>
      ) : (
        <Animated.View style={styles.card}>
          <CardContent outfit={outfit} onPost={onPost} />
        </Animated.View>
      )}
    </View>
  );
}

function CardContent({ outfit, onPost }: { outfit: GeneratedOutfit, onPost: () => void }) {
  return (
    <View style={styles.cardContent}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.three }}>
        <Text style={styles.styleTitle}>{outfit.style}</Text>
        <TouchableOpacity style={styles.postButton} onPress={onPost}>
          <Text style={styles.postButtonText}>Post</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.imagesContainer}>
        {outfit.top && <Image source={outfit.top.image_url} style={styles.itemImage} />}
        {outfit.bottom && <Image source={outfit.bottom.image_url} style={styles.itemImage} />}
        {outfit.shoe && <Image source={outfit.shoe.image_url} style={styles.itemImage} />}
        {outfit.accessory && <Image source={outfit.accessory.image_url} style={styles.itemImage} />}
        
        {outfit.sponsoredItem && (
          <TouchableOpacity 
            style={[styles.itemImage, styles.sponsoredWrapper]} 
            onPress={() => Linking.openURL(outfit.sponsoredItem!.affiliateLink)}
          >
            <Text style={styles.sponsoredText}>Trending</Text>
            <Text style={styles.sponsoredDesc}>
              {outfit.sponsoredItem.color} {outfit.sponsoredItem.pattern} {outfit.sponsoredItem.category}
            </Text>
            <Text style={styles.buyText}>Shop</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.description}>{outfit.description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.four,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
  },
  vacationButton: {
    backgroundColor: 'rgba(109, 40, 217, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  vacationButtonText: {
    color: Colors.primary,
    fontWeight: 'bold',
    fontSize: 14,
  },
  loadingText: {
    marginTop: Spacing.three,
    color: Colors.textSecondary,
    fontSize: 16,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 16,
    textAlign: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: Spacing.four,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: Spacing.four,
  },
  adButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: 12,
  },
  adButtonDisabled: {
    backgroundColor: Colors.textSecondary,
  },
  adButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  cardContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardWrapper: {
    position: 'absolute',
    width: '90%',
    height: '80%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    padding: Spacing.four,
  },
  cardContent: {
    flex: 1,
  },
  styleTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.primary,
  },
  postButton: {
    backgroundColor: 'rgba(109, 40, 217, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  postButtonText: {
    color: Colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  imagesContainer: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  itemImage: {
    width: '45%',
    aspectRatio: 3 / 4,
    borderRadius: 12,
    backgroundColor: Colors.backgroundElement,
  },
  sponsoredWrapper: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.4)',
    padding: Spacing.two,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sponsoredText: {
    color: Colors.primary,
    fontWeight: 'bold',
    fontSize: 12,
    marginBottom: Spacing.one,
  },
  sponsoredDesc: {
    color: Colors.text,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
  buyText: {
    color: Colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  description: {
    fontSize: 16,
    color: Colors.text,
    textAlign: 'center',
    marginTop: Spacing.three,
    lineHeight: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '85%',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: Spacing.four,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: Spacing.one,
  },
  modalSub: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: Spacing.three,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: Colors.backgroundElement,
    borderRadius: 8,
    padding: Spacing.three,
    color: Colors.text,
    fontSize: 16,
    marginBottom: Spacing.four,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.three,
  },
  modalCancel: {
    padding: Spacing.three,
  },
  modalCancelText: {
    color: Colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  modalSubmit: {
    backgroundColor: Colors.primary,
    padding: Spacing.three,
    borderRadius: 8,
    paddingHorizontal: Spacing.four,
  },
  modalSubmitText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
