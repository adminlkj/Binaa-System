'use client'

import { Badge } from '@/components/ui/badge'

/**
 * Reusable badge showing whether a project is a Construction project (تنفيذي)
 * or an Equipment Rental project (تأجير).
 */
export function ProjectTypeBadge({ projectType, lang }: { projectType: string; lang: 'ar' | 'en' }) {
  if (projectType === 'CONSTRUCTION') {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0">
        {lang === 'ar' ? 'تنفيذي' : 'Const.'}
      </Badge>
    )
  }
  if (projectType === 'EQUIPMENT_RENTAL') {
    return (
      <Badge className="bg-cyan-100 text-cyan-700 border-cyan-200 text-[10px] px-1.5 py-0">
        {lang === 'ar' ? 'تأجير' : 'Rental'}
      </Badge>
    )
  }
  return null
}
