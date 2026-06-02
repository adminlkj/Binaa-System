'use client'

import {
  LayoutDashboard,
  Building2,
  FileText,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Users,
  ClipboardList,
  HardHat,
  Truck,
  Wallet,
  Package,
  Calculator,
  Percent,
  BarChart3,
  Settings,
  Construction,
  Globe,
} from 'lucide-react'
import { useAppStore, type ModuleKey, labels, sectionLabels } from '@/stores/app-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface NavItem {
  key: ModuleKey
  icon: React.ElementType
}

interface NavSection {
  key: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    key: 'main',
    items: [
      { key: 'dashboard', icon: LayoutDashboard },
      { key: 'projects', icon: Building2 },
      { key: 'contracts', icon: FileText },
    ],
  },
  {
    key: 'salesPurchases',
    items: [
      { key: 'sales', icon: Receipt },
      { key: 'purchases', icon: ShoppingCart },
      { key: 'progress-claims', icon: TrendingUp },
      { key: 'subcontractors', icon: Users },
    ],
  },
  {
    key: 'costs',
    items: [
      { key: 'boq', icon: ClipboardList },
      { key: 'expenses', icon: Receipt },
      { key: 'labor', icon: HardHat },
      { key: 'equipment', icon: Truck },
      { key: 'advances', icon: Wallet },
    ],
  },
  {
    key: 'inventory',
    items: [
      { key: 'inventory', icon: Package },
    ],
  },
  {
    key: 'accounting',
    items: [
      { key: 'accounting', icon: Calculator },
      { key: 'vat', icon: Percent },
    ],
  },
  {
    key: 'reports',
    items: [
      { key: 'reports', icon: BarChart3 },
    ],
  },
  {
    key: 'settings',
    items: [
      { key: 'settings', icon: Settings },
    ],
  },
]

function NavItemButton({
  item,
  isActive,
  onClick,
  lang,
}: {
  item: NavItem
  isActive: boolean
  onClick: () => void
  lang: 'ar' | 'en'
}) {
  const Icon = item.icon
  const labelText = labels[item.key][lang]

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
        'hover:bg-emerald-50 hover:text-emerald-700',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50',
        isActive
          ? 'bg-emerald-100 text-emerald-800 shadow-sm'
          : 'text-gray-600'
      )}
    >
      <Icon className={cn('size-5 shrink-0', isActive ? 'text-emerald-600' : 'text-gray-400')} />
      <span className="truncate">{labelText}</span>
    </button>
  )
}

function SidebarContent() {
  const { activeModule, setActiveModule, setSidebarOpen, lang, toggleLang } = useAppStore()

  const handleNavClick = (key: ModuleKey) => {
    setActiveModule(key)
    setSidebarOpen(false)
  }

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Logo Header */}
      <div className="flex items-center gap-3 bg-gradient-to-l from-emerald-700 to-emerald-800 px-4 py-4 shrink-0">
        <div className="flex size-10 items-center justify-center rounded-lg bg-white/20 backdrop-blur-sm">
          <Construction className="size-6 text-white" />
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-lg font-bold text-white tracking-wide truncate">
            {lang === 'ar' ? 'ERP مقاولات' : 'Construction ERP'}
          </span>
          <span className="text-[11px] text-emerald-200 truncate">
            {lang === 'ar' ? 'نظام إدارة المقاولات' : 'Contractor Management System'}
          </span>
        </div>
      </div>

      {/* Navigation - Scrollable */}
      <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-3" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="flex flex-col gap-1">
          {navSections.map((section, sectionIndex) => (
            <div key={section.key}>
              {sectionIndex > 0 && (
                <div className="my-2 px-3">
                  <div className="h-px bg-gray-100" />
                </div>
              )}
              <div className="mb-1 mt-2 px-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  {sectionLabels[section.key as keyof typeof sectionLabels]?.[lang] || section.key}
                </span>
              </div>
              {section.items.map((item) => (
                <NavItemButton
                  key={item.key}
                  item={item}
                  isActive={activeModule === item.key}
                  onClick={() => handleNavClick(item.key)}
                  lang={lang}
                />
              ))}
            </div>
          ))}
        </div>
      </nav>

      {/* Footer - Language Toggle + User */}
      <div className="shrink-0 border-t border-gray-100">
        <div className="px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleLang}
            className="w-full justify-start gap-2 text-gray-500 hover:text-emerald-700 hover:bg-emerald-50"
          >
            <Globe className="size-4" />
            <span className="text-sm">{lang === 'ar' ? 'English' : 'عربي'}</span>
            <span className="mr-auto text-xs text-gray-400">
              {lang === 'ar' ? 'العربية' : 'EN'}
            </span>
          </Button>
        </div>
        <div className="px-4 py-3 border-t border-gray-50">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold">
              {lang === 'ar' ? 'م' : 'A'}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-gray-700 truncate">
                {lang === 'ar' ? 'مدير النظام' : 'System Admin'}
              </span>
              <span className="text-[11px] text-gray-400">admin@erp.com</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Sidebar() {
  return (
    <aside className="hidden lg:flex lg:w-72 lg:flex-col lg:border-l lg:border-gray-200 shrink-0">
      <SidebarContent />
    </aside>
  )
}

export function MobileSidebar() {
  const { sidebarOpen, setSidebarOpen } = useAppStore()

  return (
    <>
      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {/* Drawer */}
      <div
        className={cn(
          'fixed inset-y-0 right-0 z-50 w-72 transform transition-transform duration-300 ease-in-out lg:hidden',
          sidebarOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <SidebarContent />
      </div>
    </>
  )
}
