'use client'

import React from 'react'
import {
  Landmark, Building, CreditCard,
  BookOpen, List, BookCopy,
  ArrowDownToLine, ArrowUpFromLine,
  Building2, TrendingDown,
  Percent, PieChart, Banknote,
} from 'lucide-react'
import {
  useAppStore,
  type SubModuleKey,
  type Lang,
} from '@/stores/app-store'
import { SectionLayout } from '@/components/sections/section-layout'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AccountingModule } from '@/components/modules/accounting'
import { VATModule } from '@/components/modules/vat'

// ============ Tab Definitions ============

const financeTabs: { key: SubModuleKey; icon: React.ElementType }[] = [
  { key: 'treasury', icon: Landmark },
  { key: 'banks', icon: Building },
  { key: 'checks', icon: CreditCard },
  { key: 'journal-entries', icon: BookOpen },
  { key: 'chart-of-accounts', icon: List },
  { key: 'general-ledger', icon: BookCopy },
  { key: 'receivables', icon: ArrowDownToLine },
  { key: 'payables', icon: ArrowUpFromLine },
  { key: 'fixed-assets', icon: Building2 },
  { key: 'depreciation', icon: TrendingDown },
  { key: 'vat', icon: Percent },
  { key: 'budgets', icon: PieChart },
  { key: 'cash-flow', icon: Banknote },
]

// ============ Placeholder Component ============

function TabPlaceholder({
  icon: Icon,
  title,
  description,
  lang,
}: {
  icon: React.ElementType
  title: { ar: string; en: string }
  description: { ar: string; en: string }
  lang: Lang
}) {
  return (
    <Card className="border-dashed border-2 border-gray-200 bg-gray-50/50">
      <CardContent className="flex flex-col items-center gap-4 py-16">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-gray-100">
          <Icon className="size-8 text-gray-400" />
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold text-gray-700">{title[lang]}</h3>
          <p className="text-sm text-muted-foreground max-w-md">{description[lang]}</p>
        </div>
        <Badge variant="outline" className="text-gray-500 border-gray-300">
          {lang === 'ar' ? 'قريباً' : 'Coming Soon'}
        </Badge>
      </CardContent>
    </Card>
  )
}

// ============ Placeholder Data ============

const placeholderData: Record<string, {
  title: { ar: string; en: string }
  description: { ar: string; en: string }
}> = {
  'treasury': {
    title: { ar: 'الخزينة', en: 'Treasury' },
    description: {
      ar: 'إدارة حركات الخزينة، الإيرادات والمصروفات النقدية، وأرصدة الصناديق',
      en: 'Manage treasury transactions, cash receipts and payments, and fund balances',
    },
  },
  'banks': {
    title: { ar: 'البنوك', en: 'Banks' },
    description: {
      ar: 'إدارة الحسابات البنكية، كشوف الحسابات، والتحويلات البنكية',
      en: 'Manage bank accounts, bank statements, and bank transfers',
    },
  },
  'checks': {
    title: { ar: 'الشيكات', en: 'Checks' },
    description: {
      ar: 'إدارة الشيكات الواردة والصادرة، تتبع حالات الصرف والتحصيل',
      en: 'Manage incoming and outgoing checks, track payment and collection statuses',
    },
  },
  'receivables': {
    title: { ar: 'الذمم المدينة', en: 'Receivables' },
    description: {
      ar: 'إدارة حسابات العملاء والمستحقات، متابعة التحصيلات والفواتير المستحقة',
      en: 'Manage client accounts and receivables, track collections and due invoices',
    },
  },
  'payables': {
    title: { ar: 'الذمم الدائنة', en: 'Payables' },
    description: {
      ar: 'إدارة حسابات الموردين والالتزامات، متابعة المدفوعات والفواتير المستحقة',
      en: 'Manage supplier accounts and payables, track payments and due invoices',
    },
  },
  'fixed-assets': {
    title: { ar: 'الأصول الثابتة', en: 'Fixed Assets' },
    description: {
      ar: 'تسجيل ومتابعة الأصول الثابتة، مواقعها، حالتها، وتاريخ الاقتناء',
      en: 'Record and track fixed assets, their locations, conditions, and acquisition history',
    },
  },
  'depreciation': {
    title: { ar: 'الإهلاك', en: 'Depreciation' },
    description: {
      ar: 'حساب وتسجيل الإهلاك الدوري للأصول الثابتة بطرق الإهلاك المختلفة',
      en: 'Calculate and record periodic depreciation of fixed assets using various methods',
    },
  },
  'budgets': {
    title: { ar: 'الموازنات', en: 'Budgets' },
    description: {
      ar: 'إعداد ومتابعة الموازنات التقديرية، مقارنة الفعلي بالمخطط، وتحليل الانحرافات',
      en: 'Prepare and track budgets, compare actual vs planned, and analyze variances',
    },
  },
  'cash-flow': {
    title: { ar: 'التدفق النقدي', en: 'Cash Flow' },
    description: {
      ar: 'تحليل ومتابعة التدفقات النقدية الداخلة والخارجة، وتوقعات السيولة',
      en: 'Analyze and track cash inflows and outflows, and liquidity forecasts',
    },
  },
}

// ============ Main Component ============

export function FinanceSection() {
  const { activeSubModule, lang } = useAppStore()

  const renderTabContent = () => {
    switch (activeSubModule) {
      case 'treasury':
        return (
          <TabPlaceholder
            icon={Landmark}
            title={placeholderData['treasury'].title}
            description={placeholderData['treasury'].description}
            lang={lang}
          />
        )
      case 'banks':
        return (
          <TabPlaceholder
            icon={Building}
            title={placeholderData['banks'].title}
            description={placeholderData['banks'].description}
            lang={lang}
          />
        )
      case 'checks':
        return (
          <TabPlaceholder
            icon={CreditCard}
            title={placeholderData['checks'].title}
            description={placeholderData['checks'].description}
            lang={lang}
          />
        )
      case 'journal-entries':
      case 'chart-of-accounts':
      case 'general-ledger':
        return <AccountingModule />
      case 'receivables':
        return (
          <TabPlaceholder
            icon={ArrowDownToLine}
            title={placeholderData['receivables'].title}
            description={placeholderData['receivables'].description}
            lang={lang}
          />
        )
      case 'payables':
        return (
          <TabPlaceholder
            icon={ArrowUpFromLine}
            title={placeholderData['payables'].title}
            description={placeholderData['payables'].description}
            lang={lang}
          />
        )
      case 'fixed-assets':
        return (
          <TabPlaceholder
            icon={Building2}
            title={placeholderData['fixed-assets'].title}
            description={placeholderData['fixed-assets'].description}
            lang={lang}
          />
        )
      case 'depreciation':
        return (
          <TabPlaceholder
            icon={TrendingDown}
            title={placeholderData['depreciation'].title}
            description={placeholderData['depreciation'].description}
            lang={lang}
          />
        )
      case 'vat':
        return <VATModule />
      case 'budgets':
        return (
          <TabPlaceholder
            icon={PieChart}
            title={placeholderData['budgets'].title}
            description={placeholderData['budgets'].description}
            lang={lang}
          />
        )
      case 'cash-flow':
        return (
          <TabPlaceholder
            icon={Banknote}
            title={placeholderData['cash-flow'].title}
            description={placeholderData['cash-flow'].description}
            lang={lang}
          />
        )
      default:
        return (
          <TabPlaceholder
            icon={Landmark}
            title={placeholderData['treasury'].title}
            description={placeholderData['treasury'].description}
            lang={lang}
          />
        )
    }
  }

  return (
    <SectionLayout
      title={{ ar: 'المالية', en: 'Finance' }}
      subtitle={{
        ar: 'إدارة الحسابات المالية والمحاسبة والضرائب',
        en: 'Manage financial accounts, accounting, and taxes',
      }}
      tabs={financeTabs}
      showPrintExport={false}
    >
      {renderTabContent()}
    </SectionLayout>
  )
}
