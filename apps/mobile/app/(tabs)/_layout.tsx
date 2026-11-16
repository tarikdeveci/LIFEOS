import { Tabs } from 'expo-router'
import { useReducedMotion } from 'react-native-reanimated'
import { useLang } from '@/src/contexts/LangContext'
import { useWidgetSync } from '@/src/hooks/useWidgetSync'
import { useBlockLiveActivity } from '@/src/hooks/useBlockLiveActivity'
import { useRealtimeSync } from '@/src/hooks/useRealtimeSync'
import { SwipeTabs } from '@/src/navigation/SwipeTabs'
import { FloatingTabBar, TABS } from '@/src/navigation/FloatingTabBar'

const TAB_SEGMENTS = TABS.map((tab) => tab.segment)

export default function TabsLayout() {
  const { t } = useLang()
  const reduceMotion = useReducedMotion()

  // Store değişimlerini ana ekran/kilit ekranı widget'larına yansıt
  useWidgetSync()
  useBlockLiveActivity()
  useRealtimeSync()

  return (
    <SwipeTabs segments={TAB_SEGMENTS} overlay={<FloatingTabBar />}>
    <Tabs
      tabBar={() => null}
      backBehavior="fullHistory"
      screenOptions={{ headerShown: false, animation: reduceMotion ? 'none' : 'shift' }}
    >
      <Tabs.Screen name="today"     options={{ title: t.tab_today }} />
      <Tabs.Screen name="planning"  options={{ title: t.tab_planning }} />
      <Tabs.Screen name="tasks"     options={{ title: t.tab_tasks }} />
      <Tabs.Screen name="nutrition" options={{ title: t.tab_nutrition }} />
      <Tabs.Screen name="workout"   options={{ title: t.tab_workout }} />
      <Tabs.Screen name="profile"   options={{ href: null, title: t.tab_profile }} />
    </Tabs>
    </SwipeTabs>
  )
}
