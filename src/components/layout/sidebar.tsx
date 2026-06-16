'use client'

import React, { useState } from 'react'
import {
  LayoutDashboard, Building2, Truck, Users, Package, Wrench,
  Calculator, Settings, ChevronDown, Globe, Menu, X,
  FileText, ClipboardList, TrendingUp, Clock, CreditCard,
  Fuel as FuelIcon, UsersRound, CalendarDays, Banknote,
  PackageCheck, FilePlus, ReceiptText, Cog, Network,
  Receipt, ArrowRightLeft, Hammer, ListChecks, HardHat,
  DollarSign, Warehouse, Link2,
} from 'lucide-react'
import {
  useAppStore,
  navGroups,
  navItemLabels,
  navItemActivity,
  type NavItem,
  type NavGroup,
} from '@/stores/app-store'
import { cn } from '@/lib/utils'

// Icon mapping for each nav item
const navItemIcons: Record<NavItem, React.ElementType> = {
  'dashboard': LayoutDashboard,
  // Construction Hub
  'projects': Building2,
  'contracts': FileText,
  'boq': ListChecks,
  'extracts': TrendingUp,
  'sales': Receipt,
  'client-payments': CreditCard,
  // Rental Hub
  'equipment': Truck,
  'rental-contracts': FileText,
  'delivery-orders': ArrowRightLeft,
  'timesheets': Clock,
  'rental-invoices': Receipt,
  'rental-payments': CreditCard,
  // HR
  'employees': Users,
  'employee-contracts': FileText,
  'attendance': CalendarDays,
  'salaries': Banknote,
  'work-teams': UsersRound,
  'resource-distribution': Network,
  // Supply Chain
  'purchase-requests': FilePlus,
  'purchase-orders': ClipboardList,
  'goods-receipt': PackageCheck,
  'supplier-invoices': ReceiptText,
  'supplier-payments': CreditCard,
  // Operations
  'equipment-operations': Cog,
  'equipment-maintenance': Wrench,
  'fuel': FuelIcon,
  'subcontractors': HardHat,
  'expenses': DollarSign,
  // Accounting
  'accounting': Calculator,
  'vat': ReceiptText,
  'reports': TrendingUp,
  // Settings
  'clients': Users,
  'suppliers': Package,
  'inventory': Warehouse,
  'settings': Settings,
  'accounting-mapping': Link2,
}

// Hub group icons
const groupIcons: Record<NavGroup, React.ElementType> = {
  'home': LayoutDashboard,
  'construction-hub': Building2,
  'rental-hub': Truck,
  'hr': Users,
  'supply-chain': Package,
  'operations': Wrench,
  'accounting-reports': Calculator,
  'settings-data': Settings,
}

// Hub group colors for the header
const groupColors: Record<NavGroup, { bg: string; text: string; border: string; light: string }> = {
  'home': { bg: 'bg-gray-600', text: 'text-gray-600', border: 'border-gray-300', light: 'bg-gray-50' },
  'construction-hub': { bg: 'bg-emerald-600', text: 'text-emerald-600', border: 'border-emerald-300', light: 'bg-emerald-50' },
  'rental-hub': { bg: 'bg-cyan-600', text: 'text-cyan-600', border: 'border-cyan-300', light: 'bg-cyan-50' },
  'hr': { bg: 'bg-violet-600', text: 'text-violet-600', border: 'border-violet-300', light: 'bg-violet-50' },
  'supply-chain': { bg: 'bg-amber-600', text: 'text-amber-600', border: 'border-amber-300', light: 'bg-amber-50' },
  'operations': { bg: 'bg-orange-600', text: 'text-orange-600', border: 'border-orange-300', light: 'bg-orange-50' },
  'accounting-reports': { bg: 'bg-teal-600', text: 'text-teal-600', border: 'border-teal-300', light: 'bg-teal-50' },
  'settings-data': { bg: 'bg-gray-500', text: 'text-gray-500', border: 'border-gray-300', light: 'bg-gray-50' },
}

// ============ Desktop Sidebar ============

export function Sidebar() {
  const { activeItem, setActiveItem, lang, toggleLang, sidebarCollapsed, setSidebarCollapsed } = useAppStore()
  const [expandedGroups, setExpandedGroups] = useState<Set<NavGroup>>(
    new Set(['home', 'construction-hub', 'rental-hub'])
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
      <nav className="flex-1 overflow-y-auto py-1 scrollbar-thin">
        {navGroups.map(group => {
          const isExpanded = expandedGroups.has(group.key)
          const hasActiveItem = group.items.includes(activeItem)
          const GroupIcon = groupIcons[group.key]
          const colors = groupColors[group.key]
          const isHub = group.key === 'construction-hub' || group.key === 'rental-hub'

          return (
            <div key={group.key} className="mb-0.5">
              {/* Group Header */}
              {!sidebarCollapsed ? (
                <button
                  onClick={() => toggleGroup(group.key)}
                  className={cn(
                    'flex items-center w-full px-3 py-1.5 text-xs font-semibold tracking-wider transition-colors',
                    isHub ? 'border-r-4 pr-2' : '',
                    hasActiveItem && isHub
                      ? cn(colors.text, colors.border, colors.light, 'border-r-4')
                      : hasActiveItem
                        ? 'text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <GroupIcon className="size-3.5 ml-1.5 shrink-0" />
                  <span className="flex-1 text-right uppercase">{group.label[lang]}</span>
                  <ChevronDown
                    className={cn(
                      'size-3 transition-transform',
                      isExpanded ? 'rotate-180' : 'rotate-0'
                    )}
                  />
                </button>
              ) : (
                <div className="px-2 py-1 my-0.5">
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className={cn(
                      'flex items-center justify-center w-full rounded-md py-1.5 transition-colors',
                      hasActiveItem ? colors.light : 'hover:bg-muted'
                    )}
                    title={group.label[lang]}
                  >
                    <GroupIcon className={cn('size-4', hasActiveItem ? colors.text : 'text-muted-foreground')} />
                  </button>
                </div>
              )}

              {/* Group Items */}
              {isExpanded && group.items.map(item => {
                const Icon = navItemIcons[item]
                const isActive = activeItem === item
                const label = navItemLabels[item]
                const activity = navItemActivity[item]

                return (
                  <button
                    key={item}
                    onClick={() => handleItemClick(item)}
                    className={cn(
                      'flex items-center w-full transition-colors text-sm',
                      sidebarCollapsed
                        ? 'justify-center px-2 py-2.5 mx-1 rounded-lg'
                        : 'px-4 py-1.5 gap-2.5 border-r-2',
                      isActive
                        ? sidebarCollapsed
                          ? cn(colors.light, colors.text)
                          : cn(colors.light, colors.text, 'border-r-4 font-medium', isHub ? colors.border : 'border-emerald-500')
                        : sidebarCollapsed
                          ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground border-transparent'
                    )}
                    title={sidebarCollapsed ? label[lang] : undefined}
                  >
                    <Icon className="size-4 shrink-0" />
                    {!sidebarCollapsed && (
                      <span className="truncate flex-1 text-right">{label[lang]}</span>
                    )}
                    {!sidebarCollapsed && activity === 'construction' && (
                      <div className="size-2 rounded-full bg-emerald-500 shrink-0" title={lang === 'ar' ? 'مشاريع تنفيذية' : 'Construction'} />
                    )}
                    {!sidebarCollapsed && activity === 'rental' && (
                      <div className="size-2 rounded-full bg-cyan-500 shrink-0" title={lang === 'ar' ? 'تأجير معدات' : 'Equipment Rental'} />
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* Activity Legend */}
      {!sidebarCollapsed && (
        <div className="border-t px-3 py-2 space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            {lang === 'ar' ? 'النشاط' : 'Activity'}
          </p>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="size-2 rounded-full bg-emerald-500" />
              <span className="text-[10px] text-muted-foreground">{lang === 'ar' ? 'تنفيذي' : 'Const.'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="size-2 rounded-full bg-cyan-500" />
              <span className="text-[10px] text-muted-foreground">{lang === 'ar' ? 'تأجير' : 'Rental'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t p-2 space-y-1">
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
    new Set(['home', 'construction-hub', 'rental-hub', 'hr', 'supply-chain', 'operations', 'accounting-reports', 'settings-data'])
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
        className="fixed inset-y-0 right-0 z-50 w-72 bg-card shadow-xl lg:hidden overflow-y-auto"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 h-14 sticky top-0 bg-card z-10">
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
        <nav className="py-2">
          {navGroups.map(group => {
            const isExpanded = expandedGroups.has(group.key)
            const hasActiveItem = group.items.includes(activeItem)
            const GroupIcon = groupIcons[group.key]
            const colors = groupColors[group.key]
            const isHub = group.key === 'construction-hub' || group.key === 'rental-hub'

            return (
              <div key={group.key} className="mb-0.5">
                <button
                  onClick={() => toggleGroup(group.key)}
                  className={cn(
                    'flex items-center w-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors',
                    isHub && hasActiveItem ? cn(colors.text, colors.light) : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <GroupIcon className="size-3.5 ml-1.5 shrink-0" />
                  <span className="flex-1 text-right">{group.label[lang]}</span>
                  <ChevronDown
                    className={cn(
                      'size-3 transition-transform',
                      isExpanded ? 'rotate-180' : 'rotate-0'
                    )}
                  />
                </button>

                {isExpanded && group.items.map(item => {
                  const Icon = navItemIcons[item]
                  const isActive = activeItem === item
                  const label = navItemLabels[item]
                  const activity = navItemActivity[item]

                  return (
                    <button
                      key={item}
                      onClick={() => {
                        setActiveItem(item)
                        setSidebarOpen(false)
                      }}
                      className={cn(
                        'flex items-center w-full px-6 py-2 gap-2.5 border-r-2 text-sm transition-colors',
                        isActive
                          ? cn(colors.light, colors.text, 'font-medium', isHub ? colors.border : 'border-emerald-500')
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground border-transparent'
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="flex-1">{label[lang]}</span>
                      {activity === 'construction' && (
                        <div className="size-2 rounded-full bg-emerald-500 shrink-0" />
                      )}
                      {activity === 'rental' && (
                        <div className="size-2 rounded-full bg-cyan-500 shrink-0" />
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="border-t p-3 sticky bottom-0 bg-card">
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
