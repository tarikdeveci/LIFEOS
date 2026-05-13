-- supabase/seed.sql
-- Türk mutfağı yiyecek veritabanı (food_items tablosu)
-- user_id NULL = global veri, tüm kullanıcılar görebilir

INSERT INTO food_items (name, aliases, serving_size, serving_unit, calories, protein, carbs, fat, fiber, category, is_verified) VALUES

-- ============================
-- Protein kaynakları
-- ============================
('Yumurta (haşlanmış)', ARRAY['yumurta','haslama yumurta','haşlanmış yumurta'], 60, 'g', 78, 6.3, 0.6, 5.3, 0, 'protein', true),
('Yumurta (sahanda)', ARRAY['sahanda yumurta','sahanda'], 60, 'g', 110, 6.3, 0.6, 8.5, 0, 'protein', true),
('Tavuk göğsü (pişmiş)', ARRAY['tavuk göğsü','tavuk','chicken breast','tavuk göğüs'], 100, 'g', 165, 31, 0, 3.6, 0, 'protein', true),
('Tavuk but (pişmiş)', ARRAY['tavuk but','but'], 100, 'g', 209, 26, 0, 10.9, 0, 'protein', true),
('Kıyma (dana, pişmiş)', ARRAY['kıyma','dana kıyma','kiyma'], 100, 'g', 250, 26, 0, 15, 0, 'protein', true),
('Köfte (ızgara)', ARRAY['köfte','izğara köfte','ızgara köfte','kofte'], 80, 'g', 200, 17, 4, 12, 0.5, 'protein', true),
('Balık (levrek, ızgara)', ARRAY['levrek','balık','balik','ızgara balık'], 100, 'g', 124, 24, 0, 2.6, 0, 'protein', true),
('Ton balığı (konserve)', ARRAY['ton balığı','tuna','ton','konserve ton'], 100, 'g', 116, 26, 0, 0.8, 0, 'protein', true),
('Somon (ızgara)', ARRAY['somon','salmon','ızgara somon'], 100, 'g', 208, 20, 0, 13, 0, 'protein', true),

-- ============================
-- Süt ürünleri
-- ============================
('Beyaz peynir', ARRAY['peynir','white cheese','beyaz peynir'], 30, 'g', 80, 5.5, 0.5, 6.2, 0, 'dairy', true),
('Kaşar peyniri', ARRAY['kaşar','kasar','kaşar peyniri'], 30, 'g', 110, 7.5, 0.3, 8.8, 0, 'dairy', true),
('Süt (tam yağlı)', ARRAY['süt','süt tam yağlı'], 200, 'ml', 122, 6.4, 9.4, 6.4, 0, 'dairy', true),
('Yoğurt (tam yağlı)', ARRAY['yoğurt','yogurt','yoğurt tam'], 200, 'g', 122, 7, 9, 6.2, 0, 'dairy', true),
('Ayran', ARRAY['ayran'], 250, 'ml', 65, 4, 5.5, 2.8, 0, 'dairy', true),
('Lor peyniri', ARRAY['lor','lor peynir','lor peyniri'], 100, 'g', 98, 12, 3.4, 4, 0, 'dairy', true),
('Labne peyniri', ARRAY['labne','süzme peynir'], 30, 'g', 60, 3, 1, 5, 0, 'dairy', true),

-- ============================
-- Tahıllar & Ekmek
-- ============================
('Ekmek (beyaz, 1 dilim)', ARRAY['ekmek','beyaz ekmek','ekmek dilim'], 30, 'g', 79, 2.7, 14.7, 1, 0.6, 'grain', true),
('Tam buğday ekmeği (1 dilim)', ARRAY['tam buğday','tam buğday ekmek','tam buğday ekmeği'], 30, 'g', 70, 3.5, 12, 1.1, 1.9, 'grain', true),
('Pilav (pirinç)', ARRAY['pilav','pirinç pilav','pirinç','pirınc'], 150, 'g', 195, 3.5, 42, 1.5, 0.5, 'grain', true),
('Bulgur pilavı', ARRAY['bulgur','bulgur pilavı','bulgur pilav'], 150, 'g', 170, 5.5, 34, 1.5, 6.3, 'grain', true),
('Makarna (pişmiş)', ARRAY['makarna','pasta','spagetti'], 200, 'g', 262, 9, 50, 1.6, 2.4, 'grain', true),
('Yulaf ezmesi (kuru)', ARRAY['yulaf','yulaf ezmesi','oat','oatmeal'], 40, 'g', 152, 5.3, 27, 2.7, 4, 'grain', true),
('Simit', ARRAY['simit'], 120, 'g', 340, 10, 60, 6, 3, 'grain', true),

-- ============================
-- Sebzeler
-- ============================
('Domates', ARRAY['domates','tomato'], 100, 'g', 18, 0.9, 3.9, 0.2, 1.2, 'vegetable', true),
('Salatalık', ARRAY['salatalık','hıyar','salatalik'], 100, 'g', 15, 0.7, 3.6, 0.1, 0.5, 'vegetable', true),
('Biber (sivri)', ARRAY['biber','sivri biber'], 100, 'g', 20, 0.9, 4.6, 0.2, 1.7, 'vegetable', true),
('Karışık salata', ARRAY['salata','mevsim salata','yeşil salata'], 150, 'g', 30, 1.5, 5, 0.5, 2, 'vegetable', true),
('Mercimek çorbası', ARRAY['mercimek','mercimek çorba','mercimek çorbası'], 250, 'ml', 180, 10, 28, 3, 6, 'vegetable', true),
('Brokoli (haşlanmış)', ARRAY['brokoli','broccoli'], 100, 'g', 35, 2.8, 7, 0.4, 2.6, 'vegetable', true),
('Ispanak (pişmiş)', ARRAY['ıspanak','ispanak'], 100, 'g', 23, 2.9, 3.6, 0.4, 2.2, 'vegetable', true),
('Havuç', ARRAY['havuç','havuc'], 100, 'g', 41, 0.9, 10, 0.2, 2.8, 'vegetable', true),

-- ============================
-- Meyveler
-- ============================
('Muz', ARRAY['muz','banana'], 120, 'g', 107, 1.3, 27, 0.4, 3.1, 'fruit', true),
('Elma', ARRAY['elma','apple'], 150, 'g', 78, 0.4, 21, 0.2, 3.6, 'fruit', true),
('Portakal', ARRAY['portakal','orange'], 150, 'g', 70, 1.3, 17.5, 0.2, 3.6, 'fruit', true),
('Çilek', ARRAY['çilek','strawberry'], 100, 'g', 32, 0.7, 7.7, 0.3, 2, 'fruit', true),
('Karpuz', ARRAY['karpuz','watermelon'], 200, 'g', 60, 1.2, 15, 0.3, 0.8, 'fruit', true),
('Üzüm', ARRAY['üzüm','uzum'], 100, 'g', 69, 0.7, 18, 0.2, 0.9, 'fruit', true),

-- ============================
-- Yağlar & Kuruyemiş
-- ============================
('Zeytinyağı (1 yk)', ARRAY['zeytinyağı','zeytinyağ','zeytinyagi'], 14, 'ml', 119, 0, 0, 13.5, 0, 'fat', true),
('Tereyağı (1 yk)', ARRAY['tereyağı','tereyağ','tereyagi'], 14, 'g', 100, 0.1, 0, 11.4, 0, 'fat', true),
('Badem', ARRAY['badem','almond'], 30, 'g', 173, 6.3, 6, 15, 3.5, 'fat', true),
('Ceviz', ARRAY['ceviz','walnut'], 30, 'g', 196, 4.6, 4, 19.5, 2, 'fat', true),
('Fıstık ezmesi', ARRAY['fıstık ezmesi','peanut butter','fistik ezmesi'], 30, 'g', 176, 7.6, 5.7, 14.4, 1.5, 'fat', true),
('Fındık', ARRAY['fındık','findik','hazelnut'], 30, 'g', 178, 4.2, 4.7, 17.2, 2.7, 'fat', true),
('Zeytin (siyah)', ARRAY['zeytin','siyah zeytin'], 30, 'g', 36, 0.3, 2, 3, 0.9, 'fat', true),

-- ============================
-- İçecekler
-- ============================
('Çay (şekersiz)', ARRAY['çay','tea','cay'], 200, 'ml', 2, 0, 0.5, 0, 0, 'beverage', true),
('Türk kahvesi (şekersiz)', ARRAY['kahve','türk kahvesi','coffee','turk kahvesi'], 60, 'ml', 5, 0.3, 0.8, 0, 0, 'beverage', true),
('Su', ARRAY['su','water'], 200, 'ml', 0, 0, 0, 0, 0, 'beverage', true),
('Protein shake', ARRAY['protein','whey','protein tozu','protein shake'], 30, 'g', 120, 24, 3, 1.5, 0, 'protein', true),

-- ============================
-- Hazır yemekler (ortalama porsiyon)
-- ============================
('Kuru fasulye', ARRAY['kuru fasulye','fasulye','kuru fasülye'], 250, 'g', 290, 18, 40, 5, 12, 'vegetable', true),
('Nohut yemeği', ARRAY['nohut','nohut yemeği'], 250, 'g', 300, 15, 42, 7, 10, 'vegetable', true),
('İmam bayıldı', ARRAY['imam bayıldı','patlıcan','imam bayildi'], 200, 'g', 180, 3, 15, 12, 4, 'vegetable', true),
('Lahmacun', ARRAY['lahmacun'], 120, 'g', 270, 12, 32, 10, 2, 'grain', true),
('Döner (tavuk)', ARRAY['tavuk döner','döner','tavuk doner'], 200, 'g', 350, 28, 25, 15, 2, 'protein', true),
('Döner (et)', ARRAY['et döner','et doner'], 200, 'g', 420, 25, 25, 24, 2, 'protein', true),
('Pide (kıymalı)', ARRAY['pide','kıymalı pide'], 250, 'g', 500, 22, 55, 20, 3, 'grain', true),
('Mantı', ARRAY['mantı','manti'], 250, 'g', 350, 15, 40, 14, 2, 'grain', true),
('Menemen', ARRAY['menemen'], 200, 'g', 180, 10, 8, 12, 2, 'protein', true),
('Çiğ köfte (1 porsiyon)', ARRAY['çiğ köfte','cig kofte'], 150, 'g', 250, 8, 40, 6, 5, 'grain', true),
('Tost (kaşarlı)', ARRAY['tost','kaşarlı tost','kasarli tost'], 120, 'g', 300, 12, 30, 15, 1, 'grain', true),
('Triplex Smash Burger', ARRAY['triplex smash burger','smash burger','triplex burger'], 210, 'g', 550, 28, 38, 30, 1.5, 'protein', true),
('Sweetchill Tavuk Burger', ARRAY['sweetchill tavuk burger','sweetchill burger','tavuk burger'], 180, 'g', 420, 26, 32, 18, 1, 'protein', true),
('Pâté', ARRAY['pâté','pate','karaciğer pâtesi','ciğer pâtesi'], 50, 'g', 210, 12, 2, 17, 0, 'protein', true),
('Mango', ARRAY['mango','muz gibi','fusetea mango'], 330, 'ml', 150, 0.5, 38, 0.2, 2.5, 'fruit', true);

-- ============================
-- DEMO VERI (TASK + PLANNING + NUTRITION)
-- ============================
-- Bu blok, auth.users tablosundaki mevcut kullanıcılar için
-- detaylı örnek veri oluşturur. Tekrar çalıştırılabilir (idempotent).

DO $$
DECLARE
  u RECORD;
  task_focus_id UUID;
  task_mit_id UUID;
  task_health_id UUID;
  task_blocked_id UUID;
  task_done_id UUID;
  task_deferred_id UUID;
  task_backlog_id UUID;
  -- Uygulama takvimi Europe/Istanbul ile hizalı olsun (UTC CURRENT_DATE ile gün kayması olmasın)
  d0 DATE := (timezone('Europe/Istanbul', now()))::date;
  d1 DATE := d0 + INTERVAL '1 day';
  d2 DATE := d0 + INTERVAL '2 day';
BEGIN
  FOR u IN SELECT id FROM auth.users LOOP
    -- Önce eski demo verisini temizle
    DELETE FROM task_details
    WHERE task_id IN (
      SELECT id FROM tasks
      WHERE user_id = u.id
      AND tags @> ARRAY['demo_seed']::TEXT[]
    );

    DELETE FROM time_blocks
    WHERE user_id = u.id
      AND (label LIKE '[DEMO]%' OR label LIKE 'DEMO:%');

    DELETE FROM tasks
    WHERE user_id = u.id
      AND tags @> ARRAY['demo_seed']::TEXT[];

    DELETE FROM meals
    WHERE user_id = u.id
      AND (raw_input LIKE '[DEMO]%' OR notes LIKE '[DEMO]%');

    DELETE FROM daily_plans
    WHERE user_id = u.id
      AND notes LIKE '[DEMO]%';

    -- Aktif hedef yoksa bir tane ekle
    IF NOT EXISTS (
      SELECT 1
      FROM nutrition_targets
      WHERE user_id = u.id
        AND is_active = TRUE
    ) THEN
      INSERT INTO nutrition_targets (
        user_id, calories, protein_g, carbs_g, fat_g, fiber_g,
        workout_day_calories, workout_day_protein_g, is_active
      )
      VALUES (u.id, 2400, 165, 250, 80, 35, 2700, 180, TRUE);
    END IF;

    -- 1) Bugün odak görevleri
    INSERT INTO tasks (
      user_id, title, description, status,
      value_score, urgency_score, risk_score, effort_score, friction_score,
      scheduled_date, due_date, estimated_minutes, is_time_blocked, tags, sort_order
    )
    VALUES (
      u.id,
      'Q2 KPI raporunu tamamla',
      'Pazartesi yönetim toplantısı için KPI dashboard verilerini toparla ve 1 sayfalık özet çıkar.',
      'in_progress',
      5, 5, 4, 3, 2,
      d0, d0, 120, TRUE, ARRAY['work','high-impact','demo_seed'], 10
    )
    RETURNING id INTO task_focus_id;

    INSERT INTO tasks (
      user_id, title, description, status,
      value_score, urgency_score, risk_score, effort_score, friction_score,
      scheduled_date, due_date, estimated_minutes, is_time_blocked, tags, sort_order
    )
    VALUES (
      u.id,
      'Müşteri demo sunumu prova',
      'Sunum akışını 2 kez prova et, kritik itiraz sorularına 1 slide cevap hazırla.',
      'planned',
      5, 4, 4, 2, 2,
      d0, d1, 90, TRUE, ARRAY['sales','presentation','demo_seed'], 20
    )
    RETURNING id INTO task_mit_id;

    INSERT INTO tasks (
      user_id, title, description, status,
      value_score, urgency_score, risk_score, effort_score, friction_score,
      scheduled_date, due_date, estimated_minutes, is_time_blocked, tags, sort_order
    )
    VALUES (
      u.id,
      '45 dk güç antrenmanı',
      'Alt vücut + core. Isınma 10 dk, ana set 30 dk, soğuma 5 dk.',
      'planned',
      4, 3, 3, 3, 2,
      d0, NULL, 45, TRUE, ARRAY['health','training','demo_seed'], 30
    )
    RETURNING id INTO task_health_id;

    -- 2) Diğer durumları göstermek için görevler
    INSERT INTO tasks (
      user_id, title, description, status,
      value_score, urgency_score, risk_score, effort_score, friction_score,
      scheduled_date, due_date, estimated_minutes, is_time_blocked, tags, sort_order
    )
    VALUES (
      u.id,
      'Vergi evraklarını toparla',
      'Muhasebeciye gönderilecek belgeler: gelir raporu, gider faturaları, banka dökümü.',
      'blocked',
      4, 4, 5, 4, 4,
      d1, d2, 60, FALSE, ARRAY['finance','admin','demo_seed'], 40
    )
    RETURNING id INTO task_blocked_id;

    INSERT INTO tasks (
      user_id, title, description, status,
      value_score, urgency_score, risk_score, effort_score, friction_score,
      scheduled_date, due_date, estimated_minutes, completed_at, tags, sort_order
    )
    VALUES (
      u.id,
      'Inbox zero: e-posta temizliği',
      'Gelen kutusunu 20’nin altına indir, takip gerektirenleri etiketle.',
      'done',
      3, 3, 2, 2, 2,
      d0, d0, 35, NOW() - INTERVAL '2 hours', ARRAY['ops','demo_seed'], 50
    )
    RETURNING id INTO task_done_id;

    INSERT INTO tasks (
      user_id, title, description, status,
      value_score, urgency_score, risk_score, effort_score, friction_score,
      scheduled_date, due_date, estimated_minutes, tags, sort_order
    )
    VALUES (
      u.id,
      'Blog yazısı taslağı',
      'Ürün geliştirme süreciyle ilgili teknik blog taslağı.',
      'deferred',
      2, 1, 1, 4, 3,
      d2, NULL, 75, ARRAY['content','demo_seed'], 60
    )
    RETURNING id INTO task_deferred_id;

    INSERT INTO tasks (
      user_id, title, description, status,
      value_score, urgency_score, risk_score, effort_score, friction_score,
      scheduled_date, due_date, estimated_minutes, tags, sort_order
    )
    VALUES (
      u.id,
      'Notion bilgi tabanı düzenlemesi',
      'Tekrarlayan SOP dokümanlarını birleştir, arama etiketlerini standardize et.',
      'backlog',
      3, 2, 2, 3, 3,
      NULL, NULL, 80, ARRAY['knowledge','demo_seed'], 70
    )
    RETURNING id INTO task_backlog_id;

    -- Task detail (markdown + checklist)
    INSERT INTO task_details (task_id, notes, checklist, attachments)
    VALUES (
      task_focus_id,
      E'## Hedef\n- Haftalık trendi net göstermek\n- Riskli KPI''lara aksiyon yazmak\n\n## Notlar\nToplantı öncesi 15 dk dry-run yap.',
      '[
        {"id":"c1","text":"Data export al", "checked": true},
        {"id":"c2","text":"Grafikleri normalize et", "checked": true},
        {"id":"c3","text":"Özet metin yaz", "checked": false},
        {"id":"c4","text":"Toplantı dry-run", "checked": false}
      ]'::jsonb,
      '[
        {"id":"a1","name":"kpi-export.csv","url":"https://example.com/files/kpi-export.csv","type":"csv"},
        {"id":"a2","name":"weekly-summary.md","url":"https://example.com/files/weekly-summary.md","type":"markdown"}
      ]'::jsonb
    );

    INSERT INTO task_details (task_id, notes, checklist, attachments)
    VALUES (
      task_mit_id,
      E'## Sunum Akışı\n1. Problem\n2. Çözüm\n3. ROI\n4. Soru-cevap\n\nMüşteri itirazlarına kısa ve sayısal cevap ver.',
      '[
        {"id":"m1","text":"Demo ortamı kontrol", "checked": true},
        {"id":"m2","text":"Fallback video hazırla", "checked": false},
        {"id":"m3","text":"Soru listesi yaz", "checked": false}
      ]'::jsonb,
      '[]'::jsonb
    );

    -- Günlük planlar (3 gün)
    INSERT INTO daily_plans (user_id, date, energy_level, notes, ai_suggestions)
    VALUES
      (
        u.id, d0, 4, '[DEMO] Yoğun ama yönetilebilir bir gün.',
        '[
          {"type":"focus","text":"En zor görevi 09:00-11:00 arası bitir."},
          {"type":"nutrition","text":"Öğlen protein + kompleks karbonhidrat tercih et."},
          {"type":"recovery","text":"15:30''da 10 dk yürüyüş molası ver."}
        ]'::jsonb
      ),
      (
        u.id, d1, 3, '[DEMO] Toplantı ağırlıklı gün.',
        '[
          {"type":"calendar","text":"Toplantılar arasında 15 dk buffer bırak."},
          {"type":"priority","text":"Sadece 2 kritik çıktıya odaklan."}
        ]'::jsonb
      ),
      (
        u.id, d2, 5, '[DEMO] Deep work için yüksek enerji günü.',
        '[
          {"type":"focus","text":"Sabah 2x90 dk kesintisiz odak bloğu aç."},
          {"type":"habit","text":"Akşam kısa değerlendirme yaz."}
        ]'::jsonb
      )
    ON CONFLICT (user_id, date) DO UPDATE
    SET
      energy_level = EXCLUDED.energy_level,
      notes = EXCLUDED.notes,
      ai_suggestions = EXCLUDED.ai_suggestions;

    -- Time blocks (bugün)
    INSERT INTO time_blocks (user_id, task_id, date, start_time, end_time, block_type, label, color)
    VALUES
      (u.id, NULL, d0, '07:30', '08:00', 'routine', '[DEMO] Sabah planlama', '#3B82F6'),
      (u.id, task_focus_id, d0, '09:00', '11:00', 'focus', '[DEMO] KPI derin çalışma', '#8B5CF6'),
      (u.id, NULL, d0, '11:00', '11:15', 'break', '[DEMO] Kısa mola', '#10B981'),
      (u.id, task_mit_id, d0, '11:30', '13:00', 'task', '[DEMO] Sunum provası', '#F59E0B'),
      (u.id, NULL, d0, '13:00', '13:40', 'meal', '[DEMO] Öğle yemeği', '#EF4444'),
      (u.id, task_health_id, d0, '18:30', '19:15', 'workout', '[DEMO] Güç antrenmanı', '#06B6D4');

    -- Meals (bugün, 4 öğün)
    INSERT INTO meals (
      user_id, date, meal_type, raw_input, notes, items,
      total_calories, total_protein, total_carbs, total_fat, total_fiber
    )
    VALUES
      (
        u.id, d0, 'breakfast',
        '[DEMO] 2 haşlanmış yumurta, 2 dilim tam buğday ekmek, domates-salatalık, çay',
        '[DEMO] Sabah protein odaklı kahvaltı.',
        '[
          {"name":"Yumurta (haşlanmış)","amount":2,"unit":"adet","calories":156,"protein":12.6,"carbs":1.2,"fat":10.6,"fiber":0},
          {"name":"Tam buğday ekmeği","amount":2,"unit":"dilim","calories":140,"protein":7,"carbs":24,"fat":2.2,"fiber":3.8},
          {"name":"Domates+salatalık","amount":1,"unit":"porsiyon","calories":35,"protein":1.4,"carbs":7.5,"fat":0.3,"fiber":2}
        ]'::jsonb,
        331, 21.0, 32.7, 13.1, 5.8
      ),
      (
        u.id, d0, 'lunch',
        '[DEMO] 180g tavuk göğsü, bulgur pilavı, yoğurt',
        '[DEMO] Öğlen performans öğünü.',
        '[
          {"name":"Tavuk göğsü (pişmiş)","amount":180,"unit":"g","calories":297,"protein":55.8,"carbs":0,"fat":6.5,"fiber":0},
          {"name":"Bulgur pilavı","amount":1,"unit":"porsiyon","calories":170,"protein":5.5,"carbs":34,"fat":1.5,"fiber":6.3},
          {"name":"Yoğurt","amount":200,"unit":"g","calories":122,"protein":7,"carbs":9,"fat":6.2,"fiber":0}
        ]'::jsonb,
        589, 68.3, 43.0, 14.2, 6.3
      ),
      (
        u.id, d0, 'snack',
        '[DEMO] 1 muz, 20g badem',
        '[DEMO] Antrenman öncesi ara öğün.',
        '[
          {"name":"Muz","amount":1,"unit":"adet","calories":107,"protein":1.3,"carbs":27,"fat":0.4,"fiber":3.1},
          {"name":"Badem","amount":20,"unit":"g","calories":115,"protein":4.2,"carbs":4,"fat":10,"fiber":2.3}
        ]'::jsonb,
        222, 5.5, 31.0, 10.4, 5.4
      ),
      (
        u.id, d0, 'dinner',
        '[DEMO] 160g somon, karışık salata, 1 dilim ekmek',
        '[DEMO] Akşam dengeli toparlanma öğünü.',
        '[
          {"name":"Somon (ızgara)","amount":160,"unit":"g","calories":333,"protein":32,"carbs":0,"fat":20.8,"fiber":0},
          {"name":"Karışık salata","amount":1,"unit":"porsiyon","calories":30,"protein":1.5,"carbs":5,"fat":0.5,"fiber":2},
          {"name":"Ekmek (beyaz)","amount":1,"unit":"dilim","calories":79,"protein":2.7,"carbs":14.7,"fat":1,"fiber":0.6}
        ]'::jsonb,
        442, 36.2, 19.7, 22.3, 2.6
      );
  END LOOP;
END $$;
