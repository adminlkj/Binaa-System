'use client'

import { useAppStore, type SubModuleKey, subModuleLabels } from '@/stores/app-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Printer, Download } from 'lucide-react'

interface SubTab {
  key: SubModuleKey
  label?: { ar: string; en: string } // Optional override
  icon?: React.ElementType
}

interface SectionLayoutProps {
  title: { ar: string; en: string }
  subtitle?: { ar: string; en: string }
  tabs: SubTab[]
  children: React.ReactNode
  showPrintExport?: boolean
  onPrint?: () => void
  onExport?: () => void
  headerActions?: React.ReactNode
}

export function SectionLayout({
  title,
  subtitle,
  tabs,
  children,
  showPrintExport = true,
  onPrint,
  onExport,
  headerActions,
}: SectionLayoutProps) {
  const { activeSubModule, setActiveSubModule, lang } = useAppStore()

  return (
    <div className="flex flex-col gap-0 h-full">
      {/* Section Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title[lang]}</h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-0.5">{subtitle[lang]}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {headerActions}
          {showPrintExport && (
            <>
              {onPrint && (
                <Button variant="outline" size="sm" onClick={onPrint} className="gap-1.5">
                  <Printer className="size-4" />
                  <span className="hidden sm:inline">{lang === 'ar' ? 'طباعة' : 'Print'}</span>
                </Button>
              )}
              {onExport && (
                <Button variant="outline" size="sm" onClick={onExport} className="gap-1.5">
                  <Download className="size-4" />
                  <span className="hidden sm:inline">{lang === 'ar' ? 'تصدير' : 'Export'}</span>
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Sub-Tab Navigation */}
      {tabs.length > 1 && (
        <div className="mb-4 border-b border-gray-200">
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-0">
              {tabs.map((tab) => {
                const Icon = tab.icon
                const tabLabel = tab.label ? tab.label[lang] : (subModuleLabels[tab.key]?.[lang] || tab.key)
                const isActive = activeSubModule === tab.key

                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveSubModule(tab.key)}
                    className={cn(
                      'inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-all',
                      isActive
                        ? 'border-emerald-600 text-emerald-700'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                    )}
                  >
                    {Icon && <Icon className="size-4" />}
                    {tabLabel}
                  </button>
                )
              })}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1">
        {children}
      </div>
    </div>
  )
}
