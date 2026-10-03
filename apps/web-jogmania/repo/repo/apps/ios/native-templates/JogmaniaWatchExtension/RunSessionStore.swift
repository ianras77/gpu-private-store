import CoreLocation
import Foundation
import HealthKit
import WatchKit

@MainActor
final class RunSessionStore: NSObject, ObservableObject {
  static let shared = RunSessionStore()

  enum Phase {
    case connecting
    case ready
    case selectingCourse
    case running
    case paused
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
  @Published private(set) var pendingUploadCount: Int = 0
  @Published private(set) var currentAdventure: AdventureCartridge?
  @Published private(set) var latestBeat: AdventureBeat?
  @Published private(set) var triggeredBeatCount: Int = 0
  @Published private(set) var gpsPoints: [GPSPointPayload] = []
  @Published private(set) var recoveredDraftOnly = false
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
  private var routeBuilder: HKWorkoutRouteBuilder?
  private var startedAt: Date?
  private var pausedDuration: TimeInterval = 0
  private var pauseStartedAt: Date?
  private var healthDataEnabled = false
  private var latestLocation: CLLocation?
  private var timerTask: Task<Void, Never>?
  private var locationAuthorizationContinuation: CheckedContinuation<Void, Error>?
  private var heartRateSamples: [JSONValue] = []
  private var lastHeartRateSampleAt: Date?
  private var lastHeartRateSampleBpm: Double?
  private var adventureEvents: [AdventureBeatLog] = []
  private var adventureServerBacked = false
  private let pendingUploadsKey = "JogmaniaPendingAdventureUploads"
  private let runDraftFileName = "active-watch-run.json"
  private var phoneDeviceId: String?
  private var lastDraftWriteAt: Date?
  private var finalizationInProgress = false
  private var recoveryAttempted = false

  override init() {
    super.init()
    locationManager.delegate = self
    locationManager.desiredAccuracy = kCLLocationAccuracyBest
    locationManager.distanceFilter = 5
    locationManager.activityType = .fitness
    locationManager.pausesLocationUpdatesAutomatically = false
    restoreRunDraft()
  }

  func load() async {
    pendingUploadCount = loadPendingUploads().count
    let hasDraft = startedAt != nil
    if hasDraft, workoutSession == nil { recoverActiveWorkoutSession() }
    do {
      let bootstrap = try await companionBridge.requestBootstrap()
      self.bootstrap = bootstrap
      if !bootstrap.phoneDeviceId.isEmpty { phoneDeviceId = bootstrap.phoneDeviceId }

      guard bootstrap.isAuthenticated else {
        if hasDraft {
          phase = .paused
          recoveredDraftOnly = true
          statusMessage = "Your run is back. Open Jogmania on iPhone to reconnect, or save this run draft."
        } else {
          phase = .blocked
          statusMessage = "Open Jogmania on iPhone and sign in first."
        }
        return
      }

      let context: AdventureContext
      do {
        context = try await apiClient.loadAdventureContext(bootstrap: bootstrap)
      } catch {
        guard let cached = apiClient.cachedAdventureContext() else { throw error }
        courses = cached.courses
        primaryParty = cached.party
        if !hasDraft { activeCourse = cached.activeCourse }
        if !hasDraft {
          phase = .ready
          statusMessage = activeCourse.map { "Cached quest ready on \($0.name)." } ?? "Ready for an offline run."
        }
        errorText = "Offline: your saved course and last mission are ready."
        return
      }
      courses = context.courses
      primaryParty = context.party
      if !hasDraft { activeCourse = context.activeCourse }
      if !hasDraft {
        phase = .ready
        statusMessage = activeCourse.map { "Ready for \($0.name)." } ?? "Ready for your next run."
      }
      errorText = nil
      if pendingUploadCount > 0 {
        await syncSavedRuns(bootstrap: bootstrap, reportErrors: false)
      }
    } catch {
      if hasDraft {
        phase = .paused
        recoveredDraftOnly = true
        statusMessage = "Your run is back. The iPhone connection can catch up later."
      } else {
        phase = .failed
        errorText = error.localizedDescription
        statusMessage = "Unable to load companion context."
      }
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
    guard startedAt == nil else {
      statusMessage = "Finish the recovered run before starting another one."
      return
    }

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

      guard activeCourse != nil else {
        phase = .ready
        statusMessage = "Pick a course on iPhone before your first adventure."
        return
      }

      if let activeCourse {
        do {
          let cartridge = try await apiClient.prepareCartridge(routeId: activeCourse.id, bootstrap: bootstrap)
          currentAdventure = cartridge
          adventureServerBacked = true
          apiClient.cache(cartridge: cartridge, serverBacked: true, courseId: activeCourse.id)
        } catch {
          if let cached = apiClient.cachedCartridge(courseId: activeCourse.id) {
            currentAdventure = cached.cartridge
            adventureServerBacked = cached.serverBacked
          } else {
            currentAdventure = Self.localCartridge(for: activeCourse)
            adventureServerBacked = false
          }
          statusMessage = "The arcade is ready from your pocket-sized mission cache."
        }
      }

      healthDataEnabled = currentAdventure?.health_data_enabled ?? false
      try await requestPermissions(healthDataEnabled: healthDataEnabled)

      try? await apiClient.registerWatchDevice(
        phoneDeviceId: bootstrap.phoneDeviceId.isEmpty ? nil : bootstrap.phoneDeviceId,
        bootstrap: bootstrap
      )

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
      phoneDeviceId = bootstrap.phoneDeviceId.isEmpty ? nil : bootstrap.phoneDeviceId
      workoutSession = session
      workoutBuilder = builder
      routeBuilder = builder.seriesBuilder(for: HKSeriesType.workoutRoute()) as? HKWorkoutRouteBuilder
      recoveredDraftOnly = false
      persistRunDraft(force: true)
      locationManager.startUpdatingLocation()

      session.startActivity(with: startDate)
      try await beginCollection(builder, at: startDate)

      phase = .running
      statusMessage = currentAdventure?.opening_line ?? "A new little world is waiting along the path."
      startTimer()
      errorText = nil
    } catch {
      errorText = error.localizedDescription
      if startedAt != nil {
        phase = .paused
        recoveredDraftOnly = true
        workoutSession = nil
        workoutBuilder = nil
        routeBuilder = nil
        statusMessage = "The Watch kept a small run draft. Save it to keep the adventure."
        persistRunDraft(force: true)
      } else {
        phase = .failed
        statusMessage = "Unable to start the workout."
      }
    }
  }

  func stopRun() {
    guard phase == .running || phase == .paused else { return }
    phase = .uploading
    statusMessage = "Finalizing workout..."
    locationManager.stopUpdatingLocation()
    if let workoutSession {
      workoutSession.end()
    } else {
      Task { await queueRecoveredDraft(endDate: Date()) }
    }
  }

  func pauseRun() {
    guard phase == .running else { return }
    workoutSession?.pause()
    pauseStartedAt = Date()
    phase = .paused
    statusMessage = "Little pause. Your arcade is holding your place."
    stopTimer()
    locationManager.stopUpdatingLocation()
    persistRunDraft(force: true)
  }

  func resumeRun() {
    guard phase == .paused else { return }
    guard workoutSession != nil else {
      statusMessage = "This recovered postcard can be saved, but its live workout cannot resume."
      return
    }
    if let pauseStartedAt {
      pausedDuration += Date().timeIntervalSince(pauseStartedAt)
      self.pauseStartedAt = nil
    }
    workoutSession?.resume()
    phase = .running
    statusMessage = "Back on the trail. The story is right where you left it."
    locationManager.startUpdatingLocation()
    startTimer()
    persistRunDraft(force: true)
  }

  func recoverActiveWorkoutSession() {
    guard !recoveryAttempted else { return }
    recoveryAttempted = true
    restoreRunDraft()
    healthStore.recoverActiveWorkoutSession { [weak self] session, error in
      Task { @MainActor in
        guard let self else { return }
        guard let session else {
          if self.startedAt != nil {
            if self.pauseStartedAt == nil {
              let savedAt = self.lastDraftWriteAt ?? self.startedAt ?? Date()
              self.pausedDuration += max(0, Date().timeIntervalSince(savedAt))
              self.pauseStartedAt = Date()
            }
            self.recoveredDraftOnly = true
            self.phase = .paused
            self.statusMessage = "Your run postcard survived. Save it now or reconnect to Jogmania later."
            if let error { self.errorText = error.localizedDescription }
          } else if let error {
            self.errorText = error.localizedDescription
          }
          return
        }

        self.attachRecoveredSession(session)
      }
    }
  }

  private func attachRecoveredSession(_ session: HKWorkoutSession) {
    let builder = session.associatedWorkoutBuilder()
    builder.dataSource = HKLiveWorkoutDataSource(
      healthStore: healthStore,
      workoutConfiguration: session.workoutConfiguration
    )
    session.delegate = self
    builder.delegate = self
    workoutSession = session
    workoutBuilder = builder
    routeBuilder = builder.seriesBuilder(for: HKSeriesType.workoutRoute()) as? HKWorkoutRouteBuilder
    recoveredDraftOnly = false

    if startedAt == nil {
      startedAt = session.startDate ?? Date()
      healthDataEnabled = currentAdventure?.health_data_enabled ?? false
    }

    switch session.state {
    case .running:
      pauseStartedAt = nil
      phase = .running
      statusMessage = "Your run is back. The arcade kept your place."
      locationManager.startUpdatingLocation()
      startTimer()
    case .paused:
      phase = .paused
      if pauseStartedAt == nil { pauseStartedAt = Date() }
      statusMessage = "Your run is back on pause. Carry on when you’re ready."
      locationManager.stopUpdatingLocation()
      stopTimer()
    case .stopped, .ended:
      phase = .uploading
      statusMessage = "Your recovered workout is finishing its postcard..."
      locationManager.stopUpdatingLocation()
      Task { await finalizeRun() }
    default:
      phase = .paused
      recoveredDraftOnly = true
      statusMessage = "Your run postcard survived. Save it to keep the adventure."
    }
    persistRunDraft(force: true)
  }

  func syncSavedRuns() async {
    do {
      if bootstrap == nil { try await loadBootstrap() }
      guard let bootstrap else { throw RunSessionError.missingCompanionContext }
      await syncSavedRuns(bootstrap: bootstrap, reportErrors: true)
    } catch {
      errorText = error.localizedDescription
      statusMessage = "Your run is safe on the Watch. Open Jogmania on iPhone when you're ready to sync."
    }
  }

  private func loadPendingUploads() -> [QueuedWorkoutUpload] {
    guard let data = UserDefaults.standard.data(forKey: pendingUploadsKey) else { return [] }
    return (try? JSONDecoder().decode([QueuedWorkoutUpload].self, from: data)) ?? []
  }

  private func savePendingUploads(_ uploads: [QueuedWorkoutUpload]) {
    if let data = try? JSONEncoder().encode(uploads) {
      UserDefaults.standard.set(data, forKey: pendingUploadsKey)
      pendingUploadCount = uploads.count
    }
  }

  private func runDraftURL() -> URL? {
    guard let supportDirectory = FileManager.default.urls(
      for: .applicationSupportDirectory,
      in: .userDomainMask
    ).first else { return nil }
    return supportDirectory.appendingPathComponent(runDraftFileName)
  }

  private func persistRunDraft(force: Bool = false) {
    guard let startedAt, let url = runDraftURL() else { return }
    if !force, let lastDraftWriteAt, Date().timeIntervalSince(lastDraftWriteAt) < 10 { return }

    do {
      let savedAt = Date()
      try FileManager.default.createDirectory(
        at: url.deletingLastPathComponent(),
        withIntermediateDirectories: true
      )
      let draft = WatchRunDraft(
        savedAt: savedAt,
        startedAt: startedAt,
        activeCourse: activeCourse,
        primaryParty: primaryParty,
        currentAdventure: currentAdventure,
        adventureEvents: adventureEvents,
        gpsPoints: gpsPoints,
        distanceMeters: distanceMeters,
        elapsedSeconds: elapsedSeconds,
        pausedDuration: pausedDuration,
        pauseStartedAt: pauseStartedAt,
        isPaused: phase == .paused,
        healthDataEnabled: healthDataEnabled,
        averageHeartRate: healthDataEnabled ? averageHeartRate : nil,
        caloriesBurned: healthDataEnabled ? caloriesBurned : nil,
        heartRateSamples: healthDataEnabled ? heartRateSamples : [],
        lastHeartRateSampleAt: healthDataEnabled ? lastHeartRateSampleAt : nil,
        lastHeartRateSampleBpm: healthDataEnabled ? lastHeartRateSampleBpm : nil,
        adventureServerBacked: adventureServerBacked,
        phoneDeviceId: phoneDeviceId
      )
      let data = try JSONEncoder().encode(draft)
      try data.write(to: url, options: .atomic)
      lastDraftWriteAt = savedAt
    } catch {
      errorText = "Run recovery save failed: \(error.localizedDescription)"
    }
  }

  private func restoreRunDraft() {
    guard startedAt == nil, let url = runDraftURL(),
          let data = try? Data(contentsOf: url),
          let draft = try? JSONDecoder().decode(WatchRunDraft.self, from: data) else { return }

    startedAt = draft.startedAt
    activeCourse = draft.activeCourse
    primaryParty = draft.primaryParty
    currentAdventure = draft.currentAdventure
    adventureEvents = draft.adventureEvents
    gpsPoints = draft.gpsPoints
    distanceMeters = draft.distanceMeters
    elapsedSeconds = draft.elapsedSeconds
    pausedDuration = draft.pausedDuration
    pauseStartedAt = draft.pauseStartedAt
    healthDataEnabled = draft.healthDataEnabled
    averageHeartRate = draft.healthDataEnabled ? draft.averageHeartRate : nil
    caloriesBurned = draft.healthDataEnabled ? draft.caloriesBurned : nil
    heartRateSamples = draft.healthDataEnabled ? draft.heartRateSamples : []
    lastHeartRateSampleAt = draft.healthDataEnabled ? draft.lastHeartRateSampleAt : nil
    lastHeartRateSampleBpm = draft.healthDataEnabled ? draft.lastHeartRateSampleBpm : nil
    adventureServerBacked = draft.adventureServerBacked
    phoneDeviceId = draft.phoneDeviceId
    latestBeat = draft.adventureEvents.last.flatMap { last in
      draft.currentAdventure?.events.first { $0.id == last.id }
    }
    triggeredBeatCount = draft.adventureEvents.count
    latestLocation = draft.gpsPoints.last.map { CLLocation(latitude: $0.lat, longitude: $0.lon) }
    recoveredDraftOnly = true
    phase = .paused
    statusMessage = draft.isPaused
      ? "Your paused run is back. Reconnecting to the arcade..."
      : "Your run is back. Reconnecting to the arcade..."
    lastDraftWriteAt = draft.savedAt
  }

  private func clearRunDraft() {
    guard let url = runDraftURL() else { return }
    try? FileManager.default.removeItem(at: url)
    lastDraftWriteAt = nil
    recoveredDraftOnly = false
  }

  private func syncSavedRuns(bootstrap: CompanionBootstrap, reportErrors: Bool) async {
    var uploads = loadPendingUploads()
    while let upload = uploads.first {
      do {
        let detail = try await apiClient.createWorkout(upload.payload, bootstrap: bootstrap)
        latestReport = UploadReport(
          points: detail.raw_payload_json?.progression?.points ?? 0,
          rewards: detail.raw_payload_json?.progression?.rewards ?? [],
          worldEvents: detail.raw_payload_json?.world_events ?? [],
          recap: detail.raw_payload_json?.adventure_recap
        )
        uploads.removeFirst()
        savePendingUploads(uploads)
        errorText = nil
        statusMessage = uploads.isEmpty ? "Your run postcard has made it to the arcade." : "Run saved. Sending the next postcard..."
      } catch {
        pendingUploadCount = uploads.count
        if reportErrors { errorText = error.localizedDescription }
        statusMessage = "Run saved on the Watch. Sync it when you're back online."
        return
      }
    }
  }

  private func loadBootstrap() async throws {
    let bootstrap = try await companionBridge.requestBootstrap(force: true)
    self.bootstrap = bootstrap
  }

  private func requestPermissions(healthDataEnabled: Bool) async throws {
    let routeType = HKSeriesType.workoutRoute()
    let toShare: Set<HKSampleType> = [HKObjectType.workoutType(), routeType]
    var toRead: Set<HKObjectType> = [
      HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)!,
      routeType,
    ]
    if healthDataEnabled {
      toRead.insert(HKObjectType.quantityType(forIdentifier: .heartRate)!)
      toRead.insert(HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!)
    }

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

  private func finishRoute(_ routeBuilder: HKWorkoutRouteBuilder, workout: HKWorkout) async throws {
    try await withCheckedThrowingContinuation { continuation in
      routeBuilder.finishRoute(with: workout, metadata: nil) { _, error in
        if let error {
          continuation.resume(throwing: error)
        } else {
          continuation.resume(returning: ())
        }
      }
    }
  }

  private func startTimer() {
    timerTask?.cancel()
    timerTask = Task {
      while !Task.isCancelled {
        if let startedAt {
          let activePause = pauseStartedAt.map { Date().timeIntervalSince($0) } ?? 0
          elapsedSeconds = max(1, Int(Date().timeIntervalSince(startedAt) - pausedDuration - activePause))
          persistRunDraft()
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
    heartRateSamples = []
    lastHeartRateSampleAt = nil
    lastHeartRateSampleBpm = nil
    adventureEvents = []
    latestBeat = nil
    triggeredBeatCount = 0
    pausedDuration = 0
    pauseStartedAt = nil
    recoveredDraftOnly = false
  }

  private static func localCartridge(for course: RouteSummary) -> AdventureCartridge {
    let seeds: [(String, String, String, String, String)] = [
      ("marquee", "A sign in the weeds", "A little neon sign flickers awake. It says ARCADE!", "marquee", "tap"),
      ("prize-counter", "The rattling prize tin", "A brass token rolls out and lands in the prize tin.", "token", "success"),
      ("lantern-crew", "A tiny helper arrives", "A lantern mouse scampers alongside you. Very official. Tiny badge and all.", "mouse", "tap"),
      ("arcade-lights", "The Lost Arcade", "The whole marquee bursts into color. The arcade is open again!", "arcade", "celebration")
    ]
    let distance = max(400, Int(course.distance_m ?? 3200))
    let events = seeds.enumerated().map { index, seed in
      AdventureBeat(
        id: seed.0,
        trigger_kind: "distance",
        trigger_value: max(1, Int(Double(distance) * [0.18, 0.43, 0.72, 1.0][index])),
        kind: index == 0 ? "discovery" : (index == 1 ? "collectible" : (index == 2 ? "companion" : "finish")),
        title: seed.1,
        message: seed.2,
        visual_key: seed.3,
        haptic: seed.4
      )
    }
    return AdventureCartridge(
      id: UUID().uuidString.lowercased(),
      title: "Relight the Lost Arcade",
      world_name: "The Lost Arcade",
      course_name: course.name,
      intent: "surprise",
      opening_line: "A forgotten arcade sign blinks awake. A lantern mouse has volunteered as your guide.",
      finish_line: "Every light is on. Somewhere inside, a pinball machine just woke up.",
      events: events,
      reward_preview: "An arcade light and a brass token",
      target_distance_m: distance,
      haptics_enabled: true,
      health_data_enabled: false,
      intelligence: "fallback",
      runner_snapshot: [:]
    )
  }

  private func checkAdventureBeats() {
    guard let currentAdventure else { return }
    var foundNewBeat = false
    for event in currentAdventure.events where event.trigger_kind == "distance" && distanceMeters >= Double(event.trigger_value) {
      guard adventureEvents.contains(where: { $0.id == event.id }) == false else { continue }
      adventureEvents.append(AdventureBeatLog(id: event.id, title: event.title, kind: event.kind))
      latestBeat = event
      triggeredBeatCount = adventureEvents.count
      foundNewBeat = true
      if currentAdventure.haptics_enabled {
        switch event.haptic {
        case "celebration": WKInterfaceDevice.current().play(.success)
        case "success": WKInterfaceDevice.current().play(.click)
        default: WKInterfaceDevice.current().play(.notification)
        }
      }
    }
    if foundNewBeat { persistRunDraft(force: true) }
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

  private func appendHeartRateSample(bpm: Double, at date: Date = Date()) {
    if let lastHeartRateSampleAt,
       let lastHeartRateSampleBpm,
       date.timeIntervalSince(lastHeartRateSampleAt) < 5,
       abs(lastHeartRateSampleBpm - bpm) < 1 {
      return
    }

    heartRateSamples.append(
      .object([
        "bpm": .number(round(bpm * 10) / 10),
        "timestamp": .string(isoString(from: date)),
        "distance_m": .number(round(distanceMeters * 10) / 10)
      ])
    )
    if heartRateSamples.count > 720 {
      heartRateSamples.removeFirst(heartRateSamples.count - 720)
    }
    lastHeartRateSampleAt = date
    lastHeartRateSampleBpm = bpm
  }

  private func averageAccuracyMeters() -> Double? {
    let values = gpsPoints.compactMap(\.accuracy_m)
    guard values.isEmpty == false else { return nil }
    return values.reduce(0, +) / Double(values.count)
  }

  private func rawPayload(elevationGain: Double) -> [String: JSONValue] {
    var payload: [String: JSONValue] = [
      "capture_mode": .string("watch-native"),
      "synced_via": .string("watchos-native"),
      "companion_device_id": .string(phoneDeviceId ?? ""),
      "course_id": .string(activeCourse?.id ?? ""),
      "course_name": .string(activeCourse?.name ?? ""),
      "point_count": .number(Double(gpsPoints.count)),
      "elevation_gain_m": .number(round(elevationGain * 10) / 10),
      "heart_rate_samples": .array(healthDataEnabled ? heartRateSamples : [])
    ]

    if adventureServerBacked, let currentAdventure {
      payload["adventure_session_id"] = .string(currentAdventure.id)
    }
    payload["adventure_events"] = .array(adventureEvents.map { event in
      .object(["id": .string(event.id)])
    })

    if let averageAccuracy = averageAccuracyMeters() {
      payload["gps_accuracy_avg_m"] = .number(round(averageAccuracy * 10) / 10)
    }
    if healthDataEnabled, let caloriesBurned {
      payload["active_energy_kcal"] = .number(round(caloriesBurned * 10) / 10)
    }
    return payload
  }

  private func finalizeRun() async {
    guard !finalizationInProgress else { return }
    guard let startedAt else {
      phase = .failed
      statusMessage = "Workout session ended unexpectedly."
      return
    }
    guard let builder = workoutBuilder else {
      await queueRecoveredDraft(endDate: Date())
      return
    }
    finalizationInProgress = true
    defer { finalizationInProgress = false }

    do {
      let endDate = Date()
      stopTimer()
      let activePause = pauseStartedAt.map { endDate.timeIntervalSince($0) } ?? 0
      elapsedSeconds = max(1, Int(endDate.timeIntervalSince(startedAt) - pausedDuration - activePause))

      try await endCollection(builder, at: endDate)
      let savedWorkout = try await finishWorkout(builder)
      if let routeBuilder, gpsPoints.count >= 2 {
        try await finishRoute(routeBuilder, workout: savedWorkout)
      }

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
        calories_kcal: healthDataEnabled ? caloriesBurned : nil,
        avg_hr: healthDataEnabled ? averageHeartRate : nil,
        elevation_gain_m: elevationGain,
        route_id: activeCourse?.id,
        device_id: apiClient.watchDeviceId,
        raw_payload_json: rawPayload(elevationGain: elevationGain),
        gps_points: gpsPoints
      )

      let queued = QueuedWorkoutUpload(
        id: "\(payload.source)-\(payload.started_at)",
        payload: payload,
        queuedAt: Date()
      )
      savePendingUploads(loadPendingUploads().filter { $0.id != queued.id } + [queued])
      clearRunDraft()
      if let bootstrap {
        await syncSavedRuns(bootstrap: bootstrap, reportErrors: true)
      } else {
        await syncSavedRuns()
      }
      phase = .finished
      if pendingUploadCount == 0 {
        statusMessage = "Run uploaded. A new arcade light is on."
      }
      workoutBuilder = nil
      workoutSession = nil
      routeBuilder = nil
      self.startedAt = nil
      pauseStartedAt = nil
    } catch {
      phase = .paused
      recoveredDraftOnly = true
      statusMessage = "Your run is safe. Save its recovered postcard to keep the adventure."
      errorText = error.localizedDescription
      workoutBuilder = nil
      workoutSession = nil
      routeBuilder = nil
      persistRunDraft(force: true)
    }
  }

  private func queueRecoveredDraft(endDate: Date) async {
    guard !finalizationInProgress else { return }
    guard let startedAt else {
      phase = .failed
      statusMessage = "There is no saved run to finish."
      return
    }

    finalizationInProgress = true
    defer { finalizationInProgress = false }
    stopTimer()
    let activePause = pauseStartedAt.map { endDate.timeIntervalSince($0) } ?? 0
    elapsedSeconds = max(1, Int(endDate.timeIntervalSince(startedAt) - pausedDuration - activePause))
    let elevation = elevationGain()
    let pace = distanceMeters > 0 ? Double(elapsedSeconds) / (distanceMeters / 1000) : 0
    let payload = WorkoutCreatePayload(
      source: "watch",
      started_at: isoString(from: startedAt),
      ended_at: isoString(from: endDate),
      duration_s: elapsedSeconds,
      distance_m: distanceMeters,
      avg_pace_s_per_km: pace,
      calories_kcal: healthDataEnabled ? caloriesBurned : nil,
      avg_hr: healthDataEnabled ? averageHeartRate : nil,
      elevation_gain_m: elevation,
      route_id: activeCourse?.id,
      device_id: apiClient.watchDeviceId,
      raw_payload_json: rawPayload(elevationGain: elevation),
      gps_points: gpsPoints
    )
    let queued = QueuedWorkoutUpload(
      id: "\(payload.source)-\(payload.started_at)",
      payload: payload,
      queuedAt: Date()
    )
    savePendingUploads(loadPendingUploads().filter { $0.id != queued.id } + [queued])
    clearRunDraft()
    await syncSavedRuns()
    phase = .finished
    statusMessage = pendingUploadCount == 0
      ? "Your recovered run postcard made it to the arcade."
      : "Run draft saved on the Watch. Send its postcard when you reconnect."
    workoutBuilder = nil
    workoutSession = nil
    routeBuilder = nil
    self.startedAt = nil
    pauseStartedAt = nil
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
      let accepted = locations.filter { location in
        location.horizontalAccuracy >= 0 && location.horizontalAccuracy <= 65
      }
      guard accepted.isEmpty == false else { return }

      routeBuilder?.insertRouteData(accepted) { success, error in
        if success == false, let error {
          Task { @MainActor in
            self.errorText = error.localizedDescription
          }
        }
      }

      for location in accepted {
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
        checkAdventureBeats()
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
      if self.healthDataEnabled,
         let heartRateType = HKQuantityType.quantityType(forIdentifier: .heartRate),
         collectedTypes.contains(heartRateType),
         let statistics = workoutBuilder.statistics(for: heartRateType) {
        if let average = statistics.averageQuantity() {
          let bpm = average.doubleValue(for: HKUnit(from: "count/min"))
          self.averageHeartRate = bpm
          appendHeartRateSample(bpm: bpm)
        }
      }

      if self.healthDataEnabled,
         let activeEnergyType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned),
         collectedTypes.contains(activeEnergyType),
         let statistics = workoutBuilder.statistics(for: activeEnergyType),
         let quantity = statistics.sumQuantity() {
        self.caloriesBurned = quantity.doubleValue(for: .kilocalorie())
      }

      if let distanceType = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning),
         collectedTypes.contains(distanceType),
         let statistics = workoutBuilder.statistics(for: distanceType),
         let quantity = statistics.sumQuantity() {
        self.distanceMeters = max(self.distanceMeters, quantity.doubleValue(for: .meter()))
      }
    }
  }
}

enum RunSessionError: LocalizedError {
  case permissionsDenied
  case collectionFailed
  case finishFailed
  case missingCompanionContext
  case notEnoughRouteData

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
    case .notEnoughRouteData:
      return "The watch needs at least two good GPS points before it can upload an adventure."
    }
  }
}
