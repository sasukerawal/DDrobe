import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import * as Haptics from 'expo-haptics';

import {
  addComment,
  deleteComment,
  fetchComments,
  fetchPost,
  report,
  setLiked,
  timeAgo,
  type FeedPost,
  type PostComment,
} from '@/utils/lookbook';
import { DropdownMenu } from '@/components/DropdownMenu';

const REPORT_REASONS = ['Harassment or hate', 'Nudity or sexual content', 'Spam or scam', 'Something else'];
import { createAuthenticatedClient } from '@/utils/supabase';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useThemeColors, type ThemeColors } from '@/hooks/useThemeColors';

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getToken, userId } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [post, setPost] = useState<FeedPost | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ kind: 'post' | 'comment'; id: string } | null>(null);
  const listRef = useRef<FlatList<PostComment>>(null);

  const getClient = useCallback(async () => {
    const token = await getToken();
    if (!token) throw new Error('Not signed in');
    return createAuthenticatedClient(token);
  }, [getToken]);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const client = await getClient();
      const [p, c] = await Promise.all([fetchPost(client, userId, id), fetchComments(client, id)]);
      setPost(p);
      setComments(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this post.');
    }
  }, [getClient, id, userId]);

  useEffect(() => { load(); }, [load]);

  const toggleLike = async () => {
    if (!post || !userId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const like = !post.liked;
    setPost({ ...post, liked: like, likeCount: Math.max(0, post.likeCount + (like ? 1 : -1)) });
    try {
      await setLiked(await getClient(), userId, post.id, like);
    } catch {
      setPost(post);
    }
  };

  const send = async () => {
    if (!userId || !draft.trim()) return;
    setSending(true);
    try {
      const client = await getClient();
      await addComment(client, id, draft);
      setDraft('');
      setComments(await fetchComments(client, id));
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      Alert.alert('Comment not posted', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  const submitReport = async (reason: string) => {
    if (!userId || !reportTarget) return;
    const target = reportTarget;
    setReportTarget(null);
    try {
      await report(await getClient(), userId, target.kind === 'post' ? { postId: target.id } : { commentId: target.id }, reason);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (target.kind === 'post') {
        Alert.alert('Thanks for reporting', "You won't see this post again. We review reports to keep the Lookbook friendly.");
        router.back();
      } else {
        setComments((list) => list.filter((c) => c.id !== target.id));
        Alert.alert('Thanks for reporting', "You won't see this comment again.");
      }
    } catch (e) {
      Alert.alert('Report not sent', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const onCommentLongPress = (comment: PostComment) => {
    const canDelete = comment.user_id === userId || post?.user_id === userId;
    if (!canDelete) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setReportTarget({ kind: 'comment', id: comment.id });
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Delete comment?', comment.body, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setComments((list) => list.filter((c) => c.id !== comment.id));
          try {
            await deleteComment(await getClient(), comment.id);
          } catch {
            load();
          }
        },
      },
    ]);
  };

  const deletePost = () => {
    Alert.alert('Delete your post?', 'It will be removed from the Lookbook.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error: deleteError } = await (await getClient()).from('feed_posts').delete().eq('id', id);
            if (deleteError) throw deleteError;
            router.back();
          } catch (e) {
            Alert.alert('Not deleted', e instanceof Error ? e.message : 'Please try again.');
          }
        },
      },
    ]);
  };

  if (!post) {
    return (
      <SafeAreaView style={styles.center}>
        {error ? <Text style={styles.muted}>{error}</Text> : <ActivityIndicator color={colors.textSecondary} />}
      </SafeAreaView>
    );
  }

  const header = (
    <View style={styles.postBlock}>
      <Image source={post.image_url} style={styles.image} contentFit="cover" />
      <View style={styles.postMeta}>
        <View style={{ flex: 1 }}>
          <Text style={styles.author}>{post.author}</Text>
          <Text style={styles.time}>{timeAgo(post.created_at)}</Text>
        </View>
        <TouchableOpacity onPress={toggleLike} style={styles.likeButton} accessibilityLabel={post.liked ? 'Unlike' : 'Like'}>
          <Ionicons name={post.liked ? 'heart' : 'heart-outline'} size={24} color={post.liked ? Colors.danger : colors.text} />
          <Text style={styles.likeCount}>{post.likeCount}</Text>
        </TouchableOpacity>
      </View>
      {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}
      <Text style={styles.commentsTitle}>
        {comments.length === 0 ? 'No comments yet' : `${comments.length} comment${comments.length === 1 ? '' : 's'}`}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.headerSide} accessibilityLabel="Close">
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Look</Text>
        {post.user_id === userId ? (
          <TouchableOpacity onPress={deletePost} hitSlop={8} style={[styles.headerSide, { alignItems: 'flex-end' }]} accessibilityLabel="Delete post">
            <Ionicons name="trash-outline" size={21} color={Colors.danger} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => setReportTarget({ kind: 'post', id: post.id })}
            hitSlop={8}
            style={[styles.headerSide, { alignItems: 'flex-end' }]}
            accessibilityLabel="Report post"
          >
            <Ionicons name="flag-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <DropdownMenu
        visible={reportTarget !== null}
        onDismiss={() => setReportTarget(null)}
        title={reportTarget?.kind === 'post' ? 'Report this post' : 'Report this comment'}
        options={REPORT_REASONS.map((reason) => ({
          label: reason,
          onPress: () => submitReport(reason),
          destructive: true,
        }))}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={listRef}
          data={comments}
          keyExtractor={(c) => c.id}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable onLongPress={() => onCommentLongPress(item)} style={styles.comment}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(item.author[0] ?? '?').toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.commentAuthor}>
                  {item.author} <Text style={styles.time}>· {timeAgo(item.created_at)}</Text>
                </Text>
                <Text style={styles.commentBody}>{item.body}</Text>
              </View>
            </Pressable>
          )}
        />

        <View style={styles.composer}>
          <TextInput
            style={styles.composerInput}
            value={draft}
            onChangeText={setDraft}
            placeholder="Add a comment…"
            placeholderTextColor={colors.textTertiary}
            maxLength={300}
            multiline
          />
          <TouchableOpacity
            onPress={send}
            disabled={sending || !draft.trim()}
            style={[styles.sendButton, (!draft.trim() || sending) && { opacity: 0.4 }]}
            accessibilityLabel="Post comment"
          >
            {sending ? <ActivityIndicator size="small" color={colors.background} /> : <Ionicons name="arrow-up" size={18} color={colors.background} />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  center: { flex: 1, backgroundColor: c.background, justifyContent: 'center', alignItems: 'center', padding: Spacing.four },
  muted: { fontSize: 14, color: c.textSecondary, textAlign: 'center' },
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
  list: { paddingBottom: Spacing.four },
  postBlock: { gap: 10, paddingBottom: Spacing.two },
  image: { width: '100%', aspectRatio: 3 / 4, backgroundColor: c.backgroundElement },
  postMeta: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.three },
  author: { fontSize: 15, fontWeight: '700', color: c.text },
  time: { fontSize: 12, fontWeight: '400', color: c.textTertiary },
  likeButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 4 },
  likeCount: { fontSize: 15, fontWeight: '600', color: c.text, fontVariant: ['tabular-nums'] },
  caption: { fontSize: 15, lineHeight: 22, color: c.text, paddingHorizontal: Spacing.three },
  commentsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: c.textSecondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: Spacing.three,
    marginTop: 6,
  },
  comment: { flexDirection: 'row', gap: 10, paddingHorizontal: Spacing.three, paddingVertical: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.backgroundElement, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 13, fontWeight: '700', color: c.textSecondary },
  commentAuthor: { fontSize: 13, fontWeight: '600', color: c.text },
  commentBody: { fontSize: 15, lineHeight: 21, color: c.text, marginTop: 2 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.separator,
  },
  composerInput: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    color: c.text,
    backgroundColor: c.backgroundElement,
  },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.text, justifyContent: 'center', alignItems: 'center' },
});
