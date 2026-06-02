'use client'

import React, { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  TrendingUp, Plus, Search, RefreshCw,
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
interface ContractSummary { id: string; contractNo: string; totalValue: number }

interface ClaimItem {
  id: string; claimNo: string; date: string; percentage: number
  amount: number; vatRate: number; vatAmount: number; totalAmount: number
  status: string; approvedDate: string | null; notes: string | null
  project: ProjectSummary
  contract: ContractSummary
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
  DRAFT: 'مسودة', SUBMITTED: 'مقدم', APPROVED: 'معتمد',
  PARTIALLY_PAID: 'مدفوع جزئياً', PAID: 'مدفوع', REJECTED: 'مرفوض',
}
const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-200',
  SUBMITTED: 'bg-blue-100 text-blue-700 border-blue-200',
  APPROVED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-700 border-amber-200',
  PAID: 'bg-teal-100 text-teal-700 border-teal-200',
  REJECTED: 'bg-rose-100 text-rose-700 border-rose-200',
}

// ============ Skeleton ============
function TableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3">
          <div className="h-5 w-28 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

// ============ Claim Form Dialog ============
interface ClaimFormData {
  projectId: string; contractId: string; claimNo: string; date: string
  percentage: string; amount: string; vatRate: string; status: string; notes: string
}

function ClaimFormDialog({
  open, onOpenChange, projects,
}: {
  open: boolean; onOpenChange: (open: boolean) => void
  projects: ProjectSummary[]
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ClaimFormData>({
    projectId: '', contractId: '', claimNo: '', date: '',
    percentage: '', amount: '', vatRate: '0.15', status: 'DRAFT', notes: '',
  })

  React.useEffect(() => {
    if (open) {
      setForm({
        projectId: '', contractId: '', claimNo: '', date: '',
        percentage: '', amount: '', vatRate: '0.15', status: 'DRAFT', notes: '',
      })
    }
  }, [open])

  // Fetch contracts when project is selected
  const { data: projectContracts = [] } = useQuery<ContractSummary[]>({
    queryKey: ['contracts-for-project', form.projectId],
    queryFn: async () => {
      if (!form.projectId) return []
      const res = await fetch(`/api/contracts?projectId=${form.projectId}`)
      if (!res.ok) return []
      const data = await res.json()
      return data.map((c: { id: string; contractNo: string; totalValue: number }) => ({ id: c.id, contractNo: c.contractNo, totalValue: c.totalValue }))
    },
    enabled: !!form.projectId,
  })

  // Auto-calculate when percentage or contract changes
  const selectedContract = projectContracts.find(c => c.id === form.contractId)
  const pct = parseFloat(form.percentage) || 0
  const autoAmount = selectedContract ? Math.round(selectedContract.totalValue / 1.15 * pct / 100 * 100) / 100 : 0

  React.useEffect(() => {
    if (autoAmount > 0) {
      setForm(f => ({ ...f, amount: autoAmount.toString() }))
    }
  }, [autoAmount, form.percentage, form.contractId])

  const createMutation = useMutation({
    mutationFn: (data: ClaimFormData) =>
      fetch('/api/progress-claims', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['progress-claims'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate(form)
  }

  const val = parseFloat(form.amount) || 0
  const rate = parseFloat(form.vatRate) || 0
  const vatAmt = Math.round(val * rate * 100) / 100
  const totalAmt = Math.round((val + vatAmt) * 100) / 100

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>مستخلص جديد</DialogTitle>
          <DialogDescription>إضافة مستخلص جديد للعقد</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>المشروع *</Label>
              <Select value={form.projectId} onValueChange={v => setForm(f => ({ ...f, projectId: v, contractId: '' }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="اختر المشروع" /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>العقد *</Label>
              <Select value={form.contractId} onValueChange={v => setForm(f => ({ ...f, contractId: v }))} disabled={!form.projectId}>
                <SelectTrigger className="w-full"><SelectValue placeholder={form.projectId ? 'اختر العقد' : 'اختر المشروع أولاً'} /></SelectTrigger>
                <SelectContent>
                  {projectContracts.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.contractNo} — {formatSAR(c.totalValue, 'ar')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="claimNo">رقم المستخلص *</Label>
              <Input id="claimNo" value={form.claimNo} onChange={e => setForm(f => ({ ...f, claimNo: e.target.value }))} placeholder="CLM-001-01" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">التاريخ *</Label>
              <Input id="date" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="percentage">نسبة الإنجاز (%) *</Label>
              <Input id="percentage" type="number" step="0.1" min="0" max="100" value={form.percentage} onChange={e => setForm(f => ({ ...f, percentage: e.target.value }))} placeholder="0" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">المبلغ (قبل الضريبة) *</Label>
              <Input id="amount" type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" required />
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
                  <SelectItem value="SUBMITTED">مقدم</SelectItem>
                  <SelectItem value="APPROVED">معتمد</SelectItem>
                  <SelectItem value="REJECTED">مرفوض</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="notes">ملاحظات</Label>
              <Textarea id="notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="ملاحظات" rows={2} />
            </div>
          </div>

          {/* VAT Preview */}
          {val > 0 && (
            <Card className="bg-emerald-50 border-emerald-200">
              <CardContent className="p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">المبلغ</p>
                    <p className="font-semibold">{formatSAR(val, 'ar')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">الضريبة ({(rate * 100).toFixed(0)}%)</p>
                    <p className="font-semibold">{formatSAR(vatAmt, 'ar')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">الإجمالي</p>
                    <p className="font-bold text-emerald-700">{formatSAR(totalAmt, 'ar')}</p>
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

// ============ Main Progress Claims Module ============
export function ProgressClaimsModule() {
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)

  // Fetch claims
  const { data: claims = [], isLoading, isError, refetch } = useQuery<ClaimItem[]>({
    queryKey: ['progress-claims', selectedProjectId],
    queryFn: async () => {
      const url = selectedProjectId === 'all' ? '/api/progress-claims' : `/api/progress-claims?projectId=${selectedProjectId}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  // Fetch projects for filter
  const { data: projects = [] } = useQuery<ProjectSummary[]>({
    queryKey: ['projects-for-claims'],
    queryFn: async () => {
      const res = await fetch('/api/projects')
      if (!res.ok) return []
      const data = await res.json()
      return data.map((p: { id: string; name: string; code: string }) => ({ id: p.id, name: p.name, code: p.code }))
    },
  })

  // Filter
  const filtered = claims.filter(c => {
    const matchSearch = !search || c.claimNo.includes(search) || c.project.name.includes(search) || c.contract.contractNo.includes(search)
    const matchStatus = statusFilter === 'all' || c.status === statusFilter
    return matchSearch && matchStatus
  })

  // Compute running totals per contract
  const contractTotals = React.useMemo(() => {
    const acc: Record<string, { contractNo: string; totalValue: number; claimedAmount: number }> = {}
    for (const c of claims) {
      if (!acc[c.contractId]) {
        acc[c.contractId] = { contractNo: c.contract.contractNo, totalValue: c.contract.totalValue, claimedAmount: 0 }
      }
      acc[c.contractId] = { ...acc[c.contractId], claimedAmount: acc[c.contractId].claimedAmount + c.amount }
    }
    const result: Record<string, { contractNo: string; totalValue: number; claimedAmount: number; claimedPercent: string }> = {}
    for (const [key, val] of Object.entries(acc)) {
      const claimedPercent = val.totalValue > 0 ? ((val.claimedAmount / (val.totalValue / 1.15)) * 100).toFixed(1) : '0'
      result[key] = { ...val, claimedPercent }
    }
    return result
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  }, [claims])

  const totalClaimedAmount = filtered.reduce((s, c) => s + c.totalAmount, 0)
  const paidAmount = filtered.filter(c => c.status === 'PAID').reduce((s, c) => s + c.totalAmount, 0)
  const pendingAmount = filtered.filter(c => ['SUBMITTED', 'APPROVED'].includes(c.status)).reduce((s, c) => s + c.totalAmount, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{lang === 'ar' ? 'المستخلصات' : 'Progress Claims'}</h1>
          <p className="text-sm text-muted-foreground">{lang === 'ar' ? 'متابعة مستخلصات المشاريع والعقود' : 'Track project and contract claims'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} title="تحديث">
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> مستخلص جديد
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">إجمالي المستخلصات</p>
            <p className="text-lg font-bold text-emerald-700">{formatSAR(totalClaimedAmount, lang)}</p>
          </CardContent>
        </Card>
        <Card className="bg-teal-50 border-teal-200">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">المحصل</p>
            <p className="text-lg font-bold text-teal-700">{formatSAR(paidAmount, lang)}</p>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">قيد التحصيل</p>
            <p className="text-lg font-bold text-amber-700">{formatSAR(pendingAmount, lang)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Contract Running Totals */}
      {Object.keys(contractTotals).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">إجمالي المستخلصات حسب العقد</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">رقم العقد</TableHead>
                  <TableHead className="text-right">قيمة العقد</TableHead>
                  <TableHead className="text-right">المستخلص</TableHead>
                  <TableHead className="text-right">نسبة الإنجاز</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.values(contractTotals).map(t => (
                  <TableRow key={t.contractNo}>
                    <TableCell className="font-medium">{t.contractNo}</TableCell>
                    <TableCell>{formatSAR(t.totalValue, lang)}</TableCell>
                    <TableCell>{formatSAR(t.claimedAmount, lang)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[100px]">
                          <div
                            className="bg-emerald-500 rounded-full h-2 transition-all"
                            style={{ width: `${Math.min(parseFloat(t.claimedPercent), 100)}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium">{t.claimedPercent}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue placeholder="كل المشاريع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المشاريع</SelectItem>
                {projects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder="بحث برقم المستخلص أو المشروع..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="كل الحالات" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="DRAFT">مسودة</SelectItem>
                <SelectItem value="SUBMITTED">مقدم</SelectItem>
                <SelectItem value="APPROVED">معتمد</SelectItem>
                <SelectItem value="PARTIALLY_PAID">مدفوع جزئياً</SelectItem>
                <SelectItem value="PAID">مدفوع</SelectItem>
                <SelectItem value="REJECTED">مرفوض</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Claims Table */}
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
              <TrendingUp className="size-12 text-gray-300" />
              <p className="text-muted-foreground">لا توجد مستخلصات</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
                <Plus className="size-4 mr-1" /> إنشاء مستخلص
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">رقم المستخلص</TableHead>
                    <TableHead className="text-right">المشروع</TableHead>
                    <TableHead className="text-right">العقد</TableHead>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">النسبة</TableHead>
                    <TableHead className="text-right">المبلغ</TableHead>
                    <TableHead className="text-right">الضريبة</TableHead>
                    <TableHead className="text-right">الإجمالي</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.claimNo}</TableCell>
                      <TableCell className="max-w-[150px] truncate">{c.project.name}</TableCell>
                      <TableCell>{c.contract.contractNo}</TableCell>
                      <TableCell>{formatDate(c.date, lang)}</TableCell>
                      <TableCell>{c.percentage}%</TableCell>
                      <TableCell>{formatSAR(c.amount, lang)}</TableCell>
                      <TableCell>{formatSAR(c.vatAmount, lang)}</TableCell>
                      <TableCell className="font-semibold">{formatSAR(c.totalAmount, lang)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[c.status]}>
                          {statusLabels[c.status]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ClaimFormDialog open={dialogOpen} onOpenChange={setDialogOpen} projects={projects} />
    </div>
  )
}
