'use client'

import React, { useState } from 'react'
import {
  LayoutDashboard, Building2, Truck, Users, Package, Wrench,
  Calculator, Settings, ChevronDown, Globe, X,
  FileText, ClipboardList, TrendingUp, Clock, CreditCard,
  Fuel as FuelIcon, UsersRound, CalendarDays, Banknote,
  PackageCheck, FilePlus, ReceiptText, Cog, Network,
  Receipt, ArrowRightLeft, ListChecks, HardHat,
  DollarSign, Warehouse, Link2, Wallet, Circle,
  TrendingDown, CalendarRange, HandCoins, Coins, FileSignature,
  ShieldCheck,
} from 'lucide-react'
import {
  useAppStore,
  navGroups,
  navItemLabels,
  findCycleForItem,
  type NavItem,
  type NavGroup,
} from '@/stores/app-store'
import { cn } from '@/lib/utils'

// Icon mapping for each nav item
const navItemIcons: Record<NavItem, React.ElementType> = {
  'dashboard': LayoutDashboard,
  'business-flows': TrendingUp,
  // Construction Hub
  'projects': Building2,
  'contracts': FileText,
  'boq': ListChecks,
  'extracts': TrendingUp,
  'sales': Receipt,
  'service-invoices': FileSignature,
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
  'payroll-runs': Wallet,
  'salaries': Banknote,
  'salary-payments': Coins,
  'advances': HandCoins,
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
  'labor': HardHat,
  'petty-cash': Wallet,
  // Accounting
  'accounting': Calculator,
  'depreciation': TrendingDown,
  'financial-years': CalendarRange,
  'vat': ReceiptText,
  'reports': TrendingUp,
  // Settings
  'clients': Users,
  'suppliers': Package,
  'inventory': Warehouse,
  'settings': Settings,
  'accounting-mapping': Link2,
  'users': ShieldCheck,
}

// Fallback icon for safety (prevents 'Element type is invalid' crashes)
const FallbackIcon = Circle

// Cycle group icons — one per cycle
const groupIcons: Record<NavGroup, React.ElementType> = {
  'projects-cycle': Building2,
  'rental-cycle': Truck,
  'costs-cycle': Wallet,
  'subcontractors-cycle': HardHat,
  'hr-cycle': Users,
  'accounting-cycle': Calculator,
  'reports-cycle': FileText,
  'settings-cycle': Settings,
  'users-cycle': ShieldCheck,
}

// Cycle colors — accent for the active cycle header + active stage
const groupColors: Record<NavGroup, { text: string; border: string; light: string; bg: string }> = {
  'projects-cycle': { text: 'text-emerald-600', border: 'border-emerald-500', light: 'bg-emerald-50', bg: 'bg-emerald-600' },
  'rental-cycle': { text: 'text-cyan-600', border: 'border-cyan-500', light: 'bg-cyan-50', bg: 'bg-cyan-600' },
  'costs-cycle': { text: 'text-amber-600', border: 'border-amber-500', light: 'bg-amber-50', bg: 'bg-amber-600' },
  'subcontractors-cycle': { text: 'text-orange-600', border: 'border-orange-500', light: 'bg-orange-50', bg: 'bg-orange-600' },
  'hr-cycle': { text: 'text-violet-600', border: 'border-violet-500', light: 'bg-violet-50', bg: 'bg-violet-600' },
  'accounting-cycle': { text: 'text-teal-600', border: 'border-teal-500', light: 'bg-teal-50', bg: 'bg-teal-600' },
  'reports-cycle': { text: 'text-fuchsia-600', border: 'border-fuchsia-500', light: 'bg-fuchsia-50', bg: 'bg-fuchsia-600' },
  'settings-cycle': { text: 'text-slate-600', border: 'border-slate-500', light: 'bg-slate-50', bg: 'bg-slate-600' },
  'users-cycle': { text: 'text-rose-600', border: 'border-rose-500', light: 'bg-rose-50', bg: 'bg-rose-600' },
}

// Fixed sidebar width
const SIDEBAR_WIDTH = 'w-72'

// ============ Desktop Sidebar ============

export function Sidebar() {
  const { activeItem, setActiveItem, lang, toggleLang } = useAppStore()

  // The active cycle is always open. Other cycles can be opened manually.
  const [manualOpen, setManualOpen] = useState<Set<NavGroup>>(new Set())
  const activeCycle = findCycleForItem(activeItem)

  const isGroupExpanded = (group: NavGroup) => group === activeCycle || manualOpen.has(group)

  const toggleGroup = (group: NavGroup) => {
    if (group === activeCycle) return // active cycle stays open
    setManualOpen(prev => {
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
        'hidden lg:flex flex-col border-l bg-card h-screen sticky top-0 shrink-0',
        SIDEBAR_WIDTH
      )}
      dir="rtl"
    >
      {/* Header */}
      <div className="flex items-center border-b px-4 h-14 shrink-0 gap-3">
        <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold text-sm">
          ب
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold truncate">بِنَاء</h1>
          <p className="text-[10px] text-muted-foreground truncate">نظام إدارة المقاولات</p>
        </div>
      </div>

      {/* Standalone Dashboard button */}
      <div className="border-b px-3 py-1.5 shrink-0">
        <button
          onClick={() => handleItemClick('dashboard')}
          className={cn(
            'flex items-center w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors gap-2.5',
            activeItem === 'dashboard'
              ? 'bg-primary text-primary-foreground'
              : 'text-foreground hover:bg-muted'
          )}
        >
          <LayoutDashboard className="size-4 shrink-0" />
          <span>{lang === 'ar' ? 'لوحة التحكم' : 'Dashboard'}</span>
        </button>
      </div>

      {/* Navigation — 9 cycles, fixed width, clean & simple */}
      <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin">
        {navGroups.map(group => {
          const isExpanded = isGroupExpanded(group.key)
          const hasActiveItem = group.items.includes(activeItem)
          const GroupIcon = groupIcons[group.key] || FallbackIcon
          const colors = groupColors[group.key]

          return (
            <div key={group.key} className="mb-1">
              {/* Cycle Header */}
              <button
                onClick={() => toggleGroup(group.key)}
                className={cn(
                  'flex items-center w-full px-3 py-2 text-sm font-semibold transition-colors rounded-lg mx-0',
                  hasActiveItem
                    ? cn(colors.text, colors.light)
                    : 'text-foreground hover:bg-muted/60'
                )}
              >
                <GroupIcon className={cn('size-4 ml-2.5 shrink-0', hasActiveItem ? colors.text : 'text-muted-foreground')} />
                <span className="flex-1 text-right">{group.label[lang]}</span>
                <ChevronDown
                  className={cn(
                    'size-4 transition-transform text-muted-foreground',
                    isExpanded ? 'rotate-180' : 'rotate-0'
                  )}
                />
              </button>

              {/* Cycle Stages — clean sequential list */}
              {isExpanded && (
                <div className="mt-0.5 mb-1">
                  {group.items.map(item => {
                    const Icon = navItemIcons[item] || FallbackIcon
                    const isActive = activeItem === item
                    const label = navItemLabels[item] || { ar: item, en: item }

                    return (
                      <button
                        key={item}
                        onClick={() => handleItemClick(item)}
                        className={cn(
                          'flex items-center w-full px-3 py-1.5 gap-2.5 text-sm transition-colors border-r-2',
                          isActive
                            ? cn(colors.light, colors.text, colors.border, 'font-medium')
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/40 border-transparent'
                        )}
                        title={label[lang]}
                      >
                        <Icon className="size-3.5 shrink-0" />
                        <span className="truncate flex-1 text-right">{label[lang]}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Footer — language only */}
      <div className="border-t p-2 shrink-0">
        <button
          onClick={toggleLang}
          className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Globe className="size-4 shrink-0" />
          <span>{lang === 'ar' ? 'English' : 'العربية'}</span>
        </button>
      </div>
    </aside>
  )
}

// ============ Mobile Sidebar ============

export function MobileSidebar() {
  const { activeItem, setActiveItem, sidebarOpen, setSidebarOpen, lang, toggleLang } = useAppStore()

  const [manualOpen, setManualOpen] = useState<Set<NavGroup>>(new Set())
  const activeCycle = findCycleForItem(activeItem)

  const isGroupExpanded = (group: NavGroup) => group === activeCycle || manualOpen.has(group)

  const toggleGroup = (group: NavGroup) => {
    if (group === activeCycle) return
    setManualOpen(prev => {
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

      {/* Drawer — fixed width */}
      <div
        className="fixed inset-y-0 right-0 z-50 bg-card shadow-xl lg:hidden overflow-y-auto"
        style={{ width: '18rem' }}
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

        {/* Standalone Dashboard button */}
        <div className="border-b px-3 py-1.5">
          <button
            onClick={() => {
              setActiveItem('dashboard')
              setSidebarOpen(false)
            }}
            className={cn(
              'flex items-center w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors gap-2.5',
              activeItem === 'dashboard'
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground hover:bg-muted'
            )}
          >
            <LayoutDashboard className="size-4 shrink-0" />
            <span>{lang === 'ar' ? 'لوحة التحكم' : 'Dashboard'}</span>
          </button>
        </div>

        {/* Navigation — 9 cycles, clean & simple */}
        <nav className="py-2">
          {navGroups.map(group => {
            const isExpanded = isGroupExpanded(group.key)
            const hasActiveItem = group.items.includes(activeItem)
            const GroupIcon = groupIcons[group.key] || FallbackIcon
            const colors = groupColors[group.key]

            return (
              <div key={group.key} className="mb-1">
                <button
                  onClick={() => toggleGroup(group.key)}
                  className={cn(
                    'flex items-center w-full px-3 py-2 text-sm font-semibold transition-colors rounded-lg mx-0',
                    hasActiveItem
                      ? cn(colors.text, colors.light)
                      : 'text-foreground hover:bg-muted/60'
                  )}
                >
                  <GroupIcon className={cn('size-4 ml-2.5 shrink-0', hasActiveItem ? colors.text : 'text-muted-foreground')} />
                  <span className="flex-1 text-right">{group.label[lang]}</span>
                  <ChevronDown
                    className={cn(
                      'size-4 transition-transform text-muted-foreground',
                      isExpanded ? 'rotate-180' : 'rotate-0'
                    )}
                  />
                </button>

                {isExpanded && (
                  <div className="mt-0.5 mb-1">
                    {group.items.map(item => {
                      const Icon = navItemIcons[item] || FallbackIcon
                      const isActive = activeItem === item
                      const label = navItemLabels[item] || { ar: item, en: item }

                      return (
                        <button
                          key={item}
                          onClick={() => {
                            setActiveItem(item)
                            setSidebarOpen(false)
                          }}
                          className={cn(
                            'flex items-center w-full px-3 py-1.5 gap-2.5 text-sm transition-colors border-r-2',
                            isActive
                              ? cn(colors.light, colors.text, colors.border, 'font-medium')
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/40 border-transparent'
                          )}
                        >
                          <Icon className="size-3.5 shrink-0" />
                          <span className="truncate flex-1 text-right">{label[lang]}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
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
