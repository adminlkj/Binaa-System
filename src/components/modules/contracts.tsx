'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText, Plus, Search, RefreshCw,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Textarea } from '@/components/ui/textarea'
import { useAppStore, formatSAR as storeFormatSAR, formatDate as storeFormatDate, formatNumber, commonText } from '@/stores/app-store'

// ============ Types ============
interface ProjectSummary { id: string; name: string; code: string }

interface ContractItem {
  id: string; contractNo: string; date: string; value: number
  vatRate: number; vatAmount: number; totalValue: number
  startDate: string; endDate: string | null; status: string; description: string | null
  project: ProjectSummary
  _count: { progressClaims: number }
}

// formatSAR, formatDate, formatNumber imported from store

function formatSAR(value: number, lang: 'ar' | 'en' = 'ar'): string {
  return storeFormatSAR(value, lang)
}

function formatDate(dateStr: string | null, lang: 'ar' | 'en' = 'ar'): string {
  if (!dateStr) return '—'
  return storeFormatDate(dateStr, lang)
}

const statusLabels: Record<string, string> = {
  DRAFT: 'مسودة', ACTIVE: 'نشط', EXPIRED: 'منتهي', TERMINATED: 'ملغي',
}
const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-200',
  ACTIVE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  EXPIRED: 'bg-amber-100 text-amber-700 border-amber-200',
  TERMINATED: 'bg-rose-100 text-rose-700 border-rose-200',
}

// ============ Skeleton ============
function TableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3">
          <div className="h-5 w-28 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

// ============ Contract Form Dialog ============
interface ContractFormData {
  projectId: string; contractNo: string; date: string; value: string
  vatRate: string; startDate: string; endDate: string; status: string; description: string
}

function ContractFormDialog({
  open, onOpenChange, projects,
}: {
  open: boolean; onOpenChange: (open: boolean) => void
  projects: ProjectSummary[]
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ContractFormData>({
    projectId: '', contractNo: '', date: '', value: '', vatRate: '0.15',
    startDate: '', endDate: '', status: 'DRAFT', description: '',
  })

  React.useEffect(() => {
    if (open) {
      setForm({
        projectId: '', contractNo: '', date: '', value: '', vatRate: '0.15',
        startDate: '', endDate: '', status: 'DRAFT', description: '',
      })
    }
  }, [open])

  const createMutation = useMutation({
    mutationFn: (data: ContractFormData) =>
      fetch('/api/contracts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['contracts'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate(form)
  }

  // Auto-calculate VAT
  const val = parseFloat(form.value) || 0
  const rate = parseFloat(form.vatRate) || 0
  const vatAmount = Math.round(val * rate * 100) / 100
  const totalValue = Math.round((val + vatAmount) * 100) / 100

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>عقد جديد</DialogTitle>
          <DialogDescription>إضافة عقد جديد للمشروع</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>المشروع *</Label>
              <Select value={form.projectId} onValueChange={v => setForm(f => ({ ...f, projectId: v }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="اختر المشروع" /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contractNo">رقم العقد *</Label>
              <Input id="contractNo" value={form.contractNo} onChange={e => setForm(f => ({ ...f, contractNo: e.target.value }))} placeholder="CNT-2024-004" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">تاريخ العقد *</Label>
              <Input id="date" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="value">قيمة العقد (قبل الضريبة) *</Label>
              <Input id="value" type="number" step="0.01" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="0.00" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vatRate">نسبة الضريبة</Label>
              <Input id="vatRate" type="number" step="0.01" value={form.vatRate} onChange={e => setForm(f => ({ ...f, vatRate: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>الحالة</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">مسودة</SelectItem>
                  <SelectItem value="ACTIVE">نشط</SelectItem>
                  <SelectItem value="EXPIRED">منتهي</SelectItem>
                  <SelectItem value="TERMINATED">ملغي</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="startDate">تاريخ البدء *</Label>
              <Input id="startDate" type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">تاريخ الانتهاء</Label>
              <Input id="endDate" type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="description">الوصف</Label>
              <Textarea id="description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="وصف العقد" rows={3} />
            </div>
          </div>

          {/* VAT Preview */}
          {val > 0 && (
            <Card className="bg-emerald-50 border-emerald-200">
              <CardContent className="p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">القيمة</p>
                    <p className="font-semibold">{formatSAR(val, 'ar')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">الضريبة ({(rate * 100).toFixed(0)}%)</p>
                    <p className="font-semibold">{formatSAR(vatAmount, 'ar')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">الإجمالي</p>
                    <p className="font-bold text-emerald-700">{formatSAR(totalValue, 'ar')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button type="submit" disabled={createMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? 'جاري الحفظ...' : 'إنشاء'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main Contracts Module ============
export function ContractsModule() {
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: contracts = [], isLoading, isError, refetch } = useQuery<ContractItem[]>({
    queryKey: ['contracts'],
    queryFn: async () => {
      const res = await fetch('/api/contracts')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  // Fetch projects for form dropdown
  const { data: projects = [] } = useQuery<ProjectSummary[]>({
    queryKey: ['projects-for-contracts'],
    queryFn: async () => {
      const res = await fetch('/api/projects')
      if (!res.ok) return []
      const data = await res.json()
      return data.map((p: { id: string; name: string; code: string }) => ({ id: p.id, name: p.name, code: p.code }))
    },
  })

  const filtered = contracts.filter(c => {
    const matchSearch = !search || c.contractNo.includes(search) || c.project.name.includes(search)
    const matchStatus = statusFilter === 'all' || c.status === statusFilter
    return matchSearch && matchStatus
  })

  const totalContractValue = filtered.reduce((s, c) => s + c.totalValue, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{lang === 'ar' ? 'العقود' : 'Contracts'}</h1>
          <p className="text-sm text-muted-foreground">{lang === 'ar' ? 'إدارة عقود المشاريع' : 'Manage project contracts'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} title="تحديث">
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> عقد جديد
          </Button>
        </div>
      </div>

      {/* Summary Card */}
      <Card className="bg-emerald-50 border-emerald-200">
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">إجمالي قيمة العقود</p>
            <p className="text-2xl font-bold text-emerald-700">{formatSAR(totalContractValue, lang)}</p>
          </div>
          <div className="text-left">
            <p className="text-sm text-muted-foreground">عدد العقود</p>
            <p className="text-2xl font-bold">{filtered.length}</p>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder="بحث برقم العقد أو اسم المشروع..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="كل الحالات" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="DRAFT">مسودة</SelectItem>
                <SelectItem value="ACTIVE">نشط</SelectItem>
                <SelectItem value="EXPIRED">منتهي</SelectItem>
                <SelectItem value="TERMINATED">ملغي</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Contracts Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton />
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="text-rose-600">حدث خطأ أثناء تحميل البيانات</p>
              <Button variant="outline" onClick={() => refetch()}>إعادة المحاولة</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <FileText className="size-12 text-gray-300" />
              <p className="text-muted-foreground">لا توجد عقود</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">رقم العقد</TableHead>
                    <TableHead className="text-right">المشروع</TableHead>
                    <TableHead className="text-right">القيمة</TableHead>
                    <TableHead className="text-right">الضريبة</TableHead>
                    <TableHead className="text-right">الإجمالي</TableHead>
                    <TableHead className="text-right">تاريخ البدء</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">المستخلصات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.contractNo}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{c.project.name}</TableCell>
                      <TableCell>{formatSAR(c.value, lang)}</TableCell>
                      <TableCell>{formatSAR(c.vatAmount, lang)}</TableCell>
                      <TableCell className="font-semibold">{formatSAR(c.totalValue, lang)}</TableCell>
                      <TableCell>{formatDate(c.startDate, lang)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[c.status]}>
                          {statusLabels[c.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>{c._count.progressClaims}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ContractFormDialog open={dialogOpen} onOpenChange={setDialogOpen} projects={projects} />
    </div>
  )
}
