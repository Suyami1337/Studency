-- =============================================
-- Block 2: Site — кастомный домен + форма заявок
-- =============================================

-- 1. Кастомный домен для лендинга
ALTER TABLE public.landings
  ADD COLUMN IF NOT EXISTS custom_domain TEXT,
  ADD COLUMN IF NOT EXISTS funnel_stage_id UUID REFERENCES public.funnel_stages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_landings_custom_domain ON public.landings(custom_domain);

-- 2. Таблица заявок с форм лендингов
CREATE TABLE IF NOT EXISTS public.lead_submissions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  landing_id UUID REFERENCES public.landings(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  visitor_token TEXT,            -- stud_vid cookie
  name TEXT,
  phone TEXT,
  email TEXT,
  telegram_username TEXT,
  extra JSONB DEFAULT '{}',      -- любые дополнительные поля формы
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_submissions_landing ON public.lead_submissions(landing_id);
CREATE INDEX IF NOT EXISTS idx_lead_submissions_project ON public.lead_submissions(project_id);

-- RLS
ALTER TABLE public.lead_submissions ENABLE ROW LEVEL SECURITY;

-- Владелец проекта читает/управляет
CREATE POLICY "Project members can manage lead submissions"
  ON public.lead_submissions FOR ALL
  USING (public.is_project_member(project_id))
  WITH CHECK (public.is_project_member(project_id));

-- Анонимные могут только вставлять (через service role в API)
-- (вставка идёт через service role key, поэтому отдельный публичный policy не нужен)

-- 3. Счётчик конверсий: функция инкремента visits/conversions
CREATE OR REPLACE FUNCTION public.increment_landing_visits(p_landing_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.landings SET visits = visits + 1 WHERE id = p_landing_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_landing_conversions(p_landing_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.landings SET conversions = conversions + 1 WHERE id = p_landing_id;
END;
$$;

-- 4. Функция инкремента кликов по кнопке
CREATE OR REPLACE FUNCTION public.increment_button_clicks(p_button_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.landing_buttons SET clicks = clicks + 1 WHERE id = p_button_id;
END;
$$;
