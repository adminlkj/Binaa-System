'use client'

import React, { useState } from 'react'
import {
  LayoutDashboard, Building2, Truck, Users, Package, Wrench,
  Calculator, Settings, ChevronDown, Globe, Menu, X,
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

// Cycle colors
const groupColors: Record<NavGroup, { bg: string; text: string; border: string; light: string; dot: string }> = {
  'projects-cycle': { bg: 'bg-emerald-600', text: 'text-emerald-600', border: 'border-emerald-300', light: 'bg-emerald-50', dot: 'bg-emerald-500' },
  'rental-cycle': { bg: 'bg-cyan-600', text: 'text-cyan-600', border: 'border-cyan-300', light: 'bg-cyan-50', dot: 'bg-cyan-500' },
  'costs-cycle': { bg: 'bg-amber-600', text: 'text-amber-600', border: 'border-amber-300', light: 'bg-amber-50', dot: 'bg-amber-500' },
  'subcontractors-cycle': { bg: 'bg-orange-600', text: 'text-orange-600', border: 'border-orange-300', light: 'bg-orange-50', dot: 'bg-orange-500' },
  'hr-cycle': { bg: 'bg-violet-600', text: 'text-violet-600', border: 'border-violet-300', light: 'bg-violet-50', dot: 'bg-violet-500' },
  'accounting-cycle': { bg: 'bg-teal-600', text: 'text-teal-600', border: 'border-teal-300', light: 'bg-teal-50', dot: 'bg-teal-500' },
  'reports-cycle': { bg: 'bg-fuchsia-600', text: 'text-fuchsia-600', border: 'border-fuchsia-300', light: 'bg-fuchsia-50', dot: 'bg-fuchsia-500' },
  'settings-cycle': { bg: 'bg-slate-600', text: 'text-slate-600', border: 'border-slate-300', light: 'bg-slate-50', dot: 'bg-slate-500' },
  'users-cycle': { bg: 'bg-rose-600', text: 'text-rose-600', border: 'border-rose-300', light: 'bg-rose-50', dot: 'bg-rose-500' },
}

// ============ Desktop Sidebar ============

export function Sidebar() {
  const { activeItem, setActiveItem, lang, toggleLang, sidebarCollapsed, setSidebarCollapsed } = useAppStore()

  // The active cycle is always expanded (derived during render — no effect needed).
  // `manualOpen` tracks cycles the user explicitly opened beyond the active one.
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

  // In collapsed mode, clicking a cycle icon expands the sidebar and navigates
  // to the first stage of that cycle (which auto-expands it).
  const handleCollapsedCycleClick = (group: NavGroup) => {
    setSidebarCollapsed(false)
    const groupConfig = navGroups.find(g => g.key === group)
    if (groupConfig && groupConfig.items.length > 0) {
      setActiveItem(groupConfig.items[0])
    }
  }

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col border-l bg-card transition-all duration-300 h-screen sticky top-0',
        sidebarCollapsed ? 'w-16' : 'w-72'
      )}
      dir="rtl"
    >
      {/* Header */}
      <div className={cn(
        'flex items-center border-b px-3 h-14 shrink-0',
        sidebarCollapsed ? 'justify-center' : 'gap-3'
      )}>
        {!sidebarCollapsed ? (
          <>
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold text-sm">
              ب
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-bold truncate">بِنَاء</h1>
              <p className="text-[10px] text-muted-foreground truncate">نظام إدارة المقاولات</p>
            </div>
          </>
        ) : (
          <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold text-sm">
            ب
          </div>
        )}
      </div>

      {/* Standalone Dashboard button */}
      <div className="border-b py-1 px-2 shrink-0">
        <button
          onClick={() => handleItemClick('dashboard')}
          className={cn(
            'flex items-center w-full rounded-lg transition-colors text-sm font-medium',
            sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'gap-2.5 px-2 py-2',
            activeItem === 'dashboard'
              ? 'bg-gray-100 text-gray-900'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
          title={lang === 'ar' ? 'لوحة التحكم' : 'Dashboard'}
        >
          <LayoutDashboard className="size-4 shrink-0" />
          {!sidebarCollapsed && <span>{lang === 'ar' ? 'لوحة التحكم' : 'Dashboard'}</span>}
        </button>
      </div>

      {/* Navigation — 9 cycles */}
      <nav className="flex-1 overflow-y-auto py-1 scrollbar-thin">
        {navGroups.map(group => {
          const isExpanded = isGroupExpanded(group.key)
          const hasActiveItem = group.items.includes(activeItem)
          const GroupIcon = groupIcons[group.key] || FallbackIcon
          const colors = groupColors[group.key]

          return (
            <div key={group.key} className="mb-0.5">
              {/* Cycle Header */}
              {!sidebarCollapsed ? (
                <button
                  onClick={() => toggleGroup(group.key)}
                  className={cn(
                    'flex items-center w-full px-3 py-2 text-[13px] font-bold transition-colors',
                    hasActiveItem
                      ? cn(colors.text, colors.light, 'border-r-4', colors.border)
                      : 'text-foreground hover:bg-muted/50',
                  )}
                >
                  <GroupIcon className={cn('size-4 ml-2 shrink-0', hasActiveItem ? colors.text : 'text-muted-foreground')} />
                  <span className="flex-1 text-right">{group.label[lang]}</span>
                  <span className={cn('text-[10px] font-normal px-1.5 py-0.5 rounded-full', hasActiveItem ? cn(colors.light, colors.text, 'ring-1', colors.border) : 'bg-muted text-muted-foreground')}>
                    {group.items.length}
                  </span>
                  <ChevronDown
                    className={cn(
                      'size-3.5 mr-1 transition-transform',
                      isExpanded ? 'rotate-180' : 'rotate-0'
                    )}
                  />
                </button>
              ) : (
                <div className="px-1.5 py-1 my-0.5">
                  <button
                    onClick={() => handleCollapsedCycleClick(group.key)}
                    className={cn(
                      'flex items-center justify-center w-full rounded-md py-2 transition-colors',
                      hasActiveItem ? colors.light : 'hover:bg-muted'
                    )}
                    title={group.label[lang]}
                  >
                    <GroupIcon className={cn('size-4', hasActiveItem ? colors.text : 'text-muted-foreground')} />
                  </button>
                </div>
              )}

              {/* Cycle Stages — sequential numbered steps */}
              {isExpanded && !sidebarCollapsed && group.items.map((item, idx) => {
                const Icon = navItemIcons[item] || FallbackIcon
                const isActive = activeItem === item
                const label = navItemLabels[item] || { ar: item, en: item }
                const stepNumber = idx + 1
                const isLastStep = idx === group.items.length - 1

                return (
                  <button
                    key={item}
                    onClick={() => handleItemClick(item)}
                    className={cn(
                      'flex items-center w-full transition-colors text-sm relative',
                      'px-3 py-1.5 gap-2 border-r-2',
                      isActive
                        ? cn(colors.light, colors.text, 'border-r-4 font-semibold', colors.border)
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground border-transparent'
                    )}
                    title={label[lang]}
                  >
                    {/* Sequential step indicator */}
                    <span
                      className={cn(
                        'flex items-center justify-center size-5 rounded-full text-[10px] font-bold shrink-0',
                        isActive
                          ? cn(colors.bg, 'text-white')
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {stepNumber}
                    </span>
                    <Icon className="size-3.5 shrink-0" />
                    <span className="truncate flex-1 text-right">{label[lang]}</span>
                    {/* Arrow indicator showing flow direction (except last step) */}
                    {!isLastStep && (
                      <span className="text-muted-foreground/40 text-[10px] shrink-0" aria-hidden>↓</span>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t p-2 space-y-1 shrink-0">
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
          title={lang === 'ar'
            ? (sidebarCollapsed ? 'توسيع القائمة' : 'تصغير القائمة')
            : (sidebarCollapsed ? 'Expand Menu' : 'Collapse Menu')}
        >
          <Menu className="size-4 shrink-0" />
          {!sidebarCollapsed && (
            <span>{lang === 'ar'
              ? (sidebarCollapsed ? 'توسيع القائمة' : 'تصغير القائمة')
              : (sidebarCollapsed ? 'Expand Menu' : 'Collapse Menu')}</span>
          )}
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

        {/* Standalone Dashboard button */}
        <div className="border-b py-1 px-2">
          <button
            onClick={() => {
              setActiveItem('dashboard')
              setSidebarOpen(false)
            }}
            className={cn(
              'flex items-center w-full rounded-lg transition-colors text-sm font-medium gap-2.5 px-2 py-2',
              activeItem === 'dashboard'
                ? 'bg-gray-100 text-gray-900'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <LayoutDashboard className="size-4 shrink-0" />
            <span>{lang === 'ar' ? 'لوحة التحكم' : 'Dashboard'}</span>
          </button>
        </div>

        {/* Navigation — 9 cycles */}
        <nav className="py-1">
          {navGroups.map(group => {
            const isExpanded = isGroupExpanded(group.key)
            const hasActiveItem = group.items.includes(activeItem)
            const GroupIcon = groupIcons[group.key] || FallbackIcon
            const colors = groupColors[group.key]

            return (
              <div key={group.key} className="mb-0.5">
                <button
                  onClick={() => toggleGroup(group.key)}
                  className={cn(
                    'flex items-center w-full px-3 py-2 text-[13px] font-bold transition-colors',
                    hasActiveItem
                      ? cn(colors.text, colors.light, 'border-r-4', colors.border)
                      : 'text-foreground hover:bg-muted/50',
                  )}
                >
                  <GroupIcon className={cn('size-4 ml-2 shrink-0', hasActiveItem ? colors.text : 'text-muted-foreground')} />
                  <span className="flex-1 text-right">{group.label[lang]}</span>
                  <span className={cn('text-[10px] font-normal px-1.5 py-0.5 rounded-full', hasActiveItem ? cn(colors.light, colors.text, 'ring-1', colors.border) : 'bg-muted text-muted-foreground')}>
                    {group.items.length}
                  </span>
                  <ChevronDown
                    className={cn(
                      'size-3.5 mr-1 transition-transform',
                      isExpanded ? 'rotate-180' : 'rotate-0'
                    )}
                  />
                </button>

                {isExpanded && group.items.map((item, idx) => {
                  const Icon = navItemIcons[item] || FallbackIcon
                  const isActive = activeItem === item
                  const label = navItemLabels[item] || { ar: item, en: item }
                  const stepNumber = idx + 1
                  const isLastStep = idx === group.items.length - 1

                  return (
                    <button
                      key={item}
                      onClick={() => {
                        setActiveItem(item)
                        setSidebarOpen(false)
                      }}
                      className={cn(
                        'flex items-center w-full px-3 py-1.5 gap-2 border-r-2 text-sm transition-colors',
                        isActive
                          ? cn(colors.light, colors.text, 'border-r-4 font-semibold', colors.border)
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground border-transparent'
                      )}
                    >
                      <span
                        className={cn(
                          'flex items-center justify-center size-5 rounded-full text-[10px] font-bold shrink-0',
                          isActive
                            ? cn(colors.bg, 'text-white')
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {stepNumber}
                      </span>
                      <Icon className="size-3.5 shrink-0" />
                      <span className="flex-1 text-right">{label[lang]}</span>
                      {!isLastStep && (
                        <span className="text-muted-foreground/40 text-[10px] shrink-0" aria-hidden>↓</span>
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
