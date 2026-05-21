import AppKit
import CoreGraphics
import Foundation

func isoTimestamp() -> String {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return formatter.string(from: Date())
}

func frontmostPayload() -> [String: Any] {
  let app = NSWorkspace.shared.frontmostApplication
  let pid = app?.processIdentifier ?? 0
  var payload: [String: Any] = [
    "type": "frontmost_app_changed",
    "occurredAt": isoTimestamp(),
    "pid": Int(pid)
  ]
  if let localizedName = app?.localizedName {
    payload["appName"] = localizedName
  }
  if let bundleIdentifier = app?.bundleIdentifier {
    payload["bundleId"] = bundleIdentifier
  }
  if let windowTitle = frontmostWindowTitle(pid: pid), !windowTitle.isEmpty {
    payload["windowTitle"] = windowTitle
  }
  return payload
}

func frontmostWindowTitle(pid: pid_t) -> String? {
  guard pid > 0 else { return nil }
  guard let windowList = CGWindowListCopyWindowInfo(
    [.optionOnScreenOnly, .excludeDesktopElements],
    kCGNullWindowID
  ) as? [[String: Any]] else {
    return nil
  }
  for window in windowList {
    let ownerPid = window[kCGWindowOwnerPID as String] as? Int
    let layer = window[kCGWindowLayer as String] as? Int
    if ownerPid == Int(pid), layer == 0 {
      if let name = window[kCGWindowName as String] as? String, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return name
      }
    }
  }
  return nil
}

func emit(_ payload: [String: Any]) {
  guard JSONSerialization.isValidJSONObject(payload),
        let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
        let line = String(data: data, encoding: .utf8) else {
    return
  }
  print(line)
  fflush(stdout)
}

if CommandLine.arguments.contains("--once") {
  emit(frontmostPayload())
  exit(0)
}

emit(frontmostPayload())

let notificationCenter = NSWorkspace.shared.notificationCenter
let token = notificationCenter.addObserver(
  forName: NSWorkspace.didActivateApplicationNotification,
  object: nil,
  queue: nil
) { _ in
  emit(frontmostPayload())
}

RunLoop.current.run()
notificationCenter.removeObserver(token)
