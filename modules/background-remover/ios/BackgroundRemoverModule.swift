import CoreImage
import ExpoModulesCore
import UIKit
import Vision

final class UnsupportedOSException: Exception {
  override var reason: String { "Background removal needs iOS 17 or later" }
}

final class NoSubjectException: Exception {
  override var reason: String { "No item found in the photo" }
}

final class ImageReadException: Exception {
  override var reason: String { "Could not read the photo" }
}

public class BackgroundRemoverModule: Module {
  private let ciContext = CIContext()

  public func definition() -> ModuleDefinition {
    Name("DDrobeBackgroundRemover")

    // Takes a local file:// JPEG, returns a file:// JPEG with the background replaced by white.
    AsyncFunction("removeBackgroundAsync") { (uri: URL) -> String in
      guard #available(iOS 17.0, *) else { throw UnsupportedOSException() }
      return try self.process(uri)
    }
  }

  @available(iOS 17.0, *)
  private func process(_ uri: URL) throws -> String {
    guard let image = CIImage(contentsOf: uri, options: [.applyOrientationProperty: true]) else {
      throw ImageReadException()
    }

    let handler = VNImageRequestHandler(ciImage: image)
    let request = VNGenerateForegroundInstanceMaskRequest()
    try handler.perform([request])

    guard let observation = request.results?.first, !observation.allInstances.isEmpty else {
      throw NoSubjectException()
    }

    let maskBuffer = try observation.generateScaledMaskForImage(forInstances: observation.allInstances, from: handler)
    let mask = CIImage(cvPixelBuffer: maskBuffer)
    let white = CIImage(color: .white).cropped(to: image.extent)
    let composited = image.applyingFilter("CIBlendWithMask", parameters: [
      kCIInputBackgroundImageKey: white,
      kCIInputMaskImageKey: mask,
    ])

    guard let cgImage = ciContext.createCGImage(composited, from: image.extent),
          let data = UIImage(cgImage: cgImage).jpegData(compressionQuality: 0.9) else {
      throw ImageReadException()
    }

    let output = FileManager.default.temporaryDirectory
      .appendingPathComponent("bg-removed-\(UUID().uuidString).jpg")
    try data.write(to: output)
    return output.absoluteString
  }
}
