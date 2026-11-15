import { useState } from 'react'
import { Platform, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native'
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker'
import Ionicons from '@expo/vector-icons/Ionicons'
import { useTheme } from '../../contexts/ThemeContext'
import { useLang } from '../../contexts/LangContext'
import { palette, radius, fontSize, fontWeight, spacing, MIN_TOUCH } from '../../theme/tokens'
import { dateToIso, dateToTime, isoToDate, timeToDate } from '../../utils/pickerValue'

interface BaseProps {
  label?: string
  /** Boş değerde kutuda görünen metin; verilmezse "Tarih seç" / "Saat seç". */
  placeholder?: string
  containerStyle?: StyleProp<ViewStyle>
  error?: string
  disabled?: boolean
  /** Verilirse dolu kutuda temizle (×) düğmesi çıkar: alan isteğe bağlıysa. */
  onClear?: () => void
}

interface DateProps extends BaseProps {
  /** 'YYYY-MM-DD' ya da boş. */
  value: string
  onChange: (value: string) => void
  minimumDate?: Date
}

interface TimeProps extends BaseProps {
  /** 'HH:MM' ya da boş. */
  value: string
  onChange: (value: string) => void
  /** Değer boşken seçicinin açıldığı saat. */
  defaultTime?: string
}

interface FieldProps extends BaseProps {
  mode: 'date' | 'time'
  display: string
  pickerValue: Date
  minimumDate?: Date
  onPick: (d: Date) => void
}

/**
 * Elle yazılan tarih ve saat alanlarının yerine (#18, #32, UX: girdiler seçiciden).
 * Android'de sistem diyaloğu açılır; iOS'ta seçici kutunun altında açılır, Tamam kapatır.
 */
function PickerField({ label, placeholder, containerStyle, error, disabled, onClear, mode, display, pickerValue, minimumDate, onPick }: FieldProps) {
  const { colors } = useTheme()
  const { t, lang } = useLang()
  const [iosOpen, setIosOpen] = useState(false)
  const empty = display === ''
  const shown = empty ? (placeholder ?? (mode === 'date' ? t.picker_choose_date : t.picker_choose_time)) : display

  function open() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: pickerValue,
        mode,
        is24Hour: true,
        minimumDate,
        onChange: (e: DateTimePickerEvent, d?: Date) => { if (e.type === 'set' && d) onPick(d) },
      })
    } else {
      setIosOpen((o) => !o)
    }
  }

  return (
    <View style={containerStyle}>
      {label && (
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textMuted, marginBottom: spacing[1] }}>
          {label}
        </Text>
      )}
      <View style={{ justifyContent: 'center' }}>
        <TouchableOpacity
          onPress={open}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={label ? `${label}, ${shown}` : shown}
          accessibilityState={{ disabled: !!disabled, expanded: Platform.OS === 'ios' ? iosOpen : undefined }}
          style={{
            minHeight: MIN_TOUCH,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing[2],
            backgroundColor: colors.inputBg,
            borderWidth: 1,
            borderColor: error ? palette.danger : colors.inputBorder,
            borderRadius: radius.lg,
            paddingHorizontal: spacing[4],
            paddingRight: onClear && !empty ? spacing[10] : spacing[4],
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <Ionicons name={mode === 'date' ? 'calendar-outline' : 'time-outline'} size={18} color={colors.textMuted} />
          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: fontSize.base, color: empty ? colors.inputPlaceholder : colors.inputText }}>
            {shown}
          </Text>
        </TouchableOpacity>
        {onClear && !empty && !disabled && (
          <TouchableOpacity
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel={label ? `${label}, ${t.picker_clear}` : t.picker_clear}
            hitSlop={12}
            style={{ position: 'absolute', right: spacing[3] }}
          >
            <Ionicons name="close-circle" size={20} color={colors.textSubtle} />
          </TouchableOpacity>
        )}
      </View>
      {Platform.OS === 'ios' && iosOpen && (
        <View style={{ marginTop: spacing[2] }}>
          <DateTimePicker
            value={pickerValue}
            mode={mode}
            display={mode === 'date' ? 'inline' : 'spinner'}
            locale={lang === 'tr' ? 'tr-TR' : 'en-US'}
            minimumDate={minimumDate}
            onChange={(_e: DateTimePickerEvent, d?: Date) => { if (d) onPick(d) }}
          />
          <TouchableOpacity
            onPress={() => {
              // Çark hiç oynatılmadıysa değişiklik olayı gelmez: gösterilen varsayılanı kaydet.
              if (empty) onPick(pickerValue)
              setIosOpen(false)
            }}
            accessibilityRole="button"
            style={{ minHeight: MIN_TOUCH, alignSelf: 'flex-end', justifyContent: 'center', paddingHorizontal: spacing[3] }}
          >
            <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: palette.accent }}>{t.picker_done}</Text>
          </TouchableOpacity>
        </View>
      )}
      {!!error && (
        <Text accessibilityLiveRegion="polite" style={{ fontSize: fontSize.sm, color: palette.danger, marginTop: spacing[1] }}>
          {error}
        </Text>
      )}
    </View>
  )
}

export function DateField({ value, onChange, minimumDate, ...rest }: DateProps) {
  const { lang } = useLang()
  const date = isoToDate(value)
  const display = date
    ? date.toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })
    : ''
  return (
    <PickerField
      {...rest}
      mode="date"
      display={display}
      pickerValue={date ?? new Date()}
      minimumDate={minimumDate}
      onPick={(d) => onChange(dateToIso(d))}
    />
  )
}

export function TimeField({ value, onChange, defaultTime, ...rest }: TimeProps) {
  const valid = /^\d{2}:\d{2}$/.test(value)
  return (
    <PickerField
      {...rest}
      mode="time"
      display={valid ? value : ''}
      pickerValue={timeToDate(value, undefined, defaultTime)}
      onPick={(d) => onChange(dateToTime(d))}
    />
  )
}
