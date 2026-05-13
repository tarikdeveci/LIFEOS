import { Tabs, useRouter, usePathname } from 'expo-router'
import { View, TouchableOpacity, Platform } from 'react-native'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — @expo/vector-icons is available at runtime via Expo SDK
import { Ionicons } from '@expo/vector-icons'
import { T } from '@/src/theme'

const TABS: { name: string; segment: string; icon: string; iconActive: string }[] = [
  { name: 'today',     segment: 'today',     icon: 'home-outline',             iconActive: 'home'             },
  { name: 'planning',  segment: 'planning',  icon: 'calendar-outline',         iconActive: 'calendar'         },
  { name: 'tasks',     segment: 'tasks',     icon: 'checkmark-circle-outline', iconActive: 'checkmark-circle' },
  { name: 'nutrition', segment: 'nutrition', icon: 'restaurant-outline',       iconActive: 'restaurant'       },
  { name: 'workout',   segment: 'workout',   icon: 'barbell-outline',          iconActive: 'barbell'          },
]

function FloatingTabBar() {
  const router = useRouter()
  const pathname = usePathname()

  if (pathname === '/profile' || pathname.startsWith('/profile/')) {
    return null
  }

  return (
    <View
      style={{
        position: 'absolute',
        bottom: Platform.OS === 'ios' ? 28 : 16,
        left: 24,
        right: 24,
        height: 64,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
        borderRadius: 32,
        backgroundColor: 'rgba(255, 255, 255, 0.90)',
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.96)',
        shadowColor: T.card.shadowColor,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.16,
        shadowRadius: 32,
        elevation: 24,
      }}
    >
      {/* Üst kenar specular highlight */}
      <View
        style={{ position: 'absolute', top: 0, left: 20, right: 20, height: 1, backgroundColor: 'rgba(255,255,255,1)', borderRadius: 1 }}
        pointerEvents="none"
      />

      {TABS.map((tab) => {
        const isFocused = pathname === `/${tab.segment}` || pathname.startsWith(`/${tab.segment}/`)

        return (
          <TouchableOpacity
            key={tab.name}
            onPress={() => router.push(`/(tabs)/${tab.segment}` as never)}
            activeOpacity={0.7}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              height: 52,
              borderRadius: 26,
              marginHorizontal: 2,
            }}
          >
            {/* Aktif sekme: ikonu saran yuvarlak */}
            {isFocused && (
              <View
                style={{
                  position: 'absolute',
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: `${T.accent}18`,
                  borderWidth: 1.5,
                  borderColor: `${T.accent}40`,
                }}
              />
            )}
            <Ionicons
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              name={(isFocused ? tab.iconActive : tab.icon) as any}
              size={22}
              color={isFocused ? T.accent : T.text.subtle}
            />
            <View
              style={{
                marginTop: 3,
                width: 5,
                height: 5,
                borderRadius: 2.5,
                backgroundColor: isFocused ? T.accent : 'transparent',
              }}
            />
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={() => <FloatingTabBar />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="today"     options={{ title: 'Bugün'     }} />
      <Tabs.Screen name="planning"  options={{ title: 'Planlama'  }} />
      <Tabs.Screen name="tasks"     options={{ title: 'Görevler'  }} />
      <Tabs.Screen name="nutrition" options={{ title: 'Beslenme'  }} />
      <Tabs.Screen name="workout"   options={{ title: 'Antrenman' }} />
      <Tabs.Screen name="profile"   options={{ href: null, title: 'Profil' }} />
    </Tabs>
  )
}
