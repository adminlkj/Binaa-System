'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen, Plus, RefreshCw, FileText, ChevronDown, ChevronLeft,
  Trash2, Eye,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAppStore, formatSAR, formatDate, formatNumber } from '@/stores/app-store'

// ============ Types ============
interface Account {
  id: string; code: string; name: string; nameAr: string | null
  type: string; parentId: string | null; isActive: boolean
  parent: { id: string; code: string; name: string } | null
  children: { id: string; code: string; name: string }[]
  _count: { journalLines: number }
}

interface JournalLine {
  id: string; accountId: string; debit: number; credit: number
  description: string | null; costCenterId: string | null
  account: { id: string; code: string; name: string; nameAr: string | null }
  costCenter: { id: string; code: string; name: string } | null
}

interface JournalEntry {
  id: string; entryNo: string; date: string; description: string | null
  status: string; createdAt: string
  lines: JournalLine[]
  totalDebit: number; totalCredit: number
}

// ============ Type Config ============
const typeConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  ASSET: { label: { ar: 'أصول', en: 'Asset' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  LIABILITY: { label: { ar: 'التزامات', en: 'Liability' }, color: 'text-orange-700', bg: 'bg-orange-100' },
  EQUITY: { label: { ar: 'حقوق ملكية', en: 'Equity' }, color: 'text-purple-700', bg: 'bg-purple-100' },
  REVENUE: { label: { ar: 'إيرادات', en: 'Revenue' }, color: 'text-teal-700', bg: 'bg-teal-100' },
  EXPENSE: { label: { ar: 'مصروفات', en: 'Expense' }, color: 'text-rose-700', bg: 'bg-rose-100' },
}

function TypeBadge({ type, lang }: { type: string; lang: 'ar' | 'en' }) {
  const cfg = typeConfig[type] || typeConfig.ASSET
  return <Badge className={`${cfg.bg} ${cfg.color} border-0`}>{cfg.label[lang]}</Badge>
}

const jeStatusConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  DRAFT: { label: { ar: 'مسودة', en: 'Draft' }, color: 'text-gray-700', bg: 'bg-gray-100' },
  POSTED: { label: { ar: 'مرحّل', en: 'Posted' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  CANCELLED: { label: { ar: 'ملغي', en: 'Cancelled' }, color: 'text-rose-700', bg: 'bg-rose-100' },
}

function JEStatusBadge({ status, lang }: { status: string; lang: 'ar' | 'en' }) {
  const cfg = jeStatusConfig[status] || jeStatusConfig.DRAFT
  return <Badge className={`${cfg.bg} ${cfg.color} border-0`}>{cfg.label[lang]}</Badge>
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3">
          <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

// ============ New Account Dialog ============
function NewAccountDialog({ open, onOpenChange, accounts }: {
  open: boolean; onOpenChange: (v: boolean) => void; accounts: Account[]
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [type, setType] = useState('')
  const [parentId, setParentId] = useState('')

  React.useEffect(() => {
    if (open) { setCode(''); setName(''); setNameAr(''); setType(''); setParentId('') }
  }, [open])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['accounts'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({ code, name, nameAr, type, parentId: parentId || null })
  }

  const parentAccounts = accounts.filter(a => a.children.length > 0 || !a.parentId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{lang === 'ar' ? 'حساب جديد' : 'New Account'}</DialogTitle>
          <DialogDescription>{lang === 'ar' ? 'إضافة حساب جديد لشجرة الحسابات' : 'Add new account to chart of accounts'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'كود الحساب *' : 'Account Code *'}</Label>
              <Input value={code} onChange={e => setCode(e.target.value)} placeholder={lang === 'ar' ? 'مثل: 1001' : 'e.g. 1001'} dir="ltr" required />
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'نوع الحساب *' : 'Account Type *'}</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue placeholder={lang === 'ar' ? 'اختر النوع' : 'Select type'} /></SelectTrigger>
                <SelectContent>
                  {Object.entries(typeConfig).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label[lang]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'اسم الحساب *' : 'Account Name *'}</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder={lang === 'ar' ? 'اسم الحساب' : 'Account name'} required />
          </div>
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'الاسم بالعربي' : 'Arabic Name'}</Label>
            <Input value={nameAr} onChange={e => setNameAr(e.target.value)} placeholder={lang === 'ar' ? 'الاسم بالعربية' : 'Arabic name'}></Input>
          </div>
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'حساب أب' : 'Parent Account'}</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger><SelectValue placeholder={lang === 'ar' ? 'حساب رئيسي' : 'Root account'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{lang === 'ar' ? 'حساب رئيسي (بدون أب)' : 'Root (no parent)'}</SelectItem>
                {parentAccounts.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
            <Button type="submit" disabled={createMutation.isPending || !code || !name || !type} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? (lang === 'ar' ? 'جاري الإنشاء...' : 'Creating...') : (lang === 'ar' ? 'إضافة' : 'Add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ New Journal Entry Dialog ============
function NewJournalEntryDialog({ open, onOpenChange, accounts }: {
  open: boolean; onOpenChange: (v: boolean) => void; accounts: Account[]
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('DRAFT')
  const [lines, setLines] = useState([{ accountId: '', debit: '', credit: '', description: '' }])

  React.useEffect(() => {
    if (open) {
      setDate(''); setDescription(''); setStatus('DRAFT')
      setLines([{ accountId: '', debit: '', credit: '', description: '' }])
    }
  }, [open])

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0

  const addLine = () => setLines([...lines, { accountId: '', debit: '', credit: '', description: '' }])
  const removeLine = (index: number) => {
    if (lines.length > 1) setLines(lines.filter((_, i) => i !== index))
  }
  const updateLine = (index: number, field: string, value: string) => {
    const newLines = [...lines]
    newLines[index] = { ...newLines[index], [field]: value }
    setLines(newLines)
  }

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/journal-entries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Failed') }); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['journal-entries'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isBalanced) return
    createMutation.mutate({
      date, description: description || null, status,
      lines: lines.map(l => ({
        accountId: l.accountId,
        debit: parseFloat(l.debit) || 0,
        credit: parseFloat(l.credit) || 0,
        description: l.description || null,
      })),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lang === 'ar' ? 'قيد محاسبي جديد' : 'New Journal Entry'}</DialogTitle>
          <DialogDescription>{lang === 'ar' ? 'إضافة قيد محاسبي جديد' : 'Add new journal entry'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'التاريخ *' : 'Date *'}</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'الحالة' : 'Status'}</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">{lang === 'ar' ? 'مسودة' : 'Draft'}</SelectItem>
                  <SelectItem value="POSTED">{lang === 'ar' ? 'مرحّل' : 'Posted'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'الوصف' : 'Description'}</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={lang === 'ar' ? 'وصف القيد' : 'Entry description'} />
            </div>
          </div>

          {/* Lines */}
          <div className="border rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-semibold">{lang === 'ar' ? 'بنود القيد' : 'Entry Lines'}</Label>
              <Button type="button" size="sm" variant="outline" onClick={addLine} className="gap-1">
                <Plus className="size-3.5" /> {lang === 'ar' ? 'إضافة بند' : 'Add Line'}
              </Button>
            </div>
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    {idx === 0 && <Label className="text-xs">{lang === 'ar' ? 'الحساب' : 'Account'}</Label>}
                    <Select value={line.accountId} onValueChange={v => updateLine(idx, 'accountId', v)}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue placeholder={lang === 'ar' ? 'الحساب' : 'Account'} /></SelectTrigger>
                      <SelectContent>
                        {accounts.map(a => (
                          <SelectItem key={a.id} value={a.id} className="text-xs">{a.code} - {a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <Label className="text-xs">{lang === 'ar' ? 'مدين' : 'Debit'}</Label>}
                    <Input type="number" min="0" step="0.01" value={line.debit} onChange={e => updateLine(idx, 'debit', e.target.value)} dir="ltr" className="h-9 text-xs" />
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <Label className="text-xs">{lang === 'ar' ? 'دائن' : 'Credit'}</Label>}
                    <Input type="number" min="0" step="0.01" value={line.credit} onChange={e => updateLine(idx, 'credit', e.target.value)} dir="ltr" className="h-9 text-xs" />
                  </div>
                  <div className="col-span-3">
                    {idx === 0 && <Label className="text-xs">{lang === 'ar' ? 'الوصف' : 'Description'}</Label>}
                    <Input value={line.description} onChange={e => updateLine(idx, 'description', e.target.value)} className="h-9 text-xs" />
                  </div>
                  <div className="col-span-1">
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-rose-500" onClick={() => removeLine(idx)} disabled={lines.length <= 1}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex gap-4 text-sm">
                <span>{lang === 'ar' ? 'مدين' : 'Debit'}: <strong className="text-emerald-700">{formatSAR(totalDebit, lang)}</strong></span>
                <span>{lang === 'ar' ? 'دائن' : 'Credit'}: <strong className="text-rose-700">{formatSAR(totalCredit, lang)}</strong></span>
              </div>
              {isBalanced ? (
                <Badge className="bg-emerald-100 text-emerald-700 border-0">{lang === 'ar' ? 'متوازن ✓' : 'Balanced ✓'}</Badge>
              ) : (
                <Badge className="bg-rose-100 text-rose-700 border-0">{lang === 'ar' ? 'غير متوازن' : 'Unbalanced'}</Badge>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
            <Button type="submit" disabled={createMutation.isPending || !isBalanced || !date} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? (lang === 'ar' ? 'جاري الإنشاء...' : 'Creating...') : (lang === 'ar' ? 'إضافة القيد' : 'Add Entry')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Journal Entry Detail ============
function JournalEntryDetail({ entry, onBack }: { entry: JournalEntry; onBack: () => void }) {
  const { lang } = useAppStore()
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}><ChevronLeft className="size-4" /></Button>
        <div>
          <h2 className="text-xl font-bold">{entry.entryNo}</h2>
          <p className="text-sm text-muted-foreground">{entry.description || ''}</p>
        </div>
        <div className="mr-auto"><JEStatusBadge status={entry.status} lang={lang} /></div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-gray-50"><CardContent className="p-3 text-center">
          <p className="text-xs text-gray-600">{lang === 'ar' ? 'التاريخ' : 'Date'}</p>
          <p className="font-semibold">{formatDate(entry.date, lang)}</p>
        </CardContent></Card>
        <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-3 text-center">
          <p className="text-xs text-emerald-600">{lang === 'ar' ? 'مدين' : 'Debit'}</p>
          <p className="font-bold text-emerald-700">{formatSAR(entry.totalDebit, lang)}</p>
        </CardContent></Card>
        <Card className="bg-rose-50 border-rose-200"><CardContent className="p-3 text-center">
          <p className="text-xs text-rose-600">{lang === 'ar' ? 'دائن' : 'Credit'}</p>
          <p className="font-bold text-rose-700">{formatSAR(entry.totalCredit, lang)}</p>
        </CardContent></Card>
        <Card className="bg-gray-50"><CardContent className="p-3 text-center">
          <p className="text-xs text-gray-600">{lang === 'ar' ? 'عدد البنود' : 'Lines'}</p>
          <p className="font-semibold">{formatNumber(entry.lines.length)}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">{lang === 'ar' ? 'الحساب' : 'Account'}</TableHead>
                  <TableHead className="text-right">{lang === 'ar' ? 'مدين' : 'Debit'}</TableHead>
                  <TableHead className="text-right">{lang === 'ar' ? 'دائن' : 'Credit'}</TableHead>
                  <TableHead className="text-right">{lang === 'ar' ? 'الوصف' : 'Description'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entry.lines.map(line => (
                  <TableRow key={line.id}>
                    <TableCell className="font-medium">{line.account.code} - {line.account.name}</TableCell>
                    <TableCell className="text-emerald-700">{line.debit > 0 ? formatSAR(line.debit, lang) : ''}</TableCell>
                    <TableCell className="text-rose-700">{line.credit > 0 ? formatSAR(line.credit, lang) : ''}</TableCell>
                    <TableCell className="text-muted-foreground">{line.description || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============ Main Accounting Module ============
export function AccountingModule() {
  const { lang } = useAppStore()
  const [activeTab, setActiveTab] = useState('chart-of-accounts')
  const [accountDialogOpen, setAccountDialogOpen] = useState(false)
  const [jeDialogOpen, setJeDialogOpen] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)

  const { data: accounts = [], isLoading: loadingAccounts, refetch: refetchAccounts } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await fetch('/api/accounts')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const { data: entries = [], isLoading: loadingEntries, refetch: refetchEntries } = useQuery<JournalEntry[]>({
    queryKey: ['journal-entries'],
    queryFn: async () => {
      const res = await fetch('/api/journal-entries')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  if (selectedEntry) {
    return <JournalEntryDetail entry={selectedEntry} onBack={() => setSelectedEntry(null)} />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{lang === 'ar' ? 'المحاسبة' : 'Accounting'}</h1>
          <p className="text-sm text-muted-foreground">{lang === 'ar' ? 'شجرة الحسابات والقيود المحاسبية' : 'Chart of Accounts & Journal Entries'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => { refetchAccounts(); refetchEntries() }}>
            <RefreshCw className="size-4" />
          </Button>
          {activeTab === 'chart-of-accounts' ? (
            <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setAccountDialogOpen(true)}>
              <Plus className="size-4" /> {lang === 'ar' ? 'حساب جديد' : 'New Account'}
            </Button>
          ) : (
            <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setJeDialogOpen(true)}>
              <Plus className="size-4" /> {lang === 'ar' ? 'قيد جديد' : 'New Entry'}
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-2 w-full max-w-md">
          <TabsTrigger value="chart-of-accounts" className="gap-1">
            <BookOpen className="size-3.5" /> {lang === 'ar' ? 'شجرة الحسابات' : 'Chart of Accounts'}
          </TabsTrigger>
          <TabsTrigger value="journal-entries" className="gap-1">
            <FileText className="size-3.5" /> {lang === 'ar' ? 'القيود المحاسبية' : 'Journal Entries'}
          </TabsTrigger>
        </TabsList>

        {/* Chart of Accounts */}
        <TabsContent value="chart-of-accounts" className="space-y-3">
          {loadingAccounts ? <TableSkeleton /> : accounts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <BookOpen className="size-12 text-gray-300" />
              <p className="text-muted-foreground">{lang === 'ar' ? 'لا توجد حسابات' : 'No accounts found'}</p>
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">{lang === 'ar' ? 'الكود' : 'Code'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الاسم' : 'Name'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'النوع' : 'Type'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'حساب أب' : 'Parent'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'عدد القيود' : 'Entries'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {accounts.map(a => (
                        <TableRow key={a.id} className={a.parentId ? '' : 'bg-gray-50/50 font-semibold'}>
                          <TableCell className="font-mono text-sm">{a.code}</TableCell>
                          <TableCell>{a.name} {a.nameAr && <span className="text-muted-foreground text-xs">({a.nameAr})</span>}</TableCell>
                          <TableCell><TypeBadge type={a.type} lang={lang} /></TableCell>
                          <TableCell className="text-muted-foreground">{a.parent ? `${a.parent.code} - ${a.parent.name}` : '—'}</TableCell>
                          <TableCell>{formatNumber(a._count.journalLines)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Journal Entries */}
        <TabsContent value="journal-entries" className="space-y-3">
          {loadingEntries ? <TableSkeleton /> : entries.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <FileText className="size-12 text-gray-300" />
              <p className="text-muted-foreground">{lang === 'ar' ? 'لا توجد قيود' : 'No entries found'}</p>
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">{lang === 'ar' ? 'رقم القيد' : 'Entry No.'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'التاريخ' : 'Date'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الوصف' : 'Description'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'مدين' : 'Debit'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'دائن' : 'Credit'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'عرض' : 'View'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map(e => (
                        <TableRow key={e.id}>
                          <TableCell className="font-mono text-sm">{e.entryNo}</TableCell>
                          <TableCell>{formatDate(e.date, lang)}</TableCell>
                          <TableCell>{e.description || '—'}</TableCell>
                          <TableCell><JEStatusBadge status={e.status} lang={lang} /></TableCell>
                          <TableCell className="text-emerald-700">{formatSAR(e.totalDebit, lang)}</TableCell>
                          <TableCell className="text-rose-700">{formatSAR(e.totalCredit, lang)}</TableCell>
                          <TableCell>
                            <Button size="sm" variant="ghost" onClick={() => setSelectedEntry(e)}>
                              <Eye className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <NewAccountDialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen} accounts={accounts} />
      <NewJournalEntryDialog open={jeDialogOpen} onOpenChange={setJeDialogOpen} accounts={accounts} />
    </div>
  )
}
