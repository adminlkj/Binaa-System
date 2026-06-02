'use client'

import { Sidebar, MobileSidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Mobile Sidebar */}
      <MobileSidebar />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto overscroll-contain bg-gray-50 p-4 lg:p-6" style={{ WebkitOverflowScrolling: 'touch' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
