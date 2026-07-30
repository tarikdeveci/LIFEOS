import WidgetKit
import SwiftUI

// MARK: - Timeline

struct LifeOSEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> LifeOSEntry {
        LifeOSEntry(date: Date(), snapshot: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (LifeOSEntry) -> Void) {
        let snapshot = SnapshotStore.load() ?? .placeholder
        completion(LifeOSEntry(date: Date(), snapshot: snapshot))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<LifeOSEntry>) -> Void) {
        let snapshot = SnapshotStore.load() ?? .placeholder
        let now = Date()

        // Kalan süre/ilerlemeyi canlı tutmak için önümüzdeki saat boyunca
        // her 15 dakikaya bir giriş üret. Uygulama yazınca WidgetCenter zaten
        // anında tazeler.
        var entries: [LifeOSEntry] = []
        for offset in stride(from: 0, through: 60, by: 15) {
            if let entryDate = Calendar.current.date(byAdding: .minute, value: offset, to: now) {
                entries.append(LifeOSEntry(date: entryDate, snapshot: snapshot))
            }
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

// MARK: - Ortak parçalar

struct NowBadge: View {
    var color: Color
    var body: some View {
        Text("ŞU AN")
            .font(.system(size: 9, weight: .bold))
            .foregroundColor(.white)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color)
            .clipShape(Capsule())
    }
}

struct ProgressBar: View {
    var progress: Double
    var color: Color
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.primary.opacity(0.12))
                Capsule()
                    .fill(color)
                    .frame(width: max(4, geo.size.width * CGFloat(min(1, max(0, progress)))))
            }
        }
        .frame(height: 5)
    }
}

// MARK: - Ana ekran: küçük

struct SmallHomeView: View {
    let entry: LifeOSEntry
    var body: some View {
        let s = entry.snapshot
        VStack(alignment: .leading, spacing: 6) {
            if let block = s.currentBlock {
                let timing = liveTiming(for: block, now: entry.date)
                let color = blockColor(block.blockType)
                HStack(spacing: 5) {
                    NowBadge(color: color)
                    Spacer()
                }
                Text(block.label)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.primary)
                    .lineLimit(2)
                Text("\(formatRemaining(timing.remaining)) kaldı")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(color)
                ProgressBar(progress: timing.progress, color: color)
                Spacer(minLength: 0)
                Text("\(s.startTimeText(block))")
                    .font(.system(size: 10))
                    .foregroundColor(.secondary)
            } else {
                Text(s.dayOver ? "Plan tamam" : "Boş zaman")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.primary)
                if let next = s.nextBlock {
                    Text("Sıradaki \(formatRemaining(Int(next.minutesUntilStart))) sonra")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                        .lineLimit(2)
                }
                Spacer(minLength: 0)
                HStack {
                    Label("\(s.pendingTasks)", systemImage: "checklist")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(14)
        .containerBackground(for: .widget) { Color("$widgetBackground") }
    }
}

// MARK: - Ana ekran: orta

struct MediumHomeView: View {
    let entry: LifeOSEntry
    var body: some View {
        let s = entry.snapshot
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                if let block = s.currentBlock {
                    let timing = liveTiming(for: block, now: entry.date)
                    let color = blockColor(block.blockType)
                    HStack(spacing: 6) {
                        NowBadge(color: color)
                        Text("\(block.startTime) – \(block.endTime)")
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                    }
                    Text(block.label)
                        .font(.system(size: 17, weight: .bold))
                        .foregroundColor(.primary)
                        .lineLimit(1)
                    Text("\(formatRemaining(timing.remaining)) kaldı")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(color)
                    ProgressBar(progress: timing.progress, color: color)
                } else {
                    Text(s.dayOver ? "Bugünün planı tamam" : "Şu an boş zaman")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.primary)
                }
                Spacer(minLength: 4)
                if let next = s.nextBlock {
                    HStack(spacing: 5) {
                        Circle().fill(blockColor(next.blockType)).frame(width: 6, height: 6)
                        Text("Sıradaki: \(next.label)")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                        Text("· \(next.startTime)")
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                    }
                }
            }
            Divider()
            VStack(spacing: 10) {
                StatBox(value: "\(s.pendingTasks)", label: "Görev", color: blockColor("task"))
                if let cal = s.calories {
                    StatBox(value: "\(cal.consumed)", label: "kcal", color: blockColor("focus"))
                } else {
                    StatBox(value: "\(s.doneTasks)", label: "Biten", color: blockColor("routine"))
                }
                if let steps = s.steps {
                    StatBox(value: compact(steps.value), label: "adım", color: blockColor("routine"))
                }
            }
            .frame(width: 78)
        }
        .padding(16)
        .containerBackground(for: .widget) { Color("$widgetBackground") }
    }
}

struct StatBox: View {
    var value: String
    var label: String
    var color: Color
    var body: some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(size: 16, weight: .heavy))
                .foregroundColor(color)
                .minimumScaleFactor(0.7)
                .lineLimit(1)
            Text(label)
                .font(.system(size: 10))
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

func compact(_ value: Int) -> String {
    if value >= 1000 {
        return String(format: "%.1fk", Double(value) / 1000)
    }
    return "\(value)"
}

extension WidgetSnapshot {
    func startTimeText(_ block: WidgetBlock) -> String {
        "\(block.startTime)–\(block.endTime)"
    }
}

// MARK: - Kilit ekranı: dikdörtgen

struct AccessoryRectView: View {
    let entry: LifeOSEntry
    var body: some View {
        let s = entry.snapshot
        VStack(alignment: .leading, spacing: 2) {
            if let block = s.currentBlock {
                let timing = liveTiming(for: block, now: entry.date)
                HStack(spacing: 4) {
                    Image(systemName: "circle.fill").font(.system(size: 7))
                    Text(block.label).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                }
                Text("\(formatRemaining(timing.remaining)) kaldı · \(block.endTime)")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            } else if let next = s.nextBlock {
                Text("Sıradaki").font(.system(size: 11)).foregroundColor(.secondary)
                Text(next.label).font(.system(size: 14, weight: .semibold)).lineLimit(1)
                Text("\(next.startTime) · \(formatRemaining(Int(next.minutesUntilStart))) sonra")
                    .font(.system(size: 12)).foregroundColor(.secondary)
            } else {
                Text(s.dayOver ? "Plan tamam" : "Boş zaman")
                    .font(.system(size: 14, weight: .semibold))
                Text("\(s.pendingTasks) görev bekliyor")
                    .font(.system(size: 12)).foregroundColor(.secondary)
            }
        }
        .containerBackground(for: .widget) { Color.clear }
    }
}

// MARK: - Kilit ekranı: dairesel (adım/kalori halkası)

struct AccessoryCircView: View {
    let entry: LifeOSEntry
    var body: some View {
        let s = entry.snapshot
        if let steps = s.steps {
            let pct = min(1.0, Double(steps.value) / Double(max(1, steps.goal)))
            Gauge(value: pct) {
                Image(systemName: "figure.walk")
            } currentValueLabel: {
                Text(compact(steps.value))
                    .font(.system(size: 12, weight: .bold))
            }
            .gaugeStyle(.accessoryCircularCapacity)
            .containerBackground(for: .widget) { Color.clear }
        } else if let cal = s.calories {
            let pct = min(1.0, Double(cal.consumed) / Double(max(1, cal.target)))
            Gauge(value: pct) {
                Image(systemName: "flame.fill")
            } currentValueLabel: {
                Text("\(Int(pct * 100))")
                    .font(.system(size: 12, weight: .bold))
            }
            .gaugeStyle(.accessoryCircularCapacity)
            .containerBackground(for: .widget) { Color.clear }
        } else {
            Gauge(value: taskProgress(s)) {
                Image(systemName: "checklist")
            } currentValueLabel: {
                Text("\(s.doneTasks)")
                    .font(.system(size: 12, weight: .bold))
            }
            .gaugeStyle(.accessoryCircularCapacity)
            .containerBackground(for: .widget) { Color.clear }
        }
    }

    func taskProgress(_ s: WidgetSnapshot) -> Double {
        let total = s.doneTasks + s.pendingTasks
        if total == 0 { return 0 }
        return Double(s.doneTasks) / Double(total)
    }
}

// MARK: - Widget tanımları

// Family'e göre view seçimi için ortam değişkeni kullanan sarmalayıcı
struct HomeEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: LifeOSEntry
    var body: some View {
        switch family {
        case .systemSmall: SmallHomeView(entry: entry)
        default: MediumHomeView(entry: entry)
        }
    }
}

struct LockEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: LifeOSEntry
    var body: some View {
        switch family {
        case .accessoryCircular: AccessoryCircView(entry: entry)
        default: AccessoryRectView(entry: entry)
        }
    }
}

struct HomeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "LifeOSHomeWidget", provider: Provider()) { entry in
            HomeEntryView(entry: entry)
        }
        .configurationDisplayName("LifeOS — Şu an")
        .description("Aktif zaman bloğun, kalan süre ve günün özeti.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct LockWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "LifeOSLockWidget", provider: Provider()) { entry in
            LockEntryView(entry: entry)
        }
        .configurationDisplayName("LifeOS — Kilit ekranı")
        .description("Aktif blok ve adım/kalori ilerlemesi.")
        .supportedFamilies([.accessoryRectangular, .accessoryCircular])
    }
}

// MARK: - Bundle

@main
struct LifeOSWidgetBundle: WidgetBundle {
    var body: some Widget {
        HomeWidget()
        LockWidget()
    }
}
