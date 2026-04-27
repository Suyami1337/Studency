'use client'

import { useEffect, useRef, useState } from 'react'
import {
  COLUMNS, ColumnDef, ColumnId, DEFAULT_VISIBLE_COLUMNS, DEFAULT_SORT,
  FilterState, Segment, SortDirection,
} from '@/lib/users/config'
import SegmentEditor from './SegmentEditor'

type Props = {
  segments: Segment[]
  activeSegmentId: string | null
  isDirty: boolean
  filterState: FilterState
  visibleColumns: ColumnId[]
  sort: { column: ColumnId; direction: SortDirection }
  onChangeFilterState: (f: FilterState) => void
  onChangeColumns: (c: ColumnId[]) => void
  onChangeSort: (s: { column: ColumnId; direction: SortDirection }) => void
  onSelectSegment: (id: string | null) => void
  onSaveCurrent: () => void
  onSaveAsNew: (name?: string) => void
  onResetToSegment: () => void
  onDeleteSegment: (id: string) => void
  onRenameSegment: (id: string, name: string) => void
}

export default function FiltersBar({
  segments, activeSegmentId, isDirty,
  filterState, visibleColumns, sort,
  onChangeFilterState, onChangeColumns, onChangeSort,
  onSelectSegment, onSaveCurrent, onSaveAsNew, onResetToSegment,
  onDeleteSegment, onRenameSegment,
}: Props) {
  const [showEditor, setShowEditor] = useState(false)
  const [showColumns, setShowColumns] = useState(false)
  const [showSort, setShowSort] = useState(false)
  const [showSegmentMenu, setShowSegmentMenu] = useState(false)
  const segmentBtnRef = useRef<HTMLDivElement>(null)
  const colsBtnRef = useRef<HTMLDivElement>(null)
  const sortBtnRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as Node
      if (showSegmentMenu && segmentBtnRef.current && !segmentBtnRef.current.contains(target)) setShowSegmentMenu(false)
      if (showColumns && colsBtnRef.current && !colsBtnRef.current.contains(target)) setShowColumns(false)
      if (showSort && sortBtnRef.current && !sortBtnRef.current.contains(target)) setShowSort(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showSegmentMenu, showColumns, showSort])

  const activeSegment = segments.find(s => s.id === activeSegmentId)
  const sortableColumns: ColumnDef[] = COLUMNS.filter(c => c.sortable)
  const conditionsCount = filterState.conditions.length

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

      {/* Кнопка «Настроить фильтры» + сортировка/колонки */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setShowEditor(true)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border flex items-center gap-2 ${conditionsCount > 0 ? 'bg-[#F0EDFF] border-[#6A55F8]/30 text-[#6A55F8]' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'}`}
        >
          <span>🎛 Настроить фильтры</span>
          {conditionsCount > 0 && (
            <span className="text-xs bg-[#6A55F8] text-white rounded-full px-2 py-0.5 font-semibold">
              {conditionsCount} · {filterState.combinator === 'and' ? 'И' : 'ИЛИ'}
            </span>
          )}
        </button>
        {conditionsCount > 0 && (
          <button
            onClick={() => onChangeFilterState({ combinator: 'and', conditions: [] })}
            className="text-xs text-gray-500 hover:text-red-600 px-2"
            title="Сбросить все фильтры"
          >
            ✕ сбросить
          </button>
        )}

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

      <SegmentEditor
        open={showEditor}
        onClose={() => setShowEditor(false)}
        initialFilterState={filterState}
        activeSegmentName={activeSegment?.name ?? null}
        onApply={(state) => onChangeFilterState(state)}
        onSaveAsNew={(name, state) => {
          onChangeFilterState(state)
          onSaveAsNew(name)
        }}
        onSaveExisting={activeSegment ? (state) => {
          onChangeFilterState(state)
          // microtask чтобы state успел обновиться до save
          setTimeout(() => onSaveCurrent(), 0)
        } : undefined}
      />
    </div>
  )
}
