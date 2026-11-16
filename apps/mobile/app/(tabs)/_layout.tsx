import { useLang } from '@/src/contexts/LangContext'
import { useWidgetSync } from '@/src/hooks/useWidgetSync'
import { useBlockLiveActivity } from '@/src/hooks/useBlockLiveActivity'
import { useRealtimeSync } from '@/src/hooks/useRealtimeSync'
import { PagerTabs } from '@/src/navigation/PagerTabs'
import { FloatingTabBar, TABS } from '@/src/navigation/FloatingTabBar'

const TAB_SEGMENTS = TABS.map((tab) => tab.segment)

export default function TabsLayout() {
  const { t } = useLang()

  // Store değişimlerini ana ekran/kilit ekranı widget'larına yansıt
  useWidgetSync()
  useBlockLiveActivity()
  useRealtimeSync()

  return (
    <PagerTabs pages={TAB_SEGMENTS} overlay={<FloatingTabBar />} backBehavior="fullHistory">
      <PagerTabs.Screen name="today"     options={{ title: t.tab_today }} />
      <PagerTabs.Screen name="planning"  options={{ title: t.tab_planning }} />
      <PagerTabs.Screen name="tasks"     options={{ title: t.tab_tasks }} />
      <PagerTabs.Screen name="nutrition" options={{ title: t.tab_nutrition }} />
      <PagerTabs.Screen name="workout"   options={{ title: t.tab_workout }} />
      <PagerTabs.Screen name="profile"   options={{ title: t.tab_profile }} />
    </PagerTabs>
  )
}
