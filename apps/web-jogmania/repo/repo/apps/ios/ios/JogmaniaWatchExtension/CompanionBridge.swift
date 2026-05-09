import Foundation
import WatchConnectivity

@MainActor
final class CompanionBridge: NSObject, ObservableObject {
  @Published private(set) var bootstrap: CompanionBootstrap?
  @Published private(set) var isReachable: Bool = false
  @Published private(set) var lastError: String?

  private let session: WCSession? = WCSession.isSupported() ? WCSession.default : nil

  override init() {
    super.init()
    session?.delegate = self
    session?.activate()
    refreshFromApplicationContext()
  }

  func requestBootstrap(force: Bool = false) async throws -> CompanionBootstrap {
    if !force, let bootstrap {
      return bootstrap
    }

    if let cached = refreshFromApplicationContext() {
      return cached
    }

    guard let session else {
      throw CompanionBridgeError.notSupported
    }

    let payload: CompanionBootstrap = try await withCheckedThrowingContinuation { continuation in
      session.sendMessage(["type": "bootstrap"], replyHandler: { response in
        do {
          let data = try JSONSerialization.data(withJSONObject: response, options: [])
          let decoded = try JSONDecoder().decode(CompanionBootstrap.self, from: data)
          continuation.resume(returning: decoded)
        } catch {
          continuation.resume(throwing: error)
        }
      }, errorHandler: { error in
        continuation.resume(throwing: error)
      })
    }

    bootstrap = payload
    lastError = nil
    return payload
  }

  @discardableResult
  private func refreshFromApplicationContext() -> CompanionBootstrap? {
    guard let session else {
      return nil
    }
    guard !session.receivedApplicationContext.isEmpty else {
      return nil
    }

    do {
      let data = try JSONSerialization.data(withJSONObject: session.receivedApplicationContext, options: [])
      let decoded = try JSONDecoder().decode(CompanionBootstrap.self, from: data)
      bootstrap = decoded
      lastError = nil
      return decoded
    } catch {
      lastError = error.localizedDescription
      return nil
    }
  }
}

extension CompanionBridge: WCSessionDelegate {
  nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    Task { @MainActor in
      self.isReachable = session.isReachable
      if let error {
        self.lastError = error.localizedDescription
      }
      _ = self.refreshFromApplicationContext()
    }
  }

  nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
    Task { @MainActor in
      self.isReachable = session.isReachable
      _ = self.refreshFromApplicationContext()
    }
  }

  nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String : Any]) {
    Task { @MainActor in
      do {
        let data = try JSONSerialization.data(withJSONObject: applicationContext, options: [])
        let decoded = try JSONDecoder().decode(CompanionBootstrap.self, from: data)
        self.bootstrap = decoded
        self.lastError = nil
      } catch {
        self.lastError = error.localizedDescription
      }
    }
  }
}

enum CompanionBridgeError: LocalizedError {
  case notSupported

  var errorDescription: String? {
    switch self {
    case .notSupported:
      return "WatchConnectivity is not supported on this device."
    }
  }
}
