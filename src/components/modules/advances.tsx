'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  HandCoins, Plus, Search, RefreshCw, CheckCircle,
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
import { MoneyDisplay } from '@/components/ui/money-display'
import { useAppStore, formatDate, formatSAR } from '@/stores/app-store'

// ============ Types ============
interface Employee { id: string; code: string; name: string; position: string | null }

interface Advance {
  id: string; employeeId: string; amount: number; date: string
  settledAmount: number; status: string; description: string | null
  employee: Employee
}

// ============ Bilingual Helpers ============
const t = (lang: 'ar' | 'en', ar: string, en: string) => lang === 'ar' ? ar : en

// ============ Status Helpers ============
const statusConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  PENDING: { label: { ar: 'غير مسددة', en: 'Pending' }, color: 'text-orange-700', bg: 'bg-orange-100' },
  PARTIALLY_SETTLED: { label: { ar: 'مسددة جزئياً', en: 'Partially Settled' }, color: 'text-blue-700', bg: 'bg-blue-100' },
  SETTLED: { label: { ar: 'مسددة', en: 'Settled' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  CANCELLED: { label: { ar: 'ملغاة', en: 'Cancelled' }, color: 'text-gray-700', bg: 'bg-gray-100' },
}

function AdvanceStatusBadge({ status, lang }: { status: string; lang: 'ar' | 'en' }) {
  const cfg = statusConfig[status] || statusConfig.PENDING
  return <Badge className={`${cfg.bg} ${cfg.color} border-0`}>{cfg.label[lang]}</Badge>
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3">
          <div className="h-5 w-28 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

// ============ New Advance Dialog ============
function NewAdvanceDialog({ open, onOpenChange, employees }: {
  open: boolean; onOpenChange: (v: boolean) => void; employees: Employee[]
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [employeeId, setEmployeeId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')

  React.useEffect(() => {
    if (open) { setEmployeeId(''); setAmount(''); setDate(''); setDescription('') }
  }, [open])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/advances', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['advances'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({ employeeId, amount, date, description: description || null })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t(lang, 'سلفة جديدة', 'New Advance')}</DialogTitle>
          <DialogDescription>{t(lang, 'إضافة سلفة لموظف', 'Add employee advance')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t(lang, 'الموظف *', 'Employee *')}</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder={t(lang, 'اختر الموظف', 'Select employee')} /></SelectTrigger>
              <SelectContent>
                {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t(lang, 'المبلغ *', 'Amount *')}</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} dir="ltr" required />
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'التاريخ *', 'Date *')}</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t(lang, 'الوصف', 'Description')}</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={t(lang, 'وصف السلفة', 'Advance description')} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t(lang, 'إلغاء', 'Cancel')}</Button>
            <Button type="submit" disabled={createMutation.isPending || !employeeId || !amount || !date} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? t(lang, 'جاري الإنشاء...', 'Creating...') : t(lang, 'إضافة', 'Add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Settle Advance Dialog ============
function SettleAdvanceDialog({ open, onOpenChange, advance }: {
  open: boolean; onOpenChange: (v: boolean) => void; advance: Advance | null
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [settleAmount, setSettleAmount] = useState('')

  React.useEffect(() => {
    if (open && advance) {
      setSettleAmount(String(advance.amount - advance.settledAmount))
    }
  }, [open, advance])

  const settleMutation = useMutation({
    mutationFn: (data: { id: string; settleAmount: string }) =>
      fetch(`/api/advances/${data.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['advances'] }); onOpenChange(false) },
  })

  if (!advance) return null

  const remaining = advance.amount - advance.settledAmount

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    settleMutation.mutate({ id: advance.id, settleAmount })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t(lang, 'تسوية السلفة', 'Settle Advance')}</DialogTitle>
          <DialogDescription>
            {advance.employee.name} — {t(lang, 'المتبقي', 'Remaining')}: <MoneyDisplay value={remaining} lang={lang} bold size="sm" inline />
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t(lang, 'إجمالي السلفة', 'Total Advance')}</Label>
              <MoneyDisplay value={advance.amount} lang={lang} bold size="md" />
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'المسدد', 'Settled')}</Label>
              <MoneyDisplay value={advance.settledAmount} lang={lang} bold size="md" className="text-emerald-700" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t(lang, 'مبلغ التسوية *', 'Settlement Amount *')}</Label>
            <Input type="number" min="0.01" max={remaining} step="0.01" value={settleAmount} onChange={e => setSettleAmount(e.target.value)} dir="ltr" required />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t(lang, 'إلغاء', 'Cancel')}</Button>
            <Button type="submit" disabled={settleMutation.isPending || !settleAmount} className="bg-emerald-600 hover:bg-emerald-700">
              {settleMutation.isPending ? t(lang, 'جاري التسوية...', 'Settling...') : t(lang, 'تسوية', 'Settle')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main Advances Module ============
export function AdvancesModule() {
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [settleDialogOpen, setSettleDialogOpen] = useState(false)
  const [selectedAdvance, setSelectedAdvance] = useState<Advance | null>(null)

  const { data: advances = [], isLoading, isError, refetch } = useQuery<Advance[]>({
    queryKey: ['advances'],
    queryFn: async () => {
      const res = await fetch('/api/advances')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['employees'],
    queryFn: async () => {
      const res = await fetch('/api/employees')
      if (!res.ok) return []
      return res.json()
    },
  })

  const filtered = advances.filter(a => {
    const matchStatus = statusFilter === 'all' || a.status === statusFilter
    const matchSearch = !search || a.employee.name.toLowerCase().includes(search.toLowerCase()) || (a.description || '').toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  // Summary
  const totalAdvances = advances.reduce((s, a) => s + a.amount, 0)
  const totalSettled = advances.reduce((s, a) => s + a.settledAmount, 0)
  const pendingAmount = advances.filter(a => a.status === 'PENDING').reduce((s, a) => s + (a.amount - a.settledAmount), 0)

  return (
    <ModuleLayout
      title={{ ar: 'العهد والسلف', en: 'Advances' }}
      subtitle={{ ar: 'إدارة سلف الموظفين', en: 'Manage employee advances' }}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} title={t(lang, 'تحديث', 'Refresh')}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> {t(lang, 'سلفة جديدة', 'New Advance')}
          </Button>
        </div>
      }
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <HandCoins className="size-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-emerald-600">{t(lang, 'إجمالي السلف', 'Total Advances')}</p>
              <MoneyDisplay value={totalAdvances} lang={lang} bold size="lg" className="text-emerald-700" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-orange-50 border-orange-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-orange-100 flex items-center justify-center">
              <HandCoins className="size-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-orange-600">{t(lang, 'غير المسددة', 'Pending')}</p>
              <MoneyDisplay value={pendingAmount} lang={lang} bold size="lg" className="text-orange-700" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-blue-100 flex items-center justify-center">
              <CheckCircle className="size-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-blue-600">{t(lang, 'المسدد', 'Settled')}</p>
              <MoneyDisplay value={totalSettled} lang={lang} bold size="lg" className="text-blue-700" />
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
              <Input placeholder={t(lang, 'بحث باسم الموظف أو الوصف...', 'Search by employee or description...')} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder={t(lang, 'كل الحالات', 'All Statuses')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t(lang, 'كل الحالات', 'All Statuses')}</SelectItem>
                {Object.entries(statusConfig).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label[lang]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton />
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="text-rose-600">{t(lang, 'حدث خطأ', 'An error occurred')}</p>
              <Button variant="outline" onClick={() => refetch()}>{t(lang, 'إعادة المحاولة', 'Retry')}</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <HandCoins className="size-12 text-gray-300" />
              <p className="text-muted-foreground">{t(lang, 'لا توجد سلف', 'No advances found')}</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
                <Plus className="size-4 mr-1" /> {t(lang, 'إضافة سلفة', 'Add Advance')}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t(lang, 'الموظف', 'Employee')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'المبلغ', 'Amount')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'المسدد', 'Settled')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'المتبقي', 'Remaining')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'التاريخ', 'Date')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'الوصف', 'Description')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'الحالة', 'Status')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'الإجراءات', 'Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.employee.name}</TableCell>
                      <TableCell><MoneyDisplay value={a.amount} lang={lang} size="sm" /></TableCell>
                      <TableCell><MoneyDisplay value={a.settledAmount} lang={lang} size="sm" className="text-emerald-700" /></TableCell>
                      <TableCell><MoneyDisplay value={a.amount - a.settledAmount} lang={lang} bold size="sm" className="text-rose-700" /></TableCell>
                      <TableCell>{formatDate(a.date, lang)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{a.description || '—'}</TableCell>
                      <TableCell><AdvanceStatusBadge status={a.status} lang={lang} /></TableCell>
                      <TableCell>
                        {a.status !== 'SETTLED' && a.status !== 'CANCELLED' && (
                          <Button size="sm" variant="outline" className="gap-1 text-emerald-600 hover:text-emerald-700"
                            onClick={() => { setSelectedAdvance(a); setSettleDialogOpen(true) }}>
                            <CheckCircle className="size-3.5" />
                            {t(lang, 'تسوية', 'Settle')}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <NewAdvanceDialog open={dialogOpen} onOpenChange={setDialogOpen} employees={employees} />
      <SettleAdvanceDialog open={settleDialogOpen} onOpenChange={setSettleDialogOpen} advance={selectedAdvance} />
    </ModuleLayout>
  )
}
