import Foundation
import SwiftUI

// LifeOS widget snapshot — React Native tarafındaki WidgetSnapshot ile birebir.
// App Group UserDefaults'tan okunur, JSON olarak saklanır.

let appGroup = "group.tr.lifeos.app.widget"
let snapshotKey = "lifeos_widget_snapshot"

struct WidgetBlock: Codable {
    let label: String
    let blockType: String
    let startTime: String   // "HH:MM"
    let endTime: String     // "HH:MM"
    let progress: Double
    let remainingMinutes: Double
    let minutesUntilStart: Double
}

struct CalorieInfo: Codable {
    let consumed: Int
    let target: Int
}

struct StepInfo: Codable {
    let value: Int
    let goal: Int
}

struct WidgetSnapshot: Codable {
    let updatedAt: String
    let date: String
    let currentBlock: WidgetBlock?
    let nextBlock: WidgetBlock?
    let dayOver: Bool
    let pendingTasks: Int
    let doneTasks: Int
    let topTaskTitle: String?
    let calories: CalorieInfo?
    let steps: StepInfo?

    static var placeholder: WidgetSnapshot {
        WidgetSnapshot(
            updatedAt: "",
            date: "",
            currentBlock: WidgetBlock(
                label: "Odak çalışması",
                blockType: "focus",
                startTime: "09:00",
                endTime: "10:30",
                progress: 0.4,
                remainingMinutes: 54,
                minutesUntilStart: 0
            ),
            nextBlock: WidgetBlock(
                label: "Öğle molası",
                blockType: "break",
                startTime: "12:30",
                endTime: "13:15",
                progress: 0,
                remainingMinutes: 45,
                minutesUntilStart: 120
            ),
            dayOver: false,
            pendingTasks: 3,
            doneTasks: 2,
            topTaskTitle: "Sunumu bitir",
            calories: CalorieInfo(consumed: 1450, target: 2200),
            steps: StepInfo(value: 6800, goal: 8000)
        )
    }
}

enum SnapshotStore {
    static func load() -> WidgetSnapshot? {
        guard
            let defaults = UserDefaults(suiteName: appGroup),
            let json = defaults.string(forKey: snapshotKey),
            let data = json.data(using: .utf8)
        else {
            return nil
        }
        return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    }
}

// Blok tipi → renk (RN palette ile aynı)
func blockColor(_ type: String) -> Color {
    switch type {
    case "task": return Color(red: 0.39, green: 0.40, blue: 0.95)
    case "routine": return Color(red: 0.06, green: 0.72, blue: 0.51)
    case "break": return Color(red: 0.58, green: 0.64, blue: 0.72)
    case "focus": return Color(red: 0.96, green: 0.62, blue: 0.04)
    case "meal": return Color(red: 0.93, green: 0.28, blue: 0.60)
    case "workout": return Color(red: 0.94, green: 0.27, blue: 0.27)
    default: return Color(red: 0.39, green: 0.40, blue: 0.95)
    }
}

// "HH:MM" → o günün gün-içi dakikası
func minutesOfDay(_ hhmm: String) -> Int? {
    let parts = hhmm.split(separator: ":")
    guard parts.count >= 2, let h = Int(parts[0]), let m = Int(parts[1]) else { return nil }
    return h * 60 + m
}

// Aktif blok için, snapshot yazıldığından beri geçen süreyi telafi ederek
// güncel kalan dakika ve ilerlemeyi hesaplar. Böylece uygulama yazmasa da
// widget saat başı tazelenince doğru kalır.
func liveTiming(for block: WidgetBlock, now: Date) -> (remaining: Int, progress: Double) {
    let cal = Calendar.current
    let comps = cal.dateComponents([.hour, .minute], from: now)
    let nowMin = (comps.hour ?? 0) * 60 + (comps.minute ?? 0)

    guard let startMin = minutesOfDay(block.startTime), let rawEnd = minutesOfDay(block.endTime) else {
        return (Int(block.remainingMinutes), block.progress)
    }
    let endMin = rawEnd <= startMin ? 1440 : rawEnd
    let duration = max(1, endMin - startMin)

    if nowMin < startMin { return (duration, 0) }
    if nowMin >= endMin { return (0, 1) }
    let elapsed = nowMin - startMin
    return (endMin - nowMin, Double(elapsed) / Double(duration))
}

func formatRemaining(_ minutes: Int) -> String {
    let m = max(0, minutes)
    let h = m / 60
    let rem = m % 60
    if h == 0 { return "\(rem)d" }
    if rem == 0 { return "\(h)s" }
    return "\(h)s \(rem)d"
}
