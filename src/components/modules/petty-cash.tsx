'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Wallet, Plus, Search, RefreshCw,
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
import { AccountingEntryDisplay } from '@/components/shared/accounting-entry-display'
import { MoneyDisplay } from '@/components/ui/money-display'
import { useAppStore, formatDate } from '@/stores/app-store'

// ============ Types ============
interface Branch { id: string; code: string; name: string }

interface PettyCashEntry {
  id: string; branchId: string; description: string; amount: number
  date: string; category: string | null; reference: string | null; journalEntryId: string | null
  branch: Branch
}

// ============ Bilingual Helpers ============
const t = (lang: 'ar' | 'en', ar: string, en: string) => lang === 'ar' ? ar : en

// ============ Category Options ============
const categoryOptions = [
  { value: 'مصروفات نثرية', label: { ar: 'مصروفات نثرية', en: 'Miscellaneous' } },
  { value: 'صيانة', label: { ar: 'صيانة', en: 'Maintenance' } },
  { value: 'نقل', label: { ar: 'نقل', en: 'Transport' } },
  { value: 'قرطاسية', label: { ar: 'قرطاسية', en: 'Stationery' } },
  { value: 'ضيافة', label: { ar: 'ضيافة', en: 'Hospitality' } },
  { value: 'أخرى', label: { ar: 'أخرى', en: 'Other' } },
]

const categoryColors: Record<string, string> = {
  'مصروفات نثرية': 'bg-gray-100 text-gray-700',
  'صيانة': 'bg-orange-100 text-orange-700',
  'نقل': 'bg-blue-100 text-blue-700',
  'قرطاسية': 'bg-purple-100 text-purple-700',
  'ضيافة': 'bg-amber-100 text-amber-700',
  'أخرى': 'bg-emerald-100 text-emerald-700',
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3">
          <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

// ============ New Petty Cash Dialog ============
function NewPettyCashDialog({ open, onOpenChange, branches }: {
  open: boolean; onOpenChange: (v: boolean) => void; branches: Branch[]
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [branchId, setBranchId] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [category, setCategory] = useState('')
  const [reference, setReference] = useState('')

  React.useEffect(() => {
    if (open) {
      setBranchId(''); setDescription(''); setAmount(''); setDate(''); setCategory(''); setReference('')
    }
  }, [open])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/petty-cash', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['petty-cash'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({ branchId, description, amount, date, category: category || null, reference: reference || null })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(lang, 'سلفة نقدية جديدة', 'New Petty Cash Entry')}</DialogTitle>
          <DialogDescription>{t(lang, 'إضافة مصروف من الصندوق النقدي', 'Add a petty cash expense')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t(lang, 'الفرع *', 'Branch *')}</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger><SelectValue placeholder={t(lang, 'اختر الفرع', 'Select branch')} /></SelectTrigger>
                <SelectContent>
                  {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'الفئة', 'Category')}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder={t(lang, 'اختر الفئة', 'Select category')} /></SelectTrigger>
                <SelectContent>
                  {categoryOptions.map(c => <SelectItem key={c.value} value={c.value}>{c.label[lang]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t(lang, 'الوصف *', 'Description *')}</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={t(lang, 'وصف المصروف', 'Expense description')} required />
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'المبلغ *', 'Amount *')}</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} dir="ltr" required />
            </div>
            <div className="space-y-2">
              <Label>{t(lang, 'التاريخ *', 'Date *')}</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{t(lang, 'المرجع', 'Reference')}</Label>
              <Input value={reference} onChange={e => setReference(e.target.value)} placeholder={t(lang, 'رقم المرجع', 'Reference number')} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t(lang, 'إلغاء', 'Cancel')}</Button>
            <Button type="submit" disabled={createMutation.isPending || !branchId || !description || !amount || !date} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? t(lang, 'جاري الإنشاء...', 'Creating...') : t(lang, 'إضافة', 'Add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main Petty Cash Module ============
export function PettyCashModule() {
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: entries = [], isLoading, isError, refetch } = useQuery<PettyCashEntry[]>({
    queryKey: ['petty-cash'],
    queryFn: async () => {
      const res = await fetch('/api/petty-cash')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: async () => {
      const res = await fetch('/api/branches')
      if (!res.ok) return []
      return res.json()
    },
  })

  const filtered = entries.filter(e => {
    const matchCategory = categoryFilter === 'all' || e.category === categoryFilter
    const matchSearch = !search ||
      e.description.toLowerCase().includes(search.toLowerCase()) ||
      (e.reference || '').toLowerCase().includes(search.toLowerCase())
    return matchCategory && matchSearch
  })

  // Summary
  const totalBalance = entries.reduce((s, e) => s + e.amount, 0)

  return (
    <ModuleLayout
      title={{ ar: 'الصندوق النقدي', en: 'Petty Cash' }}
      subtitle={{ ar: 'إدارة المصروفات النثرية', en: 'Manage petty cash expenses' }}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} title={t(lang, 'تحديث', 'Refresh')}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> {t(lang, 'سلفة نقدية جديدة', 'New Entry')}
          </Button>
        </div>
      }
    >
      {/* Summary Card */}
      <Card className="bg-emerald-50 border-emerald-200">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="size-12 rounded-full bg-emerald-100 flex items-center justify-center">
            <Wallet className="size-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm text-emerald-600">{t(lang, 'رصيد الصندوق', 'Cash Balance')}</p>
            <MoneyDisplay value={totalBalance} lang={lang} bold size="xl" className="text-emerald-700" />
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder={t(lang, 'بحث بالوصف أو المرجع...', 'Search by description or reference...')} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder={t(lang, 'كل الفئات', 'All Categories')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t(lang, 'كل الفئات', 'All Categories')}</SelectItem>
                {categoryOptions.map(c => <SelectItem key={c.value} value={c.value}>{c.label[lang]}</SelectItem>)}
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
              <Wallet className="size-12 text-gray-300" />
              <p className="text-muted-foreground">{t(lang, 'لا توجد سجلات', 'No entries found')}</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
                <Plus className="size-4 mr-1" /> {t(lang, 'إضافة سلفة', 'Add Entry')}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{t(lang, 'الوصف', 'Description')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'المبلغ', 'Amount')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'التاريخ', 'Date')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'الفئة', 'Category')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'المرجع', 'Reference')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'الفرع', 'Branch')}</TableHead>
                    <TableHead className="text-right">{t(lang, 'القيد المحاسبي', 'Accounting')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(e => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.description}</TableCell>
                      <TableCell className="font-semibold text-emerald-700">
                        <MoneyDisplay value={e.amount} lang={lang} bold size="sm" />
                      </TableCell>
                      <TableCell>{formatDate(e.date, lang)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={categoryColors[e.category || 'أخرى'] || 'bg-gray-100 text-gray-700'}>
                          {e.category ? (categoryOptions.find(c => c.value === e.category)?.label[lang] || e.category) : '—'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{e.reference || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{e.branch.name}</TableCell>
                      <TableCell>
                        <AccountingEntryDisplay journalEntryId={e.journalEntryId} lang={lang} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <NewPettyCashDialog open={dialogOpen} onOpenChange={setDialogOpen} branches={branches} />
    </ModuleLayout>
  )
}
