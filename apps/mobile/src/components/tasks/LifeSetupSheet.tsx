import { View, Text, TextInput, ActivityIndicator } from 'react-native'
import { useLifeSetup } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { BottomSheet } from '@/src/components/ui/BottomSheet'
import { Button } from '@/src/components/ui/Button'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, spacing, radius } from '@/src/theme/tokens'
import { LifeSetupReview } from './LifeSetupReview'

interface Props {
  visible: boolean
  /** Vazgeçildi: önceki sayfaya dön. */
  onClose: () => void
  /** Öneri uygulandı: tüm sayfalar kapanır. */
  onDone: () => void
  userId: string | null
  requirePro: (source?: string) => boolean
}

/** Hayat planımı kur: serbest metin, AI önerisi, tek onay ekranı, uygula. */
export function LifeSetupSheet({ visible, onClose, onDone, userId, requirePro }: Props) {
  const { colors } = useTheme()
  const { t, lang } = useLang()
  const ls = useLifeSetup({ supabase, userId, lang, t, requirePro, onDone })
  const applying = ls.busy === 'apply'

  function close() {
    if (applying) return
    ls.reset()
    onClose()
  }

  return (
    <BottomSheet visible={visible} onClose={close} title={t.setup_title} scrollable>
      {ls.proposal === null || ls.selection === null || ls.written === null ? (
        <View style={{ gap: spacing[3] }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 18 }}>{t.setup_hint}</Text>
          <TextInput
            value={ls.text}
            onChangeText={ls.setText}
            multiline
            maxLength={ls.textMax}
            editable={ls.busy === null}
            placeholder={t.setup_placeholder}
            placeholderTextColor={colors.textSubtle}
            textAlignVertical="top"
            style={{ minHeight: 160, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.glassInner, padding: spacing[3], fontSize: fontSize.sm, color: colors.textPrimary }}
          />
          <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, textAlign: 'right' }}>
            {t.setup_counter.replace('{n}', String(ls.text.length)).replace('{max}', String(ls.textMax))}
          </Text>
          {ls.busy === 'ai' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
              <ActivityIndicator size="small" color={palette.accent} />
              <Text style={{ flex: 1, fontSize: fontSize.xs, color: colors.textMuted }}>{t.setup_loading}</Text>
            </View>
          )}
          <Button
            label={t.setup_extract}
            onPress={() => void ls.extract()}
            disabled={!ls.text.trim() || ls.busy !== null}
            loading={ls.busy === 'ai'}
            fullWidth
          />
        </View>
      ) : (
        <View style={{ gap: spacing[4] }}>
          <LifeSetupReview
            proposal={ls.proposal}
            selection={ls.selection}
            written={ls.written}
            disabled={applying}
            onToggle={ls.toggle}
            onToggleRule={ls.toggleRule}
          />
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <Button label={t.setup_back} onPress={ls.backToText} variant="secondary" disabled={applying} style={{ flex: 1 }} />
            <Button
              label={ls.remaining === 0 ? t.setup_nothing_selected : (ls.wroteSome ? t.setup_apply_rest : t.setup_apply).replace('{n}', String(ls.remaining))}
              onPress={() => void ls.apply()}
              disabled={ls.remaining === 0 || applying}
              loading={applying}
              style={{ flex: 1.4 }}
            />
          </View>
        </View>
      )}
      {ls.error && <Text style={{ fontSize: fontSize.xs, color: palette.danger, marginTop: spacing[2], lineHeight: 18 }}>{ls.error}</Text>}
    </BottomSheet>
  )
}
