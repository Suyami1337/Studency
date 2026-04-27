'use client'

// Раздел «Команда и роли» — встраивается как вкладка в /project/[id]/settings.
// Раньше был отдельным route /settings/team.

import { useEffect, useState } from 'react'

type Member = {
  id: string
  user_id: string
  email: string | null
  full_name: string | null
  status: string
  joined_at: string
  role_id: string
  role_code: string
  role_label: string
  access_type: string
  role_is_system: boolean
  is_self: boolean
}

type Invitation = {
  id: string
  email: string
  expires_at: string
  created_at: string
  role_id: string
  role_code: string
  role_label: string
}

type Role = {
  id: string
  code: string
  label: string
  description: string | null
  is_system: boolean
  access_type: string
  sort_order: number
  permissions: string[]
  members_count: number
}

type Permission = {
  code: string
  category: string
  label: string
  description: string | null
  is_dangerous: boolean
  sort_order: number
}

type Tab = 'members' | 'roles'

export default function TeamSection({ projectId }: { projectId: string }) {

  const [tab, setTab] = useState<Tab>('members')
  const [members, setMembers] = useState<Member[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Invite form
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRoleId, setInviteRoleId] = useState('')
  const [inviting, setInviting] = useState(false)

  // Transfer ownership
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferTargetId, setTransferTargetId] = useState('')
  const [transferPassword, setTransferPassword] = useState('')
  const [transferring, setTransferring] = useState(false)

  async function loadAll() {
    setLoading(true)
    try {
      const [m, inv, r, p] = await Promise.all([
        fetch(`/api/projects/${projectId}/members`).then(r => r.json()),
        fetch(`/api/projects/${projectId}/invitations`).then(r => r.json()),
        fetch(`/api/projects/${projectId}/roles`).then(r => r.json()),
        fetch(`/api/permissions`).then(r => r.json()),
      ])
      setMembers(m.members ?? [])
      setInvitations(inv.invitations ?? [])
      setRoles(r.roles ?? [])
      setPermissions(p.permissions ?? [])
      // Дефолтная роль для приглашения — student (это самая частая)
      const studentRole = (r.roles ?? []).find((x: Role) => x.code === 'student')
      const adminRole = (r.roles ?? []).find((x: Role) => x.code === 'admin')
      setInviteRoleId(studentRole?.id ?? adminRole?.id ?? r.roles?.[0]?.id ?? '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadAll() }, [projectId])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail || !inviteRoleId) return
    setInviting(true)
    setError('')
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, email: inviteEmail.trim().toLowerCase(), role_id: inviteRoleId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Не удалось пригласить')
        setInviting(false)
        return
      }
      setShowInvite(false)
      setInviteEmail('')
      await loadAll()
    } finally {
      setInviting(false)
    }
  }

  async function handleChangeRole(memberId: string, roleId: string) {
    setError('')
    const res = await fetch(`/api/projects/${projectId}/members/${memberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_id: roleId }),
    })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error || 'Не удалось изменить роль')
      return
    }
    await loadAll()
  }

  async function handleRemoveMember(memberId: string, label: string) {
    if (!confirm(`Удалить «${label}» из проекта?`)) return
    setError('')
    const res = await fetch(`/api/projects/${projectId}/members/${memberId}`, { method: 'DELETE' })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error || 'Не удалось удалить')
      return
    }
    await loadAll()
  }

  async function handleLeaveProject() {
    if (!confirm('Покинуть проект? Доступ к данным будет потерян.')) return
    const res = await fetch(`/api/projects/${projectId}/leave`, { method: 'POST' })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error || 'Не удалось покинуть')
      return
    }
    window.location.href = '/projects'
  }

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setTransferring(true)
    const res = await fetch(`/api/projects/${projectId}/transfer-ownership`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_user_id: transferTargetId, password: transferPassword }),
    })
    setTransferring(false)
    if (!res.ok) {
      const d = await res.json()
      setError(d.error || 'Не удалось передать владение')
      return
    }
    setShowTransfer(false)
    setTransferPassword('')
    setTransferTargetId('')
    await loadAll()
  }

  async function handleImpersonate(targetUserId: string, label: string) {
    if (!confirm(`Войти от лица «${label}»? Вы увидите платформу как этот участник, потом сможете вернуться в свой аккаунт.`)) return
    const res = await fetch('/api/team/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_user_id: targetUserId, project_id: projectId }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Не удалось войти от лица')
      return
    }
    // Hard redirect — нужно чтобы браузер перечитал новые auth-cookies
    window.location.href = data.redirect || '/projects'
  }

  async function handleCancelInvite(invId: string) {
    if (!confirm('Отозвать приглашение? Ссылка перестанет работать.')) return
    const res = await fetch(`/api/projects/${projectId}/invitations/${invId}`, { method: 'DELETE' })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error || 'Не удалось отозвать')
      return
    }
    await loadAll()
  }

  if (loading) {
    return <div className="text-sm text-gray-500">Загрузка команды…</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">Участники проекта, приглашения и настройка прав ролей.</p>
        {tab === 'members' && (
          <button
            onClick={() => setShowInvite(true)}
            className="px-4 py-2 rounded-lg bg-[#6A55F8] hover:bg-[#5040D6] text-white text-sm font-medium"
          >
            + Пригласить
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {[
          { key: 'members' as Tab, label: 'Участники' },
          { key: 'roles' as Tab, label: 'Роли и доступы' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === t.key ? 'border-[#6A55F8] text-[#6A55F8]' : 'border-transparent text-gray-500 hover:text-gray-900'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      {tab === 'members' && (
        <>
          <MembersTab
            members={members}
            invitations={invitations}
            roles={roles}
            onChangeRole={handleChangeRole}
            onRemove={handleRemoveMember}
            onCancelInvite={handleCancelInvite}
            onImpersonate={handleImpersonate}
          />
          <DangerZone
            members={members}
            onLeave={handleLeaveProject}
            onTransfer={() => setShowTransfer(true)}
          />
        </>
      )}

      {tab === 'roles' && (
        <RolesTab
          roles={roles}
          permissions={permissions}
          projectId={projectId}
          onChange={loadAll}
        />
      )}

      {showTransfer && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleTransfer} className="bg-white rounded-2xl border border-gray-100 p-8 w-full max-w-md">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Передать владение</h2>
            <p className="text-sm text-gray-500 mb-6">Вы перестанете быть владельцем и получите роль «Главный администратор». Передать владение можно только Главному администратору.</p>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Кому передать</label>
                <select
                  value={transferTargetId}
                  onChange={e => setTransferTargetId(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm"
                >
                  <option value="">— Выберите Главного администратора</option>
                  {members.filter(m => m.role_code === 'super_admin').map(m => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.full_name || m.email}
                    </option>
                  ))}
                </select>
                {members.filter(m => m.role_code === 'super_admin').length === 0 && (
                  <p className="text-xs text-amber-600 mt-1.5">
                    Нет Главных администраторов — сначала повысьте кого-то из админов до этой роли.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Ваш пароль</label>
                <input
                  type="password"
                  value={transferPassword}
                  onChange={e => setTransferPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm"
                  placeholder="Подтвердите паролем"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-6">
              <button type="button" onClick={() => { setShowTransfer(false); setTransferPassword(''); setTransferTargetId(''); setError('') }} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm">Отмена</button>
              <button type="submit" disabled={transferring || !transferTargetId} className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50">
                {transferring ? 'Передаём…' : 'Передать владение'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showInvite && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-8 w-full max-w-md">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Пригласить в проект</h2>
            <p className="text-sm text-gray-500 mb-6">На указанный email уйдёт письмо со ссылкой. Если у пользователя уже есть аккаунт — войдёт паролем; если нет — завершит регистрацию.</p>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20 focus:border-[#6A55F8]"
                  placeholder="ivan@example.ru"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Роль</label>
                <select
                  value={inviteRoleId}
                  onChange={e => setInviteRoleId(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20 focus:border-[#6A55F8]"
                >
                  {roles.filter(r => r.code !== 'owner' && r.code !== 'guest' && r.code !== 'lead').map(r => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowInvite(false)} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">Отмена</button>
                <button type="submit" disabled={inviting} className="flex-1 py-2.5 rounded-lg bg-[#6A55F8] hover:bg-[#5040D6] text-white text-sm font-medium disabled:opacity-50">
                  {inviting ? 'Отправляем…' : 'Отправить приглашение'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function DangerZone({ members, onLeave, onTransfer }: {
  members: Member[]
  onLeave: () => void
  onTransfer: () => void
}) {
  const me = members.find(m => m.is_self)
  if (!me) return null

  const isOwner = me.role_code === 'owner'

  return (
    <div className="mt-10 pt-6 border-t border-gray-200">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Опасная зона</h2>
      <div className="bg-white rounded-xl border border-red-100">
        {isOwner && (
          <div className="p-4 flex items-center justify-between border-b border-red-50">
            <div>
              <div className="text-sm font-medium text-gray-900">Передать владение</div>
              <div className="text-xs text-gray-500 mt-0.5">Передаёте проект другому Главному администратору. Свою роль понижаете до Главного администратора.</div>
            </div>
            <button onClick={onTransfer} className="px-3 py-1.5 rounded-lg border border-red-200 text-sm text-red-600 hover:bg-red-50">
              Передать
            </button>
          </div>
        )}
        {!isOwner && (
          <div className="p-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-900">Покинуть проект</div>
              <div className="text-xs text-gray-500 mt-0.5">Выйти из команды этой школы. Доступ к её данным будет потерян.</div>
            </div>
            <button onClick={onLeave} className="px-3 py-1.5 rounded-lg border border-red-200 text-sm text-red-600 hover:bg-red-50">
              Покинуть
            </button>
          </div>
        )}
        {isOwner && (
          <div className="p-4 text-xs text-gray-400">
            Чтобы покинуть проект, сначала передайте владение.
          </div>
        )}
      </div>
    </div>
  )
}

// Иерархия ролей — должна совпадать с серверной в /api/team/impersonate.
function getRoleRank(roleCode: string, accessType: string): number {
  switch (roleCode) {
    case 'owner': return 100
    case 'super_admin': return 80
    case 'admin': return 60
    case 'curator':
    case 'sales':
    case 'marketer': return 40
    case 'student': return 20
    case 'lead':
    case 'guest': return 0
  }
  if (accessType === 'admin_panel') return 40
  if (accessType === 'student_panel') return 20
  return 0
}

function MembersTab({ members, invitations, roles, onChangeRole, onRemove, onCancelInvite, onImpersonate }: {
  members: Member[]
  invitations: Invitation[]
  roles: Role[]
  onChangeRole: (id: string, roleId: string) => void
  onRemove: (id: string, label: string) => void
  onCancelInvite: (id: string) => void
  onImpersonate: (userId: string, label: string) => void
}) {
  const me = members.find(m => m.is_self)
  const myRank = me ? getRoleRank(me.role_code, me.access_type) : 0
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Активные ({members.length})</h2>
        <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
          {members.map(m => (
            <div key={m.id} className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#6A55F8] to-[#8B7BFA] flex items-center justify-center text-white text-sm font-semibold shrink-0">
                  {(m.full_name?.[0] || m.email?.[0] || '?').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {m.full_name || m.email || 'Без имени'}
                    {m.is_self && <span className="ml-2 text-xs text-gray-400">(вы)</span>}
                  </div>
                  <div className="text-xs text-gray-500 truncate">{m.email}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {m.role_code === 'owner' ? (
                  <span className="px-3 py-1.5 rounded-lg bg-[#6A55F8]/10 text-[#6A55F8] text-sm font-medium">{m.role_label}</span>
                ) : (
                  <select
                    value={m.role_id}
                    onChange={e => onChangeRole(m.id, e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20"
                    disabled={m.is_self}
                  >
                    {roles.filter(r => r.code !== 'owner' && r.code !== 'guest' && r.code !== 'lead').map(r => (
                      <option key={r.id} value={r.id}>{r.label}</option>
                    ))}
                  </select>
                )}
                {!m.is_self && m.status === 'active' && getRoleRank(m.role_code, m.access_type) < myRank && (
                  <button
                    onClick={() => onImpersonate(m.user_id, m.full_name || m.email || 'участника')}
                    className="text-xs px-2 py-1 rounded-md text-amber-700 hover:bg-amber-50 border border-amber-200"
                    title="Войти от его лица для тестирования"
                  >
                    👁 Войти как
                  </button>
                )}
                {!m.is_self && m.role_code !== 'owner' && (
                  <button
                    onClick={() => onRemove(m.id, m.full_name || m.email || 'участника')}
                    className="text-sm text-gray-400 hover:text-red-600 px-2"
                    title="Удалить из проекта"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {invitations.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Приглашения ожидают принятия ({invitations.length})</h2>
          <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
            {invitations.map(inv => (
              <div key={inv.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{inv.email}</div>
                  <div className="text-xs text-gray-500">
                    Роль: <strong>{inv.role_label}</strong> · до {new Date(inv.expires_at).toLocaleDateString('ru')}
                  </div>
                </div>
                <button onClick={() => onCancelInvite(inv.id)} className="text-sm text-gray-400 hover:text-red-600">Отозвать</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function RolesTab({ roles, permissions, projectId, onChange }: {
  roles: Role[]
  permissions: Permission[]
  projectId: string
  onChange: () => void
}) {
  const [reordering, setReordering] = useState(false)

  async function moveRole(roleId: string, direction: -1 | 1) {
    const sorted = [...roles].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex(r => r.id === roleId)
    if (idx < 0) return
    const targetIdx = idx + direction
    if (targetIdx < 0 || targetIdx >= sorted.length) return
    const me = sorted[idx]
    const other = sorted[targetIdx]
    setReordering(true)
    // Свап sort_order через два PATCH-а
    await Promise.all([
      fetch(`/api/projects/${projectId}/roles/${me.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: other.sort_order }),
      }),
      fetch(`/api/projects/${projectId}/roles/${other.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: me.sort_order }),
      }),
    ])
    setReordering(false)
    onChange()
  }

  const [activeRoleId, setActiveRoleId] = useState<string>(roles[0]?.id ?? '')
  const [pendingPerms, setPendingPerms] = useState<Set<string> | null>(null)
  const [saving, setSaving] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newAccessType, setNewAccessType] = useState<'admin_panel' | 'student_panel' | 'no_access'>('admin_panel')
  const [newBasedOn, setNewBasedOn] = useState<string>('')

  const role = roles.find(r => r.id === activeRoleId) ?? roles[0]
  const currentPerms = pendingPerms ?? new Set(role?.permissions ?? [])
  const dirty = pendingPerms !== null

  // Группировка permissions по category
  const grouped = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.category] = acc[p.category] || []).push(p)
    return acc
  }, {})
  const categoryOrder = ['crm', 'chatbots', 'conversations', 'funnels', 'learning', 'products', 'orders', 'sites', 'analytics', 'social', 'media', 'videos', 'journal', 'team', 'settings', 'danger']
  const categoryLabels: Record<string, string> = {
    crm: 'CRM',
    chatbots: 'Чат-боты',
    conversations: 'Переписки',
    funnels: 'Воронки',
    learning: 'Обучение',
    products: 'Продукты',
    orders: 'Заказы',
    sites: 'Сайты',
    analytics: 'Аналитика',
    social: 'Соцсети',
    media: 'Медиа',
    videos: 'Видео',
    journal: 'Журнал',
    team: 'Команда',
    settings: 'Настройки',
    danger: 'Опасная зона',
  }

  function togglePerm(code: string) {
    const next = new Set(pendingPerms ?? role?.permissions ?? [])
    if (next.has(code)) next.delete(code)
    else next.add(code)
    setPendingPerms(next)
  }

  async function handleSave() {
    if (!role || !pendingPerms) return
    setSaving(true)
    const res = await fetch(`/api/projects/${projectId}/roles/${role.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions: Array.from(pendingPerms) }),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json()
      alert('Ошибка: ' + (d.error || 'не удалось сохранить'))
      return
    }
    setPendingPerms(null)
    onChange()
  }

  function handleCancel() {
    setPendingPerms(null)
  }

  async function handleReset() {
    if (!role || !role.is_system) return
    if (!confirm(`Сбросить «${role.label}» к дефолтным правам?`)) return
    setSaving(true)
    const res = await fetch(`/api/projects/${projectId}/roles/${role.id}/reset`, { method: 'POST' })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json()
      alert('Ошибка: ' + (d.error || 'не удалось сбросить'))
      return
    }
    setPendingPerms(null)
    onChange()
  }

  async function handleDeleteRole() {
    if (!role || role.is_system) return
    if (!confirm(`Удалить роль «${role.label}»?`)) return
    setSaving(true)
    const res = await fetch(`/api/projects/${projectId}/roles/${role.id}`, { method: 'DELETE' })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json()
      alert('Ошибка: ' + (d.error || 'не удалось удалить'))
      return
    }
    onChange()
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newLabel.trim()) return
    setSaving(true)
    const res = await fetch(`/api/projects/${projectId}/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: newLabel.trim(),
        access_type: newAccessType,
        based_on: newBasedOn || undefined,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json()
      alert('Ошибка: ' + (d.error || 'не удалось создать'))
      return
    }
    const data = await res.json()
    setShowCreate(false)
    setNewLabel('')
    setNewBasedOn('')
    onChange()
    setActiveRoleId(data.role_id)
  }

  if (!role) {
    return <div className="text-sm text-gray-500">Нет ролей</div>
  }

  return (
    <div className="grid grid-cols-12 gap-6">
      <aside className="col-span-4">
        <div className="bg-white rounded-xl border border-gray-100 p-2">
          {roles.map((r, idx) => (
            <div
              key={r.id}
              className={`group relative flex items-stretch rounded-lg transition-colors ${activeRoleId === r.id ? 'bg-[#F0EDFF]' : 'hover:bg-gray-50'}`}
            >
              <button
                onClick={() => { setActiveRoleId(r.id); setPendingPerms(null) }}
                className={`flex-1 text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2.5 ${activeRoleId === r.id ? 'text-[#6A55F8] font-medium' : 'text-gray-700'}`}
              >
                <span className={`shrink-0 w-6 h-6 rounded-full text-[11px] font-semibold flex items-center justify-center ${activeRoleId === r.id ? 'bg-[#6A55F8] text-white' : 'bg-gray-100 text-gray-500 group-hover:bg-white'}`}>
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{r.label}</span>
                    <span className="text-xs text-gray-400 shrink-0">{r.members_count}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {r.is_system ? 'системная' : 'кастомная'}
                    {' · '}
                    {r.access_type === 'admin_panel' && 'админка'}
                    {r.access_type === 'student_panel' && 'витрина'}
                    {r.access_type === 'no_access' && 'без входа'}
                  </div>
                </div>
              </button>
              <div className="flex flex-col items-center justify-center pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); moveRole(r.id, -1) }}
                  disabled={reordering || idx === 0}
                  className="text-[10px] text-gray-400 hover:text-[#6A55F8] disabled:opacity-30 disabled:hover:text-gray-400 leading-none px-1"
                  title="Выше"
                >
                  ▲
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); moveRole(r.id, 1) }}
                  disabled={reordering || idx === roles.length - 1}
                  className="text-[10px] text-gray-400 hover:text-[#6A55F8] disabled:opacity-30 disabled:hover:text-gray-400 leading-none px-1"
                  title="Ниже"
                >
                  ▼
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={() => setShowCreate(true)}
            className="w-full mt-2 px-3 py-2 rounded-lg text-sm text-[#6A55F8] hover:bg-[#F0EDFF] border border-dashed border-[#6A55F8]/30"
          >
            + Создать роль
          </button>
        </div>
      </aside>

      <main className="col-span-8">
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{role.label}</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {role.is_system ? 'Системная роль' : 'Кастомная роль'}
                {' · '}{role.members_count} участн.
              </p>
            </div>
            <div className="flex gap-2">
              {role.is_system && (
                <button onClick={handleReset} disabled={saving} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">Сбросить к дефолту</button>
              )}
              {!role.is_system && (
                <button onClick={handleDeleteRole} disabled={saving} className="px-3 py-1.5 rounded-lg border border-red-200 text-sm text-red-600 hover:bg-red-50">Удалить</button>
              )}
            </div>
          </div>

          {role.code === 'owner' && (
            <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
              Роль владельца защищена — у неё всегда полный набор прав, изменить нельзя.
            </div>
          )}

          {role.access_type === 'no_access' && (
            <div className="mb-4 p-3 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-600">
              Эта роль не даёт входа в платформу. Используется как маркетинговый статус карточки.
            </div>
          )}

          <div className="space-y-5 mt-6">
            {categoryOrder.filter(c => grouped[c]).map(category => (
              <div key={category}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{categoryLabels[category]}</h3>
                <div className="space-y-1.5">
                  {grouped[category].map(p => {
                    const checked = currentPerms.has(p.code)
                    const ownerLocked = role.code === 'owner'
                    return (
                      <label key={p.code} className={`flex items-start gap-2 p-2.5 rounded-lg border ${checked ? (p.is_dangerous ? 'border-red-200 bg-red-50/50' : 'border-[#6A55F8]/30 bg-[#F8F6FF]') : 'border-gray-100'} ${ownerLocked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={ownerLocked}
                          onChange={() => togglePerm(p.code)}
                          className="mt-0.5 rounded text-[#6A55F8] focus:ring-[#6A55F8]/20"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-gray-900 flex items-center gap-1">
                            <span>{p.label}</span>
                            {p.is_dangerous && <span className="text-xs text-red-600 font-semibold">⚠</span>}
                          </div>
                          {p.description && <div className="text-xs text-gray-500 mt-0.5">{p.description}</div>}
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {dirty && role.code !== 'owner' && (
            <div className="sticky bottom-0 mt-6 bg-white border-t border-gray-100 pt-4 flex gap-2 justify-end">
              <button onClick={handleCancel} className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">Отменить</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg bg-[#6A55F8] hover:bg-[#5040D6] text-white text-sm font-medium disabled:opacity-50">
                {saving ? 'Сохраняем…' : 'Сохранить'}
              </button>
            </div>
          )}
        </div>
      </main>

      {showCreate && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-gray-100 p-8 w-full max-w-md">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Новая роль</h2>
            <p className="text-sm text-gray-500 mb-6">Укажите имя. Можно скопировать набор прав с существующей роли — потом отредактируете.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Название</label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#6A55F8]/20"
                  placeholder="Финансист"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Тип доступа</label>
                <select value={newAccessType} onChange={e => setNewAccessType(e.target.value as 'admin_panel' | 'student_panel' | 'no_access')} className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm">
                  <option value="admin_panel">Админка проекта</option>
                  <option value="student_panel">Витрина ученика</option>
                  <option value="no_access">Без входа в платформу</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Скопировать права с</label>
                <select value={newBasedOn} onChange={e => setNewBasedOn(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm">
                  <option value="">— Без копирования (пустые права)</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-6">
              <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm">Отмена</button>
              <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg bg-[#6A55F8] hover:bg-[#5040D6] text-white text-sm font-medium disabled:opacity-50">
                {saving ? 'Создаём…' : 'Создать'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
