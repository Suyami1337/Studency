'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const [projectName, setProjectName] = useState('...')
  const [activePage, setActivePage] = useState('dashboard')

  useEffect(() => {
    async function loadProject() {
      const { data } = await supabase
        .from('projects')
        .select('name')
        .eq('id', params.id)
        .single()

      if (data) setProjectName(data.name)
    }
    if (params.id) loadProject()
  }, [params.id])

  function handleNavigate(page: string) {
    if (page === 'projects') {
      router.push('/projects')
      return
    }
    setActivePage(page)
    // For now, just update active state — pages will be added in later phases
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar active={activePage} onNavigate={handleNavigate} projectName={projectName} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onNavigate={handleNavigate} />
        <main className="flex-1 overflow-y-auto p-6 bg-[#F5F5F7]">
          {children}
        </main>
      </div>
    </div>
  )
}
