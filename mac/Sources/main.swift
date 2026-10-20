// NodiNote for macOS — a native window around https://nodinest.vercel.app.
//
// • Sign-in: Google blocks sign-in inside embedded web views, so Google
//   requests open Apple's secure sign-in sheet (ASWebAuthenticationSession) on
//   /app-login; the site returns a one-time code that this window redeems at
//   /api/app/handoff (see src/server/app-handoff.ts).
// • Downloads (PDF / Word exports) go to ~/Downloads; file pickers work.
// • Links to other sites open in the default browser.
// • Remembers the last page and window size; offline screen with retry.
// • Media shortcuts: when nothing plays inside NodiNote, the page asks this app
//   (window.webkit.messageHandlers.nodinest) to press the system Play/Pause key,
//   so the same shortcut controls YouTube in a browser, Spotify, Music, …
//   macOS asks once for Accessibility permission (needed to send that key).
import AppKit
import AuthenticationServices
import WebKit

let defaults = UserDefaults.standard
func dbg(_ s: String) {
  if ProcessInfo.processInfo.environment["NODINEST_DEBUG"] != nil {
    FileHandle.standardError.write("[dbg] \(s)\n".data(using: .utf8)!)
  }
}
let BASE = URL(string: defaults.string(forKey: "NodiNestBaseURL") ?? "https://nodinest.vercel.app")!

func isOurs(_ url: URL?) -> Bool {
  guard let u = url else { return false }
  if u.scheme == "about" || u.scheme == "blob" || u.scheme == "data" { return true }
  return u.host == BASE.host && u.port == BASE.port
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate,
  WKDownloadDelegate, ASWebAuthenticationPresentationContextProviding, NSWindowDelegate,
  WKScriptMessageHandler
{
  var window: NSWindow!
  var web: WKWebView!
  var authSession: ASWebAuthenticationSession?
  var downloads: [ObjectIdentifier: URL] = [:]

  // MARK: launch
  func applicationDidFinishLaunching(_ note: Notification) {
    buildMenu()
    let cfg = WKWebViewConfiguration()
    cfg.websiteDataStore = .default()  // persistent: stay signed in
    cfg.applicationNameForUserAgent = "Version/18.0 Safari/605.1.15 NodiNestMac/1.0"
    cfg.preferences.javaScriptCanOpenWindowsAutomatically = true
    cfg.preferences.isElementFullscreenEnabled = true
    cfg.mediaTypesRequiringUserActionForPlayback = []
    cfg.userContentController.add(self, name: "nodinest")

    web = WKWebView(frame: .zero, configuration: cfg)
    web.navigationDelegate = self
    web.uiDelegate = self
    web.allowsBackForwardNavigationGestures = true
    web.allowsMagnification = true
    web.setValue(false, forKey: "drawsBackground")

    window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1320, height: 860),
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered, defer: false)
    window.title = "NodiNote"
    window.minSize = NSSize(width: 820, height: 560)
    window.contentView = web
    window.delegate = self
    window.setFrameAutosaveName("NodiNestMain")
    if !window.setFrameUsingName("NodiNestMain") { window.center() }
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)

    var start = BASE
    if let last = defaults.string(forKey: "lastURL"), let u = URL(string: last), isOurs(u) { start = u }
    web.load(URLRequest(url: start))
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { false }
  func applicationShouldHandleReopen(_ app: NSApplication, hasVisibleWindows: Bool) -> Bool {
    if !hasVisibleWindows { window.makeKeyAndOrderFront(nil) }
    return true
  }

  /// nodinest://auth?code=… opened from outside (e.g. finished in Safari).
  func application(_ application: NSApplication, open urls: [URL]) {
    for u in urls where u.scheme == "nodinest" { redeem(u) }
  }

  // MARK: sign-in
  func startSignIn() {
    let url = BASE.appendingPathComponent("app-login")
    let s = ASWebAuthenticationSession(url: url, callbackURLScheme: "nodinest") { [weak self] cb, err in
      DispatchQueue.main.async {
        if let cb = cb { self?.redeem(cb) }
        else if let e = err as? ASWebAuthenticationSessionError, e.code == .canceledLogin { /* user closed */ }
        else if let e = err { self?.alert("Kirish amalga oshmadi", e.localizedDescription) }
      }
    }
    s.presentationContextProvider = self
    s.prefersEphemeralWebBrowserSession = false
    authSession = s
    s.start()
  }

  func redeem(_ cb: URL) {
    // nodinest://open?path=/library/… — open a page of the site from outside.
    dbg("deep link \(cb.absoluteString)")
    if cb.host == "open" {
      if let path = URLComponents(url: cb, resolvingAgainstBaseURL: false)?
        .queryItems?.first(where: { $0.name == "path" })?.value,
        path.hasPrefix("/"), !path.hasPrefix("//"),
        let u = URL(string: path, relativeTo: BASE)?.absoluteURL, isOurs(u)
      {
        web.load(URLRequest(url: u))
        window.makeKeyAndOrderFront(nil)
      }
      return
    }
    guard let code = URLComponents(url: cb, resolvingAgainstBaseURL: false)?
      .queryItems?.first(where: { $0.name == "code" })?.value else { return }
    var c = URLComponents(url: BASE.appendingPathComponent("api/app/handoff"), resolvingAgainstBaseURL: false)!
    c.queryItems = [URLQueryItem(name: "code", value: code)]
    web.load(URLRequest(url: c.url!))
    window.makeKeyAndOrderFront(nil)
  }

  func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { window }

  // MARK: navigation
  func webView(
    _ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
    decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
  ) {
    let url = action.request.url
    dbg("action \(url?.absoluteString ?? "") download=\(action.shouldPerformDownload)")
    if action.shouldPerformDownload { return decisionHandler(.download) }
    if let host = url?.host, host == "accounts.google.com" || host.hasSuffix(".google.com") && url!.path.contains("oauth") {
      decisionHandler(.cancel)
      startSignIn()
      return
    }
    if url?.scheme == "nodinest" {
      decisionHandler(.cancel)
      redeem(url!)
      return
    }
    if !isOurs(url), let u = url, ["http", "https", "mailto", "tel"].contains(u.scheme ?? "") {
      // Embedded YouTube players are part of the page; everything else opens outside.
      if action.targetFrame?.isMainFrame == false { return decisionHandler(.allow) }
      NSWorkspace.shared.open(u)
      return decisionHandler(.cancel)
    }
    decisionHandler(.allow)
  }

  func webView(
    _ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
    decisionHandler: @escaping @MainActor @Sendable (WKNavigationResponsePolicy) -> Void
  ) {
    let disp = (response.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition") ?? ""
    dbg("response \(response.response.url?.path ?? "") disp=\(disp) canShow=\(response.canShowMIMEType)")
    if disp.lowercased().hasPrefix("attachment") || !response.canShowMIMEType {
      return decisionHandler(.download)
    }
    decisionHandler(.allow)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    if ProcessInfo.processInfo.environment["NODINEST_DEBUG"] != nil {
      webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { cs in
        let line = "[cookies] \(webView.url?.path ?? "") \(cs.map { "\($0.name) session=\($0.isSessionOnly) exp=\(String(describing: $0.expiresDate))" })\n"
        FileHandle.standardError.write(line.data(using: .utf8)!)
      }
    }
    if let u = webView.url, isOurs(u), !u.path.hasPrefix("/api/"), u.path != "/app-login" {
      defaults.set(u.absoluteString, forKey: "lastURL")
    }
    window.title = webView.title?.isEmpty == false ? webView.title! : "NodiNote"
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    let e = error as NSError
    if e.code == NSURLErrorCancelled || e.domain == "WebKitErrorDomain" { return }
    showOffline(retry: webView.url ?? BASE)
  }

  func showOffline(retry: URL) {
    let html = """
      <!doctype html><meta charset="utf-8"><meta name="color-scheme" content="light dark">
      <style>body{font:15px -apple-system,system-ui;display:grid;place-items:center;height:100vh;margin:0;
      background:Canvas;color:CanvasText;text-align:center}.b{max-width:380px}h1{font-size:22px;margin:14px 0 6px}
      p{opacity:.7;line-height:1.5}a{display:inline-block;margin-top:14px;padding:9px 18px;border-radius:10px;
      background:#2459e0;color:#fff;text-decoration:none;font-weight:600}</style>
      <div class="b"><div style="font-size:40px">☁︎</div><h1>Internet yoʻq</h1>
      <p>NodiNote serverga ulana olmadi. Internet qaytganda qayta urinib koʻring.</p>
      <a href="\(retry.absoluteString)">Qayta urinish</a></div>
      """
    web.loadHTMLString(html, baseURL: BASE)
  }

  // MARK: windows, panels
  func webView(
    _ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
    for action: WKNavigationAction, windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    if let u = action.request.url {
      if isOurs(u) { webView.load(action.request) } else { NSWorkspace.shared.open(u) }
    }
    return nil
  }

  func webView(
    _ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping @MainActor @Sendable ([URL]?) -> Void
  ) {
    let p = NSOpenPanel()
    p.allowsMultipleSelection = parameters.allowsMultipleSelection
    p.canChooseDirectories = false
    p.beginSheetModal(for: window) { r in completionHandler(r == .OK ? p.urls : nil) }
  }

  func webView(
    _ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
    initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor @Sendable () -> Void
  ) {
    let a = NSAlert()
    a.messageText = message
    a.beginSheetModal(for: window) { _ in completionHandler() }
  }

  func webView(
    _ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
    initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor @Sendable (Bool) -> Void
  ) {
    let a = NSAlert()
    a.messageText = message
    a.addButton(withTitle: "OK")
    a.addButton(withTitle: "Bekor qilish")
    a.beginSheetModal(for: window) { r in completionHandler(r == .alertFirstButtonReturn) }
  }

  /// Microphone for voice notes — only for our own site.
  @available(macOS 12.0, *)
  func webView(
    _ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
    initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
    decisionHandler: @escaping @MainActor @Sendable (WKPermissionDecision) -> Void
  ) {
    decisionHandler(origin.host == BASE.host && type == .microphone ? .grant : .deny)
  }

  // MARK: downloads → ~/Downloads
  func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
    download.delegate = self
  }
  func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
    dbg("became download")
    download.delegate = self
  }
  func download(
    _ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
    completionHandler: @escaping @MainActor @Sendable (URL?) -> Void
  ) {
    dbg("destination for \(suggestedFilename)")
    // A Save sheet (Downloads preselected): the user's choice grants access, so
    // macOS shows no folder-permission prompt, and nothing is overwritten silently.
    NSApp.activate(ignoringOtherApps: true)
    window.makeKeyAndOrderFront(nil)
    let panel = NSSavePanel()
    panel.nameFieldStringValue = suggestedFilename.isEmpty ? "NodiNote" : suggestedFilename
    panel.directoryURL = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
    panel.canCreateDirectories = true
    panel.isExtensionHidden = false
    panel.beginSheetModal(for: window) { [weak self] r in
      guard r == .OK, let url = panel.url else { return completionHandler(nil) }
      try? FileManager.default.removeItem(at: url)  // the panel already confirmed replacing
      self?.downloads[ObjectIdentifier(download)] = url
      completionHandler(url)
    }
  }
  func downloadDidFinish(_ download: WKDownload) {
    dbg("finished")
    if let url = downloads.removeValue(forKey: ObjectIdentifier(download)) {
      NSWorkspace.shared.activateFileViewerSelecting([url])
    }
  }
  func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
    dbg("failed \(error)")
    downloads.removeValue(forKey: ObjectIdentifier(download))
    if (error as NSError).code == NSURLErrorCancelled { return }  // the user pressed Cancel
    alert("Yuklab olinmadi", error.localizedDescription)
  }

  func alert(_ title: String, _ text: String) {
    let a = NSAlert()
    a.messageText = title
    a.informativeText = text
    a.beginSheetModal(for: window)
  }

  // MARK: menu
  // MARK: page → app bridge
  func userContentController(_ uc: WKUserContentController, didReceive message: WKScriptMessage) {
    // Only our own site's top frame may ask (never an embedded YouTube frame).
    guard message.frameInfo.isMainFrame, isOurs(message.frameInfo.request.url),
      let body = message.body as? [String: Any], body["type"] as? String == "media"
    else { return }
    switch body["action"] as? String {
    case "playpause": pressMediaKey(16)  // NX_KEYTYPE_PLAY
    case "next": pressMediaKey(17)  // NX_KEYTYPE_NEXT
    case "previous": pressMediaKey(18)  // NX_KEYTYPE_PREVIOUS
    default: return
    }
  }

  /// Posts a hardware media key so macOS routes it to the app that is playing.
  func pressMediaKey(_ key: Int32) {
    let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    guard AXIsProcessTrustedWithOptions(opts) else {
      dbg("media key: waiting for Accessibility permission")
      return
    }
    for down in [true, false] {
      let flags = NSEvent.ModifierFlags(rawValue: down ? 0xA00 : 0xB00)
      let data1 = Int((key << 16) | ((down ? 0xA : 0xB) << 8))
      NSEvent.otherEvent(
        with: .systemDefined, location: .zero, modifierFlags: flags, timestamp: 0,
        windowNumber: 0, context: nil, subtype: 8, data1: data1, data2: -1
      )?.cgEvent?.post(tap: .cghidEventTap)
    }
    dbg("media key \(key) sent")
  }

  @objc func goHome() { web.load(URLRequest(url: BASE)) }
  @objc func goPath(_ sender: NSMenuItem) {
    if let p = sender.representedObject as? String { web.load(URLRequest(url: BASE.appendingPathComponent(p))) }
  }
  @objc func reload() { web.reload() }
  @objc func back() { web.goBack() }
  @objc func forward() { web.goForward() }
  @objc func zoomIn() { web.pageZoom = min(web.pageZoom + 0.1, 2) }
  @objc func zoomOut() { web.pageZoom = max(web.pageZoom - 0.1, 0.6) }
  @objc func zoomReset() { web.pageZoom = 1 }
  @objc func openInBrowser() { NSWorkspace.shared.open(web.url ?? BASE) }

  func buildMenu() {
    let main = NSMenu()
    func sub(_ title: String, _ items: [NSMenuItem]) {
      let m = NSMenu(title: title)
      items.forEach { m.addItem($0) }
      let i = NSMenuItem()
      i.submenu = m
      main.addItem(i)
    }
    func item(_ t: String, _ a: Selector?, _ k: String = "", _ mods: NSEvent.ModifierFlags = [.command]) -> NSMenuItem {
      let i = NSMenuItem(title: t, action: a, keyEquivalent: k)
      i.keyEquivalentModifierMask = mods
      return i
    }
    func go(_ t: String, _ path: String, _ k: String) -> NSMenuItem {
      let i = item(t, #selector(goPath(_:)), k)
      i.representedObject = path
      return i
    }
    sub("NodiNote", [
      item("NodiNote haqida", #selector(NSApplication.orderFrontStandardAboutPanel(_:))),
      .separator(),
      item("NodiNote’ni yashirish", #selector(NSApplication.hide(_:)), "h"),
      item("Boshqalarni yashirish", #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option]),
      .separator(),
      item("Chiqish", #selector(NSApplication.terminate(_:)), "q"),
    ])
    sub("Tahrirlash", [
      item("Bekor qilish", Selector(("undo:")), "z"),
      item("Qaytarish", Selector(("redo:")), "z", [.command, .shift]),
      .separator(),
      item("Kesish", #selector(NSText.cut(_:)), "x"),
      item("Nusxa olish", #selector(NSText.copy(_:)), "c"),
      item("Qo‘yish", #selector(NSText.paste(_:)), "v"),
      item("Hammasini belgilash", #selector(NSText.selectAll(_:)), "a"),
    ])
    sub("Ko‘rinish", [
      item("Yangilash", #selector(reload), "r"),
      .separator(),
      item("Kattalashtirish", #selector(zoomIn), "+"),
      item("Kichraytirish", #selector(zoomOut), "-"),
      item("Asl o‘lcham", #selector(zoomReset), "0"),
      .separator(),
      item("Brauzerda ochish", #selector(openInBrowser), "o", [.command, .shift]),
    ])
    sub("O‘tish", [
      item("Orqaga", #selector(back), "["),
      item("Oldinga", #selector(forward), "]"),
      .separator(),
      go("Bosh sahifa", "", "1"),
      go("Darsxona", "library", "2"),
      go("Qaydlar va taqrizlar", "notes", "3"),
      go("To‘plamlar", "collections", "4"),
      go("AI yordamchi", "assistant", "5"),
      go("Manba qo‘shish", "library/new", "n"),
    ])
    sub("Oyna", [
      item("Yig‘ish", #selector(NSWindow.performMiniaturize(_:)), "m"),
      item("Kattalashtirish", #selector(NSWindow.performZoom(_:))),
      item("Oynani yopish", #selector(NSWindow.performClose(_:)), "w"),
    ])
    NSApp.mainMenu = main
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
