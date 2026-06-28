'use client'

import React from 'react'
import { Menu, Home } from 'lucide-react'
import { useAppStore, navItemLabels, navGroups, type NavItem } from '@/stores/app-store'
import { Button } from '@/components/ui/button'
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb'

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
  const { activeItem, lang, setSidebarOpen, setActiveItem, detailBreadcrumb } = useAppStore()

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
          title={lang === 'ar' ? 'القائمة' : 'Menu'}
        >
          <Menu className="size-5" />
        </Button>

        {/* Breadcrumb — L2-HIGH-001/002 fix: clickable shadcn Breadcrumb + detail level */}
        <Breadcrumb dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink
                className="cursor-pointer hover:text-foreground"
                onClick={() => setActiveItem('dashboard')}
              >
                <Home className="size-3.5" />
                <span className="sr-only">{lang === 'ar' ? 'الرئيسية' : 'Home'}</span>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {currentGroup && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink
                    className="cursor-pointer hover:text-foreground"
                    onClick={() => setActiveItem(currentGroup.items[0])}
                  >
                    {currentGroup.label[lang]}
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </>
            )}
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {detailBreadcrumb ? (
                <BreadcrumbLink
                  className="cursor-pointer hover:text-foreground"
                  onClick={() => setActiveItem(activeItem)}
                >
                  {currentLabel[lang]}
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{currentLabel[lang]}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
            {detailBreadcrumb && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{detailBreadcrumb[lang]}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>

        {/* Spacer */}
        <div className="flex-1" />
      </div>
    </header>
  )
}
