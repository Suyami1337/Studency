'use client'

import { useState } from 'react'
import LoginScreen from '@/components/screens/LoginScreen'
import ProjectsScreen from '@/components/screens/ProjectsScreen'
import DashboardScreen from '@/components/screens/DashboardScreen'
import FunnelsScreen from '@/components/screens/FunnelsScreen'
import CrmScreen from '@/components/screens/CrmScreen'
import ChatbotsScreen from '@/components/screens/ChatbotsScreen'
import SitesScreen from '@/components/screens/SitesScreen'
import LearningScreen from '@/components/screens/LearningScreen'
import ProductsScreen from '@/components/screens/ProductsScreen'
import OrdersScreen from '@/components/screens/OrdersScreen'
import AnalyticsScreen from '@/components/screens/AnalyticsScreen'
import UsersScreen from '@/components/screens/UsersScreen'
import SettingsScreen from '@/components/screens/SettingsScreen'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'

export type Screen = 'login' | 'projects' | 'dashboard' | 'funnels' | 'crm' | 'chatbots' | 'sites' | 'learning' | 'products' | 'orders' | 'analytics' | 'users' | 'settings'

const screenComponents: Record<string, React.ComponentType> = {
  dashboard: DashboardScreen,
  funnels: FunnelsScreen,
  crm: CrmScreen,
  chatbots: ChatbotsScreen,
  sites: SitesScreen,
  learning: LearningScreen,
  products: ProductsScreen,
  orders: OrdersScreen,
  analytics: AnalyticsScreen,
  users: UsersScreen,
  settings: SettingsScreen,
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('login')

  if (screen === 'login') {
    return <LoginScreen onLogin={() => setScreen('projects')} />
  }

  if (screen === 'projects') {
    return <ProjectsScreen onSelect={() => setScreen('dashboard')} />
  }

  const ScreenComponent = screenComponents[screen] || DashboardScreen

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar active={screen} onNavigate={(s) => setScreen(s as Screen)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onNavigate={(s) => setScreen(s as Screen)} />
        <main className="flex-1 overflow-y-auto p-6 bg-[#F5F5F7]">
          <ScreenComponent />
        </main>
      </div>
    </div>
  )
}
