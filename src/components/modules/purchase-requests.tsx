'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileCheck, Plus, Search, Trash2, RefreshCw,
  Download, CheckCircle, XCircle, Eye, ArrowRight, ShoppingCart,
} from 'lucide-react'
import { toast } from 'sonner'
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
import { Separator } from '@/components/ui/separator'
import { ModuleLayout } from '@/components/shared/module-layout'
import { useAppStore, formatDate, formatNumber } from '@/stores/app-store'
import { MoneyDisplay } from '@/components/ui/money-display'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'
import { ProjectTypeBadge } from '@/components/shared/project-type-badge'
import { PrintButton } from '@/components/shared/print-button'

// ============ Types ============
interface Project { id: string; code: string; name: string; projectType?: string }

interface PurchaseRequestItem {
  id: string; description: string; quantity: number; unit: string | null; notes: string | null
}

interface PurchaseRequest {
  id: string; requestNo: string; source: string | null; status: string
  date: string; description: string | null; requestedBy: string | null; notes: string | null
  projectId: string | null; createdAt: string
  project: Project | null
  items: PurchaseRequestItem[]
  purchaseOrders?: { id: string; orderNo: string; status: string; totalAmount?: number }[]
}

interface PRFormData {
  projectId: string; source: string; date: string; description: string; requestedBy: string
  items: { description: string; quantity: string; unit: string; notes: string }[]
}

const defaultForm: PRFormData = {
  projectId: '', source: 'PROJECT', date: new Date().toISOString().split('T')[0],
  description: '', requestedBy: '',
  items: [{ description: '', quantity: '1', unit: '', notes: '' }],
}

function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

const statusConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  NEW: { label: { ar: 'جديد', en: 'New' }, color: 'text-yellow-700', bg: 'bg-yellow-100' },
  APPROVED: { label: { ar: 'معتمد', en: 'Approved' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  CONVERTED_TO_PO: { label: { ar: 'تم التحويل', en: 'Converted to PO' }, color: 'text-blue-700', bg: 'bg-blue-100' },
  CANCELLED: { label: { ar: 'ملغي', en: 'Cancelled' }, color: 'text-red-700', bg: 'bg-red-100' },
}

const sourceConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  PROJECT: { label: { ar: 'مشروع', en: 'Project' }, color: 'text-blue-700', bg: 'bg-blue-100' },
  INVENTORY: { label: { ar: 'مخزون', en: 'Inventory' }, color: 'text-teal-700', bg: 'bg-teal-100' },
  WORKSHOP: { label: { ar: 'ورشة', en: 'Workshop' }, color: 'text-amber-700', bg: 'bg-amber-100' },
  ADMIN: { label: { ar: 'إدارة', en: 'Admin' }, color: 'text-gray-700', bg: 'bg-gray-100' },
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (<div className="space-y-2">{Array.from({ length: rows }).map((_, i) => (
    <div key={i} className="flex gap-4 p-3"><div className="h-5 w-20 animate-pulse rounded bg-gray-200" /><div className="h-5 w-40 animate-pulse rounded bg-gray-200" /><div className="h-5 w-28 animate-pulse rounded bg-gray-200" /></div>
  ))}</div>)
}

// ============ View State ============
type ViewState =
  | { type: 'list' }
  | { type: 'create' }
  | { type: 'create-po'; prId: string }
  | { type: 'detail'; id: string }

// ============ Create View ============
function PRCreateView({ onBack }: { onBack: () => void }) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<PRFormData>(defaultForm)

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects-list'],
    queryFn: async () => { const res = await fetch('/api/projects/list'); if (!res.ok) return []; return res.json() },
  })

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { description: '', quantity: '1', unit: '', notes: '' }] }))
  const removeItem = (idx: number) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  const updateItem = (idx: number, field: string, value: string) => setForm(f => ({ ...f, items: f.items.map((item, i) => i === idx ? { ...item, [field]: value } : item) }))

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => fetch('/api/purchase-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['purchase-requests'] }); toast.success(t('تم إنشاء طلب الشراء بنجاح', 'Purchase request created successfully', lang)); onBack() },
    onError: () => toast.error(t('فشل في إنشاء طلب الشراء', 'Failed to create purchase request', lang)),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      projectId: form.projectId || null,
      source: form.source,
      date: form.date,
      description: form.description || null,
      requestedBy: form.requestedBy || null,
      items: form.items.map(i => ({ ...i, quantity: parseFloat(i.quantity) || 1 })),
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}><ArrowRight className="size-4" /></Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('طلب شراء جديد', 'New Purchase Request', lang)}</h1>
          <p className="text-sm text-muted-foreground">{t('إنشاء طلب شراء جديد مع البنود', 'Create a new purchase request with items', lang)}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-lg">{t('معلومات أساسية', 'Basic Information', lang)}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('المشروع', 'Project', lang)}</Label>
                <Select value={form.projectId} onValueChange={v => setForm(f => ({ ...f, projectId: v }))}>
                  <SelectTrigger><SelectValue placeholder={t('اختر المشروع', 'Select project', lang)} /></SelectTrigger>
                  <SelectContent>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('المصدر', 'Source', lang)}</Label>
                <Select value={form.source} onValueChange={v => setForm(f => ({ ...f, source: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PROJECT">{t('مشروع', 'Project', lang)}</SelectItem>
                    <SelectItem value="INVENTORY">{t('مخزون', 'Inventory', lang)}</SelectItem>
                    <SelectItem value="WORKSHOP">{t('ورشة', 'Workshop', lang)}</SelectItem>
                    <SelectItem value="ADMIN">{t('إدارة', 'Admin', lang)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('التاريخ *', 'Date *', lang)}</Label>
                <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>{t('مقدم الطلب', 'Requested By', lang)}</Label>
                <Input value={form.requestedBy} onChange={e => setForm(f => ({ ...f, requestedBy: e.target.value }))} placeholder={t('اسم مقدم الطلب', 'Requester name', lang)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('الوصف', 'Description', lang)}</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t('وصف طلب الشراء', 'PR description', lang)} rows={2} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">{t('بنود الطلب', 'Request Items', lang)}</CardTitle>
                <Badge className="bg-emerald-100 text-emerald-700 border-0">{form.items.length}</Badge>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1"><Plus className="size-3" />{t('إضافة بند', 'Add Item', lang)}</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {form.items.map((item, idx) => (
                <div key={idx} className="flex items-end gap-2 p-3 rounded-lg border bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs">{t('الوصف', 'Description', lang)}</Label>
                    <Input value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} placeholder={t('وصف البند', 'Item description', lang)} className="h-9" />
                  </div>
                  <div className="w-20">
                    <Label className="text-xs">{t('الكمية', 'Qty', lang)}</Label>
                    <Input type="number" min="1" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} className="h-9" dir="ltr" />
                  </div>
                  <div className="w-20">
                    <Label className="text-xs">{t('الوحدة', 'Unit', lang)}</Label>
                    <Input value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)} placeholder={t('وحدة', 'Unit', lang)} className="h-9" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Label className="text-xs">{t('ملاحظات', 'Notes', lang)}</Label>
                    <Input value={item.notes} onChange={e => updateItem(idx, 'notes', e.target.value)} placeholder={t('ملاحظات', 'Notes', lang)} className="h-9" />
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0 text-rose-500" onClick={() => removeItem(idx)} disabled={form.items.length <= 1}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onBack}>{t('إلغاء', 'Cancel', lang)}</Button>
          <Button type="submit" disabled={createMutation.isPending || !form.date} className="bg-emerald-600 hover:bg-emerald-700 min-w-[160px]">
            {createMutation.isPending ? t('جاري الإنشاء...', 'Creating...', lang) : t('إنشاء الطلب', 'Create Request', lang)}
          </Button>
        </div>
      </form>
    </div>
  )
}

// ============ Detail View ============
function PRDetailView({ id, onBack, onCreatePO }: { id: string; onBack: () => void; onCreatePO: (prId: string) => void }) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()

  const { data: pr, isLoading, isError } = useQuery<PurchaseRequest>({
    queryKey: ['purchase-requests', id],
    queryFn: async () => {
      const res = await fetch(`/api/purchase-requests/${id}`)
      if (!res.ok) throw new Error()
      return res.json()
    },
    enabled: !!id,
  })

  const approveMutation = useMutation({
    mutationFn: () => fetch(`/api/purchase-requests/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'APPROVED' }) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['purchase-requests', id] }); queryClient.invalidateQueries({ queryKey: ['purchase-requests'] }); toast.success(t('تم اعتماد طلب الشراء', 'Purchase request approved', lang)) },
    onError: () => toast.error(t('فشل في اعتماد الطلب', 'Failed to approve request', lang)),
  })

  const cancelMutation = useMutation({
    mutationFn: () => fetch(`/api/purchase-requests/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'CANCELLED' }) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['purchase-requests', id] }); queryClient.invalidateQueries({ queryKey: ['purchase-requests'] }); toast.success(t('تم إلغاء الطلب', 'Request cancelled', lang)) },
    onError: () => toast.error(t('فشل في إلغاء الطلب', 'Failed to cancel request', lang)),
  })

  if (isLoading) return <div className="p-6"><TableSkeleton /></div>
  if (isError || !pr) return (
    <div className="flex flex-col items-center gap-3 py-10">
      <p className="text-rose-600">{t('حدث خطأ أثناء تحميل البيانات', 'Error loading data', lang)}</p>
      <Button variant="outline" onClick={onBack}>{t('رجوع', 'Go Back', lang)}</Button>
    </div>
  )

  const cfg = statusConfig[pr.status] || statusConfig.NEW
  const srcCfg = sourceConfig[pr.source || 'PROJECT'] || sourceConfig.PROJECT

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}><ArrowRight className="size-4" /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">{t('طلب شراء', 'Purchase Request', lang)} {pr.requestNo}</h2>
            <Badge className={`${cfg.bg} ${cfg.color} border-0`}>{cfg.label[lang]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{pr.project?.name || '—'}</p>
        </div>
        {pr.status === 'NEW' && (
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
            <CheckCircle className="size-4" /> {t('اعتماد', 'Approve', lang)}
          </Button>
        )}
        {pr.status === 'APPROVED' && (
          <Button className="gap-2 bg-blue-600 hover:bg-blue-700" onClick={() => onCreatePO(pr.id)}>
            <ShoppingCart className="size-4" /> {t('إنشاء أمر شراء', 'Create PO', lang)}
          </Button>
        )}
        {(pr.status === 'NEW' || pr.status === 'APPROVED') && (
          <Button variant="outline" className="gap-2 text-rose-600 border-rose-300 hover:bg-rose-50" onClick={() => { if (confirm(t('هل أنت متأكد من الإلغاء؟', 'Are you sure you want to cancel?', lang))) cancelMutation.mutate() }} disabled={cancelMutation.isPending}>
            <XCircle className="size-4" /> {t('إلغاء الطلب', 'Cancel Request', lang)}
          </Button>
        )}
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">{t('المشروع', 'Project', lang)}</p>
          <p className="text-sm font-medium truncate">{pr.project?.name || '—'}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">{t('المصدر', 'Source', lang)}</p>
          <Badge className={`${srcCfg.bg} ${srcCfg.color} border-0 text-xs`}>{srcCfg.label[lang]}</Badge>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">{t('التاريخ', 'Date', lang)}</p>
          <p className="text-sm font-medium">{formatDate(pr.date, lang)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">{t('مقدم الطلب', 'Requested By', lang)}</p>
          <p className="text-sm font-medium">{pr.requestedBy || '—'}</p>
        </CardContent></Card>
      </div>

      {/* Workflow Status Indicator */}
      <Card className="bg-gray-50 border-dashed">
        <CardContent className="p-4">
          <div className="flex items-center justify-center gap-2 text-sm flex-wrap">
            <Badge className={pr.status === 'NEW' ? 'bg-yellow-100 text-yellow-700 border-0' : 'bg-emerald-100 text-emerald-700 border-0'}>1. {t('طلب شراء', 'PR', lang)}</Badge>
            <span className="text-gray-400">→</span>
            <Badge className={pr.status === 'APPROVED' || pr.status === 'CONVERTED_TO_PO' ? 'bg-emerald-100 text-emerald-700 border-0' : 'bg-gray-100 text-gray-400 border-0'}>2. {t('اعتماد', 'Approved', lang)}</Badge>
            <span className="text-gray-400">→</span>
            <Badge className={pr.status === 'CONVERTED_TO_PO' ? 'bg-blue-100 text-blue-700 border-0' : 'bg-gray-100 text-gray-400 border-0'}>3. {t('أمر شراء', 'PO', lang)}</Badge>
            <span className="text-gray-400">→</span>
            <Badge className="bg-gray-100 text-gray-400 border-0">4. {t('استلام', 'GR', lang)}</Badge>
            <span className="text-gray-400">→</span>
            <Badge className="bg-gray-100 text-gray-400 border-0">5. {t('فاتورة', 'Invoice', lang)}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Items Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{t('بنود الطلب', 'Request Items', lang)}</CardTitle>
            <Badge className="bg-emerald-100 text-emerald-700 border-0">{pr.items?.length || 0}</Badge>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">#</TableHead>
                <TableHead className="text-right">{t('الوصف', 'Description', lang)}</TableHead>
                <TableHead className="text-right">{t('الكمية', 'Qty', lang)}</TableHead>
                <TableHead className="text-right">{t('الوحدة', 'Unit', lang)}</TableHead>
                <TableHead className="text-right">{t('ملاحظات', 'Notes', lang)}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {pr.items?.map((item, idx) => (
                  <TableRow key={item.id}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell>{item.description}</TableCell>
                    <TableCell>{formatNumber(item.quantity)}</TableCell>
                    <TableCell>{item.unit || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{item.notes || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Linked POs */}
      {pr.purchaseOrders && pr.purchaseOrders.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">{t('أوامر الشراء المرتبطة', 'Linked Purchase Orders', lang)}</CardTitle>
              <Badge className="bg-blue-100 text-blue-700 border-0">{pr.purchaseOrders.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {pr.purchaseOrders.map(po => (
                <Badge key={po.id} className="bg-blue-100 text-blue-700 border-0 gap-1">
                  <ShoppingCart className="size-3" />
                  {po.orderNo}
                  {po.status && <span className="text-blue-500">({po.status})</span>}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {pr.description && (
        <Card>
          <CardHeader><CardTitle className="text-lg">{t('الوصف', 'Description', lang)}</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-gray-700 whitespace-pre-wrap">{pr.description}</p></CardContent>
        </Card>
      )}
    </div>
  )
}

// ============ Main Purchase Requests Module ============
export function PurchaseRequestsModule() {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [viewState, setViewState] = useState<ViewState>({ type: 'list' })

  const { data: requests = [], isLoading, isError, refetch } = useQuery<PurchaseRequest[]>({
    queryKey: ['purchase-requests'],
    queryFn: async () => { const res = await fetch('/api/purchase-requests'); if (!res.ok) throw new Error(); return res.json() },
  })

  const approveMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/purchase-requests/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'APPROVED' }) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['purchase-requests'] }); toast.success(t('تم الاعتماد', 'Approved', lang)) },
    onError: () => toast.error(t('فشل في الاعتماد', 'Failed to approve', lang)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/purchase-requests/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['purchase-requests'] }); toast.success(t('تم الحذف', 'Deleted', lang)) },
    onError: () => toast.error(t('فشل في الحذف', 'Failed to delete', lang)),
  })

  // Summary counts
  const newCount = requests.filter(r => r.status === 'NEW').length
  const approvedCount = requests.filter(r => r.status === 'APPROVED').length

  const filtered = requests.filter(r => {
    const matchSearch = !search || r.requestNo.toLowerCase().includes(search.toLowerCase()) || (r.project?.name.toLowerCase().includes(search.toLowerCase()))
    const matchStatus = statusFilter === 'all' || r.status === statusFilter
    return matchSearch && matchStatus
  })

  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'requestNo', label: t('رقم الطلب', 'Request No', lang) },
      { key: 'project', label: t('المشروع', 'Project', lang) },
      { key: 'source', label: t('المصدر', 'Source', lang) },
      { key: 'date', label: t('التاريخ', 'Date', lang) },
      { key: 'itemCount', label: t('عدد البنود', 'Items', lang) },
      { key: 'status', label: t('الحالة', 'Status', lang) },
    ]
    exportToCSV(filtered.map(r => ({
      requestNo: r.requestNo, project: r.project?.name || '', source: r.source || '',
      date: formatDate(r.date, lang), itemCount: r.items?.length || 0, status: r.status,
    })), `purchase-requests-${new Date().toISOString().slice(0, 10)}`, columns)
  }

  const handleCreatePO = (prId: string) => {
    setViewState({ type: 'create-po', prId })
  }

  if (viewState.type === 'create') return <PRCreateView onBack={() => setViewState({ type: 'list' })} />
  if (viewState.type === 'detail') return <PRDetailView id={viewState.id} onBack={() => setViewState({ type: 'list' })} onCreatePO={handleCreatePO} />

  // For the "Create PO from PR" case, we redirect to the purchase orders module
  // The purchase orders module handles this via URL query params or state
  if (viewState.type === 'create-po') {
    // We'll handle this by showing a message to go to PO creation
    // In practice, the parent component (page.tsx) can handle the module switch
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => setViewState({ type: 'list' })}><ArrowRight className="size-4" /></Button>
          <div>
            <h1 className="text-2xl font-bold">{t('إنشاء أمر شراء', 'Create Purchase Order', lang)}</h1>
            <p className="text-sm text-muted-foreground">{t('يمكنك إنشاء أمر شراء من طلب الشراء المعتمد من خلال وحدة أوامر الشراء', 'You can create a PO from the approved PR via the Purchase Orders module', lang)}</p>
          </div>
        </div>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-6 text-center">
            <ShoppingCart className="size-12 text-blue-400 mx-auto mb-3" />
            <p className="text-blue-700 font-medium mb-2">{t('انتقل إلى أوامر الشراء لإنشاء أمر شراء من الطلب المعتمد', 'Go to Purchase Orders to create a PO from the approved request', lang)}</p>
            <p className="text-sm text-blue-600 mb-4">{t('اختر الطلب المعتمد عند إنشاء أمر شراء جديد وسيتم تحميل البنود تلقائياً', 'Select the approved PR when creating a new PO and items will be loaded automatically', lang)}</p>
            <Button onClick={() => setViewState({ type: 'list' })} className="bg-blue-600 hover:bg-blue-700">{t('عودة للقائمة', 'Back to List', lang)}</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <ModuleLayout
      title={{ ar: 'طلبات الشراء', en: 'Purchase Requests' }}
      subtitle={{ ar: 'إدارة طلبات الشراء والاعتمادات', en: 'Manage purchase requests and approvals' }}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton type="generic-table" size="icon" />
          <Button variant="outline" size="icon" onClick={handleExport}><Download className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="size-4" /></Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setViewState({ type: 'create' })}><Plus className="size-4" />{t('طلب جديد', 'New Request', lang)}</Button>
        </div>
      }
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center"><FileCheck className="size-5 text-emerald-600" /></div>
            <div>
              <p className="text-sm text-emerald-600">{t('إجمالي الطلبات', 'Total Requests', lang)}</p>
              <p className="text-xl font-bold text-emerald-700">{formatNumber(requests.length)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-yellow-100 flex items-center justify-center"><FileCheck className="size-5 text-yellow-600" /></div>
            <div>
              <p className="text-sm text-yellow-600">{t('طلبات جديدة', 'New Requests', lang)}</p>
              <p className="text-xl font-bold text-yellow-700">{formatNumber(newCount)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-blue-100 flex items-center justify-center"><CheckCircle className="size-5 text-blue-600" /></div>
            <div>
              <p className="text-sm text-blue-600">{t('طلبات معتمدة', 'Approved', lang)}</p>
              <p className="text-xl font-bold text-blue-700">{formatNumber(approvedCount)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card><CardContent className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder={t('بحث بالرقم أو المشروع...', 'Search by number or project...', lang)} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" /></div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder={t('كل الحالات', 'All Statuses', lang)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('كل الحالات', 'All Statuses', lang)}</SelectItem>
              {Object.entries(statusConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label[lang]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        {isLoading ? (<div className="p-6"><TableSkeleton /></div>) : isError ? (
          <div className="flex flex-col items-center gap-3 py-10"><p className="text-rose-600">{t('حدث خطأ', 'Error', lang)}</p><Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10"><FileCheck className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('لا توجد طلبات شراء', 'No purchase requests', lang)}</p>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setViewState({ type: 'create' })}><Plus className="size-4 mr-1" />{t('طلب جديد', 'New Request', lang)}</Button></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">{t('رقم الطلب', 'Request No', lang)}</TableHead>
                <TableHead className="text-right">{t('المشروع', 'Project', lang)}</TableHead>
                <TableHead className="text-right">{t('المصدر', 'Source', lang)}</TableHead>
                <TableHead className="text-right">{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead className="text-right">{t('مقدم الطلب', 'Requested By', lang)}</TableHead>
                <TableHead className="text-right">{t('البنود', 'Items', lang)}</TableHead>
                <TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead className="text-right">{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map(r => {
                  const cfg = statusConfig[r.status] || statusConfig.NEW
                  const srcCfg = sourceConfig[r.source || 'PROJECT'] || sourceConfig.PROJECT
                  const hasPO = r.purchaseOrders && r.purchaseOrders.length > 0
                  return (
                    <TableRow key={r.id} className="cursor-pointer hover:bg-emerald-50/50" onClick={() => setViewState({ type: 'detail', id: r.id })}>
                      <TableCell className="font-mono font-medium">{r.requestNo}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {r.project?.name || '—'}
                          {r.project?.projectType && <ProjectTypeBadge projectType={r.project.projectType} lang={lang} />}
                        </div>
                      </TableCell>
                      <TableCell><Badge className={`${srcCfg.bg} ${srcCfg.color} border-0 text-xs`}>{srcCfg.label[lang]}</Badge></TableCell>
                      <TableCell>{formatDate(r.date, lang)}</TableCell>
                      <TableCell>{r.requestedBy || '—'}</TableCell>
                      <TableCell><Badge className="bg-gray-100 text-gray-700 border-0">{r.items?.length || 0}</Badge></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Badge className={`${cfg.bg} ${cfg.color} border-0`}>{cfg.label[lang]}</Badge>
                          {hasPO && <Badge className="bg-blue-100 text-blue-700 border-0 gap-1 text-xs"><ShoppingCart className="size-3" />{r.purchaseOrders!.length}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {r.status === 'NEW' && (
                            <Button variant="ghost" size="icon" className="size-8 text-emerald-600" onClick={e => { e.stopPropagation(); approveMutation.mutate(r.id) }} title={t('اعتماد', 'Approve', lang)}><CheckCircle className="size-4" /></Button>
                          )}
                          {r.status === 'APPROVED' && (
                            <Button variant="ghost" size="icon" className="size-8 text-blue-600" onClick={e => { e.stopPropagation(); handleCreatePO(r.id) }} title={t('إنشاء أمر شراء', 'Create PO', lang)}><ShoppingCart className="size-4" /></Button>
                          )}
                          <Button variant="ghost" size="icon" className="size-8" onClick={e => { e.stopPropagation(); setViewState({ type: 'detail', id: r.id }) }} title={t('عرض', 'View', lang)}><Eye className="size-4" /></Button>
                          {r.status === 'NEW' && (
                            <Button variant="ghost" size="icon" className="size-8 text-rose-600" onClick={e => { e.stopPropagation(); if (confirm(t('هل أنت متأكد من الحذف؟', 'Are you sure?', lang))) deleteMutation.mutate(r.id) }}><Trash2 className="size-4" /></Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent></Card>
    </ModuleLayout>
  )
}
