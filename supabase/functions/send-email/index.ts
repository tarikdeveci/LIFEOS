// supabase/functions/send-email/index.ts
// Günlük sabah brief ve akşam özet e-postası
// pg_cron her saat başı çağırır; kullanıcının timezone'una göre doğru saati filtreler.
// Gerekli secret: RESEND_API_KEY (Supabase Dashboard → Settings → Edge Functions)

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.2'

const RESEND_API = 'https://api.resend.com/emails'
const FROM = 'LifeOS <noreply@lifeos.tr>'
const APP_URL = 'https://lifeos.tr'

// ─── Shared styles ───────────────────────────────────────────────────────────
const FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif'

function emailWrapper(content: string, footerHref: string, footerText: string): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>LifeOS</title>
</head>
<body style="margin:0;padding:0;background:#f0f2ff;font-family:${FONT}">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table width="100%" style="max-width:560px" cellpadding="0" cellspacing="0" role="presentation">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:20px">
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="background:#6366f1;border-radius:14px;padding:10px 18px">
                    <span style="color:#fff;font-size:18px;font-weight:800;letter-spacing:-0.5px">Life<span style="color:#c4b5fd">OS</span></span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 2px 20px rgba(99,102,241,.12)">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:20px 0 0">
              <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.6">
                ${footerText}
                <a href="${APP_URL}/settings" style="color:#6366f1;text-decoration:none">ayarlar</a> sayfasından kapatabilirsiniz.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ─── Morning template ─────────────────────────────────────────────────────────
function morningHtml(
  name: string,
  taskCount: number,
  carryover: number,
  blocks: { label: string; start: string; end: string }[],
  lang: string,
): string {
  const tr = lang !== 'en'
  const greeting = name
    ? (tr ? `Günaydın, ${name}!` : `Good morning, ${name}!`)
    : (tr ? 'Günaydın!' : 'Good morning!')

  const blockRows = blocks.slice(0, 6).map((b) =>
    `<tr>
      <td style="padding:7px 12px;width:90px;color:#6366f1;font-size:12px;font-weight:600;white-space:nowrap">${b.start}–${b.end}</td>
      <td style="padding:7px 12px;color:#374151;font-size:12px;border-left:1px solid #f3f4f6">${b.label}</td>
    </tr>`
  ).join('')

  const content = `
    <!-- Header -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      <tr>
        <td style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);padding:28px 32px">
          <p style="margin:0;font-size:24px;font-weight:800;color:#fff;line-height:1.2">☀️ ${greeting}</p>
          <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,.75)">${tr ? 'Günün planı hazır' : "Here's your day plan"}</p>
        </td>
      </tr>
    </table>

    <!-- Stats -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:24px 32px 0">
      <tr>
        <td style="padding:0 8px 0 0" width="50%">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="background:#eef2ff;border-radius:14px;padding:16px;text-align:center">
                <p style="margin:0;font-size:32px;font-weight:800;color:#6366f1;line-height:1">${taskCount}</p>
                <p style="margin:4px 0 0;font-size:11px;color:#6b7280">${tr ? 'Bugünkü Görev' : "Today's Tasks"}</p>
              </td>
            </tr>
          </table>
        </td>
        ${carryover > 0 ? `<td style="padding:0 0 0 8px" width="50%">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="background:#fffbeb;border-radius:14px;padding:16px;text-align:center">
                <p style="margin:0;font-size:32px;font-weight:800;color:#f59e0b;line-height:1">${carryover}</p>
                <p style="margin:4px 0 0;font-size:11px;color:#6b7280">${tr ? 'Önceki Günden' : 'Carried Over'}</p>
              </td>
            </tr>
          </table>
        </td>` : '<td></td>'}
      </tr>
    </table>

    ${blocks.length > 0 ? `
    <!-- Time blocks -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:20px 32px 0">
      <tr>
        <td>
          <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.06em">${tr ? 'Zaman Blokları' : 'Time Blocks'}</p>
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #f3f4f6;border-radius:12px;overflow:hidden">
            ${blockRows}
          </table>
        </td>
      </tr>
    </table>` : ''}

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:24px 32px">
      <tr>
        <td align="center">
          <a href="${APP_URL}/planning" style="display:inline-block;background:#6366f1;color:#fff;border-radius:12px;padding:12px 28px;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:-.2px">${tr ? 'Planlamaya Git →' : 'Go to Planning →'}</a>
        </td>
      </tr>
    </table>`

  return emailWrapper(
    content,
    APP_URL,
    tr ? 'Bu bildirimleri ' : 'Unsubscribe from notifications in ',
  )
}

// ─── Evening template ─────────────────────────────────────────────────────────
function eveningHtml(
  name: string,
  calories: number,
  targetCal: number,
  protein: number,
  targetPro: number,
  tasksDone: number,
  lang: string,
): string {
  const tr = lang !== 'en'
  const greeting = name
    ? (tr ? `İyi akşamlar, ${name}!` : `Good evening, ${name}!`)
    : (tr ? 'İyi akşamlar!' : 'Good evening!')

  const calPct  = targetCal > 0 ? Math.min(Math.round((calories  / targetCal)  * 100), 100) : 0
  const proPct  = targetPro > 0 ? Math.min(Math.round((protein   / targetPro)  * 100), 100) : 0

  // Progress bar via table (email-client safe)
  function progressBar(pct: number, color: string): string {
    const filled = Math.max(1, Math.round(pct * 4)) // 400px total ÷ 100 = 4px per %
    const empty  = 400 - filled
    return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-radius:99px;overflow:hidden;background:#f3f4f6;height:8px">
      <tr>
        <td width="${pct}%" style="background:${color};height:8px;border-radius:99px"></td>
        <td></td>
      </tr>
    </table>`
  }

  const content = `
    <!-- Header -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      <tr>
        <td style="background:linear-gradient(135deg,#1e1b4b 0%,#4c1d95 100%);padding:28px 32px">
          <p style="margin:0;font-size:24px;font-weight:800;color:#fff;line-height:1.2">🌙 ${greeting}</p>
          <p style="margin:8px 0 0;font-size:14px;color:rgba(255,255,255,.75)">${tr ? "Günün özeti" : "Your daily summary"}</p>
        </td>
      </tr>
    </table>

    <!-- Body -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:24px 32px">
      <tr>
        <td>
          <!-- Section title -->
          <p style="margin:0 0 16px;font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.06em">${tr ? 'Beslenme' : 'Nutrition'}</p>

          <!-- Kalori -->
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:14px">
            <tr>
              <td style="padding-bottom:5px">
                <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td style="font-size:12px;color:#6b7280">${tr ? 'Kalori' : 'Calories'}</td>
                    <td align="right" style="font-size:12px;font-weight:700;color:#1e1b4b">${Math.round(calories)} / ${targetCal} kcal</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr><td>${progressBar(calPct, '#6366f1')}</td></tr>
          </table>

          <!-- Protein -->
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:20px">
            <tr>
              <td style="padding-bottom:5px">
                <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td style="font-size:12px;color:#6b7280">${tr ? 'Protein' : 'Protein'}</td>
                    <td align="right" style="font-size:12px;font-weight:700;color:#1e1b4b">${Math.round(protein)}g / ${targetPro}g</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr><td>${progressBar(proPct, '#8b5cf6')}</td></tr>
          </table>

          <!-- Tasks done -->
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="background:#f0fdf4;border-radius:14px;padding:16px">
                <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td style="font-size:32px;font-weight:800;color:#16a34a;width:56px;line-height:1">${tasksDone}</td>
                    <td style="padding-left:14px">
                      <p style="margin:0;font-size:14px;font-weight:700;color:#166534">${tr ? 'Görev Tamamlandı' : 'Tasks Completed'}</p>
                      <p style="margin:3px 0 0;font-size:12px;color:#4ade80">${tr ? 'Harika iş çıkardın!' : 'Great work today!'}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- CTA -->
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:20px">
            <tr>
              <td align="center">
                <a href="${APP_URL}/nutrition" style="display:inline-block;background:#6366f1;color:#fff;border-radius:12px;padding:12px 28px;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:-.2px">${tr ? 'Beslenme Takibine Git →' : 'Go to Nutrition →'}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`

  return emailWrapper(
    content,
    APP_URL,
    tr ? 'Bu bildirimleri ' : 'Unsubscribe from notifications in ',
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
interface Profile {
  id: string
  display_name: string | null
  timezone: string | null
  preferences: Record<string, unknown>
}

function localHourNow(timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, hour: 'numeric', hour12: false,
    }).formatToParts(new Date())
    return parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0')
  } catch {
    return new Date().getUTCHours()
  }
}

function timeToHour(time: string): number {
  const [h] = (time ?? '08:00').split(':').map(Number)
  return h ?? 8
}

async function sendEmail(to: string, subject: string, html: string, resendKey: string) {
  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  })
  if (!res.ok) console.error(`Resend error for ${to}:`, await res.text())
}

// ─── Handler ──────────────────────────────────────────────────────────────────
serve(async () => {
  try {
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY tanımlanmamış' }), { status: 500 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    console.log(`Email check — UTC hour: ${new Date().getUTCHours()}`)

    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, display_name, timezone, preferences')

    if (!profiles?.length) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 })
    }

    const { data: authUsers } = await supabase.auth.admin.listUsers()
    const emailMap: Record<string, string> = {}
    for (const u of authUsers?.users ?? []) {
      if (u.email) emailMap[u.id] = u.email
    }

    const today = new Date().toISOString().split('T')[0]!
    let sent = 0

    for (const profile of profiles as Profile[]) {
      const prefs     = profile.preferences ?? {}
      const tz        = profile.timezone ?? 'Europe/Istanbul'
      const userEmail = emailMap[profile.id]
      const lang      = (prefs['language'] as string) ?? 'tr'
      if (!userEmail) continue

      const localHour = localHourNow(tz)

      // ── Sabah brief ──
      if (prefs['email_morning_enabled']) {
        const morningHour = timeToHour(prefs['morning_briefing_time'] as string ?? '08:00')
        if (localHour === morningHour) {
          const [taskRes, carryRes, blockRes] = await Promise.all([
            supabase.from('tasks').select('*', { count: 'exact', head: true })
              .eq('user_id', profile.id).eq('scheduled_date', today).not('status', 'in', '(done,deferred)'),
            supabase.from('tasks').select('*', { count: 'exact', head: true })
              .eq('user_id', profile.id).lt('scheduled_date', today).not('status', 'in', '(done,deferred)'),
            supabase.from('time_blocks').select('start_time, end_time, label, block_type')
              .eq('user_id', profile.id).eq('date', today).order('start_time'),
          ])

          const blocks = (blockRes.data ?? []).map((b) => ({
            label: b.label ?? b.block_type,
            start: b.start_time.slice(0, 5),
            end: b.end_time.slice(0, 5),
          }))

          const html = morningHtml(
            profile.display_name ?? '',
            taskRes.count ?? 0,
            carryRes.count ?? 0,
            blocks,
            lang,
          )
          const subject = lang === 'en'
            ? `☀️ Good morning — your plan for today`
            : `☀️ Günaydın — bugünün planı hazır`
          await sendEmail(userEmail, subject, html, resendKey)
          sent++
        }
      }

      // ── Akşam özeti ──
      if (prefs['email_evening_enabled']) {
        const eveningHour = timeToHour(prefs['evening_summary_time'] as string ?? '21:00')
        if (localHour === eveningHour) {
          const [mealRes, targetRes, doneRes] = await Promise.all([
            supabase.from('meals').select('total_calories, total_protein')
              .eq('user_id', profile.id).eq('date', today),
            supabase.from('nutrition_targets').select('calories, protein_g')
              .eq('user_id', profile.id).eq('is_active', true).single(),
            supabase.from('tasks').select('*', { count: 'exact', head: true })
              .eq('user_id', profile.id).eq('scheduled_date', today).eq('status', 'done'),
          ])

          const totalCal = (mealRes.data ?? []).reduce((s, m) => s + (m.total_calories ?? 0), 0)
          const totalPro = (mealRes.data ?? []).reduce((s, m) => s + (m.total_protein ?? 0), 0)

          const html = eveningHtml(
            profile.display_name ?? '',
            totalCal,
            targetRes.data?.calories ?? 2000,
            totalPro,
            targetRes.data?.protein_g ?? 150,
            doneRes.count ?? 0,
            lang,
          )
          const subject = lang === 'en'
            ? `🌙 Daily summary — great work today`
            : `🌙 Günün özeti — harika bir gün geçirdin`
          await sendEmail(userEmail, subject, html, resendKey)
          sent++
        }
      }
    }

    console.log(`${sent} email gönderildi`)
    return new Response(JSON.stringify({ sent }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('send-email error:', error)
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 })
  }
})
