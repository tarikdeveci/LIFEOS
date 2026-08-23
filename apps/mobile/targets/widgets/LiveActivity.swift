import ActivityKit
import SwiftUI
import WidgetKit

// MARK: - Attributes
//
// Bu tip, uygulama target'ındaki `LiveActivityModule.swift` içinde BİREBİR
// aynı isim ve alanlarla tanımlıdır. ActivityKit iki target'ı tip ADIYLA
// eşleştirir; iki taraf ayrışırsa aktivite başlar ama güncellemeler düşer.
// Birinde alan değiştirirsen diğerini de değiştir.
struct LifeOSBlockAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        /// Blok başlığı — "Derin çalışma"
        var label: String
        /// task | routine | break | focus | meal | workout
        var blockType: String
        /// Bloğun gerçek başlangıç/bitiş anları. SwiftUI bunlardan kendi
        /// sayacını sürer; her dakika push göndermeye gerek kalmaz.
        var startsAt: Date
        var endsAt: Date
        /// Bugün bekleyen görev sayısı
        var pendingTasks: Int
        /// Sıradaki bloğun başlığı (varsa)
        var nextLabel: String?
    }

    /// Aktivitenin ait olduğu gün (YYYY-MM-DD) — gün dönünce eskisini bitirmek için
    var dayDate: String
}

// MARK: - Ortak görünüm parçaları

private func liveColor(_ type: String) -> Color { blockColor(type) }

private struct LiveCountdown: View {
    let state: LifeOSBlockAttributes.ContentState
    var size: CGFloat = 13
    var body: some View {
        // timerInterval sayacı sistem tarafından tiklenir — aktivite
        // güncellenmese bile kalan süre akmaya devam eder.
        Text(timerInterval: state.startsAt...state.endsAt, countsDown: true)
            .font(.system(size: size, weight: .semibold, design: .rounded))
            .monospacedDigit()
    }
}

private struct LiveProgress: View {
    let state: LifeOSBlockAttributes.ContentState
    var body: some View {
        ProgressView(timerInterval: state.startsAt...state.endsAt, countsDown: false) {
            EmptyView()
        } currentValueLabel: {
            EmptyView()
        }
        .progressViewStyle(.linear)
        .tint(liveColor(state.blockType))
    }
}

// MARK: - Kilit ekranı / banner görünümü

struct LiveActivityLockView: View {
    let state: LifeOSBlockAttributes.ContentState
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Circle().fill(liveColor(state.blockType)).frame(width: 8, height: 8)
                Text(state.label)
                    .font(.system(size: 16, weight: .bold))
                    .lineLimit(1)
                Spacer(minLength: 8)
                LiveCountdown(state: state, size: 15)
                    .foregroundColor(liveColor(state.blockType))
            }

            LiveProgress(state: state)

            HStack(spacing: 10) {
                Label("\(state.pendingTasks)", systemImage: "checklist")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
                if let next = state.nextLabel {
                    Text("Sıradaki: \(next)")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
            }
        }
        .padding(14)
        .activityBackgroundTint(Color("$widgetBackground"))
        .activitySystemActionForegroundColor(liveColor(state.blockType))
    }
}

// MARK: - Widget tanımı

struct LifeOSLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: LifeOSBlockAttributes.self) { context in
            LiveActivityLockView(state: context.state)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Circle()
                        .fill(liveColor(context.state.blockType))
                        .frame(width: 10, height: 10)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    LiveCountdown(state: context.state, size: 14)
                        .foregroundColor(liveColor(context.state.blockType))
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.label)
                        .font(.system(size: 14, weight: .semibold))
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 6) {
                        LiveProgress(state: context.state)
                        if let next = context.state.nextLabel {
                            HStack {
                                Text("Sıradaki: \(next)")
                                    .font(.system(size: 11))
                                    .foregroundColor(.secondary)
                                    .lineLimit(1)
                                Spacer()
                                Text("\(context.state.pendingTasks) görev")
                                    .font(.system(size: 11))
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                }
            } compactLeading: {
                Circle()
                    .fill(liveColor(context.state.blockType))
                    .frame(width: 8, height: 8)
            } compactTrailing: {
                LiveCountdown(state: context.state, size: 12)
                    .foregroundColor(liveColor(context.state.blockType))
                    .frame(maxWidth: 44)
            } minimal: {
                Circle()
                    .fill(liveColor(context.state.blockType))
                    .frame(width: 8, height: 8)
            }
            .keylineTint(liveColor(context.state.blockType))
        }
    }
}
