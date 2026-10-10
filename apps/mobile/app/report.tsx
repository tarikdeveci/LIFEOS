import { router, useLocalSearchParams } from 'expo-router'
import { resolveReportDate, todayDate } from '@lifeos/shared'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { ReportStory } from '@/src/components/report/ReportStory'
import { ReportError, ReportMissing, ReportSkeleton } from '@/src/components/report/ReportStates'
import { useDayReport } from '@/src/components/report/useDayReport'

interface BodyProps { date: string }

function close() {
  if (router.canGoBack()) router.back()
  else router.replace('/(tabs)/today' as never)
}

function ReportBody({ date }: BodyProps) {
  const day = useDayReport(date)

  if (day.status === 'ready' && day.report && day.view) {
    return <ReportStory date={date} report={day.report} view={day.view} day={day} onClose={close} />
  }
  if (day.notFound) {
    return <ReportMissing onBack={close} onToday={() => router.replace(`/report?date=${todayDate()}` as never)} />
  }
  if (day.status === 'error') {
    return <ReportError onBack={close} onRetry={() => void day.refresh()} retrying={day.refreshing} />
  }
  return <ReportSkeleton onBack={close} />
}

/** Gün raporu: /report?date=YYYY-MM-DD. Tarih yoksa ya da bozuksa bugünün raporu açılır. */
export default function ReportScreen() {
  const params = useLocalSearchParams<{ date?: string }>()
  const date = resolveReportDate(params.date, todayDate())

  return (
    <ScreenBackground>
      {/* Tarih değişince ekran durumu (dokunulan işler, hata) baştan başlar. */}
      <ReportBody key={date} date={date} />
    </ScreenBackground>
  )
}
