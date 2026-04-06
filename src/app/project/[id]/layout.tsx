'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const supabase = createClient()
  const [projectName, setProjectName] = useState('...')

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

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar projectName={projectName} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6 bg-[#F5F5F7]">
          {children}
        </main>
      </div>
    </div>
  )
}
