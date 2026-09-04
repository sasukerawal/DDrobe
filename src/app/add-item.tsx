import React, { useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import * as Haptics from 'expo-haptics';

import { processImageForUpload } from '@/utils/imageProcessing';
import { createAuthenticatedClient } from '@/utils/supabase';
import { useAppStore } from '@/store/useAppStore';
import { Colors, Spacing, Radius } from '@/constants/theme';
import type { ClosetItem } from '@/types';

export default function AddItemScreen() {
  const router = useRouter();
  const { getToken, userId } = useAuth();
  const { addClosetItem } = useAppStore();

  const [permission, requestPermission] = useCameraPermissions();
  const [uploading, setUploading] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);

  const cameraRef = useRef<CameraView>(null);

  if (!permission) return null;

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionSub}>
          DDrobe needs camera access to photograph your clothing items.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ghostButton} onPress={() => router.back()}>
          <Text style={styles.ghostButtonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

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

  const handleUpload = async () => {
    if (!capturedUri || !userId) return;
    setUploading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const token = await getToken({ template: 'supabase' });
      if (!token) throw new Error('Not authenticated');

      // Resize to 512×512 and convert to base64 (Zero-Cost AI Tagging — architecture.md)
      const imageBase64 = await processImageForUpload(capturedUri);
      const client = createAuthenticatedClient(token);

      const { data, error } = await client.functions.invoke('process-image', {
        body: { imageBase64, userId },
      });

      if (error) throw new Error(error.message);
      if (!data?.item) throw new Error('No item returned from AI tagging service.');

      addClosetItem(data.item as ClosetItem);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Alert.alert('Item Added!', 'Your item has been tagged and added to your closet.', [
        { text: 'Add Another', onPress: () => setCapturedUri(null) },
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      Alert.alert('Error', msg);
    } finally {
      setUploading(false);
    }
  };

  // Preview captured photo before uploading
  if (capturedUri) {
    return (
      <View style={styles.previewContainer}>
        <Image source={{ uri: capturedUri }} style={styles.preview} contentFit="cover" />

        {uploading && (
          <View style={styles.uploadingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.uploadingText}>AI is tagging your item...</Text>
          </View>
        )}

        <SafeAreaView style={styles.previewActions}>
          <TouchableOpacity
            style={styles.ghostButton}
            onPress={() => setCapturedUri(null)}
            disabled={uploading}
          >
            <Text style={styles.ghostButtonText}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, uploading && styles.buttonDisabled]}
            onPress={handleUpload}
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

  // Camera viewfinder
  return (
    <View style={styles.cameraContainer}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back">
        <SafeAreaView style={styles.cameraOverlay}>
          <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>

          <View style={styles.frameGuide} />

          <View style={styles.cameraBottom}>
            <Text style={styles.cameraHint}>
              Lay item flat or hang it up for best AI tagging results.
            </Text>
            <TouchableOpacity style={styles.captureButton} onPress={handleCapture}>
              <View style={styles.captureInner} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Permission screen
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.text,
    textAlign: 'center',
  },
  permissionSub: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Camera screen
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
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
  closeText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
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

  // Preview screen
  previewContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  preview: {
    flex: 1,
  },
  uploadingOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
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

  // Shared buttons
  primaryButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: Radius.button,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  ghostButton: {
    flex: 1,
    borderRadius: Radius.button,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  ghostButtonText: {
    color: Colors.primary,
    fontWeight: '600',
    fontSize: 16,
  },
});
