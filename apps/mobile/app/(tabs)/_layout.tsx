import { Tabs, useRouter, usePathname } from 'expo-router'
import { View, TouchableOpacity, Platform } from 'react-native'
import { BlurView } from 'expo-blur'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { useWidgetSync } from '@/src/hooks/useWidgetSync'
import { palette, radius } from '@/src/theme/tokens'

const TABS = [
  { segment: 'today',     icon: 'home-outline',             iconActive: 'home'             },
  { segment: 'planning',  icon: 'calendar-outline',         iconActive: 'calendar'         },
  { segment: 'tasks',     icon: 'checkmark-circle-outline', iconActive: 'checkmark-circle' },
  { segment: 'nutrition', icon: 'restaurant-outline',       iconActive: 'restaurant'       },
  { segment: 'workout',   icon: 'barbell-outline',          iconActive: 'barbell'          },
] as const

function FloatingTabBar() {
  const router = useRouter()
  const pathname = usePathname()
  const { colors, isDark } = useTheme()
  const insets = useSafeAreaInsets()
  const bottomOffset = Math.max(insets.bottom + 8, Platform.OS === 'ios' ? 28 : 16)

  return (
    <View
      style={{
        position: 'absolute',
        bottom: bottomOffset,
        left: 20,
        right: 20,
        height: 64,
        borderRadius: radius.full,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.tabBorder,
        ...colors.shadowSoft,
      }}
    >
      <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 6,
            backgroundColor: colors.tabBg,
          }}
        >
          {/* Top shimmer */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0, left: 20, right: 20, height: 1,
              backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,1)',
            }}
          />

          {TABS.map((tab) => {
            const isFocused = pathname === `/${tab.segment}` || pathname.startsWith(`/${tab.segment}/`)
            const activeColor = isDark ? palette.accent2 : palette.accent

            return (
              <TouchableOpacity
                key={tab.segment}
                onPress={() => router.push(`/(tabs)/${tab.segment}` as never)}
                activeOpacity={0.7}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center', height: 52, borderRadius: 26 }}
              >
                {isFocused && (
                  <View
                    style={{
                      position: 'absolute',
                      width: 44, height: 44,
                      borderRadius: 22,
                      backgroundColor: `${activeColor}18`,
                      borderWidth: 1,
                      borderColor: `${activeColor}30`,
                    }}
                  />
                )}
                <Ionicons
                  name={(isFocused ? tab.iconActive : tab.icon) as never}
                  size={22}
                  color={isFocused ? activeColor : colors.tabInactive}
                />
                <View
                  style={{
                    marginTop: 3, width: 4, height: 4, borderRadius: 2,
                    backgroundColor: isFocused ? activeColor : 'transparent',
                  }}
                />
              </TouchableOpacity>
            )
          })}
        </View>
      </BlurView>
    </View>
  )
}

export default function TabsLayout() {
  const { t } = useLang()

  // Store değişimlerini ana ekran/kilit ekranı widget'larına yansıt
  useWidgetSync()

  return (
    <Tabs tabBar={() => <FloatingTabBar />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="today"     options={{ title: t.tab_today }} />
      <Tabs.Screen name="planning"  options={{ title: t.tab_planning }} />
      <Tabs.Screen name="tasks"     options={{ title: t.tab_tasks }} />
      <Tabs.Screen name="nutrition" options={{ title: t.tab_nutrition }} />
      <Tabs.Screen name="workout"   options={{ title: t.tab_workout }} />
      <Tabs.Screen name="profile"   options={{ href: null, title: t.tab_profile }} />
    </Tabs>
  )
}
