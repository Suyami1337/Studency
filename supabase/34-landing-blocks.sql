-- ============================================================================
-- 34: Блочный редактор лендингов
-- ============================================================================
-- Лендинг теперь состоит из упорядоченных БЛОКОВ. У каждого блока:
--   - общий контент (HTML / или структурированные поля в зависимости от типа)
--   - отдельные стили для desktop и mobile (mobile применяется через @media)
--   - свой тип (custom_html / hero / text / image / video / cta / zero)
--
-- Существующие лендинги (у которых html_content монолитный) НЕ ломаются:
-- landings.html_content остаётся. Публичный рендер на /s/[slug] сначала
-- смотрит landing_blocks — если там есть блоки, собирает из них. Если нет —
-- фолбэк на старый html_content.
--
-- Миграция существующих: отдельный скрипт / lazy-миграция при первом
-- открытии лендинга в редакторе (заворачиваем html_content в один блок
-- типа custom_html). Здесь только схема — данные мигрируем в коде.
-- ============================================================================

CREATE TABLE IF NOT EXISTS landing_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_id uuid NOT NULL REFERENCES landings(id) ON DELETE CASCADE,
  order_position int NOT NULL DEFAULT 0,
  block_type text NOT NULL DEFAULT 'custom_html',
    -- Типы блоков:
    --   custom_html — сырой HTML, для продвинутых и для импорта старых лендингов
    --   hero        — заголовок + подзаголовок + CTA (типизированный)
    --   text        — параграф(ы) текста
    --   image       — одна картинка (URL + alt + размер)
    --   video       — встроенное видео ({{video:UUID}})
    --   cta         — большая кнопка-призыв
    --   zero        — холст с абсолютно позиционированными элементами (добавим во 2-й день)
  name text,                        -- человеко-читаемое имя («Hero с видео», «Призыв купить»)
  html_content text,                -- для custom_html / hero / text / cta — сгенерированный или вручную написанный HTML
  content jsonb DEFAULT '{}'::jsonb, -- структурированные данные для типизированных блоков
                                     -- пример для hero: { headline, subheadline, ctaText, ctaUrl, bgColor }
  desktop_styles jsonb DEFAULT '{}'::jsonb, -- { "selector": { "prop": "value" } }
  mobile_styles  jsonb DEFAULT '{}'::jsonb, -- override'ы для @media (max-width: 640px)
  layout jsonb DEFAULT '{}'::jsonb,  -- { paddingY, maxWidth, align, hideOnMobile, hideOnDesktop, bgColor, bgImage }
  is_hidden boolean NOT NULL DEFAULT false, -- временно скрыть блок не удаляя
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Быстро получить все блоки лендинга в порядке
CREATE INDEX IF NOT EXISTS idx_landing_blocks_landing
  ON landing_blocks(landing_id, order_position);

-- Триггер на updated_at
CREATE OR REPLACE FUNCTION update_landing_blocks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS landing_blocks_updated_at ON landing_blocks;
CREATE TRIGGER landing_blocks_updated_at
  BEFORE UPDATE ON landing_blocks
  FOR EACH ROW
  EXECUTE FUNCTION update_landing_blocks_updated_at();

-- RLS — блоки видны тому же, кому виден сам лендинг
ALTER TABLE landing_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS landing_blocks_read ON landing_blocks;
CREATE POLICY landing_blocks_read ON landing_blocks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM landings l
      WHERE l.id = landing_blocks.landing_id
        AND l.project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS landing_blocks_write ON landing_blocks;
CREATE POLICY landing_blocks_write ON landing_blocks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM landings l
      WHERE l.id = landing_blocks.landing_id
        AND l.project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM landings l
      WHERE l.id = landing_blocks.landing_id
        AND l.project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
    )
  );

-- Service role бекенд ходит мимо RLS (наши API-роуты используют SUPABASE_SERVICE_ROLE_KEY)

-- Флаг на landings: переведён ли лендинг на блочную архитектуру.
-- Нужен чтобы публичный рендер /s/[slug] знал: читать блоки или html_content.
ALTER TABLE landings ADD COLUMN IF NOT EXISTS is_blocks_based boolean NOT NULL DEFAULT false;

COMMENT ON TABLE landing_blocks IS
  'Блоки лендинга — упорядоченные секции со своим контентом и раздельными стилями для desktop/mobile.';
COMMENT ON COLUMN landing_blocks.block_type IS
  'Тип блока: custom_html / hero / text / image / video / cta / zero';
COMMENT ON COLUMN landing_blocks.desktop_styles IS
  'CSS-override для десктопа: {"h1": {"font-size": "54px"}}';
COMMENT ON COLUMN landing_blocks.mobile_styles IS
  'CSS-override для мобилки — попадёт внутрь @media (max-width: 640px)';
COMMENT ON COLUMN landing_blocks.layout IS
  'Лейаут-параметры блока: paddingY, maxWidth, align, bgColor, bgImage, hideOnMobile, hideOnDesktop';
