import React, { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { fetchFeed as fetchLookbook, setLiked, type FeedPost } from '@/utils/lookbook';
import {
  Alert,
  StyleSheet,
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Modal,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useAuth } from '@clerk/expo';
import * as ImagePicker from 'expo-image-picker';
import { processImageForUpload } from '@/utils/imageProcessing';
import { Ionicons } from '@expo/vector-icons';
import { createAuthenticatedClient } from '@/utils/supabase';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useThemeColors, type ThemeColors } from '@/hooks/useThemeColors';

export default function LookbookScreen() {
  const router = useRouter();
  const { getToken, userId } = useAuth();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [postModalVisible, setPostModalVisible] = useState(false);
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useFocusEffect(
    useCallback(() => {
      fetchFeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const fetchFeed = async () => {
    if (!userId) return;
    setLoading(true);
    setErrorMsg(null);

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, 2000));
        const token = await getToken({ skipCache: attempt > 0 });
        if (!token) throw new Error('Not authenticated');
        setPosts(await fetchLookbook(createAuthenticatedClient(token), userId));
        break;
      } catch (e: unknown) {
        if ((e as any)?.code === 'PGRST303' && attempt === 0) continue;
        console.error('[Lookbook] fetchFeed error:', e);
        setErrorMsg(e instanceof Error ? e.message : 'Could not load the feed.');
        break;
      }
    }

    setLoading(false);
  };

  const handlePickImage = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow photo library access to post to the Lookbook.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setPickedUri(result.assets[0].uri);
      setPostModalVisible(true);
    }
  };

  const handlePost = async () => {
    if (!pickedUri || !userId) return;
    setUploading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const imageBase64 = await processImageForUpload(pickedUri);

      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const client = createAuthenticatedClient(token);
      const { data, error } = await client.functions.invoke('create-post', {
        body: { imageBase64, caption: caption.trim() },
      });
      if (error) {
        let msg = error.message ?? 'Failed to post';
        try {
          const detail = await (error as any).context?.json?.();
          msg = detail?.error ?? detail?.message ?? msg;
        } catch {}
        throw new Error(msg);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPostModalVisible(false);
      setPickedUri(null);
      setCaption('');

      if (data?.isSafe) {
        Alert.alert('Posted!', 'Your look is live in the Lookbook.');
        fetchFeed();
      } else {
        Alert.alert('Flagged', 'Your post was flagged by moderation and will not be displayed.');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to post.';
      Alert.alert('Error', msg);
    } finally {
      setUploading(false);
    }
  };

  const toggleLike = async (post: FeedPost) => {
    if (!userId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const like = !post.liked;
    const apply = (liked: boolean, likeCount: number) =>
      setPosts(list => list.map(p => (p.id === post.id ? { ...p, liked, likeCount } : p)));
    apply(like, Math.max(0, post.likeCount + (like ? 1 : -1)));
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      await setLiked(createAuthenticatedClient(token), userId, post.id, like);
    } catch {
      apply(post.liked, post.likeCount);
    }
  };

  const openPost = (post: FeedPost) => router.push(`/post/${post.id}` as never);

  const renderPost = ({ item }: { item: FeedPost }) => (
    <View style={styles.postCard}>
      <TouchableOpacity activeOpacity={0.9} onPress={() => openPost(item)}>
        <Image source={item.image_url} style={styles.postImage} contentFit="cover" />
      </TouchableOpacity>
      <View style={styles.captionBlock}>
        <Text style={styles.authorText} numberOfLines={1}>{item.author}</Text>
        {item.caption ? <Text style={styles.captionText} numberOfLines={2}>{item.caption}</Text> : null}
      </View>
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => toggleLike(item)}
          accessibilityLabel={item.liked ? 'Unlike' : 'Like'}
        >
          <Ionicons name={item.liked ? 'heart' : 'heart-outline'} size={18} color={item.liked ? Colors.danger : colors.textSecondary} />
          {item.likeCount > 0 ? <Text style={styles.actionCount}>{item.likeCount}</Text> : null}
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => openPost(item)} accessibilityLabel="Comments">
          <Ionicons name="chatbubble-outline" size={17} color={colors.textSecondary} />
          {item.commentCount > 0 ? <Text style={styles.actionCount}>{item.commentCount}</Text> : null}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Lookbook</Text>
        <TouchableOpacity style={styles.postTrigger} onPress={handlePickImage} activeOpacity={0.8}>
          <Ionicons name="add" size={22} color={colors.background} />
        </TouchableOpacity>
      </View>

      {/* Inline error banner */}
      {errorMsg && (
        <Animated.View entering={FadeIn.duration(240)} exiting={FadeOut.duration(200)} style={styles.errorBanner}>
          <Ionicons name="alert-circle-outline" size={16} color={Colors.danger} />
          <Text style={styles.errorBannerText} numberOfLines={2}>{errorMsg}</Text>
          <TouchableOpacity onPress={() => { setErrorMsg(null); fetchFeed(); }} hitSlop={8}>
            <Text style={styles.errorRetry}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setErrorMsg(null)} hitSlop={8}>
            <Ionicons name="close" size={16} color={Colors.danger} />
          </TouchableOpacity>
        </Animated.View>
      )}

      {loading && posts.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.textSecondary} />
          <Text style={styles.loadingText}>Loading looks…</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.gridContainer}
          columnWrapperStyle={styles.gridRow}
          showsVerticalScrollIndicator={false}
          onRefresh={fetchFeed}
          refreshing={loading}
          ListEmptyComponent={
            <Animated.View entering={FadeIn.delay(100).duration(400)} style={styles.center}>
              <View style={styles.emptyIconContainer}>
                <Ionicons name="images-outline" size={34} color={colors.textTertiary} />
              </View>
              <Text style={styles.emptyTitle}>No looks yet</Text>
              <Text style={styles.emptyText}>
                Be the first to share{'\n'}your outfit with the community.
              </Text>
              <TouchableOpacity style={styles.emptyAction} onPress={handlePickImage} activeOpacity={0.8}>
                <Ionicons name="add" size={16} color={Colors.accent} />
                <Text style={styles.emptyActionText}>Share a Look</Text>
              </TouchableOpacity>
            </Animated.View>
          }
          renderItem={renderPost}
        />
      )}

      {/* Post modal */}
      <Modal visible={postModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Share Your Look</Text>
            {pickedUri && (
              <Image source={pickedUri} style={styles.previewImage} contentFit="cover" />
            )}
            <TextInput
              style={styles.captionInput}
              placeholder="Add a caption…"
              placeholderTextColor={colors.textTertiary}
              value={caption}
              onChangeText={setCaption}
              multiline
              maxLength={200}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.ghostButton}
                onPress={() => { setPostModalVisible(false); setPickedUri(null); setCaption(''); }}
                disabled={uploading}
              >
                <Text style={styles.ghostButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, uploading && styles.buttonDisabled]}
                onPress={handlePost}
                disabled={uploading}
              >
                {uploading
                  ? <ActivityIndicator color={colors.background} size="small" />
                  : <Text style={styles.primaryButtonText}>Post</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },

  // ── Header ──
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  postTrigger: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.text,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
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

  // ── Loading / Empty ──
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
    paddingTop: 80,
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
    fontSize: 18,
    fontWeight: '600',
    color: c.text,
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  emptyText: {
    color: c.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.three,
  },
  emptyAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.accentLight,
    backgroundColor: 'rgba(184,147,106,0.08)',
  },
  emptyActionText: {
    color: Colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Grid ──
  gridContainer: {
    paddingHorizontal: Spacing.four,
    paddingBottom: 120,
  },
  gridRow: {
    gap: 10,
    marginBottom: 10,
  },
  postCard: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: c.backgroundElement,
  },
  postImage: {
    width: '100%',
    aspectRatio: 3 / 4,
  },
  captionBlock: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
  },
  captionText: {
    fontSize: 12,
    color: c.textSecondary,
    lineHeight: 17,
  },
  authorText: {
    fontSize: 12,
    fontWeight: '600',
    color: c.text,
    marginBottom: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 40,
    paddingHorizontal: 6,
  },
  actionCount: {
    fontSize: 12,
    fontWeight: '600',
    color: c.textSecondary,
    fontVariant: ['tabular-nums'],
  },

  // ── Modal ──
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
  previewImage: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: Radius.card,
  },
  captionInput: {
    backgroundColor: c.backgroundElement,
    borderRadius: Radius.input,
    padding: Spacing.three,
    fontSize: 15,
    color: c.text,
    borderWidth: 1,
    borderColor: c.border,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  ghostButton: {
    flex: 1,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ghostButtonText: {
    color: c.text,
    fontWeight: '500',
    fontSize: 15,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: c.text,
    borderRadius: Radius.button,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: c.background,
    fontWeight: '600',
    fontSize: 15,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
