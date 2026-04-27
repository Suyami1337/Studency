'use client'

import { useEffect, useRef, useState } from 'react'
import {
  COLUMNS, ColumnDef, ColumnId, DEFAULT_VISIBLE_COLUMNS, DEFAULT_SORT,
  FILTER_FIELDS, FilterField, FilterCondition, Segment, SortDirection,
} from '@/lib/users/config'

type Props = {
  segments: Segment[]
  activeSegmentId: string | null
  isDirty: boolean
  filters: FilterCondition[]
  visibleColumns: ColumnId[]
  sort: { column: ColumnId; direction: SortDirection }
  onChangeFilters: (f: FilterCondition[]) => void
  onChangeColumns: (c: ColumnId[]) => void
  onChangeSort: (s: { column: ColumnId; direction: SortDirection }) => void
  onSelectSegment: (id: string | null) => void
  onSaveCurrent: () => void
  onSaveAsNew: () => void
  onResetToSegment: () => void
  onDeleteSegment: (id: string) => void
  onRenameSegment: (id: string, name: string) => void
}

export default function FiltersBar({
  segments, activeSegmentId, isDirty,
  filters, visibleColumns, sort,
  onChangeFilters, onChangeColumns, onChangeSort,
  onSelectSegment, onSaveCurrent, onSaveAsNew, onResetToSegment,
  onDeleteSegment, onRenameSegment,
}: Props) {
  const [showAddFilter, setShowAddFilter] = useState(false)
  const [showColumns, setShowColumns] = useState(false)
  const [showSort, setShowSort] = useState(false)
  const [showSegmentMenu, setShowSegmentMenu] = useState(false)
  const segmentBtnRef = useRef<HTMLDivElement>(null)
  const addBtnRef = useRef<HTMLDivElement>(null)
  const colsBtnRef = useRef<HTMLDivElement>(null)
  const sortBtnRef = useRef<HTMLDivElement>(null)

  // Close popovers on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as Node
      if (showSegmentMenu && segmentBtnRef.current && !segmentBtnRef.current.contains(target)) setShowSegmentMenu(false)
      if (showAddFilter && addBtnRef.current && !addBtnRef.current.contains(target)) setShowAddFilter(false)
      if (showColumns && colsBtnRef.current && !colsBtnRef.current.contains(target)) setShowColumns(false)
      if (showSort && sortBtnRef.current && !sortBtnRef.current.contains(target)) setShowSort(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showSegmentMenu, showAddFilter, showColumns, showSort])

  function addFilter(fieldId: string) {
    const def = FILTER_FIELDS.find(f => f.id === fieldId)!
    const initial: FilterCondition['value'] =
      def.type === 'boolean' ? true :
      def.type === 'multiselect' ? [] :
      def.type === 'date_range' ? {} :
      def.type === 'number_range' ? {} :
      def.type === 'tag' ? [] :
      ''
    onChangeFilters([...filters, { field: fieldId, value: initial }])
    setShowAddFilter(false)
  }

  function updateFilter(idx: number, value: FilterCondition['value']) {
    const next = [...filters]
    next[idx] = { ...next[idx], value }
    onChangeFilters(next)
  }

  function removeFilter(idx: number) {
    onChangeFilters(filters.filter((_, i) => i !== idx))
  }

  const activeSegment = segments.find(s => s.id === activeSegmentId)
  const sortableColumns: ColumnDef[] = COLUMNS.filter(c => c.sortable)

  return (
    <div className="space-y-3">
      {/* Сегменты pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => onSelectSegment(null)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            activeSegmentId === null
              ? 'bg-[#6A55F8] text-white'
              : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-300'
          }`}
        >
          Все пользователи
        </button>
        {segments.map(s => (
          <button
            key={s.id}
            onClick={() => onSelectSegment(s.id)}
            className={`group px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${
              activeSegmentId === s.id
                ? 'bg-[#6A55F8] text-white'
                : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-300'
            }`}
          >
            <span>{s.name}</span>
          </button>
        ))}
        <div className="relative" ref={segmentBtnRef}>
          <button
            onClick={() => setShowSegmentMenu(v => !v)}
            className="px-3 py-1.5 rounded-full text-sm font-medium bg-white border border-dashed border-gray-300 text-gray-500 hover:text-gray-800 hover:border-gray-400"
            title="Сохранить текущие фильтры как сегмент"
          >
            + Сохранить как сегмент
          </button>
          {showSegmentMenu && (
            <div className="absolute z-30 left-0 top-full mt-1 w-64 bg-white rounded-xl border border-gray-100 shadow-xl p-2 space-y-1">
              <button
                onClick={() => { onSaveAsNew(); setShowSegmentMenu(false) }}
                className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-gray-50"
              >
                ✚ Сохранить как новый сегмент
              </button>
              {activeSegment && (
                <>
                  <button
                    onClick={() => { onSaveCurrent(); setShowSegmentMenu(false) }}
                    disabled={!isDirty}
                    className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-40"
                  >
                    💾 Перезаписать «{activeSegment.name}»
                  </button>
                  <button
                    onClick={() => {
                      const newName = window.prompt('Новое имя сегмента:', activeSegment.name)
                      if (newName && newName.trim()) onRenameSegment(activeSegment.id, newName.trim())
                      setShowSegmentMenu(false)
                    }}
                    className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-gray-50"
                  >
                    ✏️ Переименовать «{activeSegment.name}»
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Удалить сегмент «${activeSegment.name}»?`)) {
                        onDeleteSegment(activeSegment.id)
                      }
                      setShowSegmentMenu(false)
                    }}
                    className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-red-50 text-red-600"
                  >
                    🗑 Удалить «{activeSegment.name}»
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {isDirty && activeSegmentId !== null && (
          <span className="ml-2 inline-flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Не сохранено
            <button onClick={onResetToSegment} className="ml-1 underline hover:no-underline">сбросить</button>
          </span>
        )}
      </div>

      {/* Чипы фильтров + кнопки настройки */}
      <div className="flex items-center gap-2 flex-wrap">
        {filters.map((f, i) => {
          const def = FILTER_FIELDS.find(x => x.id === f.field)
          if (!def) return null
          return (
            <FilterChip
              key={`${f.field}-${i}`}
              def={def}
              value={f.value}
              onChange={v => updateFilter(i, v)}
              onRemove={() => removeFilter(i)}
            />
          )
        })}

        <div className="relative" ref={addBtnRef}>
          <button
            onClick={() => setShowAddFilter(v => !v)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-dashed border-gray-300 text-gray-500 hover:text-gray-800 hover:border-gray-400"
          >
            + Добавить фильтр
          </button>
          {showAddFilter && (
            <div className="absolute z-30 left-0 top-full mt-1 w-64 bg-white rounded-xl border border-gray-100 shadow-xl p-1 max-h-80 overflow-y-auto">
              {FILTER_FIELDS.map(f => (
                <button
                  key={f.id}
                  onClick={() => addFilter(f.id)}
                  className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-gray-50"
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative" ref={sortBtnRef}>
            <button
              onClick={() => setShowSort(v => !v)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:border-gray-300 flex items-center gap-1.5"
              title="Сортировка"
            >
              ↕ {COLUMNS.find(c => c.id === sort.column)?.label ?? 'Сортировка'}
              <span className="text-gray-400">{sort.direction === 'asc' ? '↑' : '↓'}</span>
            </button>
            {showSort && (
              <div className="absolute z-30 right-0 top-full mt-1 w-64 bg-white rounded-xl border border-gray-100 shadow-xl p-1 max-h-80 overflow-y-auto">
                {sortableColumns.map(c => (
                  <button
                    key={c.id}
                    onClick={() => {
                      const dir: SortDirection =
                        sort.column === c.id ? (sort.direction === 'asc' ? 'desc' : 'asc') : 'desc'
                      onChangeSort({ column: c.id, direction: dir })
                      setShowSort(false)
                    }}
                    className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-gray-50 flex items-center justify-between"
                  >
                    <span>{c.label}</span>
                    {sort.column === c.id && (
                      <span className="text-[#6A55F8]">{sort.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative" ref={colsBtnRef}>
            <button
              onClick={() => setShowColumns(v => !v)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:border-gray-300"
              title="Настройка колонок"
            >
              ⚙ Колонки ({visibleColumns.length})
            </button>
            {showColumns && (
              <div className="absolute z-30 right-0 top-full mt-1 w-80 bg-white rounded-xl border border-gray-100 shadow-xl p-2">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 pt-1 pb-1.5">Видимые (можно перетаскивать порядок)</div>
                <div className="max-h-72 overflow-y-auto">
                  {visibleColumns.map((colId, idx) => {
                    const c = COLUMNS.find(x => x.id === colId)
                    if (!c) return null
                    function moveCol(direction: -1 | 1) {
                      const target = idx + direction
                      if (target < 0 || target >= visibleColumns.length) return
                      const next = [...visibleColumns]
                      ;[next[idx], next[target]] = [next[target], next[idx]]
                      onChangeColumns(next)
                    }
                    function hideCol() {
                      onChangeColumns(visibleColumns.filter(x => x !== colId))
                    }
                    return (
                      <div key={colId} className="group flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-gray-50 text-sm">
                        <span className="flex-1 truncate">{c.label}</span>
                        <button
                          onClick={() => moveCol(-1)}
                          disabled={idx === 0}
                          className="text-xs text-gray-400 hover:text-[#6A55F8] disabled:opacity-30 px-1 leading-none"
                          title="Выше"
                        >▲</button>
                        <button
                          onClick={() => moveCol(1)}
                          disabled={idx === visibleColumns.length - 1}
                          className="text-xs text-gray-400 hover:text-[#6A55F8] disabled:opacity-30 px-1 leading-none"
                          title="Ниже"
                        >▼</button>
                        <button
                          onClick={hideCol}
                          className="text-xs text-gray-400 hover:text-red-500 px-1.5 ml-1"
                          title="Скрыть"
                        >✕</button>
                      </div>
                    )
                  })}
                </div>

                {COLUMNS.some(c => !visibleColumns.includes(c.id)) && (
                  <>
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 pt-3 pb-1.5 border-t border-gray-100 mt-2">Скрытые</div>
                    <div className="max-h-48 overflow-y-auto">
                      {COLUMNS.filter(c => !visibleColumns.includes(c.id)).map(c => (
                        <button
                          key={c.id}
                          onClick={() => onChangeColumns([...visibleColumns, c.id])}
                          className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 text-sm text-gray-600"
                        >
                          <span className="text-gray-400">+</span>
                          <span>{c.label}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                <div className="border-t border-gray-100 mt-2 pt-2 px-2">
                  <button
                    onClick={() => onChangeColumns(DEFAULT_VISIBLE_COLUMNS)}
                    className="text-xs text-gray-500 hover:text-gray-800"
                  >
                    Вернуть по умолчанию
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Filter chip ───
function FilterChip({
  def, value, onChange, onRemove,
}: {
  def: FilterField
  value: FilterCondition['value']
  onChange: (v: FilterCondition['value']) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function valueLabel(): string {
    switch (def.type) {
      case 'boolean':     return value === true ? 'да' : value === false ? 'нет' : '—'
      case 'multiselect': {
        const arr = Array.isArray(value) ? value : []
        if (arr.length === 0) return '— любое'
        const labels = arr.map(v => def.options?.find(o => o.value === v)?.label ?? v)
        return labels.join(', ')
      }
      case 'tag': {
        const arr = Array.isArray(value) ? value : []
        return arr.length === 0 ? '—' : arr.join(', ')
      }
      case 'text':        return ((value as string) || '').slice(0, 24) || '—'
      case 'date_range':  {
        const v = value as { from?: string; to?: string } | null
        if (!v || (!v.from && !v.to)) return '—'
        return `${v.from || '…'} → ${v.to || '…'}`
      }
      case 'number_range': {
        const v = value as { min?: number; max?: number } | null
        if (!v || (v.min == null && v.max == null)) return '—'
        return `${v.min ?? '…'} — ${v.max ?? '…'}`
      }
      default: return '—'
    }
  }

  return (
    <div className="relative" ref={ref}>
      <div className="inline-flex items-center gap-1 bg-[#F0EDFF] text-[#6A55F8] rounded-lg pl-3 pr-1 py-1 text-sm">
        <button onClick={() => setOpen(v => !v)} className="font-medium">
          {def.label}: <span className="font-normal">{valueLabel()}</span>
        </button>
        <button
          onClick={onRemove}
          className="text-[#6A55F8]/70 hover:text-[#6A55F8] hover:bg-white rounded p-0.5 ml-0.5"
          aria-label="Убрать фильтр"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      {open && (
        <div className="absolute z-30 left-0 top-full mt-1 w-72 bg-white rounded-xl border border-gray-100 shadow-xl p-3 space-y-2">
          {renderEditor(def, value, onChange)}
        </div>
      )}
    </div>
  )
}

function renderEditor(
  def: FilterField,
  value: FilterCondition['value'],
  onChange: (v: FilterCondition['value']) => void,
) {
  switch (def.type) {
    case 'boolean': {
      return (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onChange(true)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${value === true ? 'bg-[#6A55F8] text-white border-[#6A55F8]' : 'bg-white text-gray-700 border-gray-200'}`}
          >Да</button>
          <button
            onClick={() => onChange(false)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${value === false ? 'bg-[#6A55F8] text-white border-[#6A55F8]' : 'bg-white text-gray-700 border-gray-200'}`}
          >Нет</button>
        </div>
      )
    }
    case 'multiselect': {
      const arr = Array.isArray(value) ? value : []
      return (
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {def.options?.map(o => {
            const checked = arr.includes(o.value)
            return (
              <label key={o.value} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    if (checked) onChange(arr.filter(v => v !== o.value))
                    else onChange([...arr, o.value])
                  }}
                  className="rounded"
                />
                <span>{o.label}</span>
              </label>
            )
          })}
        </div>
      )
    }
    case 'tag': {
      const arr = Array.isArray(value) ? value : []
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {arr.map(t => (
              <span key={t} className="inline-flex items-center gap-1 bg-[#F0EDFF] text-[#6A55F8] rounded-full px-2 py-0.5 text-xs">
                {t}
                <button onClick={() => onChange(arr.filter(x => x !== t))} className="opacity-70 hover:opacity-100">×</button>
              </span>
            ))}
          </div>
          <input
            type="text"
            placeholder="Добавить тег и Enter…"
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const v = (e.currentTarget.value || '').trim()
                if (v && !arr.includes(v)) onChange([...arr, v])
                e.currentTarget.value = ''
              }
            }}
            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-[#6A55F8]"
          />
        </div>
      )
    }
    case 'text': {
      return (
        <input
          type="text"
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          placeholder={def.placeholder}
          className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#6A55F8]"
        />
      )
    }
    case 'date_range': {
      const v = (value as { from?: string; to?: string }) ?? {}
      return (
        <div className="space-y-2">
          <label className="block">
            <span className="text-xs text-gray-500">С</span>
            <input
              type="date"
              value={v.from ?? ''}
              onChange={e => onChange({ ...v, from: e.target.value || undefined })}
              className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 focus:outline-none focus:border-[#6A55F8]"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">По</span>
            <input
              type="date"
              value={v.to ?? ''}
              onChange={e => onChange({ ...v, to: e.target.value || undefined })}
              className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 focus:outline-none focus:border-[#6A55F8]"
            />
          </label>
          <div className="flex flex-wrap gap-1">
            {[
              { l: 'Сегодня',   d: 0 },
              { l: '7 дней',    d: 7 },
              { l: '30 дней',   d: 30 },
              { l: '90 дней',   d: 90 },
            ].map(p => (
              <button
                key={p.l}
                onClick={() => {
                  const to = new Date()
                  const from = new Date(); from.setDate(from.getDate() - p.d)
                  onChange({ from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) })
                }}
                className="text-xs px-2 py-1 rounded-md border border-gray-200 hover:border-gray-300"
              >
                {p.l}
              </button>
            ))}
          </div>
        </div>
      )
    }
    case 'number_range': {
      const v = (value as { min?: number; max?: number }) ?? {}
      return (
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            placeholder="мин"
            value={v.min ?? ''}
            onChange={e => onChange({ ...v, min: e.target.value === '' ? undefined : Number(e.target.value) })}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#6A55F8]"
          />
          <input
            type="number"
            placeholder="макс"
            value={v.max ?? ''}
            onChange={e => onChange({ ...v, max: e.target.value === '' ? undefined : Number(e.target.value) })}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#6A55F8]"
          />
        </div>
      )
    }
  }
}

export { DEFAULT_VISIBLE_COLUMNS, DEFAULT_SORT }
