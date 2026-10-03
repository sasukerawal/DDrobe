import React, { useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/expo';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

import { processImageForUpload } from '@/utils/imageProcessing';
import { createAuthenticatedClient, invokeFunction } from '@/utils/supabase';
import { useAppStore } from '@/store/useAppStore';
import { Colors, Spacing, Radius } from '@/constants/theme';
import type { ClosetItem } from '@/types';

// Free-tier Gemini limits make very large batches slow; keep each run manageable.
const MAX_BATCH = 15;

interface BatchEntry {
  uri: string;
  status: 'waiting' | 'working' | 'done' | 'failed';
  name?: string;
  error?: string;
}

export default function AddItemScreen() {
  const router = useRouter();
  const { getToken, userId } = useAuth();
  const { addClosetItem } = useAppStore();

  const [permission, requestPermission] = useCameraPermissions();
  const [uploading, setUploading] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [batch, setBatch] = useState<BatchEntry[] | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const stopBatchRef = useRef(false);

  // Background removal and tagging for one photo; returns the saved item.
  const uploadOne = async (uri: string): Promise<ClosetItem> => {
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');
    const imageBase64 = await processImageForUpload(uri, { removeBackground: true });
    const client = createAuthenticatedClient(token);
    const data = await invokeFunction<{ item?: ClosetItem }>(client, 'process-image', { imageBase64 });
    if (!data?.item) throw new Error('No item returned from AI tagging service.');
    addClosetItem(data.item);
    return data.item;
  };

  const runBatch = async (entries: BatchEntry[]) => {
    stopBatchRef.current = false;
    setBatchRunning(true);
    for (let i = 0; i < entries.length; i++) {
      if (stopBatchRef.current) break;
      if (entries[i].status === 'done') continue;
      setBatch(prev => prev && prev.map((e, j) => (j === i ? { ...e, status: 'working', error: undefined } : e)));
      try {
        const item = await uploadOne(entries[i].uri);
        setBatch(prev => prev && prev.map((e, j) => (j === i ? { ...e, status: 'done', name: item.name || item.category } : e)));
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Failed';
        setBatch(prev => prev && prev.map((e, j) => (j === i ? { ...e, status: 'failed', error } : e)));
      }
    }
    setBatchRunning(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleUpload = async (uri: string) => {
    if (!userId) return;
    setUploading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const item = await uploadOne(uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Alert.alert('Item added', `${item.name || 'Your item'} is in your wardrobe.`, [
        { text: 'Add another', onPress: () => setCapturedUri(null) },
        { text: 'Edit details', onPress: () => router.replace(`/item/${item.id}` as never) },
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      Alert.alert('Error', msg);
    } finally {
      setUploading(false);
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current || uploading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (photo?.uri) setCapturedUri(photo.uri);
    } catch {
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const handlePickFromGallery = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow photo library access to add items from your gallery.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_BATCH,
      orderedSelection: true,
      quality: 0.85,
    });
    if (result.canceled || result.assets.length === 0) return;
    if (result.assets.length === 1) {
      setCapturedUri(result.assets[0].uri);
      return;
    }
    const entries: BatchEntry[] = result.assets.map(a => ({ uri: a.uri, status: 'waiting' }));
    setBatch(entries);
    runBatch(entries);
  };

  // Several photos picked from the gallery
  if (batch) {
    const done = batch.filter(e => e.status === 'done').length;
    const failed = batch.filter(e => e.status === 'failed').length;
    const finished = !batchRunning;
    return (
      <SafeAreaView style={styles.batchContainer} edges={['top', 'bottom']}>
        <View style={styles.batchHeader}>
          <Text style={styles.batchTitle}>
            {finished ? `Added ${done} of ${batch.length}` : `Adding ${Math.min(done + failed + 1, batch.length)} of ${batch.length}`}
          </Text>
          <Text style={styles.batchSubtitle}>
            {finished
              ? failed > 0 ? `${failed} couldn't be added. You can retry them.` : 'All items are in your wardrobe.'
              : 'Removing backgrounds and tagging. Keep the app open.'}
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${((done + failed) / batch.length) * 100}%` }]} />
          </View>
        </View>

        <FlatList
          data={batch}
          keyExtractor={(e, i) => `${i}-${e.uri}`}
          contentContainerStyle={styles.batchList}
          renderItem={({ item: entry }) => (
            <View style={styles.batchRow}>
              <Image source={{ uri: entry.uri }} style={styles.batchThumb} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <Text style={styles.batchRowTitle} numberOfLines={1}>
                  {entry.status === 'done' ? entry.name : entry.status === 'working' ? 'Working on it…' : entry.status === 'failed' ? 'Not added' : 'Waiting'}
                </Text>
                {entry.error ? <Text style={styles.batchRowError} numberOfLines={2}>{entry.error}</Text> : null}
              </View>
              {entry.status === 'working' && <ActivityIndicator color={Colors.accent} />}
              {entry.status === 'done' && <Ionicons name="checkmark-circle" size={22} color={Colors.success} />}
              {entry.status === 'failed' && <Ionicons name="alert-circle" size={22} color={Colors.danger} />}
            </View>
          )}
        />

        <View style={styles.batchActions}>
          {finished ? (
            <>
              {failed > 0 && (
                <TouchableOpacity style={styles.batchGhost} onPress={() => runBatch(batch)}>
                  <Text style={styles.batchGhostText}>Retry failed</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()}>
                <Text style={styles.primaryButtonText}>Done</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.batchGhost} onPress={() => { stopBatchRef.current = true; }}>
              <Text style={styles.batchGhostText}>Stop after this one</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // Permission not yet determined
  if (!permission) return null;

  // Preview / upload flow
  if (capturedUri) {
    return (
      <View style={styles.previewContainer}>
        <Image source={{ uri: capturedUri }} style={styles.preview} contentFit="cover" />

        {uploading && (
          <View style={styles.uploadingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.uploadingText}>Cleaning up and tagging your item…</Text>
          </View>
        )}

        <SafeAreaView style={styles.previewActions} edges={['bottom']}>
          <TouchableOpacity
            style={styles.ghostButton}
            onPress={() => setCapturedUri(null)}
            disabled={uploading}
          >
            <Text style={styles.ghostButtonText}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, uploading && styles.buttonDisabled]}
            onPress={() => handleUpload(capturedUri)}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Add to Closet</Text>
            )}
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.center}>
        <View style={styles.errorIcon}>
          <Ionicons name="camera-outline" size={36} color={Colors.textSecondary} />
        </View>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionSub}>
          DDrobe needs camera access to photograph your clothing items.
        </Text>
        <View style={styles.permissionButtons}>
          <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
            <Text style={styles.primaryButtonText}>Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={handlePickFromGallery}>
            <Ionicons name="images-outline" size={18} color={Colors.accent} />
            <Text style={styles.secondaryButtonText}>Choose from Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostButton} onPress={() => router.back()}>
            <Text style={styles.ghostButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Camera mount error / not supported
  if (cameraError) {
    return (
      <SafeAreaView style={styles.center}>
        <View style={styles.errorIcon}>
          <Ionicons name="videocam-off-outline" size={36} color={Colors.textSecondary} />
        </View>
        <Text style={styles.permissionTitle}>Camera Unavailable</Text>
        <Text style={styles.permissionSub}>
          {cameraError.includes('supported')
            ? 'Your device camera is not accessible right now. You can still add items from your photo gallery.'
            : cameraError}
        </Text>
        <View style={styles.permissionButtons}>
          <TouchableOpacity style={styles.primaryButton} onPress={handlePickFromGallery}>
            <Ionicons name="images-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.primaryButtonText}>Choose from Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostButton} onPress={() => router.back()}>
            <Text style={styles.ghostButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Camera viewfinder
  return (
    <View style={styles.cameraContainer}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        onMountError={(e) => {
          console.warn('[Camera] mount error:', e.message);
          setCameraError(e.message || 'Camera is not supported on this device.');
        }}
      />
      <SafeAreaView style={styles.cameraOverlay}>
          <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>

          <View style={styles.frameGuide} />

          <View style={styles.cameraBottom}>
            <Text style={styles.cameraHint}>
              Lay item flat or hang it up for best AI tagging results.
            </Text>
            <View style={styles.captureRow}>
              {/* Gallery shortcut */}
              <TouchableOpacity style={styles.sideAction} onPress={handlePickFromGallery}>
                <Ionicons name="images-outline" size={26} color="#fff" />
                <Text style={styles.sideActionText}>Gallery</Text>
              </TouchableOpacity>

              {/* Shutter */}
              <TouchableOpacity style={styles.captureButton} onPress={handleCapture}>
                <View style={styles.captureInner} />
              </TouchableOpacity>

              {/* Spacer mirror */}
              <View style={styles.sideAction} />
            </View>
          </View>
        </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  errorIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.backgroundElement,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  permissionSub: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  permissionButtons: {
    width: '100%',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },

  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
  },
  closeButton: {
    alignSelf: 'flex-end',
    margin: Spacing.four,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  frameGuide: {
    width: '75%',
    aspectRatio: 3 / 4,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: 16,
    alignSelf: 'center',
  },
  cameraBottom: {
    alignItems: 'center',
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  cameraHint: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: Spacing.five,
  },
  captureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: Spacing.five,
  },
  sideAction: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  sideActionText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '600',
  },
  captureButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 3,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },

  previewContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  preview: {
    flex: 1,
  },
  uploadingOverlay: {
    position: 'absolute',
    left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.three,
  },
  uploadingText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  previewActions: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.four,
    backgroundColor: Colors.surface,
  },

  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.primary,
    borderRadius: Radius.button,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    gap: 6,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: Radius.button,
    borderWidth: 1.5,
    borderColor: Colors.accentLight,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    gap: 8,
    backgroundColor: 'rgba(184,147,106,0.08)',
  },
  secondaryButtonText: {
    color: Colors.accent,
    fontWeight: '600',
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  ghostButton: {
    flex: 1,
    borderRadius: Radius.button,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  ghostButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },

  // ── Batch add ──
  batchContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  batchHeader: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
    gap: 6,
  },
  batchTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.4,
  },
  batchSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    marginTop: Spacing.two,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.accent,
  },
  batchList: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    gap: 10,
  },
  batchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: Radius.card,
    padding: 10,
  },
  batchThumb: {
    width: 52,
    height: 52,
    borderRadius: Radius.small,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  batchRowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  batchRowError: {
    fontSize: 12,
    color: Colors.danger,
    marginTop: 2,
  },
  batchActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    padding: Spacing.four,
    paddingTop: Spacing.two,
  },
  batchGhost: {
    flex: 1,
    minHeight: 52,
    borderRadius: Radius.button,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  batchGhostText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
});
