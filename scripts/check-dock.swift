import AppKit
import Foundation

let host = NSRunningApplication(processIdentifier: Int32(CommandLine.arguments[1])!)!
let helpers = NSWorkspace.shared.runningApplications.filter {
    $0.bundleIdentifier == "com.lanyue.preview.office-helper"
}
let result: [String: Any] = [
    "hostPolicy": host.activationPolicy.rawValue,
    "helpers": helpers.map { ["pid": $0.processIdentifier, "policy": $0.activationPolicy.rawValue] }
]
print(String(data: try JSONSerialization.data(withJSONObject: result), encoding: .utf8)!)
