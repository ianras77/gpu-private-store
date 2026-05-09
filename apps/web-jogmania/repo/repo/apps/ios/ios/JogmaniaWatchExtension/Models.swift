import Foundation

struct CompanionBootstrap: Codable {
  let apiBaseUrl: String
  let token: String
  let phoneDeviceId: String
  let isAuthenticated: Bool
  let generatedAt: String
}

struct RouteSummary: Codable, Identifiable, Hashable {
  let id: String
  let name: String
  let is_course: Bool
}

struct WorldSummary: Codable {
  let id: String
  let name: String
  let route_id: String?
}

struct PartySummary: Codable, Identifiable {
  let id: String
  let name: String
  let world: WorldSummary?
}

struct AdventureContext {
  let party: PartySummary?
  let courses: [RouteSummary]
  let activeCourse: RouteSummary?
}

struct DeviceRegisterPayload: Codable {
  let platform: String
  let device_id: String
  let name: String?
  let companion_device_id: String?
  let metadata_json: [String: String]?
}

struct GPSPointPayload: Codable, Identifiable {
  var id: UUID = UUID()
  let lat: Double
  let lon: Double
  let altitude_m: Double?
  let timestamp: String
  let accuracy_m: Double?

  enum CodingKeys: String, CodingKey {
    case lat
    case lon
    case altitude_m
    case timestamp
    case accuracy_m
  }
}

struct WorkoutCreatePayload: Codable {
  let source: String
  let started_at: String
  let ended_at: String
  let duration_s: Int
  let distance_m: Double
  let avg_pace_s_per_km: Double
  let calories_kcal: Double?
  let avg_hr: Double?
  let elevation_gain_m: Double?
  let route_id: String?
  let device_id: String?
  let raw_payload_json: [String: String]
  let gps_points: [GPSPointPayload]
}

struct WorkoutDetail: Codable {
  let id: String
  let raw_payload_json: UploadMetadata?
}

struct UploadMetadata: Codable {
  let progression: ProgressionSummary?
  let world_events: [WorldEventSummary]?
}

struct ProgressionSummary: Codable {
  let points: Int
  let improvement_s_per_km: Double?
  let rewards: [String]
  let inventory: [String: Int]
}

struct WorldEventSummary: Codable, Identifiable {
  let id: String
  let title: String
  let world_id: String
}

struct UploadReport {
  let points: Int
  let rewards: [String]
  let worldEvents: [WorldEventSummary]
}
