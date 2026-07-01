'use client'

import { Sidebar, MobileSidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { useAppStore } from '@/stores/app-store'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { lang } = useAppStore()

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Skip-to-content link — visible only when keyboard-focused.
          Pressing Tab from the URL bar lands here first; Enter jumps focus
          straight to #main-content, bypassing the long sidebar nav. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:right-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:shadow-lg"
      >
        {lang === 'ar' ? 'تخطَّ إلى المحتوى' : 'Skip to content'}
      </a>

      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Mobile Sidebar */}
      <MobileSidebar />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Header />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-y-auto overscroll-contain bg-gray-50 p-4 lg:p-6 focus:outline-none"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
