import { useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { Input } from '@/src/components/ui/Input'
import { Button } from '@/src/components/ui/Button'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { PRIVACY_URL, openLegalPage } from '@/src/lib/legal'
import { palette, fontSize, fontWeight, spacing } from '@/src/theme/tokens'

/** Dokunma alanı alt sınırı (DESIGN.md): metin bağlantıları da bu yükseklikte. */
const MIN_TOUCH = 44

interface MessageProps {
  error: string | null
  info?: string | null
}

function Messages({ error, info }: MessageProps) {
  const { colors } = useTheme()
  if (!error && !info) return null
  return (
    <Text
      accessibilityLiveRegion="polite"
      style={{ marginBottom: spacing[3], fontSize: fontSize.sm, color: error ? palette.danger : colors.textMuted }}
    >
      {error ?? info}
    </Text>
  )
}

function LinkButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme()
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={{ minHeight: MIN_TOUCH, justifyContent: 'center', alignItems: 'center' }}
    >
      <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: disabled ? colors.textSubtle : palette.accent }}>{label}</Text>
    </TouchableOpacity>
  )
}

/** Hesap açılırken gizlilik metni görünür ve açılabilir (KVKK aydınlatma, persona turu 2026-11-17). */
function PrivacyConsent() {
  const { t } = useLang()
  const { colors } = useTheme()
  return (
    <TouchableOpacity
      onPress={() => openLegalPage(PRIVACY_URL)}
      accessibilityRole="link"
      style={{ minHeight: MIN_TOUCH, justifyContent: 'center', marginTop: spacing[2] }}
    >
      <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' }}>
        {t.upgrade_consent_before}
        <Text style={{ color: palette.accent, fontWeight: fontWeight.semibold, textDecorationLine: 'underline' }}>{t.upgrade_consent_link}</Text>
        {t.upgrade_consent_after}
      </Text>
    </TouchableOpacity>
  )
}

interface FormStepProps extends MessageProps {
  busy: boolean
  emailTaken: boolean
  initialEmail?: string
  onSubmit: (displayName: string, email: string, password: string) => void
  onSignIn: () => void
}

export function UpgradeFormStep({ busy, error, emailTaken, initialEmail, onSubmit, onSignIn }: FormStepProps) {
  const { t } = useLang()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState(initialEmail ?? '')
  const [password, setPassword] = useState('')
  const ready = displayName.trim() !== '' && email.trim() !== '' && password !== ''
  const submit = () => { if (ready && !busy) onSubmit(displayName, email, password) }

  return (
    <>
      <Input label={t.auth_full_name} value={displayName} onChangeText={setDisplayName} autoCapitalize="words" placeholder={t.auth_full_name_ph} containerStyle={{ marginBottom: spacing[3] }} returnKeyType="next" />
      <Input label={t.acc_email} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder={t.acc_email_placeholder} containerStyle={{ marginBottom: spacing[3] }} returnKeyType="next" />
      <Input label={t.acc_password} value={password} onChangeText={setPassword} secureTextEntry placeholder={t.acc_password_min_placeholder} containerStyle={{ marginBottom: spacing[4] }} onSubmitEditing={submit} returnKeyType="done" />
      <Messages error={error} />
      <Button label={t.upgrade_send_code} onPress={submit} loading={busy} disabled={!ready} fullWidth />
      <PrivacyConsent />
      {emailTaken && <LinkButton label={t.upgrade_sign_in_instead} onPress={onSignIn} />}
    </>
  )
}

interface CodeStepProps extends MessageProps {
  busy: boolean
  email: string
  cooldown: number
  onSubmit: (code: string) => void
  onResend: () => void
  onChangeEmail: () => void
}

export function UpgradeCodeStep({ busy, error, info, email, cooldown, onSubmit, onResend, onChangeEmail }: CodeStepProps) {
  const { t } = useLang()
  const { colors } = useTheme()
  const [code, setCode] = useState('')
  const submit = () => { if (code.trim() && !busy) onSubmit(code) }

  return (
    <>
      <Text style={{ marginBottom: spacing[4], fontSize: fontSize.sm, color: colors.textMuted }}>
        {t.upgrade_pending_body.replace('{email}', email)}
      </Text>
      <Input label={t.upgrade_code_label} value={code} onChangeText={setCode} keyboardType="number-pad" autoCapitalize="none" placeholder={t.upgrade_code_placeholder} maxLength={8} containerStyle={{ marginBottom: spacing[4] }} onSubmitEditing={submit} returnKeyType="done" />
      <Messages error={error} info={info} />
      <Button label={t.upgrade_verify} onPress={submit} loading={busy} disabled={!code.trim()} fullWidth />
      <View style={{ marginTop: spacing[2] }}>
        <LinkButton
          label={cooldown > 0 ? t.upgrade_resend_wait.replace('{s}', String(cooldown)) : t.upgrade_resend}
          onPress={onResend}
          disabled={cooldown > 0 || busy}
        />
        <LinkButton label={t.upgrade_change_email} onPress={onChangeEmail} disabled={busy} />
      </View>
    </>
  )
}

interface PasswordStepProps extends MessageProps {
  busy: boolean
  onSubmit: (password: string) => void
}

export function SetPasswordStep({ busy, error, onSubmit }: PasswordStepProps) {
  const { t } = useLang()
  const { colors } = useTheme()
  const [password, setPassword] = useState('')
  const submit = () => { if (password && !busy) onSubmit(password) }

  return (
    <>
      <Text style={{ marginBottom: spacing[4], fontSize: fontSize.sm, color: colors.textMuted }}>{t.setpw_body}</Text>
      <Input label={t.acc_password} value={password} onChangeText={setPassword} secureTextEntry placeholder={t.acc_password_min_placeholder} containerStyle={{ marginBottom: spacing[4] }} onSubmitEditing={submit} returnKeyType="done" />
      <Messages error={error} />
      <Button label={t.setpw_confirm} onPress={submit} loading={busy} disabled={!password} fullWidth />
    </>
  )
}

export function UpgradeDoneStep({ onContinue }: { onContinue: () => void }) {
  const { t } = useLang()
  const { colors } = useTheme()
  return (
    <>
      <Text style={{ marginBottom: spacing[5], fontSize: fontSize.base, color: colors.textSecondary }}>{t.upgrade_done_body}</Text>
      <Button label={t.upgrade_done_continue} onPress={onContinue} fullWidth />
    </>
  )
}
