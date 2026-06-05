'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  LayoutGrid, Plus, Search, Trash2, RefreshCw,
  Printer, Download, Users, Truck, Users2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { ModuleLayout } from '@/components/shared/module-layout'
import { useAppStore, formatDate } from '@/stores/app-store'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'

// ============ Types ============
interface Employee { id: string; code: string; name: string; nameAr: string | null }
interface Equipment { id: string; code: string; name: string; nameAr: string | null }
interface WorkTeam { id: string; code: string; name: string; nameAr: string | null }
interface Project { id: string; code: string; name: string }

interface ResourceDistribution {
  id: string; projectId: string; resourceType: string; resourceId: string
  startDate: string; endDate: string | null
  project: Project
  resourceDetails?: { name: string; code: string }
}

interface DistributionFormData {
  projectId: string; resourceType: string; resourceId: string
  startDate: string; endDate: string
}

const defaultForm: DistributionFormData = {
  projectId: '', resourceType: '', resourceId: '',
  startDate: '', endDate: '',
}

function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

const resourceTypeConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string; icon: React.ElementType }> = {
  EMPLOYEE: { label: { ar: 'موظف', en: 'Employee' }, color: 'text-teal-700', bg: 'bg-teal-100', icon: Users },
  TEAM: { label: { ar: 'فريق عمل', en: 'Work Team' }, color: 'text-violet-700', bg: 'bg-violet-100', icon: Users2 },
  EQUIPMENT: { label: { ar: 'معدة', en: 'Equipment' }, color: 'text-orange-700', bg: 'bg-orange-100', icon: Truck },
}

function ResourceTypeBadge({ type, lang }: { type: string; lang: 'ar' | 'en' }) {
  const cfg = resourceTypeConfig[type] || resourceTypeConfig.EMPLOYEE
  const Icon = cfg.icon
  return (
    <Badge className={`${cfg.bg} ${cfg.color} border-0 gap-1`}>
      <Icon className="size-3" />
      {cfg.label[lang]}
    </Badge>
  )
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (<div className="space-y-2">{Array.from({ length: rows }).map((_, i) => (
    <div key={i} className="flex gap-4 p-3"><div className="h-5 w-20 animate-pulse rounded bg-gray-200" /><div className="h-5 w-40 animate-pulse rounded bg-gray-200" /><div className="h-5 w-28 animate-pulse rounded bg-gray-200" /></div>
  ))}</div>)
}

// ============ Distribution Form Dialog ============
function DistributionFormDialog({ open, onOpenChange, projects, employees, equipment, teams }: {
  open: boolean; onOpenChange: (open: boolean) => void
  projects: Project[]; employees: Employee[]; equipment: Equipment[]; teams: WorkTeam[]
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<DistributionFormData>(defaultForm)
  const { lang } = useAppStore()

  // Get resources based on selected type
  const resourceOptions = React.useMemo(() => {
    switch (form.resourceType) {
      case 'EMPLOYEE': return employees.map(e => ({ id: e.id, name: e.name, code: e.code }))
      case 'TEAM': return teams.map(t => ({ id: t.id, name: t.name, code: t.code }))
      case 'EQUIPMENT': return equipment.map(e => ({ id: e.id, name: e.name, code: e.code }))
      default: return []
    }
  }, [form.resourceType, employees, teams, equipment])

  React.useEffect(() => {
    if (open) setForm(defaultForm)
  }, [open])

  // Reset resource when type changes
  React.useEffect(() => {
    setForm(f => ({ ...f, resourceId: '' }))
  }, [form.resourceType])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => fetch('/api/resource-distribution', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['resource-distribution'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      ...form,
      endDate: form.endDate || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('توزيع مورد', 'Allocate Resource', lang)}</DialogTitle>
          <DialogDescription>{t('توزيع مورد على مشروع', 'Allocate a resource to a project', lang)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t('المشروع *', 'Project *', lang)}</Label>
            <Select value={form.projectId} onValueChange={v => setForm(f => ({ ...f, projectId: v }))}>
              <SelectTrigger><SelectValue placeholder={t('اختر المشروع', 'Select project', lang)} /></SelectTrigger>
              <SelectContent>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('نوع المورد *', 'Resource Type *', lang)}</Label>
              <Select value={form.resourceType} onValueChange={v => setForm(f => ({ ...f, resourceType: v }))}>
                <SelectTrigger><SelectValue placeholder={t('اختر النوع', 'Select type', lang)} /></SelectTrigger>
                <SelectContent>
                  {Object.entries(resourceTypeConfig).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label[lang]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('المورد *', 'Resource *', lang)}</Label>
              <Select value={form.resourceId} onValueChange={v => setForm(f => ({ ...f, resourceId: v }))} disabled={!form.resourceType}>
                <SelectTrigger><SelectValue placeholder={form.resourceType ? t('اختر المورد', 'Select resource', lang) : t('اختر النوع أولاً', 'Select type first', lang)} /></SelectTrigger>
                <SelectContent>
                  {resourceOptions.map(r => <SelectItem key={r.id} value={r.id}>{r.name} ({r.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>{t('تاريخ البداية *', 'Start Date *', lang)}</Label><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} required /></div>
            <div className="space-y-2"><Label>{t('تاريخ النهاية', 'End Date', lang)}</Label><Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button type="submit" disabled={createMutation.isPending || !form.projectId || !form.resourceType || !form.resourceId || !form.startDate} className="bg-emerald-600 hover:bg-emerald-700">{createMutation.isPending ? t('جاري الحفظ...', 'Saving...', lang) : t('توزيع', 'Allocate', lang)}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main Resource Distribution Module ============
export function ResourceDistributionModule() {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [filterProject, setFilterProject] = useState('')

  const { data: distributions = [], isLoading, isError, refetch } = useQuery<ResourceDistribution[]>({
    queryKey: ['resource-distribution'],
    queryFn: async () => { const res = await fetch('/api/resource-distribution'); if (!res.ok) throw new Error(); return res.json() },
  })

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects-list'],
    queryFn: async () => { const res = await fetch('/api/projects/list'); if (!res.ok) return []; return res.json() },
  })

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['employees-list'],
    queryFn: async () => { const res = await fetch('/api/employees?activeOnly=true'); if (!res.ok) return []; return res.json() },
  })

  const { data: equipment = [] } = useQuery<Equipment[]>({
    queryKey: ['equipment-list'],
    queryFn: async () => { const res = await fetch('/api/equipment'); if (!res.ok) return []; return res.json() },
  })

  const { data: teams = [] } = useQuery<WorkTeam[]>({
    queryKey: ['work-teams-list'],
    queryFn: async () => { const res = await fetch('/api/work-teams?activeOnly=true'); if (!res.ok) return []; return res.json() },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/resource-distribution/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resource-distribution'] }),
  })

  // Filter
  const filtered = distributions.filter(d => {
    if (filterProject && d.projectId !== filterProject) return false
    if (!search) return true
    const s = search.toLowerCase()
    return d.project.name.toLowerCase().includes(s) || (d.resourceDetails?.name.toLowerCase().includes(s))
  })

  // Summary counts
  const totalEmployees = distributions.filter(d => d.resourceType === 'EMPLOYEE').length
  const totalTeams = distributions.filter(d => d.resourceType === 'TEAM').length
  const totalEquipment = distributions.filter(d => d.resourceType === 'EQUIPMENT').length

  // Group by project for visual grid
  const projectGroups = React.useMemo(() => {
    const groups: Record<string, { project: Project; items: ResourceDistribution[] }> = {}
    filtered.forEach(d => {
      if (!groups[d.projectId]) {
        groups[d.projectId] = { project: d.project, items: [] }
      }
      groups[d.projectId].items.push(d)
    })
    return Object.values(groups)
  }, [filtered])

  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'projectName', label: t('المشروع', 'Project', lang) },
      { key: 'resourceType', label: t('نوع المورد', 'Resource Type', lang) },
      { key: 'resourceName', label: t('المورد', 'Resource', lang) },
      { key: 'startDate', label: t('تاريخ البداية', 'Start Date', lang) },
      { key: 'endDate', label: t('تاريخ النهاية', 'End Date', lang) },
    ]
    exportToCSV(filtered.map(d => ({
      projectName: d.project.name,
      resourceType: resourceTypeConfig[d.resourceType]?.label[lang] || d.resourceType,
      resourceName: d.resourceDetails?.name || '',
      startDate: d.startDate, endDate: d.endDate || '',
    })), `resource-distribution-${new Date().toISOString().slice(0, 10)}`, columns)
  }

  return (
    <ModuleLayout
      title={{ ar: 'توزيع الموارد', en: 'Resource Distribution' }}
      subtitle={{ ar: 'توزيع الموارد على المشاريع وتحسين استخدامها', en: 'Allocate resources to projects and optimize utilization' }}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => window.print()}><Printer className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={handleExport}><Download className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="size-4" /></Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}><Plus className="size-4" />{t('توزيع مورد', 'Allocate Resource', lang)}</Button>
        </div>
      }
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-teal-50 border-teal-200">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-teal-100"><Users className="size-5 text-teal-700" /></div>
            <div>
              <p className="text-xs text-teal-600">{t('الموظفون الموزعون', 'Allocated Employees', lang)}</p>
              <p className="text-xl font-bold text-teal-700">{totalEmployees}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-violet-50 border-violet-200">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-violet-100"><Users2 className="size-5 text-violet-700" /></div>
            <div>
              <p className="text-xs text-violet-600">{t('فرق العمل الموزعة', 'Allocated Teams', lang)}</p>
              <p className="text-xl font-bold text-violet-700">{totalTeams}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-orange-50 border-orange-200">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-orange-100"><Truck className="size-5 text-orange-700" /></div>
            <div>
              <p className="text-xs text-orange-600">{t('المعدات الموزعة', 'Allocated Equipment', lang)}</p>
              <p className="text-xl font-bold text-orange-700">{totalEquipment}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter */}
      <Card><CardContent className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder={t('بحث بالمشروع أو المورد...', 'Search by project or resource...', lang)} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" /></div>
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder={t('كل المشاريع', 'All Projects', lang)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t('كل المشاريع', 'All Projects', lang)}</SelectItem>
              {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardContent></Card>

      {/* Visual Grid by Project */}
      {projectGroups.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projectGroups.map(group => (
            <Card key={group.project.id} className="border-l-4 border-l-emerald-500">
              <CardContent className="p-4">
                <h3 className="font-semibold text-sm mb-3">{group.project.name}</h3>
                <div className="space-y-2">
                  {group.items.map(item => (
                    <div key={item.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-gray-50">
                      <div className="flex items-center gap-2">
                        <ResourceTypeBadge type={item.resourceType} lang={lang} />
                        <span className="text-sm font-medium">{item.resourceDetails?.name || '—'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{formatDate(item.startDate, lang)}</span>
                        <Button variant="ghost" size="icon" className="size-6 text-rose-500 hover:text-rose-700" onClick={() => { if (confirm(t('هل أنت متأكد من إلغاء التوزيع؟', 'Are you sure you want to remove this allocation?', lang))) deleteMutation.mutate(item.id) }}><Trash2 className="size-3" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Table View */}
      <Card><CardContent className="p-0">
        {isLoading ? (<div className="p-6"><TableSkeleton /></div>) : isError ? (
          <div className="flex flex-col items-center gap-3 py-10"><p className="text-rose-600">{t('حدث خطأ', 'Error', lang)}</p><Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10"><LayoutGrid className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('لا يوجد توزيع موارد', 'No resource allocations', lang)}</p>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}><Plus className="size-4 mr-1" />{t('توزيع مورد', 'Allocate Resource', lang)}</Button></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">{t('المشروع', 'Project', lang)}</TableHead>
                <TableHead className="text-right">{t('نوع المورد', 'Resource Type', lang)}</TableHead>
                <TableHead className="text-right">{t('المورد', 'Resource', lang)}</TableHead>
                <TableHead className="text-right">{t('تاريخ البداية', 'Start Date', lang)}</TableHead>
                <TableHead className="text-right">{t('تاريخ النهاية', 'End Date', lang)}</TableHead>
                <TableHead className="text-right">{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map(d => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.project.name}</TableCell>
                    <TableCell><ResourceTypeBadge type={d.resourceType} lang={lang} /></TableCell>
                    <TableCell>{d.resourceDetails?.name || '—'}</TableCell>
                    <TableCell>{formatDate(d.startDate, lang)}</TableCell>
                    <TableCell>{d.endDate ? formatDate(d.endDate, lang) : '—'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="size-8 text-rose-600 hover:text-rose-700" onClick={() => { if (confirm(t('هل أنت متأكد من إلغاء التوزيع؟', 'Are you sure you want to remove this allocation?', lang))) deleteMutation.mutate(d.id) }}><Trash2 className="size-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent></Card>

      <DistributionFormDialog open={dialogOpen} onOpenChange={setDialogOpen} projects={projects} employees={employees} equipment={equipment} teams={teams} />
    </ModuleLayout>
  )
}
