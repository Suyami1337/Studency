'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { AiAssistantButton, AiAssistantOverlay } from '@/components/ui/AiAssistant'
import { SkeletonList } from '@/components/ui/Skeleton'

const supabase = createClient()

type Landing = {
  id: string
  name: string
  slug: string
  status: 'draft' | 'published'
  html_content: string | null
  meta_title: string | null
  meta_description: string | null
  funnel_id: string | null
  visits: number
  conversions: number
  project_id: string
  created_at: string
}

type LandingButton = {
  id: string
  landing_id: string
  name: string
  clicks: number
  conversions: number
}

type LandingVisit = {
  id: string
  landing_id: string
  visitor_ip: string | null
  visitor_ua: string | null
  created_at: string
  customers?: { name: string; email: string | null } | null
}

type Funnel = {
  id: string
  name: string
}

// ─── Status badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: 'draft' | 'published' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
        status === 'published'
          ? 'bg-green-100 text-green-700'
          : 'bg-gray-100 text-gray-500'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          status === 'published' ? 'bg-green-500' : 'bg-gray-400'
        }`}
      />
      {status === 'published' ? 'Опубликован' : 'Черновик'}
    </span>
  )
}

// ─── Conversion bar ─────────────────────────────────────────────────────────
function ConversionBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#6A55F8] rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
    </div>
  )
}

// ─── Stat card ───────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────
type Tab = 'editor' | 'analytics' | 'users' | 'settings'
function TabBar({
  active,
  onChange,
}: {
  active: Tab
  onChange: (t: Tab) => void
}) {
  const tabs: { key: Tab; label: string }[] = [
    { key: 'editor', label: 'Редактор' },
    { key: 'analytics', label: 'Аналитика' },
    { key: 'users', label: 'Пользователи' },
    { key: 'settings', label: 'Настройки' },
  ]
  return (
    <div className="flex gap-1 border-b border-gray-100 mb-6">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
            active === t.key
              ? 'border-[#6A55F8] text-[#6A55F8]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// DETAIL VIEW
// ═══════════════════════════════════════════════════════════════════════════
function LandingDetail({
  landing: initialLanding,
  onBack,
  projectId,
}: {
  landing: Landing
  onBack: (updated: Landing) => void
  projectId: string
}) {
  const [landing, setLanding] = useState<Landing>(initialLanding)
  const [activeTab, setActiveTab] = useState<Tab>('editor')
  const [aiOpen, setAiOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Editor state
  const [html, setHtml] = useState(landing.html_content ?? '')

  // Analytics state
  const [buttons, setButtons] = useState<LandingButton[]>([])
  const [addingButton, setAddingButton] = useState(false)
  const [newButtonName, setNewButtonName] = useState('')
  const [savingButton, setSavingButton] = useState(false)

  // Users state
  const [visits, setVisits] = useState<LandingVisit[]>([])
  const [loadingVisits, setLoadingVisits] = useState(false)

  // Settings state
  const [settingName, setSettingName] = useState(landing.name)
  const [settingSlug, setSettingSlug] = useState(landing.slug)
  const [settingMetaTitle, setSettingMetaTitle] = useState(landing.meta_title ?? '')
  const [settingMetaDesc, setSettingMetaDesc] = useState(landing.meta_description ?? '')
  const [settingFunnelId, setSettingFunnelId] = useState(landing.funnel_id ?? '')
  const [funnels, setFunnels] = useState<Funnel[]>([])
  const [deletingLanding, setDeletingLanding] = useState(false)

  // Load buttons when analytics tab opened
  useEffect(() => {
    if (activeTab === 'analytics') loadButtons()
    if (activeTab === 'users') loadVisits()
    if (activeTab === 'settings') loadFunnels()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  async function loadButtons() {
    const { data } = await supabase
      .from('landing_buttons')
      .select('*')
      .eq('landing_id', landing.id)
      .order('created_at')
    setButtons(data ?? [])
  }

  async function loadVisits() {
    setLoadingVisits(true)
    const { data } = await supabase
      .from('landing_visits')
      .select('*, customers(name, email)')
      .eq('landing_id', landing.id)
      .order('created_at', { ascending: false })
      .limit(100)
    setVisits((data ?? []) as LandingVisit[])
    setLoadingVisits(false)
  }

  async function loadFunnels() {
    const { data } = await supabase
      .from('funnels')
      .select('id, name')
      .eq('project_id', projectId)
    setFunnels(data ?? [])
  }

  async function handlePublish() {
    setSaving(true)
    const newStatus = landing.status === 'published' ? 'draft' : 'published'
    const { data } = await supabase
      .from('landings')
      .update({ status: newStatus, html_content: html })
      .eq('id', landing.id)
      .select()
      .single()
    if (data) setLanding(data as Landing)
    setSaving(false)
  }

  async function handleSaveHtml() {
    setSaving(true)
    const { data } = await supabase
      .from('landings')
      .update({ html_content: html })
      .eq('id', landing.id)
      .select()
      .single()
    if (data) setLanding(data as Landing)
    setSaving(false)
  }

  async function handleAddButton() {
    if (!newButtonName.trim()) return
    setSavingButton(true)
    const { data } = await supabase
      .from('landing_buttons')
      .insert({ landing_id: landing.id, name: newButtonName.trim(), clicks: 0, conversions: 0 })
      .select()
      .single()
    if (data) setButtons((prev) => [...prev, data as LandingButton])
    setNewButtonName('')
    setAddingButton(false)
    setSavingButton(false)
  }

  async function handleSaveSettings() {
    setSaving(true)
    const { data } = await supabase
      .from('landings')
      .update({
        name: settingName,
        slug: settingSlug,
        meta_title: settingMetaTitle || null,
        meta_description: settingMetaDesc || null,
        funnel_id: settingFunnelId || null,
      })
      .eq('id', landing.id)
      .select()
      .single()
    if (data) setLanding(data as Landing)
    setSaving(false)
  }

  async function handleDeleteLanding() {
    if (!confirm('Удалить лендинг? Это действие необратимо.')) return
    setDeletingLanding(true)
    await supabase.from('landings').delete().eq('id', landing.id)
    onBack({ ...landing, id: '__deleted__' })
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => onBack(landing)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Назад
        </button>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">{landing.name}</h1>
        <StatusBadge status={landing.status} />
        <div className="ml-auto flex items-center gap-2">
          <AiAssistantButton isOpen={aiOpen} onClick={() => setAiOpen(!aiOpen)} />
        </div>
      </div>

      <TabBar active={activeTab} onChange={setActiveTab} />

      {/* ── Tab: Редактор ───────────────────────────────────────────── */}
      {activeTab === 'editor' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              HTML-редактор · в будущем здесь будет визуальный конструктор с AI
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleSaveHtml}
                disabled={saving}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button
                onClick={handlePublish}
                disabled={saving}
                className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors disabled:opacity-50 ${
                  landing.status === 'published'
                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    : 'bg-[#6A55F8] text-white hover:bg-[#5040D6]'
                }`}
              >
                {landing.status === 'published' ? 'Снять с публикации' : 'Опубликовать'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Editor pane */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">HTML</span>
                <span className="text-xs text-gray-400">index.html</span>
              </div>
              <textarea
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                className="w-full h-[500px] p-4 text-sm font-mono text-gray-800 resize-none focus:outline-none leading-relaxed"
                placeholder="<!DOCTYPE html>&#10;<html>&#10;  <head>&#10;    <title>Мой лендинг</title>&#10;  </head>&#10;  <body>&#10;    <h1>Привет!</h1>&#10;  </body>&#10;</html>"
                spellCheck={false}
              />
            </div>

            {/* Preview pane */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 bg-gray-50">
                <div className="flex gap-1">
                  <span className="w-3 h-3 rounded-full bg-red-400" />
                  <span className="w-3 h-3 rounded-full bg-yellow-400" />
                  <span className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <span className="text-xs text-gray-400 flex-1 text-center">
                  studency.app/{landing.slug}
                </span>
              </div>
              <iframe
                srcDoc={html || '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9CA3AF;font-family:sans-serif;font-size:14px">Предпросмотр появится здесь</div>'}
                className="w-full h-[500px] border-0"
                sandbox="allow-scripts"
                title="Предпросмотр"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Аналитика ─────────────────────────────────────────── */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <StatCard label="Посещения" value={landing.visits} />
            <StatCard label="Конверсии" value={landing.conversions} />
            <StatCard
              label="Конверсия %"
              value={
                landing.visits > 0
                  ? `${Math.round((landing.conversions / landing.visits) * 100)}%`
                  : '—'
              }
            />
            <StatCard label="Отказы" value="34%" sub="приблизительно" />
          </div>

          {/* Buttons */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Кнопки отслеживания</h3>
              <button
                onClick={() => setAddingButton(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#6A55F8] border border-[#6A55F8] rounded-lg hover:bg-[#F0EDFF] transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Добавить кнопку
              </button>
            </div>

            {addingButton && (
              <div className="px-5 py-3 border-b border-gray-100 bg-[#F8F7FF] flex gap-3 items-center">
                <input
                  type="text"
                  value={newButtonName}
                  onChange={(e) => setNewButtonName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddButton()}
                  placeholder="Название кнопки (напр. CTA главная)"
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:border-[#6A55F8]"
                  autoFocus
                />
                <button
                  onClick={handleAddButton}
                  disabled={savingButton || !newButtonName.trim()}
                  className="px-4 py-2 text-sm bg-[#6A55F8] text-white rounded-lg hover:bg-[#5040D6] disabled:opacity-50 transition-colors"
                >
                  {savingButton ? 'Добавление...' : 'Добавить'}
                </button>
                <button
                  onClick={() => { setAddingButton(false); setNewButtonName('') }}
                  className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Отмена
                </button>
              </div>
            )}

            {buttons.length === 0 ? (
              <div className="py-12 text-center">
                <div className="text-3xl mb-2">🖱️</div>
                <p className="text-sm text-gray-400">Нет отслеживаемых кнопок</p>
                <p className="text-xs text-gray-300 mt-1">
                  Добавьте кнопки, чтобы видеть статистику кликов
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {buttons.map((btn) => (
                  <div key={btn.id} className="px-5 py-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{btn.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {btn.clicks} кликов · {btn.conversions} конверсий
                      </p>
                    </div>
                    <div className="w-40">
                      <ConversionBar value={btn.conversions} max={btn.clicks} />
                    </div>
                    <div className="text-right w-20">
                      <span className="text-lg font-bold text-gray-900">{btn.clicks}</span>
                      <p className="text-xs text-gray-400">кликов</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Пользователи ──────────────────────────────────────── */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Посетители</h3>
          </div>

          {loadingVisits ? (
            <SkeletonList count={3} />
          ) : visits.length === 0 ? (
            <div className="py-14 text-center">
              <div className="text-4xl mb-3">👤</div>
              <p className="text-sm text-gray-500 font-medium">Посетителей пока нет</p>
              <p className="text-xs text-gray-400 mt-1">
                Здесь появятся данные о посетителях лендинга
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Посетитель</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">IP</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Браузер</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Дата</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visits.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3">
                      {v.customers ? (
                        <div>
                          <p className="font-medium text-gray-800">{v.customers.name}</p>
                          {v.customers.email && (
                            <p className="text-xs text-gray-400">{v.customers.email}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Анонимный</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-500 font-mono text-xs">
                      {v.visitor_ip ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs max-w-[200px] truncate">
                      {v.visitor_ua ? v.visitor_ua.split(' ')[0] : '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-500">
                      {new Date(v.created_at).toLocaleDateString('ru-RU', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Tab: Настройки ─────────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <div className="max-w-2xl space-y-5">
          {/* Basic info */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <h3 className="font-semibold text-gray-900">Основное</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Название</label>
              <input
                type="text"
                value={settingName}
                onChange={(e) => setSettingName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-2 focus:ring-[#6A55F8]/10"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Slug</label>
              <div className="flex items-center gap-0">
                <span className="px-3 py-2.5 bg-gray-50 border border-r-0 border-gray-200 rounded-l-lg text-sm text-gray-500">
                  studency.app/
                </span>
                <input
                  type="text"
                  value={settingSlug}
                  onChange={(e) => setSettingSlug(e.target.value)}
                  className="flex-1 px-3 py-2.5 border border-gray-200 rounded-r-lg text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-2 focus:ring-[#6A55F8]/10"
                />
              </div>
            </div>
          </div>

          {/* SEO */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <h3 className="font-semibold text-gray-900">SEO</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Meta Title</label>
              <input
                type="text"
                value={settingMetaTitle}
                onChange={(e) => setSettingMetaTitle(e.target.value)}
                placeholder="Заголовок страницы для поисковиков"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-2 focus:ring-[#6A55F8]/10"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Meta Description</label>
              <textarea
                value={settingMetaDesc}
                onChange={(e) => setSettingMetaDesc(e.target.value)}
                placeholder="Описание страницы для поисковиков (до 160 символов)"
                rows={3}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm resize-none focus:outline-none focus:border-[#6A55F8] focus:ring-2 focus:ring-[#6A55F8]/10"
              />
            </div>
          </div>

          {/* Funnel */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <h3 className="font-semibold text-gray-900">Связь с воронкой</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Воронка</label>
              <select
                value={settingFunnelId}
                onChange={(e) => setSettingFunnelId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#6A55F8] focus:ring-2 focus:ring-[#6A55F8]/10"
              >
                <option value="">Не выбрана</option>
                {funnels.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tracking toggles (placeholders) */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <h3 className="font-semibold text-gray-900">Трекинг</h3>
            {[
              { label: 'Google Analytics', sub: 'Подключите GA4' },
              { label: 'Facebook Pixel', sub: 'Конверсионные события' },
              { label: 'Яндекс.Метрика', sub: 'Вебвизор и цели' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">{item.label}</p>
                  <p className="text-xs text-gray-400">{item.sub}</p>
                </div>
                <div className="w-10 h-5.5 bg-gray-200 rounded-full relative cursor-not-allowed opacity-50" title="В разработке">
                  <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow" />
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className="px-6 py-2.5 bg-[#6A55F8] text-white text-sm font-medium rounded-lg hover:bg-[#5040D6] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Сохранение...' : 'Сохранить настройки'}
            </button>
            <button
              onClick={handleDeleteLanding}
              disabled={deletingLanding}
              className="px-4 py-2.5 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
            >
              {deletingLanding ? 'Удаление...' : 'Удалить лендинг'}
            </button>
          </div>
        </div>
      )}

      <AiAssistantOverlay
        isOpen={aiOpen}
        onClose={() => setAiOpen(false)}
        title="AI-редактор лендингов"
        placeholder="Опишите что добавить или изменить на лендинге..."
        initialMessages={[
          {
            from: 'ai',
            text: `Привет! Я помогу создать или улучшить лендинг «${landing.name}». Опишите что нужно сделать — сгенерирую HTML-код.`,
          },
        ]}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// LIST VIEW
// ═══════════════════════════════════════════════════════════════════════════
function LandingsList({
  projectId,
  onSelect,
  onLandingsLoaded,
}: {
  projectId: string
  onSelect: (l: Landing) => void
  onLandingsLoaded?: (landings: Landing[]) => void
}) {
  const [landings, setLandings] = useState<Landing[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadLandings()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadLandings() {
    setLoading(true)
    const { data } = await supabase
      .from('landings')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    const loaded = (data ?? []) as Landing[]
    setLandings(loaded)
    onLandingsLoaded?.(loaded)
    setLoading(false)
  }

  function autoSlug(name: string) {
    return name
      .toLowerCase()
      .replace(/[а-яё]/g, (c) => {
        const map: Record<string, string> = {
          а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',
          и:'i',й:'j',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',
          с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',
          ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
        }
        return map[c] ?? c
      })
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  async function handleCreate() {
    if (!newName.trim()) return
    const slug = newSlug.trim() || autoSlug(newName)
    const tempLanding: Landing = {
      id: 'temp-' + Date.now(),
      name: newName.trim(),
      slug,
      status: 'draft',
      html_content: null,
      meta_title: null,
      meta_description: null,
      funnel_id: null,
      visits: 0,
      conversions: 0,
      project_id: projectId,
      created_at: new Date().toISOString(),
    }
    setLandings((prev) => [tempLanding, ...prev])
    setNewName('')
    setNewSlug('')
    setCreating(false)
    setSaving(true)
    const { data } = await supabase
      .from('landings')
      .insert({
        project_id: projectId,
        name: tempLanding.name,
        slug,
        status: 'draft',
      })
      .select()
      .single()
    if (data) {
      setLandings((prev) => prev.map((l) => l.id === tempLanding.id ? data as Landing : l))
    }
    setSaving(false)
  }

  function handleUpdated(updated: Landing) {
    if (updated.id === '__deleted__') {
      setLandings((prev) => prev.filter((l) => l.id !== updated.id))
      loadLandings()
    } else {
      setLandings((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-gray-400">Загрузка сайтов...</div>
    )
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Сайты и лендинги</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Создавайте посадочные страницы и отслеживайте их эффективность
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#6A55F8] text-white text-sm font-medium rounded-xl hover:bg-[#5040D6] transition-colors shadow-sm shadow-[#6A55F8]/30"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Создать сайт
        </button>
      </div>

      {/* Inline create form */}
      {creating && (
        <div className="bg-white rounded-xl border border-[#6A55F8]/30 p-5 mb-5 shadow-sm">
          <p className="text-sm font-semibold text-gray-800 mb-4">Новый лендинг</p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Название</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value)
                  if (!newSlug) setNewSlug(autoSlug(e.target.value))
                }}
                placeholder="Лендинг для курса"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-2 focus:ring-[#6A55F8]/10"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Slug (URL)</label>
              <div className="flex items-center">
                <span className="px-3 py-2.5 bg-gray-50 border border-r-0 border-gray-200 rounded-l-lg text-xs text-gray-500 whitespace-nowrap">
                  studency.app/
                </span>
                <input
                  type="text"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value)}
                  placeholder="moi-lending"
                  className="flex-1 px-3 py-2.5 border border-gray-200 rounded-r-lg text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-2 focus:ring-[#6A55F8]/10"
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={saving || !newName.trim()}
              className="px-5 py-2.5 bg-[#6A55F8] text-white text-sm font-medium rounded-lg hover:bg-[#5040D6] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Создание...' : 'Создать'}
            </button>
            <button
              onClick={() => { setCreating(false); setNewName(''); setNewSlug('') }}
              className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {landings.length === 0 && !creating && (
        <div className="bg-white rounded-xl border border-gray-100 py-20 text-center">
          <div className="text-5xl mb-4">🌐</div>
          <p className="text-lg font-semibold text-gray-700 mb-1">Сайтов пока нет</p>
          <p className="text-sm text-gray-400 mb-6">
            Создайте первый лендинг для привлечения студентов
          </p>
          <button
            onClick={() => setCreating(true)}
            className="px-6 py-2.5 bg-[#6A55F8] text-white text-sm font-medium rounded-xl hover:bg-[#5040D6] transition-colors"
          >
            Создать первый сайт
          </button>
        </div>
      )}

      {/* Cards grid */}
      {landings.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {landings.map((landing) => (
            <button
              key={landing.id}
              onClick={() => onSelect(landing)}
              className="bg-white rounded-xl border border-gray-100 p-5 text-left hover:border-[#6A55F8]/40 hover:shadow-md transition-all group"
            >
              {/* Top row */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="w-10 h-10 rounded-xl bg-[#F0EDFF] flex items-center justify-center text-[#6A55F8] text-xl flex-shrink-0">
                  🌐
                </div>
                <StatusBadge status={landing.status} />
              </div>

              {/* Name */}
              <p className="font-semibold text-gray-900 mb-0.5 group-hover:text-[#6A55F8] transition-colors">
                {landing.name}
              </p>
              <p className="text-xs text-gray-400 mb-4 font-mono truncate">
                studency.app/{landing.slug}
              </p>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-50">
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-900">{landing.visits}</p>
                  <p className="text-xs text-gray-400">посещений</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-900">{landing.conversions}</p>
                  <p className="text-xs text-gray-400">конверсий</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ROOT PAGE
// ═══════════════════════════════════════════════════════════════════════════
export default function SitesPage() {
  const { id: projectId } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [landingsList, setLandingsList] = useState<Landing[]>([])

  const openLandingId = searchParams.get('open')
  const selectedLanding = openLandingId ? landingsList.find(l => l.id === openLandingId) ?? null : null

  function selectLanding(id: string) {
    const p = new URLSearchParams(searchParams.toString())
    p.set('open', id)
    router.push(`?${p.toString()}`, { scroll: false })
  }
  function clearSelection() {
    const p = new URLSearchParams(searchParams.toString())
    p.delete('open')
    router.push(`?${p.toString()}`, { scroll: false })
  }

  function handleBack(updated: Landing) {
    if (updated.id === '__deleted__') {
      clearSelection()
      setLandingsList((prev) => prev.filter((l) => l.id !== updated.id))
    } else {
      setLandingsList((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
      clearSelection()
    }
  }

  if (selectedLanding) {
    return (
      <div className="p-6">
        <LandingDetail
          landing={selectedLanding}
          onBack={handleBack}
          projectId={projectId}
        />
      </div>
    )
  }

  return (
    <div className="p-6">
      <LandingsList
        projectId={projectId}
        onSelect={(l) => selectLanding(l.id)}
        onLandingsLoaded={setLandingsList}
      />
    </div>
  )
}
