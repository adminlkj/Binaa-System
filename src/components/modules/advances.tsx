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
import { useAppStore, formatSAR, formatDate, formatNumber } from '@/stores/app-store'

// ============ Types ============
interface Employee { id: string; code: string; name: string; position: string | null }

interface Advance {
  id: string; employeeId: string; amount: number; date: string
  settledAmount: number; status: string; description: string | null
  employee: Employee
}

// ============ Status Helpers ============
const statusConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  PENDING: { label: { ar: 'غير مسددة', en: 'Pending' }, color: 'text-orange-700', bg: 'bg-orange-100' },
  PARTIALLY_SETTLED: { label: { ar: 'مسددة جزئياً', en: 'Partially Settled' }, color: 'text-blue-700', bg: 'bg-blue-100' },
  SETTLED: { label: { ar: 'مسددة', en: 'Settled' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  CANCELLED: { label: { ar: 'ملغاة', en: 'Cancelled' }, color: 'text-gray-700', bg: 'bg-gray-100' },
}

function StatusBadge({ status, lang }: { status: string; lang: 'ar' | 'en' }) {
  const cfg = statusConfig[status] || statusConfig.PENDING
  return <Badge className={`${cfg.bg} ${cfg.color} border-0`}>{cfg.label[lang]}</Badge>
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
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
          <DialogTitle>{lang === 'ar' ? 'سلفة جديدة' : 'New Advance'}</DialogTitle>
          <DialogDescription>{lang === 'ar' ? 'إضافة سلفة لموظف' : 'Add employee advance'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'الموظف *' : 'Employee *'}</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder={lang === 'ar' ? 'اختر الموظف' : 'Select employee'} /></SelectTrigger>
              <SelectContent>
                {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'المبلغ *' : 'Amount *'}</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} dir="ltr" required />
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'التاريخ *' : 'Date *'}</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'الوصف' : 'Description'}</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={lang === 'ar' ? 'وصف السلفة' : 'Advance description'} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
            <Button type="submit" disabled={createMutation.isPending || !employeeId || !amount || !date} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? (lang === 'ar' ? 'جاري الإنشاء...' : 'Creating...') : (lang === 'ar' ? 'إضافة' : 'Add')}
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
          <DialogTitle>{lang === 'ar' ? 'تسوية السلفة' : 'Settle Advance'}</DialogTitle>
          <DialogDescription>
            {advance.employee.name} — {lang === 'ar' ? 'المتبقي' : 'Remaining'}: {formatSAR(remaining, lang)}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'إجمالي السلفة' : 'Total Advance'}</Label>
              <p className="text-sm font-semibold">{formatSAR(advance.amount, lang)}</p>
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'المسدد' : 'Settled'}</Label>
              <p className="text-sm font-semibold text-emerald-700">{formatSAR(advance.settledAmount, lang)}</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'مبلغ التسوية *' : 'Settlement Amount *'}</Label>
            <Input type="number" min="0.01" max={remaining} step="0.01" value={settleAmount} onChange={e => setSettleAmount(e.target.value)} dir="ltr" required />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
            <Button type="submit" disabled={settleMutation.isPending || !settleAmount} className="bg-emerald-600 hover:bg-emerald-700">
              {settleMutation.isPending ? (lang === 'ar' ? 'جاري التسوية...' : 'Settling...') : (lang === 'ar' ? 'تسوية' : 'Settle')}
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
    const matchSearch = !search || a.employee.name.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  // Summary
  const totalAdvances = advances.reduce((s, a) => s + a.amount, 0)
  const pendingAmount = advances.filter(a => a.status === 'PENDING').reduce((s, a) => s + (a.amount - a.settledAmount), 0)
  const partiallySettled = advances.filter(a => a.status === 'PARTIALLY_SETTLED').reduce((s, a) => s + (a.amount - a.settledAmount), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{lang === 'ar' ? 'العهد والسلف' : 'Advances'}</h1>
          <p className="text-sm text-muted-foreground">{lang === 'ar' ? 'إدارة سلف الموظفين' : 'Manage employee advances'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} title={lang === 'ar' ? 'تحديث' : 'Refresh'}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> {lang === 'ar' ? 'سلفة جديدة' : 'New Advance'}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <HandCoins className="size-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-emerald-600">{lang === 'ar' ? 'إجمالي السلف' : 'Total Advances'}</p>
              <p className="text-xl font-bold text-emerald-700">{formatSAR(totalAdvances, lang)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-orange-50 border-orange-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-orange-100 flex items-center justify-center">
              <HandCoins className="size-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-orange-600">{lang === 'ar' ? 'غير المسددة' : 'Pending'}</p>
              <p className="text-xl font-bold text-orange-700">{formatSAR(pendingAmount, lang)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-blue-100 flex items-center justify-center">
              <HandCoins className="size-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-blue-600">{lang === 'ar' ? 'مسددة جزئياً' : 'Partially Settled'}</p>
              <p className="text-xl font-bold text-blue-700">{formatSAR(partiallySettled, lang)}</p>
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
              <Input placeholder={lang === 'ar' ? 'بحث باسم الموظف...' : 'Search by employee name...'} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder={lang === 'ar' ? 'كل الحالات' : 'All Statuses'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{lang === 'ar' ? 'كل الحالات' : 'All Statuses'}</SelectItem>
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
            <div className="p-6"><TableSkeleton /></div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="text-rose-600">{lang === 'ar' ? 'حدث خطأ' : 'An error occurred'}</p>
              <Button variant="outline" onClick={() => refetch()}>{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <HandCoins className="size-12 text-gray-300" />
              <p className="text-muted-foreground">{lang === 'ar' ? 'لا توجد سلف' : 'No advances found'}</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
                <Plus className="size-4 mr-1" /> {lang === 'ar' ? 'إضافة سلفة' : 'Add Advance'}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{lang === 'ar' ? 'الموظف' : 'Employee'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'المبلغ' : 'Amount'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'المسدد' : 'Settled'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'المتبقي' : 'Remaining'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الإجراءات' : 'Actions'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.employee.name}</TableCell>
                      <TableCell>{formatSAR(a.amount, lang)}</TableCell>
                      <TableCell className="text-emerald-700">{formatSAR(a.settledAmount, lang)}</TableCell>
                      <TableCell className="font-semibold text-rose-700">{formatSAR(a.amount - a.settledAmount, lang)}</TableCell>
                      <TableCell>{formatDate(a.date, lang)}</TableCell>
                      <TableCell><StatusBadge status={a.status} lang={lang} /></TableCell>
                      <TableCell>
                        {a.status !== 'SETTLED' && a.status !== 'CANCELLED' && (
                          <Button size="sm" variant="outline" className="gap-1 text-emerald-600 hover:text-emerald-700"
                            onClick={() => { setSelectedAdvance(a); setSettleDialogOpen(true) }}>
                            <CheckCircle className="size-3.5" />
                            {lang === 'ar' ? 'تسوية' : 'Settle'}
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
    </div>
  )
}
