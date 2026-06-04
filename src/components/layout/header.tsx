'use client'

import React from 'react'
import { Menu, Bell, Search } from 'lucide-react'
import { useAppStore, navItemLabels, navGroups, type NavItem } from '@/stores/app-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// Find which group a nav item belongs to
function findGroupForItem(item: NavItem): { group: string; item: string } | null {
  for (const group of navGroups) {
    if (group.items.includes(item)) {
      return { group: group.key, item }
    }
  }
  return null
}

export function Header() {
  const { activeItem, lang, toggleSidebar, setSidebarOpen } = useAppStore()

  const currentLabel = navItemLabels[activeItem]
  const groupInfo = findGroupForItem(activeItem)
  const currentGroup = groupInfo
    ? navGroups.find(g => g.key === groupInfo.group)
    : null

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center gap-4 px-4">
        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu className="size-5" />
        </Button>

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm" dir="rtl">
          {currentGroup && (
            <>
              <span className="text-muted-foreground">
                {currentGroup.label[lang]}
              </span>
              <span className="text-muted-foreground">/</span>
            </>
          )}
          <span className="font-medium">
            {currentLabel[lang]}
          </span>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right side */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="size-9">
            <Search className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="relative size-9">
            <Bell className="size-4" />
            <Badge className="absolute -top-1 -right-1 size-4 p-0 flex items-center justify-center text-[9px] bg-emerald-600">
              3
            </Badge>
          </Button>
        </div>
      </div>
    </header>
  )
}
