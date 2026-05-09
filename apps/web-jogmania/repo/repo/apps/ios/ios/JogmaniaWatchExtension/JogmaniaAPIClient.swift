import Foundation

final class JogmaniaAPIClient {
  private let decoder = JSONDecoder()
  private let encoder = JSONEncoder()
  private let session: URLSession
  private let userDefaults: UserDefaults
  private let watchDeviceIdKey = "JogmaniaWatchDeviceId"

  init(session: URLSession = .shared, userDefaults: UserDefaults = .standard) {
    self.session = session
    self.userDefaults = userDefaults
  }

  var watchDeviceId: String {
    if let existing = userDefaults.string(forKey: watchDeviceIdKey), !existing.isEmpty {
      return existing
    }

    let created = "jm-watch-\(UUID().uuidString.lowercased())"
    userDefaults.set(created, forKey: watchDeviceIdKey)
    return created
  }

  func loadAdventureContext(bootstrap: CompanionBootstrap) async throws -> AdventureContext {
    async let partiesRequest: [PartySummary] = request("/parties", method: "GET", bootstrap: bootstrap)
    async let routesRequest: [RouteSummary] = request("/routes", method: "GET", bootstrap: bootstrap)

    let parties = try await partiesRequest
    let routes = try await routesRequest
    let courses = routes.filter { $0.is_course }
    let party = parties.first
    let activeCourseId = party?.world?.route_id ?? courses.first?.id
    let activeCourse = courses.first(where: { $0.id == activeCourseId }) ?? courses.first

    return AdventureContext(party: party, courses: courses, activeCourse: activeCourse)
  }

  func enterWorld(partyId: String, routeId: String, bootstrap: CompanionBootstrap) async throws {
    struct Body: Codable {
      let route_id: String
    }

    let body = Body(route_id: routeId)
    let _: WorldSummary = try await request("/parties/\(partyId)/world/enter", method: "POST", bootstrap: bootstrap, body: body)
  }

  func registerWatchDevice(phoneDeviceId: String?, bootstrap: CompanionBootstrap) async throws {
    let payload = DeviceRegisterPayload(
      platform: "watch",
      device_id: watchDeviceId,
      name: "Jogmania Apple Watch",
      companion_device_id: phoneDeviceId,
      metadata_json: [
        "app": "watchos-companion",
        "native": "true",
        "sync": "companion"
      ]
    )
    let _: EmptyResponse = try await request("/devices/register", method: "POST", bootstrap: bootstrap, body: payload)
  }

  func createWorkout(_ payload: WorkoutCreatePayload, bootstrap: CompanionBootstrap) async throws -> WorkoutDetail {
    try await request("/workouts", method: "POST", bootstrap: bootstrap, body: payload)
  }

  private func request<T: Decodable>(
    _ path: String,
    method: String,
    bootstrap: CompanionBootstrap
  ) async throws -> T {
    try await performRequest(path, method: method, bootstrap: bootstrap, bodyData: nil)
  }

  private func request<T: Decodable, Body: Encodable>(
    _ path: String,
    method: String,
    bootstrap: CompanionBootstrap,
    body: Body
  ) async throws -> T {
    let bodyData = try encoder.encode(body)
    return try await performRequest(path, method: method, bootstrap: bootstrap, bodyData: bodyData)
  }

  private func performRequest<T: Decodable>(
    _ path: String,
    method: String,
    bootstrap: CompanionBootstrap,
    bodyData: Data?
  ) async throws -> T {
    guard let url = URL(string: bootstrap.apiBaseUrl + path) else {
      throw JogmaniaAPIError.invalidBaseURL
    }

    var request = URLRequest(url: url)
    request.httpMethod = method
    request.timeoutInterval = 30
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(bootstrap.token)", forHTTPHeaderField: "Authorization")

    if let bodyData {
      request.httpBody = bodyData
    }

    let (data, response) = try await session.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse else {
      throw JogmaniaAPIError.invalidResponse
    }

    guard (200..<300).contains(httpResponse.statusCode) else {
      let detail = try? decoder.decode(APIErrorDetail.self, from: data)
      throw JogmaniaAPIError.server(detail?.detail ?? "Request failed with status \(httpResponse.statusCode)")
    }

    if T.self == EmptyResponse.self {
      return EmptyResponse() as! T
    }

    return try decoder.decode(T.self, from: data)
  }
}

private struct APIErrorDetail: Decodable {
  let detail: String
}

private struct EmptyResponse: Decodable {}

enum JogmaniaAPIError: LocalizedError {
  case invalidBaseURL
  case invalidResponse
  case server(String)

  var errorDescription: String? {
    switch self {
    case .invalidBaseURL:
      return "The companion app returned an invalid API base URL."
    case .invalidResponse:
      return "The Jogmania API returned an invalid response."
    case .server(let message):
      return message
    }
  }
}
