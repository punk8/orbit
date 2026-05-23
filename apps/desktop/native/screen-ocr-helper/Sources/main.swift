import AppKit
import CoreGraphics
import CryptoKit
import Foundation
import ScreenCaptureKit
import Vision

struct HelperOutput: Encodable {
  let ok: Bool
  let reason: String?
  let message: String?
  let capturedAt: String?
  let runtimeSessionId: String?
  let displayId: String?
  let width: Int?
  let height: Int?
  let frameHash: String?
  let rawImageBase64: String?
  let appName: String?
  let bundleId: String?
  let pid: Int?
  let windowTitle: String?
  let ocrText: String?
  let ocrConfidence: Double?
  let languages: [String]?
  let errorKind: String?
  let warnings: [String]?
}

func isoTimestamp() -> String {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return formatter.string(from: Date())
}

func emit(_ output: HelperOutput) {
  let encoder = JSONEncoder()
  guard let data = try? encoder.encode(output),
        let line = String(data: data, encoding: .utf8) else {
    exit(2)
  }
  print(line)
  fflush(stdout)
}

func frontmostAppInfo() -> (appName: String?, bundleId: String?, pid: Int?, windowTitle: String?) {
  let app = NSWorkspace.shared.frontmostApplication
  let pid = app?.processIdentifier ?? 0
  return (
    app?.localizedName,
    app?.bundleIdentifier,
    pid > 0 ? Int(pid) : nil,
    frontmostWindowTitle(pid: pid)
  )
}

func frontmostWindowTitle(pid: pid_t) -> String? {
  guard pid > 0 else { return nil }
  guard let windows = CGWindowListCopyWindowInfo(
    [.optionOnScreenOnly, .excludeDesktopElements],
    kCGNullWindowID
  ) as? [[String: Any]] else {
    return nil
  }
  for window in windows {
    let ownerPid = window[kCGWindowOwnerPID as String] as? Int
    let layer = window[kCGWindowLayer as String] as? Int
    if ownerPid == Int(pid), layer == 0 {
      if let name = window[kCGWindowName as String] as? String,
         !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return name
      }
    }
  }
  return nil
}

func hashImageData(_ data: Data?) -> String {
  guard let data else { return UUID().uuidString }
  let digest = SHA256.hash(data: data)
  return digest.map { String(format: "%02x", $0) }.joined()
}

func pngData(for image: CGImage) -> Data? {
  let data = NSMutableData()
  guard let destination = CGImageDestinationCreateWithData(
    data,
    "public.png" as CFString,
    1,
    nil
  ) else {
    return nil
  }
  CGImageDestinationAddImage(destination, image, nil)
  guard CGImageDestinationFinalize(destination) else {
    return nil
  }
  return data as Data
}

func recognizeText(in image: CGImage) -> (text: String?, confidence: Double?, warnings: [String]) {
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = true
  request.recognitionLanguages = ["en-US", "zh-Hans"]
  let handler = VNImageRequestHandler(cgImage: image, options: [:])
  do {
    try handler.perform([request])
  } catch {
    return (nil, nil, ["Vision OCR failed: \(error.localizedDescription)"])
  }
  let candidates = request.results?.compactMap { observation -> (String, Float)? in
    guard let candidate = observation.topCandidates(1).first else { return nil }
    return (candidate.string, candidate.confidence)
  } ?? []
  let text = candidates.map { $0.0 }.joined(separator: "\n")
  let confidence = candidates.isEmpty
    ? nil
    : Double(candidates.map { $0.1 }.reduce(0, +) / Float(candidates.count))
  return (text.isEmpty ? nil : text, confidence, [])
}

func captureMainDisplay() async throws -> (displayId: String, image: CGImage) {
  if #available(macOS 12.3, *) {
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
    guard let display = content.displays.first else {
      throw NSError(domain: "OrbitScreenOcr", code: 2, userInfo: [NSLocalizedDescriptionKey: "No display is available for capture."])
    }
    let filter = SCContentFilter(display: display, excludingWindows: [])
    let configuration = SCStreamConfiguration()
    configuration.width = display.width
    configuration.height = display.height
    configuration.showsCursor = false
    let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: configuration)
    return (String(display.displayID), image)
  }
  throw NSError(domain: "OrbitScreenOcr", code: 3, userInfo: [NSLocalizedDescriptionKey: "ScreenCaptureKit requires macOS 12.3 or later."])
}

Task {
  do {
    let capturedAt = isoTimestamp()
    let capture = try await captureMainDisplay()
    let app = frontmostAppInfo()
    let ocr = recognizeText(in: capture.image)
    let rawImageData = pngData(for: capture.image)
    let frameHash = hashImageData(rawImageData)
    let warnings = ocr.warnings
    emit(
      HelperOutput(
        ok: true,
        reason: nil,
        message: nil,
        capturedAt: capturedAt,
        runtimeSessionId: "manual-screen-ocr-\(capturedAt)",
        displayId: capture.displayId,
        width: capture.image.width,
        height: capture.image.height,
        frameHash: frameHash,
        rawImageBase64: rawImageData?.base64EncodedString(),
        appName: app.appName,
        bundleId: app.bundleId,
        pid: app.pid,
        windowTitle: app.windowTitle,
        ocrText: ocr.text,
        ocrConfidence: ocr.confidence,
        languages: ["en-US", "zh-Hans"],
        errorKind: warnings.isEmpty ? nil : "ocr_failed",
        warnings: warnings
      )
    )
  } catch {
    let description = (error as NSError).localizedDescription
    let reason: String
    if description.localizedCaseInsensitiveContains("permission") {
      reason = "screen_recording_permission_denied"
    } else if description.localizedCaseInsensitiveContains("ScreenCaptureKit requires") {
      reason = "unsupported_macos"
    } else {
      reason = "capture_failed"
    }
    emit(
      HelperOutput(
        ok: false,
        reason: reason,
        message: description,
        capturedAt: nil,
        runtimeSessionId: nil,
        displayId: nil,
        width: nil,
        height: nil,
        frameHash: nil,
        rawImageBase64: nil,
        appName: nil,
        bundleId: nil,
        pid: nil,
        windowTitle: nil,
        ocrText: nil,
        ocrConfidence: nil,
        languages: nil,
        errorKind: nil,
        warnings: nil
      )
    )
  }
  exit(0)
}

RunLoop.main.run()
