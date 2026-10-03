import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import * as Haptics from 'expo-haptics';

import { createAuthenticatedClient, invokeFunction } from '@/utils/supabase';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useThemeColors, type ThemeColors } from '@/hooks/useThemeColors';

interface ChatItem {
  id: string;
  name: string;
  category: string;
  image_url: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  items?: ChatItem[];
  failed?: boolean;
}

const STARTERS = [
  'What should I wear to a wedding?',
  "It's raining today. What works?",
  'Style my favourite jeans three ways',
  'What am I missing for work outfits?',
];

export default function ChatScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || thinking) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMessage: Message = { id: `u-${Date.now()}`, role: 'user', content };
    const history = [...messages.filter((m) => !m.failed), userMessage];
    setMessages(history);
    setDraft('');
    setThinking(true);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const data = await invokeFunction<{ reply: string; items: ChatItem[] }>(
        createAuthenticatedClient(token),
        'stylist-chat',
        { messages: history.map(({ role, content: c }) => ({ role, content: c })) },
      );
      setMessages((list) => [...list, { id: `a-${Date.now()}`, role: 'assistant', content: data.reply, items: data.items }]);
    } catch (e) {
      setMessages((list) => [
        ...list,
        { id: `e-${Date.now()}`, role: 'assistant', content: e instanceof Error ? e.message : 'Something went wrong.', failed: true },
      ]);
    } finally {
      setThinking(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const mine = item.role === 'user';
    return (
      <View style={[styles.messageRow, mine && styles.messageRowMine]}>
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, item.failed && styles.bubbleFailed]}>
          <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.content}</Text>
        </View>
        {item.items && item.items.length > 0 ? (
          <View style={styles.itemsRow}>
            {item.items.map((piece) => (
              <TouchableOpacity
                key={piece.id}
                onPress={() => router.push(`/item/${piece.id}` as never)}
                style={styles.itemCard}
                accessibilityLabel={piece.name || piece.category}
              >
                <Image source={piece.image_url} style={styles.itemImage} contentFit="contain" />
                <Text style={styles.itemName} numberOfLines={1}>{piece.name || piece.category}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.headerSide} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Ask your stylist</Text>
          <Text style={styles.headerSubtitle}>Answers from your own wardrobe</Text>
        </View>
        <TouchableOpacity
          onPress={() => setMessages([])}
          hitSlop={8}
          style={[styles.headerSide, { alignItems: 'flex-end' }]}
          disabled={messages.length === 0}
          accessibilityLabel="New chat"
        >
          <Ionicons name="create-outline" size={22} color={messages.length ? colors.text : colors.textTertiary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="sparkles" size={28} color={Colors.accent} />
              </View>
              <Text style={styles.emptyTitle}>What are we dressing for?</Text>
              <Text style={styles.emptyText}>Ask about an event, the weather, or how to wear something you own.</Text>
              <View style={styles.starters}>
                {STARTERS.map((s) => (
                  <Pressable key={s} style={styles.starter} onPress={() => send(s)}>
                    <Text style={styles.starterText}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          }
          ListFooterComponent={
            thinking ? (
              <View style={[styles.messageRow]}>
                <View style={[styles.bubble, styles.bubbleTheirs, styles.thinking]}>
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                  <Text style={styles.thinkingText}>Looking through your wardrobe…</Text>
                </View>
              </View>
            ) : null
          }
        />

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask anything about what to wear…"
            placeholderTextColor={colors.textTertiary}
            maxLength={1000}
            multiline
          />
          <TouchableOpacity
            onPress={() => send(draft)}
            disabled={thinking || !draft.trim()}
            style={[styles.sendButton, (!draft.trim() || thinking) && { opacity: 0.4 }]}
            accessibilityLabel="Send"
          >
            <Ionicons name="arrow-up" size={18} color={colors.background} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.separator,
  },
  headerSide: { width: 44, height: 44, justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '600', color: c.text },
  headerSubtitle: { fontSize: 11, color: c.textTertiary, marginTop: 1 },
  list: { padding: Spacing.three, gap: 12, flexGrow: 1 },
  messageRow: { alignItems: 'flex-start', gap: 8 },
  messageRowMine: { alignItems: 'flex-end' },
  bubble: { maxWidth: '86%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  bubbleMine: { backgroundColor: c.text, borderBottomRightRadius: 6 },
  bubbleTheirs: { backgroundColor: c.backgroundElement, borderBottomLeftRadius: 6 },
  bubbleFailed: { backgroundColor: 'rgba(239,68,68,0.10)' },
  bubbleText: { fontSize: 15, lineHeight: 22, color: c.text },
  bubbleTextMine: { color: c.background },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thinkingText: { fontSize: 14, color: c.textSecondary },
  itemsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, maxWidth: '92%' },
  itemCard: { width: 84, gap: 4 },
  itemImage: { width: 84, height: 96, borderRadius: Radius.button, backgroundColor: c.backgroundElement },
  itemName: { fontSize: 11, color: c.textSecondary },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: Spacing.two },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(184,147,106,0.14)', justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: c.text, marginTop: 4 },
  emptyText: { fontSize: 14, lineHeight: 20, color: c.textSecondary, textAlign: 'center' },
  starters: { alignSelf: 'stretch', gap: 8, marginTop: Spacing.three },
  starter: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: c.border,
  },
  starterText: { fontSize: 15, color: c.text },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.separator,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
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
