import CoreLocation
import Foundation
import HealthKit

@MainActor
final class RunSessionStore: NSObject, ObservableObject {
  enum Phase {
    case connecting
    case ready
    case selectingCourse
    case running
    case uploading
    case finished
    case blocked
    case failed
  }

  @Published private(set) var phase: Phase = .connecting
  @Published private(set) var statusMessage: String = "Connecting to your iPhone..."
  @Published private(set) var courses: [RouteSummary] = []
  @Published private(set) var activeCourse: RouteSummary?
  @Published private(set) var primaryParty: PartySummary?
  @Published private(set) var elapsedSeconds: Int = 0
  @Published private(set) var distanceMeters: Double = 0
  @Published private(set) var averageHeartRate: Double?
  @Published private(set) var caloriesBurned: Double?
  @Published private(set) var latestReport: UploadReport?
  @Published private(set) var gpsPoints: [GPSPointPayload] = []
  @Published var errorText: String?

  let companionBridge = CompanionBridge()

  private let healthStore = HKHealthStore()
  private let locationManager = CLLocationManager()
  private let apiClient = JogmaniaAPIClient()
  private let isoFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()

  private var bootstrap: CompanionBootstrap?
  private var workoutSession: HKWorkoutSession?
  private var workoutBuilder: HKLiveWorkoutBuilder?
  private var startedAt: Date?
  private var latestLocation: CLLocation?
  private var timerTask: Task<Void, Never>?
  private var locationAuthorizationContinuation: CheckedContinuation<Void, Error>?

  override init() {
    super.init()
    locationManager.delegate = self
    locationManager.desiredAccuracy = kCLLocationAccuracyBest
    locationManager.distanceFilter = 5
    locationManager.activityType = .fitness
    locationManager.pausesLocationUpdatesAutomatically = false
  }

  func load() async {
    do {
      let bootstrap = try await companionBridge.requestBootstrap()
      self.bootstrap = bootstrap

      guard bootstrap.isAuthenticated else {
        phase = .blocked
        statusMessage = "Open Jogmania on iPhone and sign in first."
        return
      }

      let context = try await apiClient.loadAdventureContext(bootstrap: bootstrap)
      courses = context.courses
      primaryParty = context.party
      activeCourse = context.activeCourse
      phase = .ready
      statusMessage = activeCourse.map { "Ready for \($0.name)." } ?? "Ready for your next run."
      errorText = nil
    } catch {
      phase = .failed
      errorText = error.localizedDescription
      statusMessage = "Unable to load companion context."
    }
  }

  func selectCourse(routeId: String) async {
    guard let bootstrap, let party = primaryParty else { return }
    guard let course = courses.first(where: { $0.id == routeId }) else { return }

    do {
      phase = .selectingCourse
      statusMessage = "Switching to \(course.name)..."
      try await apiClient.enterWorld(partyId: party.id, routeId: routeId, bootstrap: bootstrap)
      activeCourse = course
      phase = .ready
      statusMessage = "\(course.name) is active."
      errorText = nil
    } catch {
      phase = .failed
      errorText = error.localizedDescription
      statusMessage = "Could not switch courses."
    }
  }

  func startRun() async {
    do {
      if bootstrap == nil {
        try await loadBootstrap()
      }

      guard let bootstrap else {
        throw RunSessionError.missingCompanionContext
      }

      guard bootstrap.isAuthenticated else {
        phase = .blocked
        statusMessage = "Sign in on iPhone first."
        return
      }

      try await requestPermissions()
      try await apiClient.registerWatchDevice(phoneDeviceId: bootstrap.phoneDeviceId.isEmpty ? nil : bootstrap.phoneDeviceId, bootstrap: bootstrap)

      let configuration = HKWorkoutConfiguration()
      configuration.activityType = .running
      configuration.locationType = .outdoor

      let session = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
      let builder = session.associatedWorkoutBuilder()
      builder.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: configuration)
      session.delegate = self
      builder.delegate = self

      resetRunState()

      let startDate = Date()
      startedAt = startDate
      workoutSession = session
      workoutBuilder = builder
      locationManager.startUpdatingLocation()

      session.startActivity(with: startDate)
      try await beginCollection(builder, at: startDate)

      phase = .running
      statusMessage = "Run in progress on \(activeCourse?.name ?? "Adventure Course")."
      startTimer()
      errorText = nil
    } catch {
      phase = .failed
      errorText = error.localizedDescription
      statusMessage = "Unable to start the workout."
    }
  }

  func stopRun() {
    guard phase == .running else { return }
    phase = .uploading
    statusMessage = "Finalizing workout..."
    locationManager.stopUpdatingLocation()
    workoutSession?.end()
  }

  private func loadBootstrap() async throws {
    let bootstrap = try await companionBridge.requestBootstrap(force: true)
    self.bootstrap = bootstrap
  }

  private func requestPermissions() async throws {
    let toShare: Set<HKSampleType> = [HKObjectType.workoutType()]
    let toRead: Set<HKObjectType> = [
      HKObjectType.quantityType(forIdentifier: .heartRate)!,
      HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
      HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)!
    ]

    try await withCheckedThrowingContinuation { continuation in
      healthStore.requestAuthorization(toShare: toShare, read: toRead) { success, error in
        if let error {
          continuation.resume(throwing: error)
        } else if success {
          continuation.resume(returning: ())
        } else {
          continuation.resume(throwing: RunSessionError.permissionsDenied)
        }
      }
    }

    let status = locationManager.authorizationStatus
    if status == .authorizedAlways || status == .authorizedWhenInUse {
      return
    }

    try await withCheckedThrowingContinuation { continuation in
      self.locationAuthorizationContinuation = continuation
      self.locationManager.requestWhenInUseAuthorization()
    }
  }

  private func beginCollection(_ builder: HKLiveWorkoutBuilder, at startDate: Date) async throws {
    try await withCheckedThrowingContinuation { continuation in
      builder.beginCollection(withStart: startDate) { success, error in
        if let error {
          continuation.resume(throwing: error)
        } else if success {
          continuation.resume(returning: ())
        } else {
          continuation.resume(throwing: RunSessionError.collectionFailed)
        }
      }
    }
  }

  private func endCollection(_ builder: HKLiveWorkoutBuilder, at endDate: Date) async throws {
    try await withCheckedThrowingContinuation { continuation in
      builder.endCollection(withEnd: endDate) { success, error in
        if let error {
          continuation.resume(throwing: error)
        } else if success {
          continuation.resume(returning: ())
        } else {
          continuation.resume(throwing: RunSessionError.collectionFailed)
        }
      }
    }
  }

  private func finishWorkout(_ builder: HKLiveWorkoutBuilder) async throws -> HKWorkout {
    try await withCheckedThrowingContinuation { continuation in
      builder.finishWorkout { workout, error in
        if let error {
          continuation.resume(throwing: error)
        } else if let workout {
          continuation.resume(returning: workout)
        } else {
          continuation.resume(throwing: RunSessionError.finishFailed)
        }
      }
    }
  }

  private func startTimer() {
    timerTask?.cancel()
    timerTask = Task {
      while !Task.isCancelled {
        if let startedAt {
          elapsedSeconds = max(1, Int(Date().timeIntervalSince(startedAt)))
        }
        try? await Task.sleep(nanoseconds: 1_000_000_000)
      }
    }
  }

  private func stopTimer() {
    timerTask?.cancel()
    timerTask = nil
  }

  private func resetRunState() {
    gpsPoints = []
    latestLocation = nil
    latestReport = nil
    elapsedSeconds = 0
    distanceMeters = 0
    averageHeartRate = nil
    caloriesBurned = nil
  }

  private func isoString(from date: Date) -> String {
    isoFormatter.string(from: date)
  }

  private func elevationGain() -> Double {
    guard gpsPoints.count > 1 else { return 0 }
    var gain = 0.0
    for index in 1..<gpsPoints.count {
      guard let previous = gpsPoints[index - 1].altitude_m, let current = gpsPoints[index].altitude_m else {
        continue
      }
      if current > previous {
        gain += current - previous
      }
    }
    return gain
  }

  private func finalizeRun() async {
    guard let bootstrap, let startedAt, let builder = workoutBuilder else {
      phase = .failed
      statusMessage = "Workout session ended unexpectedly."
      return
    }

    do {
      let endDate = Date()
      stopTimer()
      elapsedSeconds = max(1, Int(endDate.timeIntervalSince(startedAt)))

      try await endCollection(builder, at: endDate)
      _ = try await finishWorkout(builder)

      let averageHeartRate = self.averageHeartRate
      let caloriesBurned = self.caloriesBurned
      let elevationGain = elevationGain()
      let pace = distanceMeters > 0 ? Double(elapsedSeconds) / (distanceMeters / 1000) : 0
      let payload = WorkoutCreatePayload(
        source: "watch",
        started_at: isoString(from: startedAt),
        ended_at: isoString(from: endDate),
        duration_s: elapsedSeconds,
        distance_m: distanceMeters,
        avg_pace_s_per_km: pace,
        calories_kcal: caloriesBurned,
        avg_hr: averageHeartRate,
        elevation_gain_m: elevationGain,
        route_id: activeCourse?.id,
        device_id: apiClient.watchDeviceId,
        raw_payload_json: [
          "capture_mode": "watch-native",
          "synced_via": "watchos-native",
          "companion_device_id": bootstrap.phoneDeviceId,
          "course_id": activeCourse?.id ?? "",
          "course_name": activeCourse?.name ?? ""
        ],
        gps_points: gpsPoints
      )

      let detail = try await apiClient.createWorkout(payload, bootstrap: bootstrap)
      latestReport = UploadReport(
        points: detail.raw_payload_json?.progression?.points ?? 0,
        rewards: detail.raw_payload_json?.progression?.rewards ?? [],
        worldEvents: detail.raw_payload_json?.world_events ?? []
      )

      phase = .finished
      statusMessage = "Run uploaded to \(activeCourse?.name ?? "Adventure Course")."
      errorText = nil
    } catch {
      phase = .failed
      statusMessage = "Run capture finished, but upload failed."
      errorText = error.localizedDescription
    }

    workoutBuilder = nil
    workoutSession = nil
    startedAt = nil
  }
}

extension RunSessionStore: CLLocationManagerDelegate {
  nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    Task { @MainActor in
      let status = manager.authorizationStatus
      if status == .authorizedAlways || status == .authorizedWhenInUse {
        locationAuthorizationContinuation?.resume(returning: ())
        locationAuthorizationContinuation = nil
      } else if status == .denied || status == .restricted {
        locationAuthorizationContinuation?.resume(throwing: RunSessionError.permissionsDenied)
        locationAuthorizationContinuation = nil
      }
    }
  }

  nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    Task { @MainActor in
      for location in locations where location.horizontalAccuracy >= 0 && location.horizontalAccuracy <= 65 {
        if let latestLocation {
          distanceMeters += max(0, location.distance(from: latestLocation))
        }

        latestLocation = location
        gpsPoints.append(
          GPSPointPayload(
            lat: location.coordinate.latitude,
            lon: location.coordinate.longitude,
            altitude_m: location.verticalAccuracy >= 0 ? location.altitude : nil,
            timestamp: isoString(from: location.timestamp),
            accuracy_m: location.horizontalAccuracy
          )
        )
      }
    }
  }

  nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    Task { @MainActor in
      self.errorText = error.localizedDescription
    }
  }
}

extension RunSessionStore: HKWorkoutSessionDelegate {
  nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
    Task { @MainActor in
      if toState == .ended {
        await finalizeRun()
      }
      if toState == .running && fromState != .running {
        self.statusMessage = "Workout session is live."
      }
      _ = date
    }
  }

  nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
    Task { @MainActor in
      self.phase = .failed
      self.statusMessage = "Workout session failed."
      self.errorText = error.localizedDescription
      self.stopTimer()
    }
  }
}

extension RunSessionStore: HKLiveWorkoutBuilderDelegate {
  nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

  nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
    Task { @MainActor in
      if let heartRateType = HKQuantityType.quantityType(forIdentifier: .heartRate),
         collectedTypes.contains(heartRateType),
         let statistics = workoutBuilder.statistics(for: heartRateType),
         let quantity = statistics.averageQuantity() {
        self.averageHeartRate = quantity.doubleValue(for: HKUnit(from: "count/min"))
      }

      if let activeEnergyType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned),
         collectedTypes.contains(activeEnergyType),
         let statistics = workoutBuilder.statistics(for: activeEnergyType),
         let quantity = statistics.sumQuantity() {
        self.caloriesBurned = quantity.doubleValue(for: .kilocalorie())
      }
    }
  }
}

enum RunSessionError: LocalizedError {
  case permissionsDenied
  case collectionFailed
  case finishFailed
  case missingCompanionContext

  var errorDescription: String? {
    switch self {
    case .permissionsDenied:
      return "Health or location permissions are missing on Apple Watch."
    case .collectionFailed:
      return "The workout builder could not collect this run."
    case .finishFailed:
      return "The workout finished without a saved HealthKit session."
    case .missingCompanionContext:
      return "Open the Jogmania iPhone app once so the watch can fetch your account context."
    }
  }
}
