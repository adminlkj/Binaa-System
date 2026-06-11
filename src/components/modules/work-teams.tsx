'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users2, Plus, Search, Pencil, Trash2, RefreshCw,
  Download, UserPlus, Banknote,
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
import { Checkbox } from '@/components/ui/checkbox'
import { MoneyDisplay } from '@/components/ui/money-display'
import { ModuleLayout } from '@/components/shared/module-layout'
import { PrintButton } from '@/components/shared/print-button'
import { useAppStore, formatDate } from '@/stores/app-store'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'

// ============ Types ============
interface Employee { id: string; code: string; name: string; nameAr: string | null; basicSalary: number }
interface Project { id: string; code: string; name: string }

interface TeamMember {
  id: string; employeeId: string; role: string | null; isLeader: boolean
  employee: Employee
}

interface WorkTeam {
  id: string; code: string; name: string; nameAr: string | null
  specialty: string | null; projectId: string | null; status: string
  project: Project | null
  members: TeamMember[]
  _count?: { members: number }
}

interface TeamFormData {
  name: string; nameAr: string; specialty: string; projectId: string; memberIds: string[]
}

const defaultForm: TeamFormData = {
  name: '', nameAr: '', specialty: '', projectId: '', memberIds: [],
}

function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

const statusConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  ACTIVE: { label: { ar: 'نشط', en: 'Active' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  INACTIVE: { label: { ar: 'غير نشط', en: 'Inactive' }, color: 'text-gray-700', bg: 'bg-gray-100' },
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (<div className="space-y-2">{Array.from({ length: rows }).map((_, i) => (
    <div key={i} className="flex gap-4 p-3"><div className="h-5 w-20 animate-pulse rounded bg-gray-200" /><div className="h-5 w-40 animate-pulse rounded bg-gray-200" /><div className="h-5 w-28 animate-pulse rounded bg-gray-200" /></div>
  ))}</div>)
}

// ============ Team Form Dialog ============
function TeamFormDialog({ open, onOpenChange, editingTeam, projects, employees }: {
  open: boolean; onOpenChange: (open: boolean) => void; editingTeam: WorkTeam | null; projects: Project[]; employees: Employee[]
}) {
  const queryClient = useQueryClient()
  const isEdit = !!editingTeam
  const [form, setForm] = useState<TeamFormData>(defaultForm)
  const { lang } = useAppStore()

  React.useEffect(() => {
    if (open) {
      if (editingTeam) {
        setForm({
          name: editingTeam.name, nameAr: editingTeam.nameAr || '',
          specialty: editingTeam.specialty || '',
          projectId: editingTeam.projectId || '',
          memberIds: editingTeam.members?.map(m => m.employeeId) || [],
        })
      } else { setForm(defaultForm) }
    }
  }, [open, editingTeam])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => fetch('/api/work-teams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['work-teams'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = {
      name: form.name, nameAr: form.nameAr || null,
      specialty: form.specialty || null,
      projectId: form.projectId || null,
      members: form.memberIds,
    }
    if (isEdit) {
      const existingIds = editingTeam?.members?.map(m => m.employeeId) || []
      const addMembers = form.memberIds.filter(id => !existingIds.includes(id))
      const removeMembers = existingIds.filter(id => !form.memberIds.includes(id))
      fetch(`/api/work-teams/${editingTeam?.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, nameAr: form.nameAr || null, specialty: form.specialty || null, projectId: form.projectId || null, addMembers, removeMembers }),
      }).then(r => { if (!r.ok) throw new Error(); return r.json() }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['work-teams'] }); onOpenChange(false)
      })
    } else {
      createMutation.mutate(payload)
    }
  }

  const toggleMember = (empId: string) => {
    setForm(f => ({
      ...f,
      memberIds: f.memberIds.includes(empId) ? f.memberIds.filter(id => id !== empId) : [...f.memberIds, empId],
    }))
  }

  const isSaving = createMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('تعديل فريق', 'Edit Team', lang) : t('فريق عمل جديد', 'New Work Team', lang)}</DialogTitle>
          <DialogDescription>{isEdit ? t('تعديل بيانات فريق العمل', 'Edit work team data', lang) : t('إنشاء فريق عمل جديد', 'Create new work team', lang)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>{t('اسم الفريق *', 'Team Name *', lang)}</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
            <div className="space-y-2"><Label>{t('الاسم بالعربي', 'Arabic Name', lang)}</Label><Input value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} /></div>
            <div className="space-y-2"><Label>{t('التخصص', 'Specialty', lang)}</Label><Input value={form.specialty} onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>{t('المشروع', 'Project', lang)}</Label>
              <Select value={form.projectId} onValueChange={v => setForm(f => ({ ...f, projectId: v }))}>
                <SelectTrigger><SelectValue placeholder={t('اختر المشروع', 'Select project', lang)} /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Members Selection */}
          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-emerald-700 border-b border-emerald-200 pb-1">
              {t('أعضاء الفريق', 'Team Members', lang)} ({form.memberIds.length})
            </h4>
            <div className="max-h-48 overflow-y-auto border rounded-lg p-2 space-y-1">
              {employees.map(emp => (
                <label key={emp.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 cursor-pointer">
                  <Checkbox
                    checked={form.memberIds.includes(emp.id)}
                    onCheckedChange={() => toggleMember(emp.id)}
                  />
                  <span className="text-sm">{emp.name} <span className="text-muted-foreground">({emp.code})</span></span>
                  <span className="text-xs text-muted-foreground mr-auto"><MoneyDisplay value={emp.basicSalary} lang={lang} size="sm" inline /></span>
                </label>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button type="submit" disabled={isSaving || !form.name} className="bg-emerald-600 hover:bg-emerald-700">{isSaving ? t('جاري الحفظ...', 'Saving...', lang) : isEdit ? t('تحديث', 'Update', lang) : t('إنشاء', 'Create', lang)}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main Work Teams Module ============
export function WorkTeamsModule() {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTeam, setEditingTeam] = useState<WorkTeam | null>(null)
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null)

  const { data: teams = [], isLoading, isError, refetch } = useQuery<WorkTeam[]>({
    queryKey: ['work-teams'],
    queryFn: async () => { const res = await fetch('/api/work-teams'); if (!res.ok) throw new Error(); return res.json() },
  })

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects-list'],
    queryFn: async () => { const res = await fetch('/api/projects/list'); if (!res.ok) return []; return res.json() },
  })

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['employees-list'],
    queryFn: async () => { const res = await fetch('/api/employees?activeOnly=true'); if (!res.ok) return []; return res.json() },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/work-teams/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['work-teams'] }),
  })

  const filtered = teams.filter(team => {
    if (!search) return true
    const s = search.toLowerCase()
    return team.name.toLowerCase().includes(s) || team.code.toLowerCase().includes(s) || (team.specialty?.toLowerCase().includes(s))
  })

  const printData = useMemo(() => ({
    columns: [
      { key: 'code', label: lang === 'ar' ? 'الكود' : 'Code' },
      { key: 'name', label: lang === 'ar' ? 'الاسم' : 'Name' },
      { key: 'specialty', label: lang === 'ar' ? 'التخصص' : 'Specialty' },
      { key: 'project', label: lang === 'ar' ? 'المشروع' : 'Project' },
      { key: 'memberCount', label: lang === 'ar' ? 'عدد الأعضاء' : 'Members' },
      { key: 'totalCost', label: lang === 'ar' ? 'تكلفة الفريق' : 'Team Cost' },
    ],
    rows: filtered.map(team => ({
      code: team.code,
      name: team.name,
      specialty: team.specialty || '—',
      project: team.project?.name || '—',
      memberCount: team.members?.length || 0,
      totalCost: team.members?.reduce((s, m) => s + (m.employee?.basicSalary ?? 0), 0) || 0,
    })),
    infoItems: [
      { label: lang === 'ar' ? 'تاريخ الطباعة' : 'Print Date', value: new Date().toLocaleDateString() },
      { label: lang === 'ar' ? 'عدد الفرق' : 'Teams', value: String(filtered.length) },
    ],
  }), [filtered, lang])

  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'code', label: t('الكود', 'Code', lang) },
      { key: 'name', label: t('الاسم', 'Name', lang) },
      { key: 'specialty', label: t('التخصص', 'Specialty', lang) },
      { key: 'project', label: t('المشروع', 'Project', lang) },
      { key: 'memberCount', label: t('عدد الأعضاء', 'Members', lang) },
      { key: 'totalCost', label: t('تكلفة الفريق', 'Team Cost', lang) },
    ]
    exportToCSV(filtered.map(team => ({
      code: team.code, name: team.name, specialty: team.specialty || '',
      project: team.project?.name || '', memberCount: team.members?.length || 0,
      totalCost: team.members?.reduce((s, m) => s + (m.employee?.basicSalary ?? 0), 0) || 0,
    })), `work-teams-${new Date().toISOString().slice(0, 10)}`, columns)
  }

  return (
    <ModuleLayout
      title={{ ar: 'فرق العمل', en: 'Work Teams' }}
      subtitle={{ ar: 'إدارة فرق العمل وتشكيلها', en: 'Manage and organize work teams' }}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton type="work-team-report" data={printData} size="icon" />
          <Button variant="outline" size="icon" onClick={handleExport}><Download className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="size-4" /></Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditingTeam(null); setDialogOpen(true) }}><Plus className="size-4" />{t('فريق جديد', 'New Team', lang)}</Button>
        </div>
      }
    >
      {/* Search */}
      <Card><CardContent className="p-4">
        <div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder={t('بحث بالاسم أو التخصص...', 'Search by name or specialty...', lang)} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" /></div>
      </CardContent></Card>

      {/* Table */}
      <Card><CardContent className="p-0">
        {isLoading ? (<div className="p-6"><TableSkeleton /></div>) : isError ? (
          <div className="flex flex-col items-center gap-3 py-10"><p className="text-rose-600">{t('حدث خطأ', 'Error', lang)}</p><Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10"><Users2 className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('لا توجد فرق عمل', 'No work teams', lang)}</p>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditingTeam(null); setDialogOpen(true) }}><Plus className="size-4 mr-1" />{t('إنشاء فريق', 'Create Team', lang)}</Button></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead>
                <TableHead className="text-right">{t('الاسم', 'Name', lang)}</TableHead>
                <TableHead className="text-right">{t('التخصص', 'Specialty', lang)}</TableHead>
                <TableHead className="text-right">{t('المشروع', 'Project', lang)}</TableHead>
                <TableHead className="text-right">{t('عدد الأعضاء', 'Members', lang)}</TableHead>
                <TableHead className="text-right">{t('تكلفة الفريق', 'Team Cost', lang)}</TableHead>
                <TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead className="text-right">{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map(team => {
                  const teamCost = team.members?.reduce((s, m) => s + (m.employee?.basicSalary ?? 0), 0) || 0
                  return (
                    <React.Fragment key={team.id}>
                      <TableRow className={expandedTeamId === team.id ? 'bg-emerald-50/50' : ''}>
                        <TableCell className="font-medium font-mono">{team.code}</TableCell>
                        <TableCell className="font-medium">{team.name}</TableCell>
                        <TableCell>{team.specialty || '—'}</TableCell>
                        <TableCell>{team.project?.name || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 cursor-pointer" onClick={() => setExpandedTeamId(expandedTeamId === team.id ? null : team.id)}>
                            {team.members?.length || 0} {t('أعضاء', 'members', lang)}
                          </Badge>
                        </TableCell>
                        <TableCell><MoneyDisplay value={teamCost} lang={lang} size="sm" bold /></TableCell>
                        <TableCell>
                          <Badge className={`${(statusConfig[team.status] || statusConfig.ACTIVE).bg} ${(statusConfig[team.status] || statusConfig.ACTIVE).color} border-0`}>
                            {(statusConfig[team.status] || statusConfig.ACTIVE).label[lang]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="size-8" onClick={() => { setEditingTeam(team); setDialogOpen(true) }}><Pencil className="size-4" /></Button>
                            <Button variant="ghost" size="icon" className="size-8 text-rose-600 hover:text-rose-700" onClick={() => { if (confirm(t('هل أنت متأكد من حذف الفريق؟', 'Are you sure you want to delete this team?', lang))) deleteMutation.mutate(team.id) }}><Trash2 className="size-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {/* Expanded Members Section */}
                      {expandedTeamId === team.id && team.members && team.members.length > 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="bg-gray-50/50 p-0">
                            <div className="px-6 py-3">
                              <div className="flex items-center justify-between mb-2">
                                <h5 className="text-xs font-semibold text-emerald-700">{t('أعضاء الفريق', 'Team Members', lang)}</h5>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Banknote className="size-3" />
                                  {t('إجمالي الرواتب', 'Total Salaries', lang)}: <MoneyDisplay value={teamCost} lang={lang} size="sm" inline bold />
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {team.members.map(m => (
                                  <Badge key={m.id} variant="outline" className={`${m.isLeader ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white'}`}>
                                    {m.isLeader && <span className="mr-1">★</span>}
                                    {m.employee.name}
                                    <span className="text-muted-foreground mx-1">({m.employee.code})</span>
                                    {m.role && <span className="text-muted-foreground text-xs">- {m.role}</span>}
                                    <span className="text-muted-foreground text-xs mr-1"><MoneyDisplay value={m.employee.basicSalary} lang={lang} size="sm" inline /></span>
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent></Card>

      <TeamFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editingTeam={editingTeam} projects={projects} employees={employees} />
    </ModuleLayout>
  )
}
