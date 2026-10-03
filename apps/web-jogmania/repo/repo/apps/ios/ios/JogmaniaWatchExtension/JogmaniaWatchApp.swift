import SwiftUI
import WatchKit

@main
struct JogmaniaWatchApp: App {
  @WKExtensionDelegateAdaptor(WorkoutRecoveryDelegate.self) private var recoveryDelegate

  var body: some Scene {
    WindowGroup {
      ContentView()
    }
  }
}

final class WorkoutRecoveryDelegate: NSObject, WKExtensionDelegate {
  func handleActiveWorkoutRecovery() {
    Task { @MainActor in
      RunSessionStore.shared.recoverActiveWorkoutSession()
    }
  }
}
