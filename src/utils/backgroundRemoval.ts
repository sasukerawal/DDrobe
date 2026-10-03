import { requireOptionalNativeModule } from 'expo';

interface BackgroundRemoverModule {
  removeBackgroundAsync(uri: string): Promise<string>;
}

// Native module in modules/background-remover; absent in Expo Go.
const native = requireOptionalNativeModule<BackgroundRemoverModule>('DDrobeBackgroundRemover');

export const backgroundRemovalAvailable = native != null;

// Replaces the background of a local JPEG with white, entirely on the device.
export async function removeBackgroundAsync(fileUri: string): Promise<string> {
  if (!native) throw new Error('Background removal is not available in this build.');
  return native.removeBackgroundAsync(fileUri);
}
