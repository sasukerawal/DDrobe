package expo.modules.ddrobe.backgroundremover

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenter
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

// Fraction of pixels that must be foreground before we trust the cut-out.
private const val MIN_SUBJECT_COVERAGE = 0.02f

class BackgroundRemoverModule : Module() {
  private var segmenter: SubjectSegmenter? = null
  private val executor: ExecutorService = Executors.newSingleThreadExecutor()

  override fun definition() = ModuleDefinition {
    Name("DDrobeBackgroundRemover")

    OnDestroy {
      executor.shutdown()
      segmenter?.close()
    }

    // Takes a local file:// JPEG, returns a file:// JPEG with the background replaced by white.
    AsyncFunction("removeBackgroundAsync") { uri: String, promise: Promise ->
      executor.execute {
        try {
          promise.resolve(process(uri))
        } catch (e: CodedException) {
          promise.reject(e)
        } catch (e: Exception) {
          promise.reject("ERR_BACKGROUND_REMOVAL", e.message ?: "Background removal failed", e)
        }
      }
    }
  }

  private fun getSegmenter(): SubjectSegmenter =
    segmenter ?: SubjectSegmentation.getClient(
      SubjectSegmenterOptions.Builder().enableForegroundConfidenceMask().build()
    ).also { segmenter = it }

  private fun process(uri: String): String {
    val path = Uri.parse(uri).path ?: throw CodedException("ERR_INVALID_URI", "Not a file URI: $uri", null)
    val source = BitmapFactory.decodeFile(path)
      ?: throw CodedException("ERR_DECODE", "Could not read the photo", null)

    try {
      val result = Tasks.await(getSegmenter().process(InputImage.fromBitmap(source, 0)), 30, TimeUnit.SECONDS)
      val mask = result.foregroundConfidenceMask
        ?: throw CodedException("ERR_NO_SUBJECT", "No item found in the photo", null)

      val width = source.width
      val height = source.height
      val pixels = IntArray(width * height)
      source.getPixels(pixels, 0, width, 0, 0, width, height)

      mask.rewind()
      var foreground = 0
      for (i in pixels.indices) {
        val alpha = mask.get().coerceIn(0f, 1f)
        if (alpha > 0.5f) foreground++
        val p = pixels[i]
        val r = (Color.red(p) * alpha + 255 * (1 - alpha)).toInt()
        val g = (Color.green(p) * alpha + 255 * (1 - alpha)).toInt()
        val b = (Color.blue(p) * alpha + 255 * (1 - alpha)).toInt()
        pixels[i] = Color.rgb(r, g, b)
      }
      if (foreground < pixels.size * MIN_SUBJECT_COVERAGE) {
        throw CodedException("ERR_NO_SUBJECT", "No item found in the photo", null)
      }

      val output = Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888)
      val context = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "App is not ready", null)
      val file = File(context.cacheDir, "bg-removed-${UUID.randomUUID()}.jpg")
      try {
        FileOutputStream(file).use { output.compress(Bitmap.CompressFormat.JPEG, 90, it) }
      } finally {
        output.recycle()
      }
      return Uri.fromFile(file).toString()
    } finally {
      source.recycle()
    }
  }
}
