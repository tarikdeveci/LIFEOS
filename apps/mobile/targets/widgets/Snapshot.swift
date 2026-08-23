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
    /// Günün tüm blokları. Eski snapshot'larda yok (nil) — o zaman donmuş
    /// currentBlock/nextBlock alanlarına düşülür.
    let blocks: [WidgetBlock]?
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
            blocks: nil,
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


// MARK: - "Şu an" çözümlemesi

/// Snapshot + bir an → o ana ait blok durumu.
struct ResolvedNow {
    let current: WidgetBlock?
    let next: WidgetBlock?
    let dayOver: Bool
    let progress: Double
    let remaining: Int
    let minutesUntilStart: Int
    /// Snapshot başka bir güne aitse true — bayat plan gösterme
    let stale: Bool
}

private let snapshotDayFormatter: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    return f
}()

extension WidgetSnapshot {
    /// Aktif ve sıradaki bloğu `now`'a göre YENİDEN seçer.
    ///
    /// `currentBlock`/`nextBlock` snapshot yazıldığı ana donmuştur; uygulama
    /// kapalıyken blok geçişi olmaz ve widget bitmiş bloğu göstermeye devam
    /// eder. Gün listesi (`blocks`) varsa widget kendi saatinden hesaplar.
    func resolve(now: Date) -> ResolvedNow {
        if !date.isEmpty && date != snapshotDayFormatter.string(from: now) {
            return ResolvedNow(current: nil, next: nil, dayOver: false,
                               progress: 0, remaining: 0, minutesUntilStart: 0, stale: true)
        }

        guard let all = blocks, !all.isEmpty else {
            // Eski snapshot — donmuş alanlarla idare et
            return ResolvedNow(
                current: currentBlock,
                next: nextBlock,
                dayOver: dayOver,
                progress: currentBlock?.progress ?? 0,
                remaining: Int(currentBlock?.remainingMinutes ?? 0),
                minutesUntilStart: Int(nextBlock?.minutesUntilStart ?? 0),
                stale: false
            )
        }

        let comps = Calendar.current.dateComponents([.hour, .minute], from: now)
        let nowMin = (comps.hour ?? 0) * 60 + (comps.minute ?? 0)

        var current: WidgetBlock?
        var next: WidgetBlock?
        var progress: Double = 0
        var remaining = 0
        var untilStart = 0

        for block in all {
            guard let start = minutesOfDay(block.startTime), let rawEnd = minutesOfDay(block.endTime) else { continue }
            // Gece yarısını aşan blok (23:30–00:15) gün sonuna kadar sayılır
            let end = rawEnd <= start ? 1440 : rawEnd

            if nowMin >= start && nowMin < end {
                current = block
                let duration = max(1, end - start)
                progress = Double(nowMin - start) / Double(duration)
                remaining = end - nowMin
            } else if nowMin < start && next == nil {
                next = block
                untilStart = start - nowMin
            }
        }

        return ResolvedNow(
            current: current,
            next: next,
            dayOver: current == nil && next == nil,
            progress: progress,
            remaining: remaining,
            minutesUntilStart: untilStart,
            stale: false
        )
    }

    /// Bugünün blok sınırları (başlangıç/bitiş dakikaları), sıralı.
    var boundaryMinutes: [Int] {
        guard let all = blocks else { return [] }
        var out: Set<Int> = []
        for block in all {
            if let s = minutesOfDay(block.startTime) { out.insert(s) }
            if let e = minutesOfDay(block.endTime) { out.insert(e) }
        }
        return out.sorted()
    }
}

func formatRemaining(_ minutes: Int) -> String {
    let m = max(0, minutes)
    let h = m / 60
    let rem = m % 60
    if h == 0 { return "\(rem)d" }
    if rem == 0 { return "\(h)s" }
    return "\(h)s \(rem)d"
}
