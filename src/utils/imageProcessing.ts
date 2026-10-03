import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import { backgroundRemovalAvailable, removeBackgroundAsync } from './backgroundRemoval';

const MAX_SIDE = 512;

async function fitWithin512(uri: string): Promise<ImageRef> {
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const context = ImageManipulator.manipulate(original);
  if (original.width > MAX_SIDE || original.height > MAX_SIDE) {
    context.resize(original.width >= original.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  return context.renderAsync();
}

async function toJpegBase64(image: ImageRef): Promise<string> {
  const result = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG, base64: true });
  if (!result.base64) throw new Error('Image processing failed: no base64 output');
  return result.base64;
}

// Fits the photo inside 512×512 (keeping its proportions) and returns JPEG base64.
// With removeBackground, the background is replaced with white on-device first; if that
// isn't possible (Expo Go, iOS < 17, no item detected) the original photo is used.
export async function processImageForUpload(
  uri: string,
  { removeBackground = false }: { removeBackground?: boolean } = {},
): Promise<string> {
  const resized = await fitWithin512(uri);
  if (!removeBackground || !backgroundRemovalAvailable) return toJpegBase64(resized);

  try {
    const saved = await resized.saveAsync({ compress: 0.95, format: SaveFormat.JPEG });
    const cleanedUri = await removeBackgroundAsync(saved.uri);
    return toJpegBase64(await ImageManipulator.manipulate(cleanedUri).renderAsync());
  } catch (e) {
    console.warn('[imageProcessing] background removal skipped:', e);
    return toJpegBase64(resized);
  }
}
