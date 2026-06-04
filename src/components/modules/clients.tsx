'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Plus, Search, Pencil, Trash2, RefreshCw, ToggleLeft, ToggleRight,
  Printer, Download,
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAppStore, formatNumber } from '@/stores/app-store'
import { MoneyDisplay } from '@/components/ui/money-display'
import { ModuleLayout } from '@/components/shared/module-layout'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'

// ============ Types ============
interface ClientItem {
  id: string; code: string; name: string; nameAr: string | null
  contactPerson: string | null; email: string | null; phone: string | null
  address: string | null; taxNumber: string | null; isActive: boolean
  _count: { projects: number; salesInvoices: number }
}

interface ClientFormData {
  name: string; nameAr: string; contactPerson: string; email: string
  phone: string; address: string; taxNumber: string; isActive: boolean
}

const defaultForm: ClientFormData = { name: '', nameAr: '', contactPerson: '', email: '', phone: '', address: '', taxNumber: '', isActive: true }

function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (<div className="space-y-2">{Array.from({ length: rows }).map((_, i) => (
    <div key={i} className="flex gap-4 p-3"><div className="h-5 w-20 animate-pulse rounded bg-gray-200" /><div className="h-5 w-40 animate-pulse rounded bg-gray-200" /><div className="h-5 w-28 animate-pulse rounded bg-gray-200" /></div>
  ))}</div>)
}

// ============ Client Form Dialog ============
function ClientFormDialog({ open, onOpenChange, editingClient }: { open: boolean; onOpenChange: (open: boolean) => void; editingClient: ClientItem | null }) {
  const queryClient = useQueryClient()
  const isEdit = !!editingClient
  const [form, setForm] = useState<ClientFormData>(defaultForm)
  const { lang } = useAppStore()

  React.useEffect(() => {
    if (open) {
      if (editingClient) {
        setForm({ name: editingClient.name, nameAr: editingClient.nameAr || '', contactPerson: editingClient.contactPerson || '', email: editingClient.email || '', phone: editingClient.phone || '', address: editingClient.address || '', taxNumber: editingClient.taxNumber || '', isActive: editingClient.isActive })
      } else { setForm(defaultForm) }
    }
  }, [open, editingClient])

  const createMutation = useMutation({
    mutationFn: (data: ClientFormData) => fetch('/api/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['clients'] }); onOpenChange(false) },
  })
  const updateMutation = useMutation({
    mutationFn: (data: ClientFormData) => fetch(`/api/clients/${editingClient?.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['clients'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (isEdit) updateMutation.mutate(form); else createMutation.mutate(form) }
  const isLoading = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t('تعديل العميل', 'Edit Client', lang) : t('عميل جديد', 'New Client', lang)}</DialogTitle>
          <DialogDescription>{isEdit ? t('تعديل بيانات العميل', 'Edit client data', lang) : t('إضافة عميل جديد', 'Add new client', lang)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>{t('اسم العميل *', 'Client Name *', lang)}</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
            <div className="space-y-2"><Label>{t('الاسم بالعربي', 'Arabic Name', lang)}</Label><Input value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} /></div>
            <div className="space-y-2"><Label>{t('جهة الاتصال', 'Contact Person', lang)}</Label><Input value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} /></div>
            <div className="space-y-2"><Label>{t('الهاتف', 'Phone', lang)}</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} dir="ltr" /></div>
            <div className="space-y-2"><Label>{t('البريد الإلكتروني', 'Email', lang)}</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} dir="ltr" /></div>
            <div className="space-y-2"><Label>{t('الرقم الضريبي', 'Tax Number', lang)}</Label><Input value={form.taxNumber} onChange={e => setForm(f => ({ ...f, taxNumber: e.target.value }))} dir="ltr" /></div>
            <div className="space-y-2 sm:col-span-2"><Label>{t('العنوان', 'Address', lang)}</Label><Textarea value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button type="submit" disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-700">{isLoading ? t('جاري الحفظ...', 'Saving...', lang) : isEdit ? t('تحديث', 'Update', lang) : t('إنشاء', 'Create', lang)}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main Clients Module ============
export function ClientsModule() {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<ClientItem | null>(null)

  const { data: clients = [], isLoading, isError, refetch } = useQuery<ClientItem[]>({
    queryKey: ['clients'],
    queryFn: async () => { const res = await fetch('/api/clients'); if (!res.ok) throw new Error(); return res.json() },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/clients/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  })
  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => fetch(`/api/clients/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive }) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  })

  const filtered = clients.filter(c => {
    if (!search) return true
    const s = search.toLowerCase()
    return c.name.toLowerCase().includes(s) || c.code.toLowerCase().includes(s) || (c.contactPerson?.toLowerCase().includes(s)) || (c.phone?.includes(s))
  })

  const handleExport = () => {
    const columns: CSVColumn[] = [{ key: 'code', label: t('الكود', 'Code', lang) }, { key: 'name', label: t('الاسم', 'Name', lang) }, { key: 'contactPerson', label: t('جهة الاتصال', 'Contact', lang) }, { key: 'phone', label: t('الهاتف', 'Phone', lang) }, { key: 'email', label: t('البريد', 'Email', lang) }, { key: 'taxNumber', label: t('الرقم الضريبي', 'Tax No', lang) }]
    exportToCSV(filtered.map(c => ({ code: c.code, name: c.name, contactPerson: c.contactPerson || '', phone: c.phone || '', email: c.email || '', taxNumber: c.taxNumber || '' })), `clients-${new Date().toISOString().slice(0, 10)}`, columns)
  }

  return (
    <ModuleLayout
      title={{ ar: 'العملاء', en: 'Clients' }}
      subtitle={{ ar: 'إدارة بيانات العملاء والمتعاملين', en: 'Manage client and partner data' }}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => window.print()}><Printer className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={handleExport}><Download className="size-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="size-4" /></Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditingClient(null); setDialogOpen(true) }}><Plus className="size-4" />{t('عميل جديد', 'New Client', lang)}</Button>
        </div>
      }
    >
      {/* Search */}
      <Card><CardContent className="p-4">
        <div className="relative"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder={t('بحث بالاسم أو الكود أو الهاتف...', 'Search by name, code or phone...', lang)} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" /></div>
      </CardContent></Card>

      {/* Table */}
      <Card><CardContent className="p-0">
        {isLoading ? (<div className="p-6"><TableSkeleton /></div>) : isError ? (
          <div className="flex flex-col items-center gap-3 py-10"><p className="text-rose-600">{t('حدث خطأ', 'Error', lang)}</p><Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10"><Users className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('لا يوجد عملاء', 'No clients', lang)}</p>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditingClient(null); setDialogOpen(true) }}><Plus className="size-4 mr-1" />{t('إضافة عميل', 'Add Client', lang)}</Button></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead>
                <TableHead className="text-right">{t('الاسم', 'Name', lang)}</TableHead>
                <TableHead className="text-right">{t('جهة الاتصال', 'Contact', lang)}</TableHead>
                <TableHead className="text-right">{t('الهاتف', 'Phone', lang)}</TableHead>
                <TableHead className="text-right">{t('البريد', 'Email', lang)}</TableHead>
                <TableHead className="text-right">{t('الرقم الضريبي', 'Tax No', lang)}</TableHead>
                <TableHead className="text-right">{t('الفواتير', 'Invoices', lang)}</TableHead>
                <TableHead className="text-right">{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead className="text-right">{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium font-mono">{c.code}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.contactPerson || '—'}</TableCell>
                    <TableCell dir="ltr" className="text-right">{c.phone || '—'}</TableCell>
                    <TableCell dir="ltr" className="text-right text-xs">{c.email || '—'}</TableCell>
                    <TableCell dir="ltr" className="text-right text-xs">{c.taxNumber || '—'}</TableCell>
                    <TableCell><Badge variant="outline" className="bg-gray-50">{formatNumber(c._count.salesInvoices)}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className={c.isActive ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'}>{c.isActive ? t('نشط', 'Active', lang) : t('غير نشط', 'Inactive', lang)}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => toggleMutation.mutate({ id: c.id, isActive: !c.isActive })}>{c.isActive ? <ToggleRight className="size-4 text-emerald-600" /> : <ToggleLeft className="size-4 text-gray-400" />}</Button>
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => { setEditingClient(c); setDialogOpen(true) }}><Pencil className="size-4" /></Button>
                        <Button variant="ghost" size="icon" className="size-8 text-rose-600 hover:text-rose-700" onClick={() => { if (confirm(t('هل أنت متأكد من حذف العميل؟', 'Are you sure you want to delete this client?', lang))) deleteMutation.mutate(c.id) }}><Trash2 className="size-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent></Card>

      <ClientFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editingClient={editingClient} />
    </ModuleLayout>
  )
}
