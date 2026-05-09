import SwiftUI

struct ContentView: View {
  @StateObject private var store = RunSessionStore()
  @State private var selectedCourseId: String = ""

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 12) {
        statusCard
        coursePicker
        metricsCard
        reportCard
        controls
        if let errorText = store.errorText {
          Text(errorText)
            .font(.footnote)
            .foregroundStyle(.red)
        }
      }
      .padding()
    }
    .navigationTitle("Jogmania")
    .task {
      await store.load()
      selectedCourseId = store.activeCourse?.id ?? ""
    }
    .onChange(of: store.activeCourse?.id ?? "") { _, next in
      selectedCourseId = next
    }
  }

  private var statusCard: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("Companion")
        .font(.caption2)
        .foregroundStyle(.secondary)
      Text(store.statusMessage)
        .font(.headline)
      Text(store.companionBridge.isReachable ? "iPhone nearby" : "Using cached bridge context")
        .font(.footnote)
        .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var coursePicker: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("Adventure Course")
        .font(.caption2)
        .foregroundStyle(.secondary)
      Picker("Course", selection: $selectedCourseId) {
        ForEach(store.courses, id: \.id) { course in
          Text(course.name).tag(course.id)
        }
      }
      .labelsHidden()
      .disabled(store.phase == .running || store.courses.isEmpty)
      .onChange(of: selectedCourseId) { _, nextValue in
        guard !nextValue.isEmpty, nextValue != store.activeCourse?.id else { return }
        Task {
          await store.selectCourse(routeId: nextValue)
        }
      }
    }
  }

  private var metricsCard: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("Run Stats")
        .font(.caption2)
        .foregroundStyle(.secondary)
      metricRow("Distance", value: String(format: "%.2f km", store.distanceMeters / 1000))
      metricRow("Time", value: formatElapsed(store.elapsedSeconds))
      metricRow("Heart", value: store.averageHeartRate.map { String(format: "%.0f bpm", $0) } ?? "--")
      metricRow("Calories", value: store.caloriesBurned.map { String(format: "%.0f kcal", $0) } ?? "--")
    }
  }

  private var reportCard: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("Mission Report")
        .font(.caption2)
        .foregroundStyle(.secondary)
      if let latestReport = store.latestReport {
        Text("+\(latestReport.points) course points")
          .font(.headline)
        if latestReport.rewards.isEmpty == false {
          Text("Rewards: \(latestReport.rewards.joined(separator: ", "))")
            .font(.footnote)
        }
        ForEach(latestReport.worldEvents) { event in
          Text("World event: \(event.title)")
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
      } else {
        Text("Complete a watch run to push rewards into your active world.")
          .font(.footnote)
          .foregroundStyle(.secondary)
      }
    }
  }

  private var controls: some View {
    VStack(spacing: 8) {
      if store.phase == .running {
        Button("Stop Run") {
          store.stopRun()
        }
        .buttonStyle(.borderedProminent)
        .tint(.red)
      } else {
        Button("Start Run") {
          Task {
            await store.startRun()
          }
        }
        .buttonStyle(.borderedProminent)
      }

      Button("Refresh Companion") {
        Task {
          await store.load()
        }
      }
      .buttonStyle(.bordered)
    }
    .frame(maxWidth: .infinity)
  }

  private func metricRow(_ label: String, value: String) -> some View {
    HStack {
      Text(label)
      Spacer()
      Text(value)
        .monospacedDigit()
    }
    .font(.footnote)
  }

  private func formatElapsed(_ seconds: Int) -> String {
    let minutes = seconds / 60
    let remainder = seconds % 60
    return String(format: "%d:%02d", minutes, remainder)
  }
}
