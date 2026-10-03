import SwiftUI

struct ContentView: View {
  @StateObject private var store = RunSessionStore.shared
  @State private var selectedCourseId: String = ""

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 12) {
        statusCard
        coursePicker
        adventureCard
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
      Text("THE OUTDOOR ARCADE")
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

  private var adventureCard: some View {
    let cartridge = store.currentAdventure
    let progress = cartridge.map { min(1, store.distanceMeters / Double(max(1, $0.target_distance_m))) } ?? 0
    return VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 8) {
        PixelArcadeBuddy(variant: store.latestBeat?.visual_key ?? "mouse")
          .frame(width: 42, height: 42)
        VStack(alignment: .leading, spacing: 2) {
          Text(cartridge?.title ?? "The Lost Arcade")
            .font(.headline)
            .lineLimit(1)
          Text(cartridge?.world_name.uppercased() ?? "A WORLD IN YOUR POCKET")
            .font(.system(size: 8, weight: .heavy, design: .rounded))
            .foregroundStyle(.cyan)
            .lineLimit(1)
        }
      }
      Text(store.latestBeat?.message ?? cartridge?.opening_line ?? "A little arcade is hiding along your route.")
        .font(.footnote.weight(.medium))
        .fixedSize(horizontal: false, vertical: true)
      GeometryReader { proxy in
        ZStack(alignment: .leading) {
          Capsule().fill(Color.white.opacity(0.12))
          Capsule().fill(LinearGradient(colors: [.cyan, .purple, .pink], startPoint: .leading, endPoint: .trailing))
            .frame(width: max(8, proxy.size.width * progress))
        }
      }
      .frame(height: 7)
      HStack {
        Text(store.phase == .running ? "\(store.triggeredBeatCount) surprises found" : (cartridge?.reward_preview ?? "Run, wander, light something up"))
        Spacer(minLength: 4)
        Text("\(Int(progress * 100))%")
          .monospacedDigit()
          .foregroundStyle(.yellow)
      }
      .font(.system(size: 9, weight: .semibold, design: .rounded))
      .foregroundStyle(.secondary)
    }
    .padding(10)
    .background(
      LinearGradient(colors: [Color(red: 0.18, green: 0.07, blue: 0.33), Color(red: 0.04, green: 0.12, blue: 0.22)], startPoint: .topLeading, endPoint: .bottomTrailing),
      in: RoundedRectangle(cornerRadius: 14)
    )
    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.cyan.opacity(0.45), lineWidth: 1))
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
      Text("Trail Treasures")
        .font(.caption2)
        .foregroundStyle(.secondary)
      metricRow("Distance", value: String(format: "%.2f km", store.distanceMeters / 1000))
      metricRow("Time", value: formatElapsed(store.elapsedSeconds))
      metricRow("Little surprises", value: "\(store.triggeredBeatCount)")
    }
  }

  private var reportCard: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("Mission Report")
        .font(.caption2)
        .foregroundStyle(.secondary)
      if let latestReport = store.latestReport {
        Text("+\(latestReport.points) arcade sparks")
          .font(.headline)
        if let recap = latestReport.recap {
          Text(recap.headline)
            .font(.subheadline.weight(.bold))
            .foregroundStyle(.yellow)
          Text(recap.story)
            .font(.footnote)
          if let next = recap.next_hook {
            Text("Next: \(next)")
              .font(.caption2)
              .foregroundStyle(.cyan)
          }
        }
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
        Button("Pause") {
          store.pauseRun()
        }
        .buttonStyle(.bordered)

        Button("Stop Run") {
          store.stopRun()
        }
        .buttonStyle(.borderedProminent)
        .tint(.red)
      } else if store.phase == .paused {
        if store.recoveredDraftOnly {
          Button("Save Recovered Run") {
            store.stopRun()
          }
          .buttonStyle(.borderedProminent)
          .tint(.purple)
        } else {
          Button("Carry On") {
            store.resumeRun()
          }
          .buttonStyle(.borderedProminent)

          Button("Finish This Run") {
            store.stopRun()
          }
          .buttonStyle(.bordered)
        }
      } else {
        Button("Start Run") {
          Task {
            await store.startRun()
          }
        }
        .buttonStyle(.borderedProminent)
      }

      if store.pendingUploadCount > 0 {
        Button("Send \(store.pendingUploadCount) saved \(store.pendingUploadCount == 1 ? "run" : "runs")") {
          Task { await store.syncSavedRuns() }
        }
        .buttonStyle(.borderedProminent)
        .tint(.purple)
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

private struct PixelArcadeBuddy: View {
  let variant: String

  private let mouse = [
    "...YY.....",
    "..YYYY....",
    ".YBBBBY...",
    "YBBWWBBY..",
    "YBBBBBBBYY",
    "YBWWBWWBYY",
    "YBBBBBBBYY",
    ".YBBBBBYY.",
    "..YBBBY...",
    "...YY....."
  ]
  private let marquee = [
    "..CCCCCC..",
    ".CYYYYYYC.",
    "CYYPPPPYYC",
    "CYYPPPPYYC",
    "CYYYYYYYYC",
    "..CBBBBCC.",
    "..CBBBBCC.",
    "..CBBBBCC.",
    ".CBBBBBBC.",
    "CCCCCCCCCC"
  ]
  private let token = [
    "...YYYY...",
    "..YYOOYY..",
    ".YYOOOOYY.",
    ".YOOYYOOY.",
    ".YOOYYOOY.",
    ".YOOYYOOY.",
    ".YOOYYOOY.",
    ".YYOOOOYY.",
    "..YYOOYY..",
    "...YYYY..."
  ]
  private let moth = [
    "...PP.....",
    "..PPPP....",
    ".CCPPCC...",
    "CCCPPPCCC.",
    "CCCPPPCCCC",
    ".CCPPCCC..",
    "..PPPP....",
    ".CC..CC...",
    "CC....CC..",
    ".........."
  ]
  private let fox = [
    "Y........Y",
    "YY......YY",
    ".YOOOOOOY.",
    "..OOOOOO..",
    ".OWWOOOWWO.",
    ".OOOOOOOO.",
    "..OOOOOO..",
    "...OOOO...",
    "..O....O..",
    ".OO....OO."
  ]
  private let flower = [
    "...PPP....",
    "..PPYPP...",
    "...PPP....",
    "....Y.....",
    "....Y.....",
    "...YYY....",
    "..Y...Y...",
    ".....Y....",
    ".....Y....",
    "....YYY..."
  ]
  private let kite = [
    "....C.....",
    "...CCC....",
    "..CCYCC...",
    ".CCYYYCC..",
    "CCYYYYYCC.",
    ".CCYYYCC..",
    "..CCYCC...",
    "...CCC....",
    "....C.....",
    "....P....."
  ]

  var body: some View {
    Canvas { context, size in
      let grid: [String]
      switch variant {
      case "marquee", "arcade": grid = marquee
      case "token": grid = token
      case "moth": grid = moth
      case "fox": grid = fox
      case "flower", "garden": grid = flower
      case "kite", "bridge": grid = kite
      default: grid = mouse
      }
      let cellWidth = size.width / 10
      let cellHeight = size.height / 10
      for (rowIndex, row) in grid.enumerated() {
        for (columnIndex, pixel) in row.enumerated() where pixel != "." && pixel != " " {
          let color: Color
          switch pixel {
          case "Y": color = .yellow
          case "B": color = Color(red: 0.27, green: 0.13, blue: 0.48)
          case "W": color = .white
          case "C": color = .cyan
          case "P": color = .pink
          case "O": color = .orange
          default: color = .orange
          }
          let rect = CGRect(x: CGFloat(columnIndex) * cellWidth, y: CGFloat(rowIndex) * cellHeight, width: cellWidth, height: cellHeight)
          context.fill(Path(rect), with: .color(color))
        }
      }
    }
    .padding(4)
    .background(Color.purple.opacity(0.35), in: RoundedRectangle(cornerRadius: 8))
    .accessibilityLabel(accessibilityName)
  }

  private var accessibilityName: String {
    switch variant {
    case "marquee", "arcade": "Pixel arcade cabinet"
    case "token": "Pixel brass token"
    case "moth": "Pixel moon moth"
    case "fox": "Pixel prize fox"
    case "flower", "garden": "Pixel singing flower"
    case "kite", "bridge": "Pixel paper kite"
    default: "Pixel lantern mouse"
    }
  }
}
