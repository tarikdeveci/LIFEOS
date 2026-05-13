import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, Alert, Image } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { supabase } from '@/src/lib/supabase'
import { GradientBackground } from '@/src/components/GradientBackground'
import { T } from '@/src/theme'

export default function RegisterScreen() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRegister() {
    setLoading(true)

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName, timezone },
      },
    })

    if (error) {
      Alert.alert('Hata', error.message)
      setLoading(false)
      return
    }

    if (data.user) {
      router.replace('/(tabs)/today')
    }
  }

  return (
    <GradientBackground>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 }}>
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <View style={{ shadowColor: '#4048C8', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 6, borderRadius: 22 }}>
            <Image
              source={require('../../assets/logo.png')}
              style={{ width: 88, height: 88, borderRadius: 22 }}
              resizeMode="cover"
            />
          </View>
          <Text style={{ marginTop: 18, fontSize: 30, fontWeight: '800', color: T.text.primary }}>LifeOS</Text>
          <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 20, color: T.text.muted, textAlign: 'center', maxWidth: 290 }}>
            Hesabını oluştur ve günlük sistemini tek akışta kur.
          </Text>
        </View>

        <View style={{ borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.92)', padding: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.82)', shadowColor: T.card.shadowColor, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 8 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: T.text.primary }}>Kayıt Ol</Text>
          <Text style={{ marginTop: 6, marginBottom: 18, fontSize: 13, color: T.text.muted }}>Temel hesabını oluştur, sonra hedeflerini detaylandır.</Text>

          <View style={{ marginBottom: 12, borderRadius: 18, borderWidth: 1, borderColor: T.input.border, backgroundColor: T.input.bg, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 }}>
            <Ionicons name="person-outline" size={18} color={T.text.muted} />
            <TextInput
              style={{ flex: 1, paddingVertical: 14, paddingLeft: 10, color: T.input.text, fontSize: 15 }}
              placeholder="Adın Soyadın"
              value={displayName}
              onChangeText={setDisplayName}
              placeholderTextColor={T.input.placeholder}
            />
          </View>

          <View style={{ marginBottom: 12, borderRadius: 18, borderWidth: 1, borderColor: T.input.border, backgroundColor: T.input.bg, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 }}>
            <Ionicons name="mail-outline" size={18} color={T.text.muted} />
            <TextInput
              style={{ flex: 1, paddingVertical: 14, paddingLeft: 10, color: T.input.text, fontSize: 15 }}
              placeholder="E-posta"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor={T.input.placeholder}
            />
          </View>

          <View style={{ marginBottom: 18, borderRadius: 18, borderWidth: 1, borderColor: T.input.border, backgroundColor: T.input.bg, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 }}>
            <Ionicons name="lock-closed-outline" size={18} color={T.text.muted} />
            <TextInput
              style={{ flex: 1, paddingVertical: 14, paddingLeft: 10, color: T.input.text, fontSize: 15 }}
              placeholder="Şifre (en az 8 karakter)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholderTextColor={T.input.placeholder}
            />
          </View>

          <TouchableOpacity
            onPress={handleRegister}
            disabled={loading}
            style={{ width: '100%', alignItems: 'center', borderRadius: 18, backgroundColor: T.accent, paddingVertical: 15, opacity: loading ? 0.6 : 1 }}
          >
            <Text style={{ fontWeight: '700', color: 'white', fontSize: 15 }}>
              {loading ? 'Hesap oluşturuluyor...' : 'Kayıt Ol'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
            <Text style={{ textAlign: 'center', fontSize: 13, color: T.text.muted }}>
              Hesabın var mı? <Text style={{ color: T.accent, fontWeight: '700' }}>Giriş yap</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </GradientBackground>
  )
}
