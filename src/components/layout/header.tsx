'use client'

import { Menu, Bell, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { useAppStore, sectionLabels, subModuleLabels, commonText } from '@/stores/app-store'

export function Header() {
  const { activeSection, activeSubModule, toggleSidebar, lang } = useAppStore()
  const sectionLabel = sectionLabels[activeSection]?.[lang] || 'Dashboard'
  const subLabel = subModuleLabels[activeSubModule]?.[lang] || ''

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-gray-200 bg-white/95 px-4 backdrop-blur-sm supports-[backdrop-filter]:bg-white/80 lg:px-6 shrink-0">
      {/* Mobile Menu Toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={toggleSidebar}
        aria-label="Toggle menu"
      >
        <Menu className="size-5" />
      </Button>

      {/* Breadcrumb */}
      <Breadcrumb className="flex-1">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage className="text-xs text-gray-400">
              {commonText.home[lang]}
            </BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-medium text-gray-800">
              {sectionLabel}
            </BreadcrumbPage>
          </BreadcrumbItem>
          {subLabel && subLabel !== sectionLabel && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="text-sm text-gray-600">
                  {subLabel}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      {/* Search */}
      <Button variant="ghost" size="icon" className="text-gray-500" aria-label="Search">
        <Search className="size-5" />
      </Button>

      {/* Notifications */}
      <Button variant="ghost" size="icon" className="relative text-gray-500" aria-label="Notifications">
        <Bell className="size-5" />
        <span className="absolute -top-0.5 -left-0.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
          3
        </span>
      </Button>

      {/* User Avatar */}
      <Avatar className="size-9 cursor-pointer ring-2 ring-emerald-100 transition hover:ring-emerald-300">
        <AvatarFallback className="bg-emerald-100 text-emerald-700 text-sm font-bold">
          {lang === 'ar' ? 'م' : 'A'}
        </AvatarFallback>
      </Avatar>
    </header>
  )
}
