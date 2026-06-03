'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  LayoutDashboard,
  Building2,
  Users,
  Truck,
  Warehouse,
  KeyRound,
  Wallet,
  Handshake,
  BarChart3,
  Settings,
  Construction,
  Globe,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import {
  useAppStore,
  type SectionKey,
  type SubModuleKey,
  sectionLabels,
} from '@/stores/app-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// ============ NAVIGATION CONFIG ============

interface NavItem {
  key: SectionKey
  icon: React.ElementType
  defaultSubModule: SubModuleKey
}

const navItems: NavItem[] = [
  { key: 'dashboard', icon: LayoutDashboard, defaultSubModule: 'dashboard-main' },
  { key: 'projects', icon: Building2, defaultSubModule: 'project-list' },
  { key: 'resources', icon: Users, defaultSubModule: 'employees' },
  { key: 'supply-chain', icon: Truck, defaultSubModule: 'suppliers' },
  { key: 'warehouses', icon: Warehouse, defaultSubModule: 'warehouse-list' },
  { key: 'rental', icon: KeyRound, defaultSubModule: 'rental-contracts' },
  { key: 'finance', icon: Wallet, defaultSubModule: 'treasury' },
  { key: 'crm', icon: Handshake, defaultSubModule: 'clients' },
  { key: 'reports', icon: BarChart3, defaultSubModule: 'report-projects' },
  { key: 'admin', icon: Settings, defaultSubModule: 'users' },
]

// ============ SIDEBAR CONTENT ============

function SidebarContent({ collapsed, onToggleCollapse }: { collapsed: boolean; onToggleCollapse: () => void }) {
  const { activeSection, lang, toggleLang, navigateTo, setSidebarOpen } = useAppStore()

  const handleNavClick = useCallback((item: NavItem) => {
    navigateTo(item.key, item.defaultSubModule)
    // Close mobile drawer on navigation
    if (window.innerWidth < 1024) {
      setSidebarOpen(false)
    }
  }, [navigateTo, setSidebarOpen])

  return (
    <div className="flex h-full flex-col bg-white">
      {/* ── Logo Header ── */}
      <div
        className={cn(
          'flex items-center bg-gradient-to-l from-emerald-700 to-emerald-800 shrink-0 transition-all duration-300',
          collapsed ? 'px-2 py-4 justify-center' : 'gap-3 px-4 py-4'
        )}
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
          <Construction className="size-6 text-white" />
        </div>
        {!collapsed && (
          <div className="flex flex-1 flex-col min-w-0">
            <span className="text-lg font-bold text-white tracking-wide truncate">
              {lang === 'ar' ? 'بِنَاء ERP' : 'Binaa ERP'}
            </span>
            <span className="text-[11px] text-emerald-200 truncate">
              {lang === 'ar' ? 'نظام إدارة المقاولات' : 'Construction Management'}
            </span>
          </div>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto overscroll-contain px-2 py-3" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="flex flex-col gap-0.5">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeSection === item.key
            const labelText = sectionLabels[item.key][lang]

            // Collapsed: show tooltip + icon only
            if (collapsed) {
              return (
                <Tooltip key={item.key} delayDuration={0}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => handleNavClick(item)}
                      className={cn(
                        'flex w-full items-center justify-center rounded-lg p-3 transition-all duration-200',
                        'hover:bg-emerald-50 hover:text-emerald-700',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50',
                        isActive
                          ? 'bg-emerald-100 text-emerald-800 shadow-sm'
                          : 'text-gray-500'
                      )}
                      aria-label={labelText}
                    >
                      <Icon
                        className={cn(
                          'size-5 shrink-0',
                          isActive ? 'text-emerald-600' : 'text-gray-400'
                        )}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" sideOffset={8} className="font-medium">
                    {labelText}
                  </TooltipContent>
                </Tooltip>
              )
            }

            // Expanded: show icon + label
            return (
              <button
                key={item.key}
                onClick={() => handleNavClick(item)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  'hover:bg-emerald-50 hover:text-emerald-700',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50',
                  isActive
                    ? 'bg-emerald-100 text-emerald-800 shadow-sm'
                    : 'text-gray-600'
                )}
              >
                <Icon
                  className={cn(
                    'size-5 shrink-0',
                    isActive ? 'text-emerald-600' : 'text-gray-400'
                  )}
                />
                <span className="truncate">{labelText}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* ── Collapse Toggle (desktop only) ── */}
      <div className={cn('shrink-0 border-t border-gray-100 px-2 py-1.5', collapsed && 'flex justify-center')}>
        <Button
          variant="ghost"
          size={collapsed ? 'icon' : 'sm'}
          onClick={onToggleCollapse}
          className={cn(
            'text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors',
            !collapsed && 'w-full justify-center gap-2'
          )}
          aria-label={collapsed ? (lang === 'ar' ? 'توسيع القائمة' : 'Expand sidebar') : (lang === 'ar' ? 'تصغير القائمة' : 'Collapse sidebar')}
        >
          {collapsed ? (
            <ChevronsLeft className="size-4" />
          ) : (
            <>
              <ChevronsRight className="size-4" />
              <span className="text-xs">{lang === 'ar' ? 'تصغير' : 'Collapse'}</span>
            </>
          )}
        </Button>
      </div>

      {/* ── Footer: Language Toggle + User ── */}
      <div className="shrink-0 border-t border-gray-100">
        {/* Language Toggle */}
        <div className={cn('px-2 py-1.5', collapsed && 'flex justify-center')}>
          {collapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleLang}
                  className="text-gray-400 hover:text-emerald-700 hover:bg-emerald-50"
                  aria-label={lang === 'ar' ? 'Switch to English' : 'التبديل للعربية'}
                >
                  <Globe className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" sideOffset={8}>
                {lang === 'ar' ? 'English' : 'عربي'}
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLang}
              className="w-full justify-start gap-2 text-gray-500 hover:text-emerald-700 hover:bg-emerald-50"
            >
              <Globe className="size-4 shrink-0" />
              <span className="text-sm">{lang === 'ar' ? 'English' : 'عربي'}</span>
              <span className="mr-auto text-xs text-gray-400">
                {lang === 'ar' ? 'العربية' : 'EN'}
              </span>
            </Button>
          )}
        </div>

        {/* User Avatar */}
        <div className={cn('px-3 py-3 border-t border-gray-50', collapsed ? 'flex justify-center' : '')}>
          {collapsed ? (
            <div className="flex size-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold">
              {lang === 'ar' ? 'م' : 'A'}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold">
                {lang === 'ar' ? 'م' : 'A'}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-gray-700 truncate">
                  {lang === 'ar' ? 'مدير النظام' : 'System Admin'}
                </span>
                <span className="text-[11px] text-gray-400">admin@erp.com</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============ DESKTOP SIDEBAR ============

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col shrink-0 border-l border-gray-200 transition-all duration-300 ease-in-out',
        collapsed ? 'w-16' : 'w-[272px]'
      )}
    >
      <SidebarContent collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />
    </aside>
  )
}

// ============ MOBILE SIDEBAR (DRAWER) ============

export function MobileSidebar() {
  const { sidebarOpen, setSidebarOpen } = useAppStore()

  // Close drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sidebarOpen) {
        setSidebarOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [sidebarOpen, setSidebarOpen])

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 lg:hidden',
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Drawer - always expanded on mobile */}
      <div
        className={cn(
          'fixed inset-y-0 right-0 z-50 w-[272px] transform transition-transform duration-300 ease-in-out lg:hidden shadow-2xl',
          sidebarOpen ? 'translate-x-0' : 'translate-x-full'
        )}
        role="dialog"
        aria-modal={sidebarOpen}
        aria-label="Navigation menu"
      >
        <SidebarContent
          collapsed={false}
          onToggleCollapse={() => setSidebarOpen(false)}
        />
      </div>
    </>
  )
}
