import React, { useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
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
  const [cameraError, setCameraError] = useState<string | null>(null);

  const cameraRef = useRef<CameraView>(null);

  const handleUpload = async (uri: string) => {
    if (!userId) return;
    setUploading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');

      const imageBase64 = await processImageForUpload(uri, { removeBackground: true });
      const client = createAuthenticatedClient(token);

      const { data, error } = await client.functions.invoke('process-image', {
        body: { imageBase64 },
      });

      if (error) {
        let msg = error.message ?? 'AI tagging failed';
        try {
          const detail = await (error as any).context?.json?.();
          msg = detail?.error ?? detail?.message ?? msg;
        } catch {}
        throw new Error(msg);
      }
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
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setCapturedUri(result.assets[0].uri);
    }
  };

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
