'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { SkeletonList } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import ProductGroupsTab from '@/components/learning/ProductGroupsTab'

type Product = {
  id: string
  name: string
  description: string | null
  project_id: string
  created_at: string
}

type Tariff = {
  id: string
  product_id: string
  name: string
  price: number
  features: string | string[] | null
  order_position?: number
}

type OrderStat = {
  tariff_id: string
  tariff_name: string | null
  count: number
  revenue: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMoney(n: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n)
}

function pluralTariff(n: number) {
  if (n % 10 === 1 && n % 100 !== 11) return `${n} тариф`
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return `${n} тарифа`
  return `${n} тарифов`
}

// ─── Tariff Detail (настройки доступов) ──────────────────────────────────────

type AccessRule = { id: string; tariff_id: string; course_id: string | null; module_id: string | null; lesson_id: string | null; access_days: number | null }
type CourseOption = { id: string; name: string; modules: { id: string; name: string; lessons: { id: string; name: string }[] }[] }

function TariffDetail({ tariff, projectId, onBack }: { tariff: Tariff; projectId: string; onBack: () => void }) {
  const supabase = createClient()
  const [accessRules, setAccessRules] = useState<AccessRule[]>([])
  const [courses, setCourses] = useState<CourseOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [accessDaysValue, setAccessDaysValue] = useState('')
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set())

  // Set of checked lesson IDs
  const [checkedLessons, setCheckedLessons] = useState<Set<string>>(new Set())

  async function loadData() {
    const [accessRes, coursesRes] = await Promise.all([
      supabase.from('tariff_access').select('*').eq('tariff_id', tariff.id),
      supabase.from('courses').select('id, name').eq('project_id', projectId),
    ])
    const rules = (accessRes.data ?? []) as AccessRule[]
    setAccessRules(rules)

    // Load courses tree
    const rawCourses = (coursesRes.data ?? []) as { id: string; name: string }[]
    const withModules: CourseOption[] = await Promise.all(rawCourses.map(async (c) => {
      const { data: mods } = await supabase.from('course_modules').select('id, name').eq('course_id', c.id).order('order_position')
      const modules = await Promise.all((mods ?? []).map(async (m: { id: string; name: string }) => {
        const { data: lessons } = await supabase.from('course_lessons').select('id, name').eq('module_id', m.id).order('order_position')
        return { ...m, lessons: (lessons ?? []) as { id: string; name: string }[] }
      }))
      return { ...c, modules }
    }))
    setCourses(withModules)

    // Build checked set from existing rules
    const checked = new Set<string>()
    for (const rule of rules) {
      if (rule.lesson_id) {
        checked.add(rule.lesson_id)
      } else if (rule.module_id) {
        // Check all lessons in this module
        const course = withModules.find(c => c.id === rule.course_id)
        const mod = course?.modules.find(m => m.id === rule.module_id)
        mod?.lessons.forEach(l => checked.add(l.id))
      } else if (rule.course_id) {
        // Check all lessons in all modules
        const course = withModules.find(c => c.id === rule.course_id)
        course?.modules.forEach(m => m.lessons.forEach(l => checked.add(l.id)))
      }
      if (rule.access_days) setAccessDaysValue(String(rule.access_days))
    }
    setCheckedLessons(checked)
    // Expand courses that have checked lessons
    const expanded = new Set<string>()
    withModules.forEach(c => {
      if (c.modules.some(m => m.lessons.some(l => checked.has(l.id)))) expanded.add(c.id)
    })
    setExpandedCourses(expanded)
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData() }, [tariff.id])

  function toggleCourse(courseId: string) {
    setExpandedCourses(prev => {
      const next = new Set(prev)
      if (next.has(courseId)) next.delete(courseId); else next.add(courseId)
      return next
    })
  }

  function toggleAllModuleLessons(mod: { id: string; lessons: { id: string }[] }) {
    const allChecked = mod.lessons.every(l => checkedLessons.has(l.id))
    setCheckedLessons(prev => {
      const next = new Set(prev)
      mod.lessons.forEach(l => { if (allChecked) next.delete(l.id); else next.add(l.id) })
      return next
    })
  }

  function toggleLesson(lessonId: string) {
    setCheckedLessons(prev => {
      const next = new Set(prev)
      if (next.has(lessonId)) next.delete(lessonId); else next.add(lessonId)
      return next
    })
  }

  function selectAllCourse(course: CourseOption) {
    setCheckedLessons(prev => {
      const next = new Set(prev)
      const allChecked = course.modules.every(m => m.lessons.every(l => next.has(l.id)))
      course.modules.forEach(m => m.lessons.forEach(l => { if (allChecked) next.delete(l.id); else next.add(l.id) }))
      return next
    })
  }

  async function saveAccess() {
    setSaving(true)
    // Delete old rules
    await supabase.from('tariff_access').delete().eq('tariff_id', tariff.id)

    // Build new rules — group by module for efficiency
    const rules: { tariff_id: string; course_id: string; module_id: string | null; lesson_id: string | null; access_days: number | null }[] = []
    const days = accessDaysValue ? parseInt(accessDaysValue) : null

    for (const course of courses) {
      for (const mod of course.modules) {
        const checkedInMod = mod.lessons.filter(l => checkedLessons.has(l.id))
        if (checkedInMod.length === 0) continue

        if (checkedInMod.length === mod.lessons.length) {
          // All lessons checked → save as module access
          rules.push({ tariff_id: tariff.id, course_id: course.id, module_id: mod.id, lesson_id: null, access_days: days })
        } else {
          // Individual lessons
          for (const l of checkedInMod) {
            rules.push({ tariff_id: tariff.id, course_id: course.id, module_id: mod.id, lesson_id: l.id, access_days: days })
          }
        }
      }
    }

    if (rules.length > 0) {
      await supabase.from('tariff_access').insert(rules)
    }
    setSaving(false)
    loadData()
  }

  const totalChecked = checkedLessons.size

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-800">← Назад к тарифам</button>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Доступ: {tariff.name}</h2>
            <p className="text-xs text-gray-500">{tariff.price.toLocaleString('ru')} ₽ · {totalChecked} уроков выбрано</p>
          </div>
        </div>
        <button onClick={saveAccess} disabled={saving} className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          {saving ? 'Сохраняю...' : 'Сохранить'}
        </button>
      </div>

      {/* Access duration */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
        <span className="text-sm text-gray-700">Срок доступа:</span>
        <input type="number" value={accessDaysValue} onChange={e => setAccessDaysValue(e.target.value)} placeholder="∞"
          className="w-20 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-center focus:outline-none focus:border-[#6A55F8]" />
        <span className="text-xs text-gray-500">{accessDaysValue ? `дней (${Math.round(parseInt(accessDaysValue) / 30)} мес.)` : 'Бессрочно'}</span>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400 text-sm">Загрузка курсов...</div>
      ) : courses.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
          Нет курсов. Сначала создайте курс в разделе Обучение.
        </div>
      ) : (
        <div className="space-y-3">
          {courses.map(course => {
            const isExpanded = expandedCourses.has(course.id)
            const allLessons = course.modules.flatMap(m => m.lessons)
            const checkedCount = allLessons.filter(l => checkedLessons.has(l.id)).length
            const allChecked = allLessons.length > 0 && checkedCount === allLessons.length

            return (
              <div key={course.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {/* Course header */}
                <div className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => toggleCourse(course.id)}>
                  <button onClick={e => { e.stopPropagation(); selectAllCourse(course) }}
                    className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                      allChecked ? 'bg-[#6A55F8] text-white' : checkedCount > 0 ? 'bg-[#6A55F8]/30 text-white' : 'border-2 border-gray-300'
                    }`}>
                    {(allChecked || checkedCount > 0) && <span className="text-xs font-bold">✓</span>}
                  </button>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">🎓 {course.name}</p>
                    <p className="text-xs text-gray-400">{checkedCount}/{allLessons.length} уроков</p>
                  </div>
                  <span className="text-gray-400 text-sm">{isExpanded ? '▲' : '▼'}</span>
                </div>

                {/* Modules + Lessons */}
                {isExpanded && (
                  <div className="border-t border-gray-100">
                    {course.modules.map(mod => {
                      const modChecked = mod.lessons.filter(l => checkedLessons.has(l.id)).length
                      const modAllChecked = mod.lessons.length > 0 && modChecked === mod.lessons.length

                      return (
                        <div key={mod.id}>
                          {/* Module */}
                          <div className="flex items-center gap-3 px-5 py-3 bg-gray-50/50 border-b border-gray-50">
                            <button onClick={() => toggleAllModuleLessons(mod)}
                              className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                                modAllChecked ? 'bg-[#6A55F8] text-white' : modChecked > 0 ? 'bg-[#6A55F8]/30 text-white' : 'border-2 border-gray-300'
                              }`}>
                              {(modAllChecked || modChecked > 0) && <span className="text-xs font-bold">✓</span>}
                            </button>
                            <p className="text-sm font-medium text-gray-700">{mod.name}</p>
                            <span className="text-xs text-gray-400">{modChecked}/{mod.lessons.length}</span>
                          </div>

                          {/* Lessons */}
                          {mod.lessons.map(lesson => (
                            <div key={lesson.id} className="flex items-center gap-3 px-5 py-2.5 pl-12 border-b border-gray-50 last:border-0 hover:bg-[#F8F7FF] transition-colors cursor-pointer"
                              onClick={() => toggleLesson(lesson.id)}>
                              <button className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                                checkedLessons.has(lesson.id) ? 'bg-[#6A55F8] text-white' : 'border-2 border-gray-300'
                              }`}>
                                {checkedLessons.has(lesson.id) && <span className="text-[9px] font-bold">✓</span>}
                              </button>
                              <p className="text-sm text-gray-600">{lesson.name}</p>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Product Detail ───────────────────────────────────────────────────────────

function ProductDetail({
  product,
  onBack,
  onDeleted,
  onUpdated,
  onDuplicate,
}: {
  product: Product
  onBack: () => void
  onDeleted: () => void
  onUpdated: (p: Product) => void
  onDuplicate?: () => void
}) {
  const supabase = createClient()
  const [tab, setTab] = useState<'tariffs' | 'groups' | 'analytics' | 'settings'>('tariffs')
  const [tariffs, setTariffs] = useState<Tariff[]>([])
  const [stats, setStats] = useState<OrderStat[]>([])
  const [loadingTariffs, setLoadingTariffs] = useState(true)
  const [loadingStats, setLoadingStats] = useState(false)

  // Tariff form
  const [showTariffForm, setShowTariffForm] = useState(false)
  const [tName, setTName] = useState('')
  const [tPrice, setTPrice] = useState('')
  const [tFeatures, setTFeatures] = useState<string[]>([''])
  const [savingTariff, setSavingTariff] = useState(false)
  const [editingTariffId, setEditingTariffId] = useState<string | null>(null)
  const [accessTariff, setAccessTariff] = useState<Tariff | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const detailParams = useParams()
  const projectId = detailParams.id as string

  // Settings form
  const [editName, setEditName] = useState(product.name)
  const [editDesc, setEditDesc] = useState(product.description ?? '')
  const [savingSettings, setSavingSettings] = useState(false)
  const [deletingProduct, setDeletingProduct] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function loadTariffs() {
    const { data } = await supabase.from('tariffs').select('*').eq('product_id', product.id).order('price')
    if (data) setTariffs(data as Tariff[])
    setLoadingTariffs(false)
  }

  async function loadStats() {
    const { data } = await supabase
      .from('orders')
      .select('tariff_id, amount')
      .eq('product_id', product.id)
      .not('tariff_id', 'is', null)

    if (data) {
      const map: Record<string, OrderStat> = {}
      for (const row of data as { tariff_id: string; amount: number }[]) {
        if (!map[row.tariff_id]) {
          const t = tariffs.find(t => t.id === row.tariff_id)
          map[row.tariff_id] = { tariff_id: row.tariff_id, tariff_name: t?.name ?? null, count: 0, revenue: 0 }
        }
        map[row.tariff_id].count++
        map[row.tariff_id].revenue += row.amount
      }
      setStats(Object.values(map).sort((a, b) => b.revenue - a.revenue))
    }
    setLoadingStats(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadTariffs() }, [product.id])

  useEffect(() => {
    if (tab === 'analytics') loadStats()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  async function saveTariff() {
    if (!tName.trim() || !tPrice) return
    setSavingTariff(true)
    const features = tFeatures.filter(f => f.trim()).map(f => f.trim())
    if (editingTariffId) {
      await supabase.from('tariffs').update({ name: tName.trim(), price: parseFloat(tPrice), features }).eq('id', editingTariffId)
      setTariffs(prev => prev.map(t => t.id === editingTariffId ? { ...t, name: tName.trim(), price: parseFloat(tPrice), features } : t))
      setTName(''); setTPrice(''); setTFeatures(['']); setShowTariffForm(false); setEditingTariffId(null)
      setSavingTariff(false)
    } else {
      const tempTariff: Tariff = {
        id: 'temp-' + Date.now(),
        product_id: product.id,
        name: tName.trim(),
        price: parseFloat(tPrice),
        features,
      }
      setTariffs(prev => [...prev, tempTariff])
      setTName(''); setTPrice(''); setTFeatures(['']); setShowTariffForm(false); setEditingTariffId(null)
      const { data } = await supabase.from('tariffs').insert({ product_id: product.id, name: tempTariff.name, price: tempTariff.price, features }).select().single()
      if (data) {
        setTariffs(prev => prev.map(t => t.id === tempTariff.id ? data as Tariff : t))
      }
      setSavingTariff(false)
    }
  }

  function startEditTariff(t: Tariff) {
    setEditingTariffId(t.id)
    setTName(t.name)
    setTPrice(String(t.price))
    const feats = Array.isArray(t.features) ? t.features : []
    setTFeatures(feats.length > 0 ? feats : [''])
    setShowTariffForm(true)
  }

  async function duplicateTariff(t: Tariff) {
    const features = Array.isArray(t.features) ? t.features : []
    const { data: newTariff } = await supabase.from('tariffs').insert({
      product_id: product.id,
      name: `${t.name} (копия)`,
      price: t.price,
      features,
      order_position: tariffs.length,
    }).select().single()

    // Copy access rules
    if (newTariff) {
      const { data: accessRules } = await supabase.from('tariff_access').select('*').eq('tariff_id', t.id)
      if (accessRules && accessRules.length > 0) {
        await supabase.from('tariff_access').insert(
          accessRules.map((r: Record<string, unknown>) => ({
            tariff_id: newTariff.id,
            course_id: r.course_id,
            module_id: r.module_id,
            lesson_id: r.lesson_id,
            access_days: r.access_days,
          }))
        )
      }
    }
    loadTariffs()
  }

  async function deleteTariff(id: string) {
    // Check if any orders use this tariff
    const { count } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('tariff_id', id)
    if (count && count > 0) {
      setDeleteError(`Невозможно удалить тариф: ${count} заказ(ов) привязано. Сначала удалите или переназначьте заказы.`)
      setTimeout(() => setDeleteError(''), 3000)
      return
    }
    await supabase.from('tariffs').delete().eq('id', id)
    setTariffs(prev => prev.filter(t => t.id !== id))
  }

  async function saveSettings() {
    if (!editName.trim()) return
    setSavingSettings(true)
    const { data } = await supabase
      .from('products')
      .update({ name: editName.trim(), description: editDesc.trim() || null })
      .eq('id', product.id)
      .select()
      .single()
    if (data) onUpdated(data as Product)
    setSavingSettings(false)
  }

  async function deleteProduct() {
    setDeletingProduct(true)
    await supabase.from('products').delete().eq('id', product.id)
    onDeleted()
  }

  const tabs = [
    { key: 'tariffs', label: 'Тарифы' },
    { key: 'groups', label: 'Группы и кураторы' },
    { key: 'analytics', label: 'Аналитика' },
    { key: 'settings', label: 'Настройки' },
  ] as const

  if (accessTariff) {
    return <TariffDetail tariff={accessTariff} projectId={projectId} onBack={() => { setAccessTariff(null); loadTariffs() }} />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Назад к продуктам
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <h2 className="text-xl font-semibold text-gray-900">{product.name}</h2>
        {product.description && <p className="text-sm text-gray-500 mt-1">{product.description}</p>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={tab === t.key ? { backgroundColor: '#6A55F8', color: 'white' } : { color: '#64748B' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Тарифы */}
      {tab === 'tariffs' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-gray-900">Тарифы</h3>
            <button
              onClick={() => setShowTariffForm(v => !v)}
              className="text-sm font-medium px-3 py-1.5 rounded-lg text-white"
              style={{ backgroundColor: '#6A55F8' }}
            >
              + Добавить тариф
            </button>
          </div>

          {showTariffForm && (
            <div className="bg-white rounded-xl border border-[#6A55F8]/30 p-5 shadow-sm space-y-4">
              <h4 className="text-sm font-semibold text-gray-900">{editingTariffId ? 'Редактировать тариф' : 'Новый тариф'}</h4>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Название</label>
                  <input type="text" placeholder="Например: Базовый" value={tName} onChange={e => setTName(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#6A55F8]" />
                </div>
                <div className="w-40">
                  <label className="block text-xs text-gray-500 mb-1">Цена, ₽</label>
                  <input type="number" placeholder="2990" value={tPrice} onChange={e => setTPrice(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#6A55F8]" />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-2">Что входит в тариф (каждый пункт отдельно)</label>
                <div className="space-y-2">
                  {tFeatures.map((feat, idx) => {
                    const isStruck = feat.startsWith('~') && feat.endsWith('~') && feat.length > 2
                    const rawText = isStruck ? feat.slice(1, -1) : feat
                    return (
                      <div key={idx} className="flex items-center gap-2">
                        <button onClick={() => {
                          const updated = [...tFeatures]
                          if (isStruck) { updated[idx] = rawText } else { updated[idx] = `~${rawText}~` }
                          setTFeatures(updated)
                        }} className={`w-6 h-6 rounded flex items-center justify-center text-sm flex-shrink-0 transition-colors ${isStruck ? 'bg-red-100 text-red-500' : 'bg-green-100 text-green-600'}`}
                          title={isStruck ? 'Включить пункт' : 'Зачеркнуть пункт'}>
                          {isStruck ? '✗' : '✓'}
                        </button>
                        <input type="text" value={rawText} onChange={e => {
                          const updated = [...tFeatures]
                          updated[idx] = isStruck ? `~${e.target.value}~` : e.target.value
                          setTFeatures(updated)
                        }} placeholder={`Пункт ${idx + 1}`}
                          className={`flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#6A55F8] ${isStruck ? 'line-through text-gray-400' : ''}`} />
                        {tFeatures.length > 1 && (
                          <button onClick={() => setTFeatures(prev => prev.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-500 text-sm">✕</button>
                        )}
                      </div>
                    )
                  })}
                  <button onClick={() => setTFeatures(prev => [...prev, ''])} className="text-xs text-[#6A55F8] font-medium hover:underline">
                    + Добавить пункт
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={saveTariff} disabled={savingTariff || !tName.trim() || !tPrice}
                  className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                  {savingTariff ? 'Сохраняю...' : editingTariffId ? 'Сохранить изменения' : 'Создать тариф'}
                </button>
                <button onClick={() => { setShowTariffForm(false); setEditingTariffId(null); setTName(''); setTPrice(''); setTFeatures(['']) }}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Отмена</button>
              </div>
            </div>
          )}

          {deleteError && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">{deleteError}</p>
          )}

          {loadingTariffs ? (
            <SkeletonList count={3} />
          ) : tariffs.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
              <div className="text-3xl mb-2">💰</div>
              <p className="text-gray-600 font-medium">Тарифов пока нет</p>
              <p className="text-sm text-gray-400 mt-1">Добавьте первый тариф, нажав кнопку выше</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tariffs.map(t => {
                const feats = Array.isArray(t.features) ? t.features : []
                return (
                  <div key={t.id} className="bg-white rounded-xl border border-gray-100 p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <h4 className="font-semibold text-gray-900">{t.name}</h4>
                        <span className="text-lg font-bold text-[#6A55F8]">{formatMoney(t.price)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setAccessTariff(t)} className="text-xs text-green-600 font-medium border border-green-300 rounded-lg px-2.5 py-1 hover:bg-green-50">
                          Настроить доступ
                        </button>
                        <button onClick={() => startEditTariff(t)} className="text-xs text-[#6A55F8] font-medium border border-[#6A55F8]/30 rounded-lg px-2.5 py-1 hover:bg-[#F0EDFF]">
                          Редактировать
                        </button>
                        <button onClick={() => duplicateTariff(t)} className="text-xs text-gray-500 font-medium border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50">
                          Дублировать
                        </button>
                        <button onClick={() => deleteTariff(t.id)} className="text-xs text-gray-300 hover:text-red-500">✕</button>
                      </div>
                    </div>
                    {feats.length > 0 && (
                      <div className="space-y-1.5">
                        {feats.map((f: string, i: number) => {
                          const isStrikethrough = f.startsWith('~') && f.endsWith('~')
                          const text = isStrikethrough ? f.slice(1, -1) : f
                          return (
                            <div key={i} className="flex items-center gap-2">
                              {isStrikethrough ? (
                                <>
                                  <span className="text-red-400 text-sm">✗</span>
                                  <span className="text-sm text-gray-400 line-through">{text}</span>
                                </>
                              ) : (
                                <>
                                  <span className="text-green-500 text-sm">✓</span>
                                  <span className="text-sm text-gray-700">{f}</span>
                                </>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Аналитика */}
      {tab === 'groups' && (
        <ProductGroupsTab productId={product.id} projectId={projectId} />
      )}

      {tab === 'analytics' && (
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-900">Аналитика по тарифам</h3>
          {loadingStats ? (
            <SkeletonList count={3} />
          ) : stats.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
              <div className="text-3xl mb-2">📊</div>
              <p className="text-gray-600 font-medium">Заказов пока нет</p>
              <p className="text-sm text-gray-400 mt-1">Статистика появится после первых продаж</p>
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <p className="text-sm text-gray-400 mb-1">Всего заказов</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.reduce((s, r) => s + r.count, 0)}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <p className="text-sm text-gray-400 mb-1">Общая выручка</p>
                  <p className="text-2xl font-bold" style={{ color: '#6A55F8' }}>
                    {formatMoney(stats.reduce((s, r) => s + r.revenue, 0))}
                  </p>
                </div>
              </div>

              {/* Per-tariff */}
              <div className="space-y-3">
                {stats.map(s => (
                  <div key={s.tariff_id} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{s.tariff_name ?? 'Тариф'}</p>
                      <p className="text-sm text-gray-400">{s.count} заказ{s.count === 1 ? '' : s.count < 5 ? 'а' : 'ов'}</p>
                    </div>
                    <p className="text-lg font-semibold" style={{ color: '#6A55F8' }}>{formatMoney(s.revenue)}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab: Настройки */}
      {tab === 'settings' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Редактировать продукт</h3>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Название</label>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#6A55F8]"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Описание</label>
              <textarea
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#6A55F8] resize-none"
              />
            </div>
            <button
              onClick={saveSettings}
              disabled={savingSettings || !editName.trim()}
              className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: '#6A55F8' }}
            >
              {savingSettings ? 'Сохраняю...' : 'Сохранить изменения'}
            </button>
          </div>

          {/* Duplicate */}
          {onDuplicate && (
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Дублировать продукт</h3>
              <p className="text-sm text-gray-500 mb-4">Создаст копию продукта со всеми тарифами и настройками доступа.</p>
              <button onClick={onDuplicate} className="px-4 py-2 rounded-lg text-sm font-medium text-[#6A55F8] border border-[#6A55F8]/30 hover:bg-[#F0EDFF]">
                📋 Дублировать продукт
              </button>
            </div>
          )}

          {/* Danger zone */}
          <div className="bg-white rounded-xl border border-red-100 p-6">
            <h3 className="font-semibold text-red-600 mb-2">Удалить продукт</h3>
            <p className="text-sm text-gray-500 mb-4">Это действие нельзя отменить. Все тарифы и связанные данные будут удалены.</p>
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} className="px-4 py-2 rounded-lg text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50">
                Удалить продукт
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={deleteProduct}
                  disabled={deletingProduct}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-50"
                >
                  {deletingProduct ? 'Удаляю...' : 'Да, удалить'}
                </button>
                <button onClick={() => setConfirmDelete(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                  Отмена
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const projectId = params.id as string
  const supabase = createClient()
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null)
  const urlProductId = searchParams.get('open')
  const openProductId = localSelectedId ?? urlProductId

  const [products, setProducts] = useState<Product[]>([])
  const [tariffCounts, setTariffCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const selected = openProductId ? products.find(p => p.id === openProductId) ?? null : null

  function selectProduct(id: string) {
    setLocalSelectedId(id)
    const p = new URLSearchParams(searchParams.toString())
    p.set('open', id)
    router.replace(`?${p.toString()}`, { scroll: false })
  }
  function clearSelection() {
    setLocalSelectedId(null)
    const p = new URLSearchParams(searchParams.toString())
    p.delete('open')
    router.replace(`?${p.toString()}`, { scroll: false })
  }

  async function loadProducts() {
    const { data } = await supabase.from('products').select('*').eq('project_id', projectId).order('created_at')
    if (data) {
      const prods = data as Product[]
      setProducts(prods)

      if (prods.length > 0) {
        const { data: tData } = await supabase
          .from('tariffs')
          .select('product_id')
          .in('product_id', prods.map(p => p.id))

        const counts: Record<string, number> = {}
        for (const t of (tData ?? []) as { product_id: string }[]) {
          counts[t.product_id] = (counts[t.product_id] ?? 0) + 1
        }
        setTariffCounts(counts)
      }
    }
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadProducts() }, [projectId])

  async function createProduct() {
    if (!newName.trim()) return
    const tempProduct: Product = {
      id: 'temp-' + Date.now(),
      name: newName.trim(),
      description: null,
      project_id: projectId,
      created_at: new Date().toISOString(),
    }
    setProducts(prev => [...prev, tempProduct])
    setNewName(''); setShowCreate(false)
    setCreating(true)
    const { data } = await supabase
      .from('products')
      .insert({ project_id: projectId, name: tempProduct.name })
      .select()
      .single()
    setCreating(false)
    if (data) {
      setProducts(prev => prev.map(p => p.id === tempProduct.id ? data as Product : p))
    }
  }

  function handleUpdated(updated: Product) {
    setProducts(prev => prev.map(p => p.id === updated.id ? updated : p))
  }

  function handleDeleted() {
    setProducts(prev => prev.filter(p => p.id !== selected?.id))
    clearSelection()
  }

  async function duplicateProduct(product: Product) {
    // Create product copy
    const { data: newProduct } = await supabase.from('products').insert({
      project_id: projectId,
      name: `${product.name} (копия)`,
      description: product.description,
    }).select().single()

    if (newProduct) {
      // Copy tariffs
      const { data: oldTariffs } = await supabase.from('tariffs').select('*').eq('product_id', product.id)
      if (oldTariffs) {
        for (const t of oldTariffs as Tariff[]) {
          const { data: newTariff } = await supabase.from('tariffs').insert({
            product_id: newProduct.id,
            name: t.name,
            price: t.price,
            features: t.features,
            order_position: t.order_position,
          }).select().single()

          // Copy access rules for each tariff
          if (newTariff) {
            const { data: accessRules } = await supabase.from('tariff_access').select('*').eq('tariff_id', t.id)
            if (accessRules && accessRules.length > 0) {
              await supabase.from('tariff_access').insert(
                accessRules.map((r: Record<string, unknown>) => ({
                  tariff_id: newTariff.id,
                  course_id: r.course_id,
                  module_id: r.module_id,
                  lesson_id: r.lesson_id,
                  access_days: r.access_days,
                }))
              )
            }
          }
        }
      }
      loadProducts()
      selectProduct(newProduct.id)
    }
  }

  if (selected) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <ProductDetail
          product={selected}
          onBack={clearSelection}
          onDeleted={handleDeleted}
          onUpdated={handleUpdated}
          onDuplicate={() => duplicateProduct(selected)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Продукты</h1>
          <p className="text-sm text-gray-500 mt-0.5">{products.length} продукт{products.length === 1 ? '' : products.length < 5 ? 'а' : 'ов'}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-[#6A55F8] hover:bg-[#5040D6] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          + Создать продукт
        </button>
      </div>

      <Modal
        isOpen={showCreate}
        onClose={() => { setShowCreate(false); setNewName('') }}
        title="Новый продукт"
        subtitle="Название — остальное настроишь после создания"
        maxWidth="md"
        footer={
          <>
            <button onClick={() => { setShowCreate(false); setNewName('') }}
              className="px-3 py-2 text-sm text-gray-500 rounded-lg hover:bg-gray-100">
              Отмена
            </button>
            <button
              onClick={createProduct}
              disabled={creating || !newName.trim()}
              className="px-4 py-2 text-sm font-semibold bg-[#6A55F8] text-white rounded-lg hover:bg-[#5845e0] disabled:opacity-50"
            >
              {creating ? 'Создаю...' : 'Создать продукт'}
            </button>
          </>
        }
      >
        <div className="p-5">
          <label className="block text-xs font-medium text-gray-700 mb-1">Название</label>
          <input
            type="text"
            placeholder="Например, «Курс по AI-маркетингу»"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) createProduct() }}
            autoFocus
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#6A55F8] focus:ring-2 focus:ring-[#6A55F8]/10"
          />
        </div>
      </Modal>

      {/* Products grid */}
      {loading ? (
        <SkeletonList count={3} />
      ) : products.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-3">📦</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Продуктов пока нет</h3>
          <p className="text-sm text-gray-500">Создайте первый продукт, нажав кнопку выше</p>
        </div>
      ) : (
        <div className="space-y-2">
          {products.map(p => {
            const tariffCount = tariffCounts[p.id] ?? 0
            return (
              <button
                key={p.id}
                onClick={() => selectProduct(p.id)}
                className="w-full bg-white rounded-xl border border-gray-100 p-4 text-left transition-all group flex items-center gap-4 hover:border-[#6A55F8]/40 hover:shadow-md"
              >
                <div className="w-11 h-11 rounded-xl bg-[#F0EDFF] flex items-center justify-center text-[#6A55F8] text-xl flex-shrink-0">📦</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate group-hover:text-[#6A55F8] transition-colors">{p.name}</p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {p.description ? p.description : pluralTariff(tariffCount)}
                  </p>
                </div>
                <div className="hidden sm:flex items-center gap-6 flex-shrink-0">
                  <div className="text-center">
                    <p className="text-base font-bold text-gray-900 leading-tight">{tariffCount}</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">тарифов</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <svg className="w-4 h-4 text-gray-300 group-hover:text-[#6A55F8] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
