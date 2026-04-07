'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

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
  features: string | null
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

// ─── Product Detail ───────────────────────────────────────────────────────────

function ProductDetail({
  product,
  onBack,
  onDeleted,
  onUpdated,
}: {
  product: Product
  onBack: () => void
  onDeleted: () => void
  onUpdated: (p: Product) => void
}) {
  const supabase = createClient()
  const [tab, setTab] = useState<'tariffs' | 'analytics' | 'settings'>('tariffs')
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

  // Settings form
  const [editName, setEditName] = useState(product.name)
  const [editDesc, setEditDesc] = useState(product.description ?? '')
  const [savingSettings, setSavingSettings] = useState(false)
  const [deletingProduct, setDeletingProduct] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function loadTariffs() {
    setLoadingTariffs(true)
    const { data } = await supabase.from('tariffs').select('*').eq('product_id', product.id).order('price')
    if (data) setTariffs(data as Tariff[])
    setLoadingTariffs(false)
  }

  async function loadStats() {
    setLoadingStats(true)
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
    } else {
      await supabase.from('tariffs').insert({ product_id: product.id, name: tName.trim(), price: parseFloat(tPrice), features })
    }
    setTName(''); setTPrice(''); setTFeatures(['']); setShowTariffForm(false); setEditingTariffId(null)
    await loadTariffs()
    setSavingTariff(false)
  }

  function startEditTariff(t: Tariff) {
    setEditingTariffId(t.id)
    setTName(t.name)
    setTPrice(String(t.price))
    const feats = Array.isArray(t.features) ? t.features : []
    setTFeatures(feats.length > 0 ? feats : [''])
    setShowTariffForm(true)
  }

  async function deleteTariff(id: string) {
    // Check if any orders use this tariff
    const { count } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('tariff_id', id)
    if (count && count > 0) {
      alert(`Невозможно удалить тариф: ${count} заказ(ов) привязано. Сначала удалите или переназначьте заказы.`)
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
    { key: 'analytics', label: 'Аналитика' },
    { key: 'settings', label: 'Настройки' },
  ] as const

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

          {loadingTariffs ? (
            <div className="flex justify-center py-10">
              <div className="w-7 h-7 border-4 border-[#6A55F8] border-t-transparent rounded-full animate-spin" />
            </div>
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
                        <button onClick={() => startEditTariff(t)} className="text-xs text-[#6A55F8] font-medium border border-[#6A55F8]/30 rounded-lg px-2.5 py-1 hover:bg-[#F0EDFF]">
                          Редактировать
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
      {tab === 'analytics' && (
        <div className="space-y-4">
          <h3 className="font-semibold text-gray-900">Аналитика по тарифам</h3>
          {loadingStats ? (
            <div className="flex justify-center py-10">
              <div className="w-7 h-7 border-4 border-[#6A55F8] border-t-transparent rounded-full animate-spin" />
            </div>
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
  const projectId = params.id as string
  const supabase = createClient()
  const openProductId = searchParams.get('open')

  const [products, setProducts] = useState<Product[]>([])
  const [tariffCounts, setTariffCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<Product | null>(null)

  async function loadProducts() {
    setLoading(true)
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

  // Auto-open product from URL param
  useEffect(() => {
    if (openProductId && products.length > 0 && !selected) {
      const prod = products.find(p => p.id === openProductId)
      if (prod) setSelected(prod)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openProductId, products])

  async function createProduct() {
    if (!newName.trim()) return
    setCreating(true)
    const { data } = await supabase
      .from('products')
      .insert({ project_id: projectId, name: newName.trim() })
      .select()
      .single()
    setCreating(false)
    setNewName(''); setShowCreate(false)
    if (data) {
      setProducts(prev => [...prev, data as Product])
    }
  }

  function handleUpdated(updated: Product) {
    setProducts(prev => prev.map(p => p.id === updated.id ? updated : p))
    setSelected(updated)
  }

  function handleDeleted() {
    setProducts(prev => prev.filter(p => p.id !== selected?.id))
    setSelected(null)
  }

  if (selected) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <ProductDetail
          product={selected}
          onBack={() => setSelected(null)}
          onDeleted={handleDeleted}
          onUpdated={handleUpdated}
        />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Продукты</h1>
          <p className="text-sm text-gray-500 mt-0.5">{products.length} продукт{products.length === 1 ? '' : products.length < 5 ? 'а' : 'ов'}</p>
        </div>
        <button
          onClick={() => setShowCreate(v => !v)}
          className="px-4 py-2.5 rounded-xl text-sm font-medium text-white shadow-sm"
          style={{ backgroundColor: '#6A55F8' }}
        >
          + Создать продукт
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          <h3 className="font-semibold text-gray-900">Новый продукт</h3>
          <input
            type="text"
            placeholder="Название продукта"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createProduct()}
            autoFocus
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#6A55F8]"
          />
          <div className="flex gap-2">
            <button
              onClick={createProduct}
              disabled={creating || !newName.trim()}
              className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: '#6A55F8' }}
            >
              {creating ? 'Создаю...' : 'Создать'}
            </button>
            <button onClick={() => { setShowCreate(false); setNewName('') }} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Products grid */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-[#6A55F8] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <div className="text-4xl mb-3">📦</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Продуктов пока нет</h3>
          <p className="text-sm text-gray-500">Создайте первый продукт, нажав кнопку выше</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map(p => (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              className="text-left bg-white rounded-xl border border-gray-100 p-5 hover:border-[#8B7BFA] hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-bold"
                  style={{ backgroundColor: '#6A55F8' }}
                >
                  {p.name[0]?.toUpperCase()}
                </div>
                <svg className="w-4 h-4 text-gray-300 group-hover:text-[#6A55F8] transition-colors mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{p.name}</h3>
              {p.description && <p className="text-sm text-gray-500 mb-2 line-clamp-2">{p.description}</p>}
              <p className="text-xs text-gray-400">{pluralTariff(tariffCounts[p.id] ?? 0)}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
