'use client'

import React from 'react'
import {
  Users, FileSignature, CalendarCheck, Banknote,
  Wrench, Cog, ShieldCheck, Fuel,
  UserCog, Network,
} from 'lucide-react'
import {
  useAppStore,
  type SubModuleKey,
  type Lang,
} from '@/stores/app-store'
import { SectionLayout } from '@/components/sections/section-layout'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EquipmentModule } from '@/components/modules/equipment'

// ============ Tab Definitions ============

const resourcesTabs: { key: SubModuleKey; icon: React.ElementType }[] = [
  { key: 'employees', icon: Users },
  { key: 'employee-contracts', icon: FileSignature },
  { key: 'employee-attendance', icon: CalendarCheck },
  { key: 'employee-salaries', icon: Banknote },
  { key: 'equipment-list', icon: Wrench },
  { key: 'equipment-operations', icon: Cog },
  { key: 'equipment-maintenance', icon: ShieldCheck },
  { key: 'equipment-fuel', icon: Fuel },
  { key: 'teams', icon: UserCog },
  { key: 'team-assignments', icon: Network },
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
  'employees': {
    title: { ar: 'الموظفون', en: 'Employees' },
    description: {
      ar: 'إدارة بيانات الموظفين، المعلومات الشخصية والمهنية، والوثائق والمؤهلات',
      en: 'Manage employee data, personal and professional information, documents and qualifications',
    },
  },
  'employee-contracts': {
    title: { ar: 'العقود', en: 'Employee Contracts' },
    description: {
      ar: 'إدارة عقود الموظفين، التجديد، الإنذارات، وأنواع التعاقد المختلفة',
      en: 'Manage employee contracts, renewals, warnings, and different contract types',
    },
  },
  'employee-attendance': {
    title: { ar: 'الحضور', en: 'Attendance' },
    description: {
      ar: 'تسجيل ومتابعة الحضور والانصراف، الإجازات، والتأخير والغياب',
      en: 'Record and track attendance, leaves, tardiness and absences',
    },
  },
  'employee-salaries': {
    title: { ar: 'الرواتب', en: 'Salaries' },
    description: {
      ar: 'إعداد وتشغيل الرواتب، البدلات والخصومات، والحسميات والصافي',
      en: 'Prepare and run payroll, allowances and deductions, and net salary calculations',
    },
  },
  'equipment-operations': {
    title: { ar: 'التشغيل', en: 'Equipment Operations' },
    description: {
      ar: 'تسجيل ساعات تشغيل المعدات، تخصيصها للمشاريع، ومتابعة الإنتاجية',
      en: 'Record equipment operating hours, project allocation, and track productivity',
    },
  },
  'equipment-maintenance': {
    title: { ar: 'الصيانة', en: 'Equipment Maintenance' },
    description: {
      ar: 'جدولة ومتابعة أعمال الصيانة الدورية والطارئة للمعدات والآليات',
      en: 'Schedule and track routine and emergency maintenance for equipment and machinery',
    },
  },
  'equipment-fuel': {
    title: { ar: 'الوقود', en: 'Equipment Fuel' },
    description: {
      ar: 'تسجيل ومتابعة استهلاك الوقود للمعدات، والتكاليف المرتبطة',
      en: 'Record and track fuel consumption for equipment and associated costs',
    },
  },
  'teams': {
    title: { ar: 'فرق العمل', en: 'Teams' },
    description: {
      ar: 'إنشاء وإدارة فرق العمل، تحديد المسؤوليات والمهام لكل فريق',
      en: 'Create and manage work teams, assign responsibilities and tasks for each team',
    },
  },
  'team-assignments': {
    title: { ar: 'توزيع الموارد', en: 'Resource Allocation' },
    description: {
      ar: 'توزيع الموارد البشرية والمعدات على المشاريع، ومتابعة الاستخدام',
      en: 'Allocate human resources and equipment to projects, and track utilization',
    },
  },
}

// ============ Main Component ============

export function ResourcesSection() {
  const { activeSubModule, lang } = useAppStore()

  const renderTabContent = () => {
    switch (activeSubModule) {
      case 'employees':
        return (
          <TabPlaceholder
            icon={Users}
            title={placeholderData['employees'].title}
            description={placeholderData['employees'].description}
            lang={lang}
          />
        )
      case 'employee-contracts':
        return (
          <TabPlaceholder
            icon={FileSignature}
            title={placeholderData['employee-contracts'].title}
            description={placeholderData['employee-contracts'].description}
            lang={lang}
          />
        )
      case 'employee-attendance':
        return (
          <TabPlaceholder
            icon={CalendarCheck}
            title={placeholderData['employee-attendance'].title}
            description={placeholderData['employee-attendance'].description}
            lang={lang}
          />
        )
      case 'employee-salaries':
        return (
          <TabPlaceholder
            icon={Banknote}
            title={placeholderData['employee-salaries'].title}
            description={placeholderData['employee-salaries'].description}
            lang={lang}
          />
        )
      case 'equipment-list':
        return <EquipmentModule />
      case 'equipment-operations':
        return (
          <TabPlaceholder
            icon={Cog}
            title={placeholderData['equipment-operations'].title}
            description={placeholderData['equipment-operations'].description}
            lang={lang}
          />
        )
      case 'equipment-maintenance':
        return (
          <TabPlaceholder
            icon={ShieldCheck}
            title={placeholderData['equipment-maintenance'].title}
            description={placeholderData['equipment-maintenance'].description}
            lang={lang}
          />
        )
      case 'equipment-fuel':
        return (
          <TabPlaceholder
            icon={Fuel}
            title={placeholderData['equipment-fuel'].title}
            description={placeholderData['equipment-fuel'].description}
            lang={lang}
          />
        )
      case 'teams':
        return (
          <TabPlaceholder
            icon={UserCog}
            title={placeholderData['teams'].title}
            description={placeholderData['teams'].description}
            lang={lang}
          />
        )
      case 'team-assignments':
        return (
          <TabPlaceholder
            icon={Network}
            title={placeholderData['team-assignments'].title}
            description={placeholderData['team-assignments'].description}
            lang={lang}
          />
        )
      default:
        return (
          <TabPlaceholder
            icon={Users}
            title={placeholderData['employees'].title}
            description={placeholderData['employees'].description}
            lang={lang}
          />
        )
    }
  }

  return (
    <SectionLayout
      title={{ ar: 'الموارد', en: 'Resources' }}
      subtitle={{
        ar: 'إدارة الموارد البشرية والمعدات وفرق العمل',
        en: 'Manage human resources, equipment, and work teams',
      }}
      tabs={resourcesTabs}
      showPrintExport={false}
    >
      {renderTabContent()}
    </SectionLayout>
  )
}
