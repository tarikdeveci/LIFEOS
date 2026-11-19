import { ImageResponse } from 'next/og'

// WhatsApp, LinkedIn, Meta ve X'te link paylaşılınca görünen kart. Next bu dosyadan
// og:image etiketini kendisi üretir; alt sayfalar kendi görselini vermedikçe bunu kullanır.
// Sağdaki bloklar hero'daki gün çizelgesinin özeti.

export const alt = 'LifeOS: Yapılacaklar listen zaten var. LifeOS gününü kurar.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const BLOCKS = [
  { label: 'Sabah rutini', time: '07:00', color: '#38bdf8', height: 64 },
  { label: 'Derin iş: sunum', time: '09:00', color: '#818cf8', height: 112 },
  { label: 'Öğle yemeği', time: '12:30', color: '#34d399', height: 64 },
  { label: 'Ekip toplantısı', time: '14:00', color: '#a78bfa', height: 80 },
  { label: 'Antrenman', time: '18:00', color: '#fb923c', height: 64 },
]

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: 'linear-gradient(135deg, #080B14 0%, #111633 60%, #1e1b4b 100%)',
          color: 'white',
          padding: '72px 80px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 640 }}>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: '#a5b4fc' }}>LifeOS</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 64, fontWeight: 800, lineHeight: 1.08 }}>Yapılacaklar listen zaten var.</div>
            <div style={{ display: 'flex', fontSize: 64, fontWeight: 800, lineHeight: 1.08, color: '#a5b4fc', marginTop: 8 }}>
              LifeOS gününü kurar.
            </div>
            <div style={{ display: 'flex', fontSize: 28, color: 'rgba(255,255,255,0.65)', marginTop: 28, lineHeight: 1.35 }}>
              Görevlerini sıralar, takvimine yerleştirir, gün kayınca yeniden planlar.
            </div>
          </div>
          <div style={{ display: 'flex', fontSize: 24, color: 'rgba(255,255,255,0.5)' }}>lifeos.tr · iOS · Android · Web</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', marginLeft: 'auto', width: 360, gap: 14 }}>
          {BLOCKS.map((b) => (
            <div
              key={b.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                height: b.height,
                borderRadius: 16,
                background: 'rgba(255,255,255,0.06)',
                borderLeft: `6px solid ${b.color}`,
                padding: '0 22px',
                fontSize: 24,
              }}
            >
              <span style={{ color: 'rgba(255,255,255,0.45)', width: 84 }}>{b.time}</span>
              <span style={{ fontWeight: 600 }}>{b.label}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  )
}
