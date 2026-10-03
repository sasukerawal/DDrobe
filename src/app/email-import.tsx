import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { fetchPurchaseEmails, fetchEmailMeta, fetchEmailHtml, parseSender } from '@/utils/gmail';
import {
  connectGmail,
  disconnectGmail,
  gmailSupported,
  refreshGmailToken,
  restoreGmailToken,
} from '@/utils/googleAuth';
import { processImageForUpload } from '@/utils/imageProcessing';
import { createAuthenticatedClient } from '@/utils/supabase';
import { useAppStore } from '@/store/useAppStore';
import { Colors, Radius, Spacing } from '@/constants/theme';
import type { ClosetItem } from '@/types';

interface FoundItem {
  name: string;
  imageUrl: string;
  category?: string;
  from: string;
  status: 'pending' | 'adding' | 'added' | 'failed';
}

type Screen = 'connect' | 'scanning' | 'results' | 'empty';

export default function EmailImportScreen() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { addClosetItem } = useAppStore();

  const [screen, setScreen] = useState<Screen>('connect');
  const [scanProgress, setScanProgress] = useState('');
  const [items, setItems] = useState<FoundItem[]>([]);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Reconnect a previously linked Gmail account silently
  useEffect(() => {
    restoreGmailToken()
      .then(token => {
        if (token) {
          setAccessToken(token);
          startScan(token);
        }
      })
      .catch(e => console.warn('[GmailScan] restore failed:', e));
  }, []);

  const startScan = async (initialToken: string) => {
    setScreen('scanning');
    setScanProgress('Connecting to Gmail…');
    let token = initialToken;

    try {
      let emails: { id: string; threadId: string }[];
      try {
        emails = await fetchPurchaseEmails(token);
      } catch (e: any) {
        if (e?.code !== 401) throw e;
        const fresh = await refreshGmailToken(token);
        if (!fresh) {
          setAccessToken(null);
          setScreen('connect');
          Alert.alert('Reconnect Gmail', 'Your Gmail connection expired. Tap Connect Gmail to continue.');
          return;
        }
        token = fresh;
        setAccessToken(fresh);
        emails = await fetchPurchaseEmails(token);
      }

      if (emails.length === 0) {
        setScreen('empty');
        return;
      }

      setScanProgress(`Scanning ${emails.length} purchase email${emails.length !== 1 ? 's' : ''}…`);

      const authToken = await getToken();
      if (!authToken) throw new Error('Not authenticated');
      const client = createAuthenticatedClient(authToken);

      const found: FoundItem[] = [];
      let failedCount = 0;
      let lastFailure = '';

      for (let i = 0; i < emails.length; i++) {
        const { id } = emails[i];
        setScanProgress(`Reading email ${i + 1} of ${emails.length}…`);

        try {
          const [meta, html] = await Promise.all([
            fetchEmailMeta(token, id),
            fetchEmailHtml(token, id),
          ]);

          const { data, error } = await client.functions.invoke('parse-receipt', {
            body: {
              emailHtml: html.slice(0, 60000),
              emailSubject: meta.subject,
              fromAddress: meta.from,
            },
          });

          if (error) {
            let msg = error.message ?? 'Could not read email';
            try {
              const detail = await (error as any).context?.json?.();
              msg = detail?.error ?? detail?.message ?? msg;
            } catch {}
            throw new Error(msg);
          }

          for (const it of (data?.items ?? []) as any[]) {
            found.push({
              name: it.name ?? 'Unknown item',
              imageUrl: it.imageUrl ?? '',
              category: it.category,
              from: parseSender(meta.from),
              status: 'pending',
            });
          }
        } catch (e) {
          failedCount++;
          lastFailure = e instanceof Error ? e.message : 'Could not read email';
          console.warn('[GmailScan] email failed:', lastFailure);
        }
      }

      setItems(found);
      setScreen(found.length === 0 ? 'empty' : 'results');
      if (found.length === 0 && failedCount === emails.length) {
        Alert.alert('Scan failed', lastFailure);
      } else if (failedCount > 0) {
        Alert.alert(
          'Some emails skipped',
          `${failedCount} of ${emails.length} emails couldn't be read. Tap Scan Again to retry them.`,
        );
      }
    } catch (e: unknown) {
      console.error('[GmailScan] error:', e);
      setScreen('empty');
      Alert.alert('Scan failed', 'Could not read your emails. Please try again.');
    }
  };

  const handleConnect = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setConnecting(true);
    try {
      const token = await connectGmail();
      if (!token) return;
      setAccessToken(token);
      startScan(token);
    } catch (e: unknown) {
      console.error('[GmailScan] connect failed:', e);
      Alert.alert(
        "Couldn't connect Gmail",
        e instanceof Error ? e.message : 'Google sign-in failed. Please try again.',
      );
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await disconnectGmail();
    setAccessToken(null);
    setItems([]);
    setScreen('connect');
  };

  const handleAddItem = async (itemIndex: number) => {
    const item = items[itemIndex];
    if (!item || item.status !== 'pending') return;
    if (!item.imageUrl) {
      Alert.alert('No Image', 'This item has no product image.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setItems(prev => prev.map((it, i) => i === itemIndex ? { ...it, status: 'adding' } : it));

    try {
      const tempPath = `${FileSystem.cacheDirectory}email_item_${Date.now()}.jpg`;
      const { uri } = await FileSystem.downloadAsync(item.imageUrl, tempPath);
      const imageBase64 = await processImageForUpload(uri);

      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const client = createAuthenticatedClient(token);
      const { data, error } = await client.functions.invoke('process-image', {
        body: { imageBase64 },
      });
      if (error) {
        let msg = error.message ?? 'Import failed';
        try {
          const detail = await (error as any).context?.json?.();
          msg = detail?.error ?? detail?.message ?? msg;
        } catch {}
        throw new Error(msg);
      }
      if (!data?.item) throw new Error('No item returned.');

      addClosetItem(data.item as ClosetItem);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setItems(prev => prev.map((it, i) => i === itemIndex ? { ...it, status: 'added' } : it));
    } catch (e: unknown) {
      setItems(prev => prev.map((it, i) => i === itemIndex ? { ...it, status: 'failed' } : it));
      Alert.alert('Import failed', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const handleAddAll = async () => {
    const pending = items.map((it, i) => ({ it, i })).filter(({ it }) => it.status === 'pending');
    for (const { i } of pending) await handleAddItem(i);
  };

  const handleRescan = () => {
    if (accessToken) startScan(accessToken);
  };

  const pendingCount = items.filter(it => it.status === 'pending').length;
  const addedCount = items.filter(it => it.status === 'added').length;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Import from Email</Text>
        {screen === 'results' || screen === 'empty' ? (
          <TouchableOpacity onPress={handleDisconnect} hitSlop={8}>
            <Text style={styles.disconnectText}>Disconnect</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 80 }} />
        )}
      </View>

      {/* Connect screen */}
      {screen === 'connect' && (
        <Animated.View entering={FadeIn.duration(280)} style={styles.centeredContent}>
          <View style={styles.iconCircle}>
            <Ionicons name="mail-outline" size={36} color={Colors.accent} />
          </View>
          <Text style={styles.title}>Scan Purchase Emails</Text>
          <Text style={styles.subtitle}>
            Connect your Gmail to automatically detect clothes from order confirmations — Amazon, ASOS, Zara, H&M and more. We only read purchase emails.
          </Text>

          {gmailSupported ? (
            <TouchableOpacity
              style={[styles.googleBtn, connecting && styles.googleBtnDisabled]}
              onPress={handleConnect}
              disabled={connecting}
              activeOpacity={0.85}
            >
              {connecting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name="logo-google" size={18} color="#fff" />
              )}
              <Text style={styles.googleBtnText}>Connect Gmail</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.privacyNote}>
              Gmail import isn't available in Expo Go. Open the DDrobe development build to connect your Gmail.
            </Text>
          )}

          <Text style={styles.privacyNote}>
            DDrobe reads only purchase confirmation emails and never stores email content.
          </Text>
        </Animated.View>
      )}

      {/* Scanning */}
      {screen === 'scanning' && (
        <View style={styles.centeredContent}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.scanningTitle}>Scanning emails…</Text>
          <Text style={styles.scanningProgress}>{scanProgress}</Text>
        </View>
      )}

      {/* Empty */}
      {screen === 'empty' && (
        <Animated.View entering={FadeIn.duration(280)} style={styles.centeredContent}>
          <View style={styles.iconCircle}>
            <Ionicons name="search-outline" size={34} color={Colors.textSecondary} />
          </View>
          <Text style={styles.title}>No Items Found</Text>
          <Text style={styles.subtitle}>
            No clothing items were found in your recent purchase emails. Try again after receiving a new order confirmation.
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={handleRescan} activeOpacity={0.8}>
            <Ionicons name="refresh-outline" size={16} color={Colors.accent} />
            <Text style={styles.retryBtnText}>Scan Again</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Results */}
      {screen === 'results' && (
        <>
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsCount}>
              {items.length} item{items.length !== 1 ? 's' : ''} found
              {addedCount > 0 ? ` · ${addedCount} added` : ''}
            </Text>
            {pendingCount > 1 && (
              <TouchableOpacity onPress={handleAddAll} style={styles.addAllBtn} activeOpacity={0.8}>
                <Text style={styles.addAllText}>Add All</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView contentContainerStyle={styles.resultsList} showsVerticalScrollIndicator={false}>
            {items.map((item, i) => (
              <Animated.View
                key={`item-${i}`}
                entering={FadeInDown.delay(i * 50).duration(280)}
                style={styles.itemCard}
              >
                <View style={styles.itemImageBox}>
                  {item.imageUrl ? (
                    <Image source={item.imageUrl} style={styles.itemImage} contentFit="cover" />
                  ) : (
                    <View style={styles.itemImagePlaceholder}>
                      <Ionicons name="shirt-outline" size={28} color={Colors.textSecondary} />
                    </View>
                  )}
                </View>

                <View style={styles.itemInfo}>
                  <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                  <Text style={styles.itemFrom}>{item.from}</Text>
                  {item.category && (
                    <Text style={styles.itemCategory}>{item.category}</Text>
                  )}
                </View>

                <View style={styles.itemAction}>
                  {item.status === 'pending' && (
                    <TouchableOpacity style={styles.addBtn} onPress={() => handleAddItem(i)} activeOpacity={0.8}>
                      <Text style={styles.addBtnText}>Add</Text>
                    </TouchableOpacity>
                  )}
                  {item.status === 'adding' && <ActivityIndicator size="small" color={Colors.accent} />}
                  {item.status === 'added' && (
                    <View style={styles.addedBadge}>
                      <Ionicons name="checkmark" size={14} color={Colors.success} />
                    </View>
                  )}
                  {item.status === 'failed' && (
                    <TouchableOpacity onPress={() => handleAddItem(i)}>
                      <Ionicons name="refresh-outline" size={20} color={Colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              </Animated.View>
            ))}

            <Text style={styles.scanNote}>
              Images are processed locally before being added to your wardrobe.
            </Text>
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.dark.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    letterSpacing: -0.2,
  },
  disconnectText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
    width: 80,
    textAlign: 'right',
  },

  centeredContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: Colors.backgroundElement,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.four,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.4,
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.four,
  },

  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.primary,
    borderRadius: Radius.button,
    paddingVertical: 14,
    paddingHorizontal: 28,
    minHeight: 52,
    marginBottom: Spacing.three,
  },
  googleBtnDisabled: {
    opacity: 0.5,
  },
  googleBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  privacyNote: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: Spacing.three,
  },

  scanningTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginTop: Spacing.three,
    marginBottom: 6,
  },
  scanningProgress: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.accentLight,
    backgroundColor: 'rgba(184,147,106,0.08)',
    marginTop: Spacing.two,
  },
  retryBtnText: {
    color: Colors.accent,
    fontWeight: '600',
    fontSize: 15,
  },

  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.dark.border,
  },
  resultsCount: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  addAllBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  addAllText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },

  resultsList: {
    padding: Spacing.four,
    paddingBottom: 100,
    gap: 12,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundElement,
    borderRadius: Radius.card,
    padding: Spacing.two,
    gap: Spacing.two,
    borderWidth: 0.5,
    borderColor: Colors.dark.border,
  },
  itemImageBox: {
    width: 72,
    height: 72,
    borderRadius: Radius.small,
    overflow: 'hidden',
    backgroundColor: Colors.dark.backgroundSelected,
    flexShrink: 0,
  },
  itemImage: { width: '100%', height: '100%' },
  itemImagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text,
    lineHeight: 19,
  },
  itemFrom: {
    fontSize: 12,
    color: Colors.accent,
    fontWeight: '500',
  },
  itemCategory: {
    fontSize: 11,
    color: Colors.textSecondary,
    textTransform: 'capitalize',
  },
  itemAction: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.button,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  addBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  addedBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(34,197,94,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanNote: {
    textAlign: 'center',
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: Spacing.three,
  },
});
