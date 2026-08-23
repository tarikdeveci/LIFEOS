import ExpoModulesCore
import ActivityKit

// Widget target'ındaki `targets/widgets/LiveActivity.swift` ile BİREBİR aynı
// olmak zorunda: ActivityKit iki target'ı tip adıyla eşleştirir. Alan eklersen
// iki dosyayı birlikte güncelle, yoksa aktivite başlar ama update'ler düşer.
//
// Uygulamanın iOS deployment target'ı 15.1; ActivityAttributes 16.1+ olduğundan
// tipin kendisi de availability ile işaretlenmeli, yoksa derlenmez.
// (Widget target'ında gerekmiyor — orada deployment target 17.0.)
@available(iOS 16.1, *)
struct LifeOSBlockAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var label: String
        var blockType: String
        var startsAt: Date
        var endsAt: Date
        var pendingTasks: Int
        var nextLabel: String?
    }

    var dayDate: String
}

/// JS'ten gelen blok durumu
struct BlockStateRecord: Record {
    @Field var label: String = ""
    @Field var blockType: String = "task"
    /// Epoch milisaniye — JS Date.getTime()
    @Field var startsAtMs: Double = 0
    @Field var endsAtMs: Double = 0
    @Field var pendingTasks: Int = 0
    @Field var nextLabel: String? = nil
    @Field var dayDate: String = ""
}

@available(iOS 16.2, *)
private enum ActivityHolder {
    static var current: Activity<LifeOSBlockAttributes>?
}

public class LiveActivityModule: Module {
    public func definition() -> ModuleDefinition {
        Name("LiveActivity")

        Function("isSupported") { () -> Bool in
            guard #available(iOS 16.2, *) else { return false }
            return ActivityAuthorizationInfo().areActivitiesEnabled
        }

        // Aktiviteyi başlatır; zaten açık bir aktivite varsa onu günceller.
        // Dönen değer aktivite kimliği (yoksa nil).
        AsyncFunction("start") { (state: BlockStateRecord) -> String? in
            guard #available(iOS 16.2, *) else { return nil }
            guard ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }

            let content = makeActivityContent(from: state)

            if let existing = ActivityHolder.current {
                await existing.update(content)
                return existing.id
            }

            // Uygulama yeniden başladıysa sistemde hâlâ açık bir aktivite olabilir
            if let running = Activity<LifeOSBlockAttributes>.activities.first {
                ActivityHolder.current = running
                await running.update(content)
                return running.id
            }

            do {
                let activity = try Activity.request(
                    attributes: LifeOSBlockAttributes(dayDate: state.dayDate),
                    content: content,
                    pushType: nil
                )
                ActivityHolder.current = activity
                return activity.id
            } catch {
                // Kullanıcı canlı aktiviteleri kapatmış olabilir — sessizce geç
                return nil
            }
        }

        AsyncFunction("update") { (state: BlockStateRecord) -> Bool in
            guard #available(iOS 16.2, *) else { return false }
            let activity = ActivityHolder.current ?? Activity<LifeOSBlockAttributes>.activities.first
            guard let activity else { return false }
            ActivityHolder.current = activity
            await activity.update(makeActivityContent(from: state))
            return true
        }

        AsyncFunction("end") { () -> Bool in
            guard #available(iOS 16.2, *) else { return false }
            var ended = false
            for activity in Activity<LifeOSBlockAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
                ended = true
            }
            ActivityHolder.current = nil
            return ended
        }
    }
}

@available(iOS 16.2, *)
private func makeActivityContent(
    from state: BlockStateRecord
) -> ActivityContent<LifeOSBlockAttributes.ContentState> {
    let endsAt = Date(timeIntervalSince1970: state.endsAtMs / 1000)
    let contentState = LifeOSBlockAttributes.ContentState(
        label: state.label,
        blockType: state.blockType,
        startsAt: Date(timeIntervalSince1970: state.startsAtMs / 1000),
        endsAt: endsAt,
        pendingTasks: state.pendingTasks,
        nextLabel: state.nextLabel
    )
    // Blok bittikten 1 dk sonra sistem "bayat" işaretlesin; uygulama
    // kapalıyken kalan sayaç sıfırlanınca soluk gösterilir.
    return ActivityContent(state: contentState, staleDate: endsAt.addingTimeInterval(60))
}
