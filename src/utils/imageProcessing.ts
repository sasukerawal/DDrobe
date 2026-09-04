import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Resizes an image to exactly 512x512 pixels.
 * This is the "Low-Res AI Tagging Hack" from context/architecture.md.
 * Locking image size to 512x512 keeps OpenAI Vision cost at exactly 85 tokens (~$0.0004/image).
 *
 * @param uri - Local file URI of the captured image
 * @returns A new local URI pointing to the 512x512 resized image
 */
export async function resizeTo512(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 512, height: 512 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

/**
 * Converts a local image URI to a base64 string.
 * Used for sending images to the Supabase Edge Function.
 *
 * @param uri - Local file URI
 * @returns Base64 encoded string of the image
 */
export async function uriToBase64(uri: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return base64;
}

/**
 * Full processing pipeline for a captured photo before upload:
 * 1. Resize to 512x512
 * 2. Convert to base64
 *
 * @param uri - Raw captured image URI
 * @returns base64 string of the processed image
 */
export async function processImageForUpload(uri: string): Promise<string> {
  const resizedUri = await resizeTo512(uri);
  const base64 = await uriToBase64(resizedUri);
  return base64;
}
