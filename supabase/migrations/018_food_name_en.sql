-- Migration 018: Add name_en column to food_items for English search support

ALTER TABLE food_items ADD COLUMN IF NOT EXISTS name_en TEXT;

-- Update global foods with English names
UPDATE food_items SET name_en = CASE name
  -- Protein sources
  WHEN 'Yumurta (haşlanmış)'      THEN 'Boiled egg'
  WHEN 'Yumurta (sahanda)'         THEN 'Fried egg'
  WHEN 'Tavuk göğsü (pişmiş)'     THEN 'Chicken breast (cooked)'
  WHEN 'Tavuk but (pişmiş)'       THEN 'Chicken thigh (cooked)'
  WHEN 'Kıyma (dana, pişmiş)'     THEN 'Ground beef (cooked)'
  WHEN 'Köfte (ızgara)'           THEN 'Meatballs (grilled)'
  WHEN 'Balık (levrek, ızgara)'   THEN 'Sea bass (grilled)'
  WHEN 'Ton balığı (konserve)'    THEN 'Canned tuna'
  WHEN 'Somon (ızgara)'           THEN 'Grilled salmon'
  -- Dairy
  WHEN 'Beyaz peynir'             THEN 'White cheese / Feta'
  WHEN 'Kaşar peyniri'            THEN 'Yellow cheese'
  WHEN 'Süt (tam yağlı)'         THEN 'Whole milk'
  WHEN 'Yoğurt (tam yağlı)'      THEN 'Yogurt (full fat)'
  WHEN 'Ayran'                    THEN 'Ayran (yogurt drink)'
  WHEN 'Lor peyniri'              THEN 'Cottage cheese'
  WHEN 'Labne peyniri'            THEN 'Labneh / Cream cheese'
  -- Grains & Bread
  WHEN 'Ekmek (beyaz, 1 dilim)'        THEN 'White bread (1 slice)'
  WHEN 'Tam buğday ekmeği (1 dilim)'   THEN 'Whole wheat bread (1 slice)'
  WHEN 'Pilav (pirinç)'               THEN 'Rice pilaf'
  WHEN 'Bulgur pilavı'                THEN 'Bulgur pilaf'
  WHEN 'Makarna (pişmiş)'             THEN 'Pasta (cooked)'
  WHEN 'Yulaf ezmesi (kuru)'          THEN 'Oatmeal (dry)'
  WHEN 'Simit'                        THEN 'Simit (sesame bagel)'
  -- Vegetables
  WHEN 'Domates'                 THEN 'Tomato'
  WHEN 'Salatalık'               THEN 'Cucumber'
  WHEN 'Biber (sivri)'           THEN 'Green pepper'
  WHEN 'Karışık salata'          THEN 'Mixed salad'
  WHEN 'Mercimek çorbası'        THEN 'Lentil soup'
  WHEN 'Brokoli (haşlanmış)'     THEN 'Broccoli (boiled)'
  WHEN 'Ispanak (pişmiş)'        THEN 'Spinach (cooked)'
  WHEN 'Havuç'                   THEN 'Carrot'
  -- Fruits
  WHEN 'Muz'         THEN 'Banana'
  WHEN 'Elma'        THEN 'Apple'
  WHEN 'Portakal'    THEN 'Orange'
  WHEN 'Çilek'       THEN 'Strawberry'
  WHEN 'Karpuz'      THEN 'Watermelon'
  WHEN 'Üzüm'        THEN 'Grapes'
  WHEN 'Mango'       THEN 'Mango'
  -- Fats & Nuts
  WHEN 'Zeytinyağı (1 yk)'   THEN 'Olive oil (1 tbsp)'
  WHEN 'Tereyağı (1 yk)'     THEN 'Butter (1 tbsp)'
  WHEN 'Badem'               THEN 'Almonds'
  WHEN 'Ceviz'               THEN 'Walnuts'
  WHEN 'Fıstık ezmesi'       THEN 'Peanut butter'
  WHEN 'Fındık'              THEN 'Hazelnuts'
  WHEN 'Zeytin (siyah)'      THEN 'Black olives'
  -- Beverages
  WHEN 'Çay (şekersiz)'           THEN 'Tea (unsweetened)'
  WHEN 'Türk kahvesi (şekersiz)'  THEN 'Turkish coffee (unsweetened)'
  WHEN 'Su'                       THEN 'Water'
  WHEN 'Protein shake'            THEN 'Protein shake'
  -- Ready meals
  WHEN 'Kuru fasulye'         THEN 'White beans stew'
  WHEN 'Nohut yemeği'         THEN 'Chickpea stew'
  WHEN 'İmam bayıldı'         THEN 'Stuffed eggplant (imam bayildi)'
  WHEN 'Lahmacun'             THEN 'Turkish pizza (lahmacun)'
  WHEN 'Döner (tavuk)'        THEN 'Chicken doner kebab'
  WHEN 'Döner (et)'           THEN 'Beef doner kebab'
  WHEN 'Pide (kıymalı)'       THEN 'Turkish flatbread with meat (pide)'
  WHEN 'Mantı'                THEN 'Turkish dumplings (manti)'
  WHEN 'Menemen'              THEN 'Turkish scrambled eggs (menemen)'
  WHEN 'Çiğ köfte (1 porsiyon)' THEN 'Raw kofte (vegan bulgur balls)'
  WHEN 'Tost (kaşarlı)'       THEN 'Grilled cheese toast'
  WHEN 'Triplex Smash Burger' THEN 'Triplex smash burger'
  WHEN 'Sweetchill Tavuk Burger' THEN 'Sweetchill chicken burger'
  WHEN 'Pâté'                 THEN 'Pate / Liver pate'
  ELSE NULL
END
WHERE user_id IS NULL;

-- Index for fast English search
CREATE INDEX IF NOT EXISTS idx_food_items_name_en ON food_items (name_en text_pattern_ops)
  WHERE name_en IS NOT NULL;

-- Index for Turkish name search too (if not already exists)
CREATE INDEX IF NOT EXISTS idx_food_items_name ON food_items (name text_pattern_ops);
