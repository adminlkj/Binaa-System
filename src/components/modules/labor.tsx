'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  HardHat, Plus, Search, RefreshCw, Users, Calculator,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { useAppStore, formatSAR as storeFormatSAR, formatDate as storeFormatDate, formatNumber, commonText } from '@/stores/app-store'

// ============ Types ============
interface ProjectOption { id: string; code: string; name: string }

interface LaborCost {
  id: string; projectId: string; description: string; workers: number
  days: number; dailyRate: number; totalAmount: number; date: string
  project: { id: string; code: string; name: string }
}

// formatSAR, formatDate, formatNumber imported from store

function formatSAR(value: number, lang: 'ar' | 'en' = 'ar'): string {
  return storeFormatSAR(value, lang)
}

function formatDate(dateStr: string, lang: 'ar' | 'en' = 'ar'): string {
  return storeFormatDate(dateStr, lang)
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3">
          <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-28 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

// ============ Labor Cost Form Dialog ============
function LaborCostFormDialog({
  open, onOpenChange, projects,
}: {
  open: boolean; onOpenChange: (open: boolean) => void
  projects: ProjectOption[]
}) {
  const queryClient = useQueryClient()

  const [projectId, setProjectId] = useState('')
  const [description, setDescription] = useState('')
  const [workers, setWorkers] = useState('')
  const [days, setDays] = useState('')
  const [dailyRate, setDailyRate] = useState('')
  const [date, setDate] = useState('')

  React.useEffect(() => {
    if (open) {
      setProjectId(''); setDescription(''); setWorkers('')
      setDays(''); setDailyRate(''); setDate('')
    }
  }, [open])

  const totalAmount = useMemo(() => {
    const w = parseFloat(workers) || 0
    const d = parseFloat(days) || 0
    const r = parseFloat(dailyRate) || 0
    return w * d * r
  }, [workers, days, dailyRate])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/labor-costs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['labor-costs'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({ projectId, description, workers, days, dailyRate, date })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>تكلفة عمالة جديدة</DialogTitle>
          <DialogDescription>إضافة تكلفة عمالة للمشروع</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label>المشروع *</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="اختر المشروع" /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="lc-desc">الوصف *</Label>
              <Input id="lc-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="وصف العمل" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lc-workers">عدد العمال *</Label>
              <Input id="lc-workers" type="number" min="1" value={workers} onChange={e => setWorkers(e.target.value)} dir="ltr" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lc-days">عدد الأيام *</Label>
              <Input id="lc-days" type="number" min="0.5" step="0.5" value={days} onChange={e => setDays(e.target.value)} dir="ltr" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lc-rate">الأجر اليومي *</Label>
              <Input id="lc-rate" type="number" min="0" step="0.01" value={dailyRate} onChange={e => setDailyRate(e.target.value)} dir="ltr" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lc-date">التاريخ *</Label>
              <Input id="lc-date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
          </div>

          {/* Auto-calc Preview */}
          {totalAmount > 0 && (
            <Card className="bg-emerald-50 border-emerald-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calculator className="size-4 text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-700">حساب تلقائي</span>
                </div>
                <p className="text-xs text-emerald-600 mb-1">العدد × الأيام × الأجر اليومي = الإجمالي</p>
                <p className="text-lg font-bold text-emerald-700">{formatSAR(totalAmount, 'ar')}</p>
              </CardContent>
            </Card>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button type="submit" disabled={createMutation.isPending || !projectId || !description || !workers || !days || !dailyRate || !date} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? 'جاري الإنشاء...' : 'إضافة تكلفة العمالة'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main Labor Costs Module ============
export function LaborModule() {
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: laborCosts = [], isLoading, isError, refetch } = useQuery<LaborCost[]>({
    queryKey: ['labor-costs'],
    queryFn: async () => {
      const res = await fetch('/api/labor-costs')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  const { data: projects = [] } = useQuery<ProjectOption[]>({
    queryKey: ['projects-list'],
    queryFn: async () => {
      const res = await fetch('/api/projects/list')
      if (!res.ok) return []
      return res.json()
    },
  })

  const filtered = laborCosts.filter(lc => {
    const matchProject = projectFilter === 'all' || lc.projectId === projectFilter
    const matchSearch = !search ||
      lc.description.toLowerCase().includes(search.toLowerCase()) ||
      lc.project.name.toLowerCase().includes(search.toLowerCase())
    return matchProject && matchSearch
  })

  // Summary
  const totalLabor = laborCosts.reduce((s, l) => s + l.totalAmount, 0)
  const totalWorkers = laborCosts.reduce((s, l) => s + l.workers, 0)
  const avgDailyRate = laborCosts.length > 0 ? laborCosts.reduce((s, l) => s + l.dailyRate, 0) / laborCosts.length : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{lang === 'ar' ? 'تكاليف العمالة' : 'Labor Costs'}</h1>
          <p className="text-sm text-muted-foreground">{lang === 'ar' ? 'إدارة تكاليف العمالة للمشاريع' : 'Manage project labor costs'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} title="تحديث">
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> تكلفة عمالة جديدة
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <HardHat className="size-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-emerald-600">إجمالي تكاليف العمالة</p>
              <p className="text-xl font-bold text-emerald-700">{formatSAR(totalLabor, lang)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-teal-50 border-teal-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-teal-100 flex items-center justify-center">
              <Users className="size-5 text-teal-600" />
            </div>
            <div>
              <p className="text-sm text-teal-600">عدد العمال</p>
              <p className="text-xl font-bold text-teal-700">{formatNumber(totalWorkers)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-amber-100 flex items-center justify-center">
              <Calculator className="size-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-amber-600">متوسط الأجر اليومي</p>
              <p className="text-xl font-bold text-amber-700">{formatSAR(avgDailyRate, lang)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder="بحث بالوصف أو المشروع..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="كل المشاريع" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المشاريع</SelectItem>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6"><TableSkeleton /></div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="text-rose-600">حدث خطأ أثناء تحميل البيانات</p>
              <Button variant="outline" onClick={() => refetch()}>إعادة المحاولة</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <HardHat className="size-12 text-gray-300" />
              <p className="text-muted-foreground">لا توجد تكاليف عمالة</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
                <Plus className="size-4 mr-1" /> إضافة تكلفة عمالة
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">المشروع</TableHead>
                    <TableHead className="text-right">الوصف</TableHead>
                    <TableHead className="text-right">عدد العمال</TableHead>
                    <TableHead className="text-right">الأيام</TableHead>
                    <TableHead className="text-right">الأجر اليومي</TableHead>
                    <TableHead className="text-right">الإجمالي</TableHead>
                    <TableHead className="text-right">التاريخ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(lc => (
                    <TableRow key={lc.id}>
                      <TableCell className="font-medium">{lc.project.name}</TableCell>
                      <TableCell>{lc.description}</TableCell>
                      <TableCell>{formatNumber(lc.workers)}</TableCell>
                      <TableCell>{formatNumber(lc.days)}</TableCell>
                      <TableCell>{formatSAR(lc.dailyRate, lang)}</TableCell>
                      <TableCell className="font-semibold text-emerald-700">{formatSAR(lc.totalAmount, lang)}</TableCell>
                      <TableCell>{formatDate(lc.date, lang)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <LaborCostFormDialog open={dialogOpen} onOpenChange={setDialogOpen} projects={projects} />
    </div>
  )
}
