import React, { useEffect, useMemo, useState } from 'react';
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
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useAuth } from '@clerk/expo';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { createAuthenticatedClient } from '@/utils/supabase';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useThemeColors, type ThemeColors } from '@/hooks/useThemeColors';

interface FeedPost {
  id: string;
  user_id: string;
  image_url: string;
  caption: string;
  created_at: string;
}

export default function LookbookScreen() {
  const { getToken, userId } = useAuth();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [postModalVisible, setPostModalVisible] = useState(false);
  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    fetchFeed();
  }, []);

  const fetchFeed = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const client = createAuthenticatedClient(token);
      const { data, error } = await client
        .from('feed_posts')
        .select('*')
        .eq('moderation_status', 'approved')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPosts(data || []);
    } catch (e: unknown) {
      console.error('[Lookbook] fetchFeed error:', e);
      const msg = e instanceof Error ? e.message : 'Failed to load the feed.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  const handlePickImage = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow photo library access to post to the Lookbook.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
      // Resize to 512x512 before upload (cost control + faster moderation)
      const resized = await ImageManipulator.manipulateAsync(
        pickedUri,
        [{ resize: { width: 512, height: 512 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (!resized.base64) throw new Error('Image processing failed.');

      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const client = createAuthenticatedClient(token);
      const { data, error } = await client.functions.invoke('create-post', {
        body: { userId, imageBase64: resized.base64, caption: caption.trim() },
      });
      if (error) throw error;

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

  const renderPost = ({ item }: { item: FeedPost }) => (
    <View style={styles.postCard}>
      <Image source={item.image_url} style={styles.postImage} contentFit="cover" />
      <View style={styles.postContent}>
        {item.caption ? <Text style={styles.caption}>{item.caption}</Text> : null}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Alert.alert('Coming soon', 'Likes are coming in the next update!');
            }}
          >
            <Text style={styles.actionText}>❤️ Like</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Alert.alert('Coming soon', 'Comments are coming in the next update!');
            }}
          >
            <Text style={styles.actionText}>💬 Comment</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Lookbook</Text>
        <TouchableOpacity style={styles.cameraButton} onPress={handlePickImage} activeOpacity={0.8}>
          <Ionicons name="camera-outline" size={22} color="#fff" />
          <Text style={styles.cameraButtonText}>Post</Text>
        </TouchableOpacity>
      </View>

      {loading && posts.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.feedContainer}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyIcon}>📸</Text>
              <Text style={styles.emptyText}>No outfits posted yet.</Text>
              <Text style={styles.emptySubtext}>Be the first — tap Post to share your look!</Text>
            </View>
          }
          renderItem={renderPost}
          onRefresh={fetchFeed}
          refreshing={loading}
        />
      )}

      {/* Post modal */}
      <Modal visible={postModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Share Your Look</Text>
            {pickedUri && (
              <Image source={pickedUri} style={styles.previewImage} contentFit="cover" />
            )}
            <TextInput
              style={styles.captionInput}
              placeholder="Add a caption..."
              placeholderTextColor={colors.textSecondary}
              value={caption}
              onChangeText={setCaption}
              multiline
              maxLength={200}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => { setPostModalVisible(false); setPickedUri(null); setCaption(''); }}
                disabled={uploading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.postButton, uploading && styles.buttonDisabled]}
                onPress={handlePost}
                disabled={uploading}
              >
                {uploading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.postButtonText}>Post</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    color: c.text,
  },
  cameraButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.button,
  },
  cameraButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.four },
  feedContainer: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.four, gap: Spacing.four },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.two },
  emptyText: { color: c.textSecondary, fontSize: 16, fontWeight: '600' },
  emptySubtext: { color: c.textSecondary, fontSize: 13, marginTop: Spacing.one, textAlign: 'center' },
  postCard: {
    backgroundColor: c.surface,
    borderRadius: 16,
    overflow: 'hidden',
  },
  postImage: { width: '100%', aspectRatio: 3 / 4 },
  postContent: { padding: Spacing.three },
  caption: { fontSize: 15, color: c.text, marginBottom: Spacing.two, lineHeight: 20 },
  actionRow: { flexDirection: 'row', gap: Spacing.three },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    backgroundColor: c.backgroundElement,
    borderRadius: 8,
  },
  actionText: { fontSize: 14, color: c.textSecondary, fontWeight: '500' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: c.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: c.text },
  previewImage: { width: '100%', aspectRatio: 3 / 4, borderRadius: 12 },
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
  modalActions: { flexDirection: 'row', gap: Spacing.three },
  cancelButton: {
    flex: 1,
    borderRadius: Radius.button,
    borderWidth: 1.5,
    borderColor: c.border,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  cancelButtonText: { color: c.text, fontWeight: '600', fontSize: 16 },
  postButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: Radius.button,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  postButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  buttonDisabled: { opacity: 0.6 },
});
