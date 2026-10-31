import Cocoa
import WebKit
import UniformTypeIdentifiers

// FormulaSnip — a tiny native macOS shell around the local web UI.
// The app is self-contained: MathJax + fonts and the whole UI live in Resources/web.

setbuf(stdout, nil)
func log(_ s: String) { print(s); fflush(stdout) }

let APP_TITLE = "FormulaSnip"

func appSupportDir() -> URL {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
    let dir = base.appendingPathComponent(APP_TITLE, isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
}

func stateFileURL() -> URL {
    appSupportDir().appendingPathComponent("state.json")
}

func encodeJSON(_ object: Any) -> String {
    guard let data = try? JSONSerialization.data(withJSONObject: object, options: []),
          let text = String(data: data, encoding: .utf8) else { return "null" }
    return text
}

func dataURLToData(_ dataUrl: String) -> Data? {
    guard let comma = dataUrl.firstIndex(of: ",") else { return nil }
    let b64 = String(dataUrl[dataUrl.index(after: comma)...])
    return Data(base64Encoded: b64)
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var webView: WKWebView!
    var webDir: URL!
    var selftest = false
    var selftestOutDir = "/tmp/formulasnip-selftest"
    var selftestTimer: Timer?
    var selftestDone = false
    var startedAt = Date()

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        parseArguments()
        if CommandLine.arguments.contains("--dark") {
            NSApp.appearance = NSAppearance(named: .darkAqua)
        }
        buildMenu()

        let resources = Bundle.main.resourceURL ?? URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        webDir = resources.appendingPathComponent("web", isDirectory: true)

        let config = WKWebViewConfiguration()
        let controller = WKUserContentController()
        controller.add(self, name: "formulasnip")
        config.userContentController = controller

        let prefs = WKWebpagePreferences()
        prefs.allowsContentJavaScript = true
        config.defaultWebpagePreferences = prefs
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")

        let stateJSON: String
        if let data = try? Data(contentsOf: stateFileURL()), let text = String(data: data, encoding: .utf8) {
            stateJSON = text
        } else {
            stateJSON = "{}"
        }
        let inject = "window.__NATIVE_STATE__ = \(stateJSON); window.__SELFTEST__ = \(selftest ? "true" : "false");"
        controller.addUserScript(WKUserScript(source: inject, injectionTime: .atDocumentStart, forMainFrameOnly: true))

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1220, height: 840),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = APP_TITLE
        window.minSize = NSSize(width: 980, height: 660)
        window.center()
        window.setFrameAutosaveName("FormulaSnipMainWindow")

        webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        window.contentView!.addSubview(webView)

        let index = webDir.appendingPathComponent("index.html")
        log("WEB: \(index.path)")
        webView.loadFileURL(index, allowingReadAccessTo: webDir)

        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        if selftest {
            try? FileManager.default.createDirectory(atPath: selftestOutDir, withIntermediateDirectories: true)
            selftestTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] timer in
                self?.pollSelftest(timer)
            }
            log("SELFTEST_OUT: \(selftestOutDir)")
        }
    }

    func parseArguments() {
        let args = CommandLine.arguments
        for (i, arg) in args.enumerated() {
            if arg == "--selftest" {
                selftest = true
                if i + 1 < args.count && !args[i + 1].hasPrefix("--") {
                    selftestOutDir = args[i + 1]
                }
            }
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    // MARK: - Menu

    func buildMenu() {
        let mainMenu = NSMenu()

        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "关于 \(APP_TITLE)", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "隐藏 \(APP_TITLE)", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "退出 \(APP_TITLE)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        mainMenu.addItem(appItem)

        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: "编辑")
        editMenu.addItem(withTitle: "撤销", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = editMenu.addItem(withTitle: "重做", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "剪切", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "拷贝", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "粘贴", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "全选", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu
        mainMenu.addItem(editItem)

        let windowItem = NSMenuItem()
        let windowMenu = NSMenu(title: "窗口")
        windowMenu.addItem(withTitle: "最小化", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "缩放", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowItem.submenu = windowMenu
        mainMenu.addItem(windowItem)

        NSApp.mainMenu = mainMenu
    }

    // MARK: - Bridge

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let type = body["type"] as? String,
              let reqId = body["reqId"] as? String else { return }
        switch type {
        case "savePng":
            handleSavePng(body, reqId)
        case "copyPng":
            handleCopyPng(body, reqId)
        case "saveState":
            handleSaveState(body, reqId)
        case "selftestWritePng":
            handleSelftestWritePng(body, reqId)
        default:
            reply(["reqId": reqId, "ok": false, "error": "unknown bridge type"])
        }
    }

    func reply(_ payload: [String: Any]) {
        let json = encodeJSON(payload)
        webView.evaluateJavaScript("window.__bridgeResult(\(json))", completionHandler: nil)
    }

    func handleSavePng(_ body: [String: Any], _ reqId: String) {
        guard let dataUrl = body["dataUrl"] as? String, let data = dataURLToData(dataUrl) else {
            reply(["reqId": reqId, "ok": false, "error": "PNG 数据无效"])
            return
        }
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.png]
        panel.nameFieldStringValue = (body["filename"] as? String) ?? "formula.png"
        panel.canCreateDirectories = true
        panel.title = "导出透明 PNG"
        panel.message = "保存为透明背景 PNG，可直接插入 PowerPoint / Keynote"
        let result = panel.runModal()
        guard result == .OK, let url = panel.url else {
            reply(["reqId": reqId, "ok": false, "canceled": true])
            return
        }
        do {
            try data.write(to: url)
            reply(["reqId": reqId, "ok": true, "path": url.path])
        } catch {
            reply(["reqId": reqId, "ok": false, "error": error.localizedDescription])
        }
    }

    func handleCopyPng(_ body: [String: Any], _ reqId: String) {
        guard let dataUrl = body["dataUrl"] as? String, let data = dataURLToData(dataUrl),
              let image = NSImage(data: data) else {
            reply(["reqId": reqId, "ok": false, "error": "PNG 数据无效"])
            return
        }
        let pb = NSPasteboard.general
        pb.clearContents()
        pb.writeObjects([image])
        reply(["reqId": reqId, "ok": true])
    }

    func handleSaveState(_ body: [String: Any], _ reqId: String) {
        guard let json = body["json"] as? String, let data = json.data(using: .utf8) else {
            reply(["reqId": reqId, "ok": false, "error": "状态无效"])
            return
        }
        do {
            var url = stateFileURL()
            if (body["selftest"] as? Bool) == true {
                url = URL(fileURLWithPath: selftestOutDir, isDirectory: true).appendingPathComponent("state-test.json")
            }
            try data.write(to: url, options: .atomic)
            reply(["reqId": reqId, "ok": true, "path": url.path])
        } catch {
            reply(["reqId": reqId, "ok": false, "error": error.localizedDescription])
        }
    }

    func handleSelftestWritePng(_ body: [String: Any], _ reqId: String) {
        guard selftest else {
            reply(["reqId": reqId, "ok": false, "error": "not in selftest"])
            return
        }
        guard let dataUrl = body["dataUrl"] as? String, let data = dataURLToData(dataUrl) else {
            reply(["reqId": reqId, "ok": false, "error": "PNG 数据无效"])
            return
        }
        let name = (body["name"] as? String) ?? "selftest.png"
        let url = URL(fileURLWithPath: selftestOutDir, isDirectory: true).appendingPathComponent(name)
        do {
            try data.write(to: url)
            reply(["reqId": reqId, "ok": true, "path": url.path])
        } catch {
            reply(["reqId": reqId, "ok": false, "error": error.localizedDescription])
        }
    }

    // MARK: - Selftest

    func pollSelftest(_ timer: Timer) {
        if selftestDone { return }
        if Date().timeIntervalSince(startedAt) > 180 {
            selftestDone = true
            log("SELFTEST: TIMEOUT")
            timer.invalidate()
            exit(3)
        }
        webView.evaluateJavaScript("window.__SELFTEST_RESULT__ ? JSON.stringify(window.__SELFTEST_RESULT__) : null") { [weak self] value, error in
            guard let self = self, !self.selftestDone else { return }
            if let error = error {
                log("SELFTEST_EVAL_ERROR: \(error.localizedDescription)")
                return
            }
            guard let text = value as? String, text != "null", text != "<null>" else { return }
            self.selftestDone = true
            self.selftestTimer?.invalidate()
            log("SELFTEST_RESULT: \(text)")
            if let data = text.data(using: .utf8),
               let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                log("SELFTEST_OK: \(dict["ok"] as? Bool ?? false)")
                for check in (dict["checks"] as? [[String: Any]]) ?? [] {
                    let name = check["name"] as? String ?? "?"
                    let ok = check["ok"] as? Bool ?? false
                    let detail = check["detail"] as? String ?? ""
                    log("\((ok ? "PASS" : "FAIL"))  \(name)\(detail.isEmpty ? "" : "  [\(detail)]")")
                }
            }
            self.captureSnapshot { path in
                if let path = path { log("SNAPSHOT: \(path)") }
                let stateExists = FileManager.default.fileExists(atPath: stateFileURL().path)
                log("STATE_FILE_EXISTS: \(stateExists)")
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    NSApp.terminate(nil)
                }
            }
        }
    }

    func captureSnapshot(completion: @escaping (String?) -> Void) {
        let cfg = WKSnapshotConfiguration()
        cfg.snapshotWidth = 1220 as NSNumber
        webView.takeSnapshot(with: cfg) { image, error in
            guard let image = image,
                  let tiff = image.tiffRepresentation,
                  let rep = NSBitmapImageRep(data: tiff),
                  let png = rep.representation(using: .png, properties: [:]) else {
                log("SNAPSHOT_ERROR: \(String(describing: error))")
                completion(nil)
                return
            }
            let out = URL(fileURLWithPath: self.selftestOutDir, isDirectory: true).appendingPathComponent("app-ui.png")
            do {
                try png.write(to: out)
                completion(out.path)
            } catch {
                log("SNAPSHOT_WRITE_ERROR: \(error)")
                completion(nil)
            }
        }
    }
}

let args = CommandLine.arguments
let outDir: String
if let idx = args.firstIndex(of: "--selftest"), idx + 1 < args.count, !args[idx + 1].hasPrefix("--") {
    outDir = args[idx + 1]
} else {
    outDir = "/tmp/formulasnip-selftest"
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
