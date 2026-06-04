'use client'

import React from 'react'
import {
  Users, ShieldCheck, GitBranch, Settings,
} from 'lucide-react'
import {
  useAppStore,
  type SubModuleKey,
  type Lang,
} from '@/stores/app-store'
import { SectionLayout } from '@/components/sections/section-layout'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SettingsModule } from '@/components/modules/settings'

// ============ Tab Definitions ============

const adminTabs: { key: SubModuleKey; icon: React.ElementType }[] = [
  { key: 'users', icon: Users },
  { key: 'permissions', icon: ShieldCheck },
  { key: 'workflow', icon: GitBranch },
  { key: 'settings', icon: Settings },
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
  'users': {
    title: { ar: 'المستخدمون', en: 'Users' },
    description: {
      ar: 'إدارة حسابات المستخدمين، إضافة وتعديل وحذف المستخدمين، وتعيين الأدوار',
      en: 'Manage user accounts, add, edit and delete users, and assign roles',
    },
  },
  'permissions': {
    title: { ar: 'الصلاحيات', en: 'Permissions' },
    description: {
      ar: 'إدارة الأدوار والصلاحيات، تحديد مستويات الوصول لكل مستخدم ومجموعة',
      en: 'Manage roles and permissions, define access levels for each user and group',
    },
  },
  'workflow': {
    title: { ar: 'سير العمل', en: 'Workflow' },
    description: {
      ar: 'تصميم وإدارة مسارات سير العمل، قواعد الاعتماد، وتنبيهات المهام',
      en: 'Design and manage workflow paths, approval rules, and task notifications',
    },
  },
}

// ============ Main Component ============

export function AdminSection() {
  const { activeSubModule, lang } = useAppStore()

  const renderTabContent = () => {
    switch (activeSubModule) {
      case 'users':
        return (
          <TabPlaceholder
            icon={Users}
            title={placeholderData['users'].title}
            description={placeholderData['users'].description}
            lang={lang}
          />
        )
      case 'permissions':
        return (
          <TabPlaceholder
            icon={ShieldCheck}
            title={placeholderData['permissions'].title}
            description={placeholderData['permissions'].description}
            lang={lang}
          />
        )
      case 'workflow':
        return (
          <TabPlaceholder
            icon={GitBranch}
            title={placeholderData['workflow'].title}
            description={placeholderData['workflow'].description}
            lang={lang}
          />
        )
      case 'settings':
        return <SettingsModule />
      default:
        return <SettingsModule />
    }
  }

  return (
    <SectionLayout
      title={{ ar: 'الإدارة', en: 'Administration' }}
      subtitle={{
        ar: 'إدارة النظام والمستخدمين والصلاحيات والإعدادات',
        en: 'Manage system, users, permissions, and settings',
      }}
      tabs={adminTabs}
      showPrintExport={false}
    >
      {renderTabContent()}
    </SectionLayout>
  )
}
