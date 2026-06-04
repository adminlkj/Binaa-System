'use client'

import React, { useState } from 'react'
import {
  LayoutDashboard, ShoppingCart, FileText, Users, Truck, HardHat,
  ClipboardList, Clock, ListChecks, Receipt, Wrench, Wallet,
  Package, Calculator, Percent, BarChart3, Settings, ChevronDown,
  Globe, Menu, X, Layers, UserCheck, Briefcase,
} from 'lucide-react'
import {
  useAppStore,
  navGroups,
  navItemLabels,
  type NavItem,
  type NavGroup,
} from '@/stores/app-store'
import { cn } from '@/lib/utils'
import { MoneyDisplay } from '@/components/ui/money-display'

// Icon mapping for each nav item
const navItemIcons: Record<NavItem, React.ElementType> = {
  'dashboard': LayoutDashboard,
  'sales': ShoppingCart,
  'purchases': Truck,
  'extracts': FileText,
  'clients': Users,
  'suppliers': Briefcase,
  'subcontractors': HardHat,
  'projects': Layers,
  'contracts': FileText,
  'timesheets': Clock,
  'boq': ListChecks,
  'expenses': Receipt,
  'labor-costs': UserCheck,
  'equipment': Wrench,
  'advances': Wallet,
  'petty-cash': Package,
  'inventory': Package,
  'accounting': Calculator,
  'vat': Percent,
  'reports': BarChart3,
  'settings': Settings,
}

// ============ Desktop Sidebar ============

export function Sidebar() {
  const { activeItem, setActiveItem, lang, toggleLang, sidebarCollapsed, setSidebarCollapsed } = useAppStore()
  const [expandedGroups, setExpandedGroups] = useState<Set<NavGroup>>(
    new Set(['home', 'sales-purchases', 'projects-costs'])
  )

  const toggleGroup = (group: NavGroup) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  const handleItemClick = (item: NavItem) => {
    setActiveItem(item)
  }

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col border-l bg-card transition-all duration-300 h-screen sticky top-0',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
      dir="rtl"
    >
      {/* Header */}
      <div className={cn(
        'flex items-center border-b px-3 h-14',
        sidebarCollapsed ? 'justify-center' : 'gap-3'
      )}>
        {!sidebarCollapsed && (
          <>
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold text-sm">
              ب
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-bold truncate">بِنَاء</h1>
              <p className="text-[10px] text-muted-foreground truncate">نظام إدارة المقاولات</p>
            </div>
          </>
        )}
        {sidebarCollapsed && (
          <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold text-sm">
            ب
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin">
        {navGroups.map(group => {
          const isExpanded = expandedGroups.has(group.key)
          const hasActiveItem = group.items.includes(activeItem)

          return (
            <div key={group.key} className="mb-1">
              {/* Group Header */}
              {!sidebarCollapsed ? (
                <button
                  onClick={() => toggleGroup(group.key)}
                  className={cn(
                    'flex items-center w-full px-3 py-2 text-xs font-semibold uppercase tracking-wider',
                    'text-muted-foreground hover:text-foreground transition-colors',
                    hasActiveItem && 'text-emerald-600'
                  )}
                >
                  <span className="flex-1 text-right">{group.label[lang]}</span>
                  <ChevronDown
                    className={cn(
                      'size-3.5 transition-transform',
                      isExpanded ? 'rotate-180' : 'rotate-0'
                    )}
                  />
                </button>
              ) : (
                <div className="px-2 py-1.5 my-1 border-t border-border mx-2" />
              )}

              {/* Group Items */}
              {isExpanded && group.items.map(item => {
                const Icon = navItemIcons[item]
                const isActive = activeItem === item
                const label = navItemLabels[item]

                return (
                  <button
                    key={item}
                    onClick={() => handleItemClick(item)}
                    className={cn(
                      'flex items-center w-full transition-colors text-sm',
                      sidebarCollapsed
                        ? 'justify-center px-2 py-2.5 mx-1 rounded-lg'
                        : 'px-4 py-2 gap-3 border-r-2',
                      isActive
                        ? sidebarCollapsed
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-emerald-50/50 text-emerald-700 border-emerald-600 font-medium'
                        : sidebarCollapsed
                          ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground border-transparent'
                    )}
                    title={sidebarCollapsed ? label[lang] : undefined}
                  >
                    <Icon className="size-4 shrink-0" />
                    {!sidebarCollapsed && (
                      <span className="truncate">{label[lang]}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t p-2 space-y-1">
        {/* Language Toggle */}
        <button
          onClick={toggleLang}
          className={cn(
            'flex items-center w-full rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors text-sm',
            sidebarCollapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2'
          )}
          title={lang === 'ar' ? 'Switch to English' : 'التبديل للعربية'}
        >
          <Globe className="size-4 shrink-0" />
          {!sidebarCollapsed && (
            <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
          )}
        </button>

        {/* Collapse Toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className={cn(
            'flex items-center w-full rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors text-sm',
            sidebarCollapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2'
          )}
          title={sidebarCollapsed ? 'توسيع' : 'تصغير'}
        >
          <Menu className="size-4 shrink-0" />
          {!sidebarCollapsed && (
            <span>{sidebarCollapsed ? 'توسيع' : 'تصغير القائمة'}</span>
          )}
        </button>
      </div>
    </aside>
  )
}

// ============ Mobile Sidebar ============

export function MobileSidebar() {
  const { activeItem, setActiveItem, sidebarOpen, setSidebarOpen, lang, toggleLang } = useAppStore()
  const [expandedGroups, setExpandedGroups] = useState<Set<NavGroup>>(
    new Set(['home', 'sales-purchases', 'projects-costs', 'inventory-accounting', 'reports-settings'])
  )

  const toggleGroup = (group: NavGroup) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  if (!sidebarOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        onClick={() => setSidebarOpen(false)}
      />

      {/* Drawer */}
      <div
        className="fixed inset-y-0 right-0 z-50 w-72 bg-card shadow-xl lg:hidden"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 h-14">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold text-sm">
              ب
            </div>
            <div>
              <h1 className="text-sm font-bold">بِنَاء</h1>
              <p className="text-[10px] text-muted-foreground">نظام إدارة المقاولات</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="size-8 flex items-center justify-center rounded-lg hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 max-h-[calc(100vh-8rem)]">
          {navGroups.map(group => {
            const isExpanded = expandedGroups.has(group.key)
            const hasActiveItem = group.items.includes(activeItem)

            return (
              <div key={group.key} className="mb-1">
                <button
                  onClick={() => toggleGroup(group.key)}
                  className={cn(
                    'flex items-center w-full px-4 py-2 text-xs font-semibold uppercase tracking-wider',
                    'text-muted-foreground hover:text-foreground transition-colors',
                    hasActiveItem && 'text-emerald-600'
                  )}
                >
                  <span className="flex-1 text-right">{group.label[lang]}</span>
                  <ChevronDown
                    className={cn(
                      'size-3.5 transition-transform',
                      isExpanded ? 'rotate-180' : 'rotate-0'
                    )}
                  />
                </button>

                {isExpanded && group.items.map(item => {
                  const Icon = navItemIcons[item]
                  const isActive = activeItem === item
                  const label = navItemLabels[item]

                  return (
                    <button
                      key={item}
                      onClick={() => {
                        setActiveItem(item)
                        setSidebarOpen(false)
                      }}
                      className={cn(
                        'flex items-center w-full px-6 py-2.5 gap-3 border-r-2 text-sm transition-colors',
                        isActive
                          ? 'bg-emerald-50/50 text-emerald-700 border-emerald-600 font-medium'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground border-transparent'
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span>{label[lang]}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="border-t p-3">
          <button
            onClick={toggleLang}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Globe className="size-4" />
            <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
          </button>
        </div>
      </div>
    </>
  )
}
