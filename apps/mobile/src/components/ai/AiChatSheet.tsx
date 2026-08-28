import { useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../contexts/ThemeContext'
import { BottomSheet } from '../ui/BottomSheet'
import { Input } from '../ui/Input'
import { fontSize, radius, spacing } from '../../theme/tokens'

/**
 * Üç ekranın (beslenme, antrenman, planlama) AI koç sohbeti aynı iskeleti
 * paylaşıyor. Ekran başına kopyalamak yerine tek bileşen: mesaj listesi,
 * yazıyor göstergesi, hızlı öneri çipleri, ve asistan mesajının altına
 * çıkan aksiyon düğmeleri. Mesaj state'i çağıran ekranda kalır — koçun ne
 * gönderdiği ekrana özgü, nasıl göründüğü değil.
 */

export interface AiChatAction {
  /** Buton yazısı. */
  label: string
  icon?: keyof typeof Ionicons.glyphMap
  /** Basıldıktan sonra gösterilecek yazı; verilmezse label kalır. */
  doneLabel?: string
  onPress: () => void | Promise<void>
}

export interface AiChatMessage {
  role: 'user' | 'assistant'
  content: string
  actions?: AiChatAction[]
}

interface Props {
  visible: boolean
  onClose: () => void
  title: string
  accent: string
  messages: AiChatMessage[]
  loading: boolean
  input: string
  onChangeInput: (value: string) => void
  onSend: () => void
  placeholder?: string
  /** Sohbet boşken gösterilen açıklama. */
  emptyHint: string
  /** Boş ekranda tek dokunuşla gönderilecek hazır sorular. */
  suggestions?: string[]
  onSuggestionPress?: (text: string) => void
}

function ActionButton({ action, accent }: { action: AiChatAction; accent: string }) {
  const { colors } = useTheme()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const handlePress = async () => {
    if (busy || done) return
    setBusy(true)
    try {
      await action.onPress()
      setDone(true)
    } catch {
      // Hata mesajını çağıran gösterir; buton "yapıldı"ya geçmez ki
      // kullanıcı tekrar deneyebilsin.
    } finally {
      setBusy(false)
    }
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={busy || done}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[2],
        alignSelf: 'flex-start',
        paddingHorizontal: spacing[3],
        paddingVertical: spacing[2],
        borderRadius: radius.full,
        backgroundColor: done ? `${colors.textMuted}18` : `${accent}18`,
        borderWidth: 1,
        borderColor: done ? colors.border : `${accent}40`,
      }}
    >
      {busy
        ? <ActivityIndicator size="small" color={accent} />
        : <Ionicons name={done ? 'checkmark' : (action.icon ?? 'add')} size={15} color={done ? colors.textMuted : accent} />}
      <Text style={{ fontSize: fontSize.sm, fontWeight: '600', color: done ? colors.textMuted : accent }}>
        {done ? (action.doneLabel ?? action.label) : action.label}
      </Text>
    </TouchableOpacity>
  )
}

export function AiChatSheet({
  visible, onClose, title, accent, messages, loading,
  input, onChangeInput, onSend, placeholder, emptyHint,
  suggestions, onSuggestionPress,
}: Props) {
  const { colors } = useTheme()

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} scrollable>
      <View style={{ gap: spacing[3] }}>
        {messages.length === 0 && (
          <View style={{ gap: spacing[3] }}>
            <View style={{ padding: spacing[3], borderRadius: radius.lg, backgroundColor: `${accent}10`, borderWidth: 1, borderColor: `${accent}20` }}>
              <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 }}>{emptyHint}</Text>
            </View>
            {suggestions && suggestions.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
                {suggestions.map((s) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => onSuggestionPress?.(s)}
                    style={{
                      paddingHorizontal: spacing[3],
                      paddingVertical: spacing[2],
                      borderRadius: radius.full,
                      backgroundColor: colors.glassInner,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {messages.map((msg, i) => (
          <View key={i} style={{ gap: spacing[2], alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <View
              style={{
                maxWidth: '88%',
                padding: spacing[3],
                borderRadius: radius.lg,
                backgroundColor: msg.role === 'user' ? accent : colors.glassInner,
                borderWidth: 1,
                borderColor: msg.role === 'user' ? accent : colors.border,
              }}
            >
              <Text style={{ fontSize: fontSize.sm, color: msg.role === 'user' ? '#fff' : colors.textSecondary, lineHeight: 20 }}>
                {msg.content}
              </Text>
            </View>
            {msg.actions?.map((action, ai) => (
              <ActionButton key={ai} action={action} accent={accent} />
            ))}
          </View>
        ))}

        {loading && (
          <View style={{ alignSelf: 'flex-start', padding: spacing[3], borderRadius: radius.lg, backgroundColor: colors.glassInner }}>
            <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>Yazıyor...</Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: spacing[3], marginTop: spacing[2] }}>
          <Input
            value={input}
            onChangeText={onChangeInput}
            placeholder={placeholder ?? 'Sorun...'}
            containerStyle={{ flex: 1 }}
            onSubmitEditing={onSend}
            returnKeyType="send"
          />
          <TouchableOpacity
            onPress={onSend}
            disabled={loading || !input.trim()}
            style={{
              width: 44, height: 44, borderRadius: 22, marginTop: 2,
              backgroundColor: input.trim() ? accent : colors.glassInner,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="arrow-up" size={20} color={input.trim() ? '#fff' : colors.textSubtle} />
          </TouchableOpacity>
        </View>
      </View>
    </BottomSheet>
  )
}
