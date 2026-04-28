'use client'

// Модалка настройки фильтров. Содержит:
// - переключатель И/ИЛИ (как объединять условия)
// - список условий с возможностью «инвертировать» (NOT) каждое
// - значение для каждого условия (text/multiselect/boolean/date/number/tag)
// - кнопки внизу: применить / сохранить как новый / сохранить (если редактируем существующий)

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import {
  FILTER_FIELDS, FilterField, FilterCondition, FilterState, FilterCombinator,
  DynamicFilterOptions, EMPTY_DYNAMIC_OPTIONS,
} from '@/lib/users/config'

type Props = {
  open: boolean
  onClose: () => void
  initialFilterState: FilterState
  // Если активен сегмент — здесь его имя и id, можно «Сохранить» (перезаписать).
  activeSegmentName?: string | null
  dynamicOptions?: DynamicFilterOptions
  onApply: (state: FilterState) => void
  onSaveAsNew: (name: string, state: FilterState) => void
  onSaveExisting?: (state: FilterState) => void
}

function emptyValueFor(def: FilterField): FilterCondition['value'] {
  if (def.type === 'boolean') return true
  if (def.type === 'multiselect' || def.type === 'tag') return []
  if (def.type === 'date_range' || def.type === 'number_range') return {}
  return ''
}

export default function SegmentEditor(props: Props) {
  // Когда модалка закрыта — компонент не рендерится. При открытии монтируется
  // заново и useState получает initial-значения из props. Это избавляет от
  // useEffect-«синхронизатора» и lint-правила react-hooks/set-state-in-effect.
  if (!props.open) return null
  return <SegmentEditorInner {...props} />
}

function SegmentEditorInner({
  onClose, initialFilterState, activeSegmentName, dynamicOptions,
  onApply, onSaveAsNew, onSaveExisting,
}: Omit<Props, 'open'>) {
  const dynOpts = dynamicOptions ?? EMPTY_DYNAMIC_OPTIONS
  const [combinator, setCombinator] = useState<FilterCombinator>(initialFilterState.combinator)
  const [conditions, setConditions] = useState<FilterCondition[]>(initialFilterState.conditions)
  const [newName, setNewName] = useState('')

  function currentState(): FilterState {
    return { combinator, conditions }
  }

  function addCondition(fieldId: string) {
    const def = FILTER_FIELDS.find(f => f.id === fieldId)
    if (!def) return
    setConditions([...conditions, { field: fieldId, value: emptyValueFor(def) }])
  }

  function updateCondition(idx: number, patch: Partial<FilterCondition>) {
    setConditions(conditions.map((c, i) => i === idx ? { ...c, ...patch } : c))
  }

  function removeCondition(idx: number) {
    setConditions(conditions.filter((_, i) => i !== idx))
  }

  function changeField(idx: number, newFieldId: string) {
    const def = FILTER_FIELDS.find(f => f.id === newFieldId)
    if (!def) return
    updateCondition(idx, { field: newFieldId, value: emptyValueFor(def) })
  }

  function handleApply() {
    onApply(currentState())
    onClose()
  }

  function handleSaveExisting() {
    if (onSaveExisting) {
      onSaveExisting(currentState())
      onClose()
    }
  }

  function handleSaveNew() {
    const name = newName.trim()
    if (!name) {
      const prompted = window.prompt('Имя нового сегмента:')
      if (!prompted?.trim()) return
      onSaveAsNew(prompted.trim(), currentState())
      onClose()
      return
    }
    onSaveAsNew(name, currentState())
    onClose()
  }

  return (
    <Modal isOpen={true} onClose={onClose} title="Настройка фильтров" maxWidth="2xl">
      <div className="p-5 space-y-5">
        {/* Combinator */}
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Логика объединения условий</div>
          <div className="flex gap-2">
            <button
              onClick={() => setCombinator('and')}
              className={`flex-1 py-2.5 rounded-lg border text-sm transition-colors ${
                combinator === 'and'
                  ? 'border-[#6A55F8] bg-[#F0EDFF] text-[#6A55F8] font-medium'
                  : 'border-gray-200 text-gray-700 hover:border-gray-300'
              }`}
            >
              <strong>И</strong> — соответствует <em>всем</em> условиям
            </button>
            <button
              onClick={() => setCombinator('or')}
              className={`flex-1 py-2.5 rounded-lg border text-sm transition-colors ${
                combinator === 'or'
                  ? 'border-[#6A55F8] bg-[#F0EDFF] text-[#6A55F8] font-medium'
                  : 'border-gray-200 text-gray-700 hover:border-gray-300'
              }`}
            >
              <strong>ИЛИ</strong> — хотя бы <em>одному</em> условию
            </button>
          </div>
        </div>

        {/* Conditions */}
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Условия</div>
          {conditions.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Нет условий — будут показаны все пользователи.</p>
          ) : (
            <div className="space-y-2">
              {conditions.map((c, idx) => {
                const def = FILTER_FIELDS.find(f => f.id === c.field)
                return (
                  <div key={idx} className="bg-[#FAFAFD] rounded-xl border border-gray-100 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={c.field}
                        onChange={e => changeField(idx, e.target.value)}
                        className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-sm bg-white"
                      >
                        {FILTER_FIELDS.map(f => (
                          <option key={f.id} value={f.id}>{f.label}</option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1.5 text-xs text-gray-600 select-none cursor-pointer px-2 py-1 rounded-md hover:bg-white" title="Если включено — отбираем тех, у кого условие НЕ выполняется">
                        <input
                          type="checkbox"
                          checked={Boolean(c.negate)}
                          onChange={e => updateCondition(idx, { negate: e.target.checked })}
                          className="rounded border-gray-300"
                        />
                        НЕ
                      </label>
                      <button
                        onClick={() => removeCondition(idx)}
                        className="text-gray-400 hover:text-red-600 px-1.5"
                        title="Удалить"
                      >
                        ✕
                      </button>
                    </div>

                    {def && (
                      <ValueEditor
                        def={def}
                        value={c.value}
                        onChange={v => updateCondition(idx, { value: v })}
                        dynamicOptions={dynOpts}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Add condition */}
          <div className="mt-3">
            <select
              value=""
              onChange={e => {
                if (e.target.value) addCondition(e.target.value)
                e.currentTarget.value = ''
              }}
              className="w-full px-3 py-2 rounded-lg border border-dashed border-gray-300 text-sm bg-white text-gray-500 hover:border-gray-400 cursor-pointer"
            >
              <option value="">+ Добавить условие…</option>
              {FILTER_FIELDS.map(f => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Save as new — name input */}
        {!activeSegmentName && (
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Сохранить как сегмент (необязательно)</div>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Имя сегмента"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20"
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">
            Отмена
          </button>
          <div className="flex-1" />
          <button
            onClick={handleApply}
            className="px-4 py-2 rounded-lg border border-[#6A55F8] text-[#6A55F8] hover:bg-[#F0EDFF] text-sm font-medium"
          >
            Применить без сохранения
          </button>
          {activeSegmentName && onSaveExisting && (
            <button
              onClick={handleSaveExisting}
              className="px-4 py-2 rounded-lg bg-[#6A55F8] hover:bg-[#5040D6] text-white text-sm font-medium"
            >
              Сохранить «{activeSegmentName}»
            </button>
          )}
          {!activeSegmentName && (
            <button
              onClick={handleSaveNew}
              disabled={conditions.length === 0}
              className="px-4 py-2 rounded-lg bg-[#6A55F8] hover:bg-[#5040D6] text-white text-sm font-medium disabled:opacity-40"
            >
              Сохранить как сегмент
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ============================================================================
// ValueEditor — UI редактирования значения для одного условия
// ============================================================================

function ValueEditor({ def, value, onChange, dynamicOptions }: {
  def: FilterField
  value: FilterCondition['value']
  onChange: (v: FilterCondition['value']) => void
  dynamicOptions: DynamicFilterOptions
}) {
  // Источник опций: статичный (def.options) или динамический (по dynamic_source).
  const options = def.dynamic_source
    ? dynamicOptions[def.dynamic_source]
    : (def.options ?? [])
  if (def.type === 'boolean') {
    const v = value === null ? null : Boolean(value)
    return (
      <div className="flex gap-1">
        {[
          { val: true, label: 'Да' },
          { val: false, label: 'Нет' },
        ].map(opt => (
          <button
            key={String(opt.val)}
            onClick={() => onChange(opt.val)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${v === opt.val ? 'border-[#6A55F8] bg-[#F0EDFF] text-[#6A55F8]' : 'border-gray-200 text-gray-700 hover:border-gray-300'}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    )
  }

  if (def.type === 'multiselect') {
    const arr = Array.isArray(value) ? (value as string[]) : []
    if (options.length === 0) {
      return <p className="text-xs text-gray-400 italic">Нет доступных вариантов</p>
    }
    return (
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => {
          const checked = arr.includes(opt.value)
          return (
            <button
              key={opt.value}
              onClick={() => onChange(checked ? arr.filter(x => x !== opt.value) : [...arr, opt.value])}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border ${checked ? 'bg-[#6A55F8] border-[#6A55F8] text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'}`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    )
  }

  if (def.type === 'tag') {
    const arr = Array.isArray(value) ? (value as string[]) : []
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          {arr.map((t, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-[#F0EDFF] text-[#6A55F8]">
              {t}
              <button onClick={() => onChange(arr.filter((_, j) => j !== i))} className="hover:text-red-500">✕</button>
            </span>
          ))}
        </div>
        <input
          type="text"
          placeholder={def.placeholder ?? 'тег и Enter'}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
              onChange([...arr, (e.target as HTMLInputElement).value.trim()])
              ;(e.target as HTMLInputElement).value = ''
            }
          }}
          className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm bg-white"
        />
      </div>
    )
  }

  if (def.type === 'date_range') {
    const v = (value ?? {}) as { from?: string; to?: string }
    return (
      <div className="grid grid-cols-2 gap-2">
        <input type="date" value={v.from ?? ''} onChange={e => onChange({ ...v, from: e.target.value || undefined })} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm bg-white" />
        <input type="date" value={v.to ?? ''} onChange={e => onChange({ ...v, to: e.target.value || undefined })} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm bg-white" />
      </div>
    )
  }

  if (def.type === 'number_range') {
    const v = (value ?? {}) as { min?: number; max?: number }
    return (
      <div className="grid grid-cols-2 gap-2">
        <input type="number" placeholder="от" value={v.min ?? ''} onChange={e => onChange({ ...v, min: e.target.value === '' ? undefined : Number(e.target.value) })} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm bg-white" />
        <input type="number" placeholder="до" value={v.max ?? ''} onChange={e => onChange({ ...v, max: e.target.value === '' ? undefined : Number(e.target.value) })} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm bg-white" />
      </div>
    )
  }

  // text
  return (
    <input
      type="text"
      value={(value as string) ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={def.placeholder ?? ''}
      className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm bg-white"
    />
  )
}
