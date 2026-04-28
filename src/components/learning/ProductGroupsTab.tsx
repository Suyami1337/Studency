'use client'

// Phase 7.5 — Группы и кураторы внутри продукта.
// Вкладка в карточке продукта: список групп, кураторы каждой группы,
// перераспределение учеников между группами.

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'

type Group = {
  id: string
  product_id: string
  name: string
  description: string | null
  is_default: boolean
  order_position: number
}

type Curator = { id: string; user_id: string; group_id: string; full_name: string; email: string }
type Student = { id: string; customer_id: string; group_id: string; group_name: string; full_name: string; email: string | null; public_code: string | null }

type AvailableUser = { user_id: string; full_name: string; email: string }

export default function ProductGroupsTab({ productId, projectId }: { productId: string; projectId: string }) {
  const supabase = createClient()
  const [groups, setGroups] = useState<Group[]>([])
  const [curators, setCurators] = useState<Curator[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  const load = useCallback(async () => {
    setLoading(true)

    // Группы продукта
    const { data: groupData } = await supabase
      .from('product_groups').select('*').eq('product_id', productId).order('order_position')
    const gs = (groupData as Group[]) ?? []
    setGroups(gs)

    if (gs.length > 0) {
      // Кураторы групп
      const { data: cData } = await supabase
        .from('product_group_curators').select('id, user_id, group_id').in('group_id', gs.map(g => g.id))
      const userIds = [...new Set((cData ?? []).map((c: { user_id: string }) => c.user_id))]
      const { data: usersData } = userIds.length > 0
        ? await supabase.from('users_meta').select('user_id, full_name, email').in('user_id', userIds)
        : { data: [] }
      const userMap = new Map((usersData as Array<{ user_id: string; full_name: string; email: string }> ?? []).map(u => [u.user_id, u]))
      setCurators(((cData ?? []) as Array<{ id: string; user_id: string; group_id: string }>).map(c => ({
        id: c.id, user_id: c.user_id, group_id: c.group_id,
        full_name: userMap.get(c.user_id)?.full_name ?? '—',
        email: userMap.get(c.user_id)?.email ?? '',
      })))

      // Ученики продукта (через product_group_members + customers)
      const { data: memberData } = await supabase
        .from('product_group_members').select('id, group_id, customer_id').in('group_id', gs.map(g => g.id))
      const customerIds = [...new Set((memberData ?? []).map((m: { customer_id: string }) => m.customer_id))]
      const { data: custData } = customerIds.length > 0
        ? await supabase.from('customers').select('id, full_name, email, public_code').in('id', customerIds)
        : { data: [] }
      const custMap = new Map((custData as Array<{ id: string; full_name: string; email: string | null; public_code: string | null }> ?? []).map(c => [c.id, c]))
      const groupMap = new Map(gs.map(g => [g.id, g.name]))
      setStudents(((memberData ?? []) as Array<{ id: string; group_id: string; customer_id: string }>).map(m => ({
        id: m.id,
        customer_id: m.customer_id,
        group_id: m.group_id,
        group_name: groupMap.get(m.group_id) ?? '',
        full_name: custMap.get(m.customer_id)?.full_name ?? '—',
        email: custMap.get(m.customer_id)?.email ?? null,
        public_code: custMap.get(m.customer_id)?.public_code ?? null,
      })))
    }

    // Юзеры проекта с ролью curator (или admin/owner — кому можно проверять ДЗ)
    const { data: members } = await supabase
      .from('project_members').select('user_id, roles!inner(code)')
      .eq('project_id', projectId).eq('status', 'active')
    type MemberRow = { user_id: string; roles: { code: string } | { code: string }[] }
    const possibleCuratorUserIds = ((members ?? []) as MemberRow[])
      .filter(m => {
        const role = Array.isArray(m.roles) ? m.roles[0] : m.roles
        return ['curator', 'admin', 'super_admin', 'owner'].includes(role?.code ?? '')
      })
      .map(m => m.user_id)
    if (possibleCuratorUserIds.length > 0) {
      const { data: u } = await supabase.from('users_meta').select('user_id, full_name, email').in('user_id', possibleCuratorUserIds)
      setAvailableUsers((u as AvailableUser[]) ?? [])
    } else {
      setAvailableUsers([])
    }

    setLoading(false)
  }, [productId, projectId, supabase])

  useEffect(() => { load() }, [load])

  async function createGroup() {
    if (!newGroupName.trim()) return
    setCreating(true)
    await supabase.from('product_groups').insert({
      product_id: productId, name: newGroupName.trim(), order_position: groups.length,
    })
    setNewGroupName('')
    setCreating(false)
    load()
  }

  async function renameGroup(g: Group, newName: string) {
    await supabase.from('product_groups').update({ name: newName }).eq('id', g.id)
    load()
  }

  async function deleteGroup(g: Group) {
    if (g.is_default) return alert('Дефолтную группу удалить нельзя')
    const inGroup = students.filter(s => s.group_id === g.id).length
    if (inGroup > 0) {
      const target = groups.find(x => x.is_default)
      if (!confirm(`Группа «${g.name}» содержит ${inGroup} учеников. Они будут перенесены в группу «${target?.name}». Продолжить?`)) return
      // Перенос учеников
      if (target) {
        await supabase.from('product_group_members').update({ group_id: target.id }).eq('group_id', g.id)
      }
    }
    await supabase.from('product_groups').delete().eq('id', g.id)
    load()
  }

  async function moveStudent(student: Student, newGroupId: string) {
    await supabase.from('product_group_members').update({ group_id: newGroupId }).eq('id', student.id)
    load()
  }

  async function addCurator(groupId: string, userId: string) {
    await supabase.from('product_group_curators').insert({ group_id: groupId, user_id: userId })
    load()
  }

  async function removeCurator(c: Curator) {
    await supabase.from('product_group_curators').delete().eq('id', c.id)
    load()
  }

  if (loading) return <div className="text-sm text-gray-400">Загрузка…</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Группы и кураторы</h3>
          <p className="text-xs text-gray-500 mt-0.5">Ученики автоматически попадают в дефолтную группу при оплате. Можно перераспределить вручную.</p>
        </div>
      </div>

      {/* Список групп */}
      <div className="space-y-3">
        {groups.map(g => (
          <GroupCard
            key={g.id}
            group={g}
            curators={curators.filter(c => c.group_id === g.id)}
            studentsInGroup={students.filter(s => s.group_id === g.id)}
            availableUsers={availableUsers.filter(u => !curators.some(c => c.group_id === g.id && c.user_id === u.user_id))}
            onRename={n => renameGroup(g, n)}
            onDelete={() => deleteGroup(g)}
            onAddCurator={uid => addCurator(g.id, uid)}
            onRemoveCurator={c => removeCurator(c)}
          />
        ))}
      </div>

      {/* Создание группы */}
      <div className="bg-white rounded-xl border border-dashed border-gray-200 p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createGroup()}
            placeholder="Название новой группы"
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm"
          />
          <button onClick={createGroup} disabled={!newGroupName.trim() || creating}
            className="px-4 py-2 rounded-lg bg-[#6A55F8] hover:bg-[#5040D6] text-white text-sm font-medium disabled:opacity-40">
            + Создать группу
          </button>
        </div>
      </div>

      {/* Все ученики продукта с возможностью перетащить */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-900">Все ученики продукта ({students.length})</h4>
          <input
            type="text"
            placeholder="Поиск"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm w-48"
          />
        </div>
        <div className="space-y-1 max-h-96 overflow-auto">
          {students
            .filter(s => !search || s.full_name.toLowerCase().includes(search.toLowerCase()) || s.email?.toLowerCase().includes(search.toLowerCase()))
            .map(s => (
              <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#6A55F8] to-[#8B7BFA] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {s.full_name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{s.full_name} {s.public_code && <span className="text-xs text-gray-400">{s.public_code}</span>}</div>
                    <div className="text-xs text-gray-500 truncate">{s.email}</div>
                  </div>
                </div>
                <select
                  value={s.group_id}
                  onChange={e => moveStudent(s, e.target.value)}
                  className="text-xs px-2 py-1 rounded border border-gray-200 bg-white"
                >
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            ))}
          {students.length === 0 && (
            <div className="text-xs text-gray-400 text-center py-4">Пока нет учеников. Они появятся после оплаты или ручной выдачи доступа.</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────
// Group card
// ───────────────────────────────────────────────────────────────────────
function GroupCard({
  group, curators, studentsInGroup, availableUsers,
  onRename, onDelete, onAddCurator, onRemoveCurator,
}: {
  group: Group;
  curators: Curator[];
  studentsInGroup: Student[];
  availableUsers: AvailableUser[];
  onRename: (n: string) => void;
  onDelete: () => void;
  onAddCurator: (uid: string) => void;
  onRemoveCurator: (c: Curator) => void;
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(group.name)
  const [showAddCurator, setShowAddCurator] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
      <div className="flex items-center justify-between">
        {editing ? (
          <div className="flex items-center gap-2 flex-1">
            <input value={name} onChange={e => setName(e.target.value)} className="px-2 py-1 rounded border border-gray-200 text-sm flex-1" autoFocus />
            <button onClick={() => { onRename(name); setEditing(false) }} className="text-xs text-[#6A55F8] hover:underline">Сохранить</button>
            <button onClick={() => { setName(group.name); setEditing(false) }} className="text-xs text-gray-500 hover:underline">Отмена</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">{group.name}</h4>
            {group.is_default && <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">по умолчанию</span>}
            <span className="text-xs text-gray-400">· {studentsInGroup.length} учеников · {curators.length} кураторов</span>
          </div>
        )}
        {!editing && (
          <div className="flex gap-2">
            <button onClick={() => setEditing(true)} className="text-xs text-gray-500 hover:text-gray-800">Переименовать</button>
            {!group.is_default && <button onClick={onDelete} className="text-xs text-red-500 hover:underline">Удалить</button>}
          </div>
        )}
      </div>

      {/* Кураторы */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-500">Кураторы</span>
          <button onClick={() => setShowAddCurator(true)} className="text-xs text-[#6A55F8] hover:underline">+ Добавить куратора</button>
        </div>
        {curators.length === 0 ? (
          <div className="text-xs text-gray-400">Кураторов пока нет</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {curators.map(c => (
              <div key={c.id} className="flex items-center gap-2 bg-gray-50 rounded-full pl-2 pr-1 py-0.5">
                <span className="text-xs">{c.full_name}</span>
                <button onClick={() => onRemoveCurator(c)} className="text-xs text-gray-400 hover:text-red-500 w-5 h-5 rounded-full hover:bg-white">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add curator modal */}
      {showAddCurator && (
        <Modal isOpen={true} onClose={() => setShowAddCurator(false)} title="Добавить куратора" maxWidth="md">
          <div className="p-5 space-y-2 max-h-96 overflow-auto">
            {availableUsers.length === 0 ? (
              <div className="text-sm text-gray-500">Нет доступных кураторов. Добавьте сотрудников с ролью «Куратор» в разделе Команда.</div>
            ) : (
              availableUsers.map(u => (
                <button key={u.user_id} onClick={() => { onAddCurator(u.user_id); setShowAddCurator(false) }}
                  className="w-full px-3 py-2 rounded-lg hover:bg-gray-50 text-left text-sm">
                  <div className="font-medium">{u.full_name}</div>
                  <div className="text-xs text-gray-500">{u.email}</div>
                </button>
              ))
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
