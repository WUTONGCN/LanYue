import AppKit
import ApplicationServices
import UniformTypeIdentifiers
import CoreServices

func emit(_ object: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: object), let line = String(data: data, encoding: .utf8) {
        print(line); fflush(stdout)
    }
}
let args = Array(CommandLine.arguments.dropFirst())
if args.first == "--associate", args.count > 2 {
    let appURL = URL(fileURLWithPath: args[1])
    LSRegisterURL(appURL as CFURL, true)
    var remaining = Array(args.dropFirst(2)), failures: [String] = [], handled = Set<String>()
    func next() {
        guard !remaining.isEmpty else { emit(["type":"associated", "failed":failures]); exit(0) }
        let ext = remaining.removeFirst()
        guard let type = UTType(filenameExtension: ext) else { failures.append(ext); next(); return }
        guard handled.insert(type.identifier).inserted else { next(); return }
        NSWorkspace.shared.setDefaultApplication(at: appURL, toOpen: type) { error in
            DispatchQueue.main.async { if error != nil { failures.append(ext) }; next() }
        }
    }
    next(); RunLoop.main.run()
    exit(0)
}
guard args.first == "--watch" else { exit(2) }
let prompt = args.contains("--prompt")
guard AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: prompt] as CFDictionary) else {
    emit(["type":"permission", "permission":"accessibility"]); exit(3)
}
var tap: CFMachPort?
var spaceDown = false
var pending = false
var finderPID: pid_t = 0
func editableFocus(_ pid: pid_t) -> Bool {
    let application = AXUIElementCreateApplication(pid)
    AXUIElementSetMessagingTimeout(application, 0.08)
    var focused: CFTypeRef?
    guard AXUIElementCopyAttributeValue(application, kAXFocusedUIElementAttribute as CFString, &focused) == .success,
          let focused = focused, CFGetTypeID(focused) == AXUIElementGetTypeID() else { return true }
    var element = unsafeBitCast(focused, to: AXUIElement.self)
    for _ in 0..<4 {
        var role: CFTypeRef?
        AXUIElementCopyAttributeValue(element, kAXRoleAttribute as CFString, &role)
        if let role = role as? String, ["AXTextField", "AXTextArea", "AXComboBox", "AXSearchField"].contains(role) { return true }
        var parent: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, kAXParentAttribute as CFString, &parent) == .success,
              let parent = parent, CFGetTypeID(parent) == AXUIElementGetTypeID() else { break }
        element = unsafeBitCast(parent, to: AXUIElement.self)
    }
    return false
}
func previewSelection() {
    defer { pending = false }
    // Fixed script: filenames are returned as Apple event list items, never interpolated.
    let source = """
    tell application "Finder"
        set paths to {}
        repeat with selectedItem in (get selection)
            try
                if class of selectedItem is not folder then set end of paths to POSIX path of (selectedItem as alias)
            end try
        end repeat
        return paths
    end tell
    """
    var error: NSDictionary?
    guard let script = NSAppleScript(source: source) else { return }
    let result = script.executeAndReturnError(&error)
    if let error = error {
        let code = error[NSAppleScript.errorNumber] as? Int ?? 0
        emit(["type":"permission", "permission":code == -1743 ? "automation" : "finder", "code":code]); return
    }
    var paths: [String] = []
    if result.numberOfItems > 0 {
        for index in 1...min(500, result.numberOfItems) {
            if let file = result.atIndex(index)?.stringValue { paths.append(file) }
        }
    }
    if !paths.isEmpty { emit(["type":"preview", "paths":paths]) }
}
let callback: CGEventTapCallBack = { _, type, event, _ in
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
        if let tap = tap { CGEvent.tapEnable(tap: tap, enable: true) }
        return Unmanaged.passUnretained(event)
    }
    guard event.getIntegerValueField(.keyboardEventKeycode) == 49 else { return Unmanaged.passUnretained(event) }
    if type == .keyUp && spaceDown { spaceDown = false; return nil }
    guard type == .keyDown,
          event.flags.intersection([.maskCommand, .maskControl, .maskAlternate, .maskShift]).isEmpty,
          let front = NSWorkspace.shared.frontmostApplication, front.bundleIdentifier == "com.apple.finder",
          !editableFocus(front.processIdentifier) else { return Unmanaged.passUnretained(event) }
    if !spaceDown && !pending {
        spaceDown = true; pending = true; finderPID = front.processIdentifier
        DispatchQueue.main.async { previewSelection() }
    }
    return nil
}
tap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .defaultTap,
                       eventsOfInterest: (1 << CGEventType.keyDown.rawValue) | (1 << CGEventType.keyUp.rawValue),
                       callback: callback, userInfo: nil)
guard let eventTap = tap else { emit(["type":"permission", "permission":"accessibility"]); exit(3) }
let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0)
CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
CGEvent.tapEnable(tap: eventTap, enable: true)
DispatchQueue.global(qos: .utility).async {
    while let command = readLine() {
        if command == "restore" {
            DispatchQueue.main.async { NSRunningApplication(processIdentifier: finderPID)?.activate(options: []) }
        }
    }
    exit(0) // Never leave an input hook behind if the host closes or crashes.
}
emit(["type":"ready"])
RunLoop.main.run()
