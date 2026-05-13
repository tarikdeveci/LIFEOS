// supabase/functions/send-notification/index.ts
// Expo Push Notification gönderimi
// pg_cron tarafından tetiklenir: task_reminder, morning_briefing, evening_nutrition

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.2'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

interface NotificationRequest {
  type: 'task_reminder' | 'morning_briefing' | 'evening_nutrition'
}

interface ExpoPushMessage {
  to: string
  title: string
  body: string
  data?: Record<string, string>
  channelId?: string
}

serve(async (req: Request) => {
  try {
    const { type }: NotificationRequest = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const messages: ExpoPushMessage[] = []

    if (type === 'task_reminder') {
      // Yaklaşan time_blocks'ı bul (15dk içinde başlayacaklar)
      const now = new Date()
      const inFifteen = new Date(now.getTime() + 15 * 60 * 1000)
      const today = now.toISOString().split('T')[0]!

      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      const futureTime = `${String(inFifteen.getHours()).padStart(2, '0')}:${String(inFifteen.getMinutes()).padStart(2, '0')}`

      const { data: blocks } = await supabase
        .from('time_blocks')
        .select('*, tasks(title)')
        .eq('date', today)
        .gte('start_time', currentTime)
        .lte('start_time', futureTime)

      if (blocks) {
        for (const block of blocks) {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('preferences')
            .eq('id', block.user_id)
            .single()

          const pushToken = (profile?.preferences as Record<string, unknown>)?.['push_token'] as string | undefined

          if (pushToken) {
            const label = block.tasks?.title ?? block.label ?? 'Görev'
            messages.push({
              to: pushToken,
              title: '⏰ Yaklaşan Görev',
              body: `"${label}" 15 dakika içinde başlıyor`,
              data: {
                type: 'task_reminder',
                task_id: block.task_id ?? '',
              },
              channelId: 'task-reminders',
            })
          }
        }
      }
    } else if (type === 'morning_briefing') {
      // Tüm kullanıcılara sabah briefingi gönder
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, preferences')

      if (profiles) {
        const today = new Date().toISOString().split('T')[0]!

        for (const profile of profiles) {
          const pushToken = (profile.preferences as Record<string, unknown>)?.['push_token'] as string | undefined
          if (!pushToken) continue

          // Bugünün görev sayısını al
          const { count: taskCount } = await supabase
            .from('tasks')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', profile.id)
            .eq('scheduled_date', today)
            .not('status', 'in', '(done,deferred)')

          // Dünden taşan görev sayısı
          const { count: carryover } = await supabase
            .from('tasks')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', profile.id)
            .lt('scheduled_date', today)
            .not('status', 'in', '(done,deferred)')

          let body = `Bugün ${taskCount ?? 0} görev planlandı.`
          if (carryover && carryover > 0) {
            body += ` ${carryover} görev dünden taşıyor.`
          }

          messages.push({
            to: pushToken,
            title: '☀️ Günaydın!',
            body,
            data: { type: 'morning_briefing' },
          })
        }
      }
    } else if (type === 'evening_nutrition') {
      // Akşam beslenme özeti
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, preferences')

      if (profiles) {
        const today = new Date().toISOString().split('T')[0]!

        for (const profile of profiles) {
          const pushToken = (profile.preferences as Record<string, unknown>)?.['push_token'] as string | undefined
          if (!pushToken) continue

          // Günün toplam kalorisi
          const { data: meals } = await supabase
            .from('meals')
            .select('total_calories, total_protein')
            .eq('user_id', profile.id)
            .eq('date', today)

          if (!meals || meals.length === 0) continue

          const totalCal = meals.reduce((s: number, m: { total_calories: number }) => s + m.total_calories, 0)
          const totalPro = meals.reduce((s: number, m: { total_protein: number }) => s + m.total_protein, 0)

          // Hedefi al
          const { data: target } = await supabase
            .from('nutrition_targets')
            .select('calories, protein_g')
            .eq('user_id', profile.id)
            .eq('is_active', true)
            .single()

          let body = `Bugün ${totalCal} kcal, ${Math.round(totalPro)}g protein aldın.`
          if (target) {
            const calPct = Math.round((totalCal / target.calories) * 100)
            body += ` (Hedefe %${calPct})`
          }

          messages.push({
            to: pushToken,
            title: '🌙 Günlük Beslenme Özeti',
            body,
            data: { type: 'evening_nutrition' },
            channelId: 'nutrition',
          })
        }
      }
    }

    // Expo Push API'ye gönder
    if (messages.length > 0) {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      })

      const result = await response.json()
      console.log(`${messages.length} bildirim gönderildi:`, result)
    }

    return new Response(
      JSON.stringify({ sent: messages.length }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    console.error('send-notification error:', error)
    return new Response(
      JSON.stringify({ error: 'Bildirim gönderilirken hata oluştu' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
})
