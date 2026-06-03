'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Truck, Plus, Search, Pencil, Trash2, RefreshCw, ToggleLeft, ToggleRight,
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
import { useAppStore, commonText } from '@/stores/app-store'
import { exportToCSV, type CSVColumn } from '@/lib/export-csv'

// ============ Types ============
interface SupplierItem {
  id: string; code: string; name: string; nameAr: string | null
  contactPerson: string | null; email: string | null; phone: string | null
  address: string | null; taxNumber: string | null; isActive: boolean
  _count: { purchaseOrders: number; purchaseInvoices: number }
}

interface SupplierFormData {
  name: string; nameAr: string; contactPerson: string; email: string
  phone: string; address: string; taxNumber: string; isActive: boolean
}

// ============ Helpers ============
const defaultForm: SupplierFormData = {
  name: '', nameAr: '', contactPerson: '', email: '',
  phone: '', address: '', taxNumber: '', isActive: true,
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3">
          <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-28 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-16 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

// ============ Supplier Form Dialog ============
function SupplierFormDialog({
  open, onOpenChange, editingSupplier,
}: {
  open: boolean; onOpenChange: (open: boolean) => void
  editingSupplier: SupplierItem | null
}) {
  const queryClient = useQueryClient()
  const isEdit = !!editingSupplier

  const [form, setForm] = useState<SupplierFormData>(defaultForm)

  React.useEffect(() => {
    if (open) {
      if (editingSupplier) {
        setForm({
          name: editingSupplier.name,
          nameAr: editingSupplier.nameAr || '',
          contactPerson: editingSupplier.contactPerson || '',
          email: editingSupplier.email || '',
          phone: editingSupplier.phone || '',
          address: editingSupplier.address || '',
          taxNumber: editingSupplier.taxNumber || '',
          isActive: editingSupplier.isActive,
        })
      } else {
        setForm(defaultForm)
      }
    }
  }, [open, editingSupplier])

  const createMutation = useMutation({
    mutationFn: (data: SupplierFormData) =>
      fetch('/api/suppliers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['suppliers'] }); onOpenChange(false) },
  })

  const updateMutation = useMutation({
    mutationFn: (data: SupplierFormData) =>
      fetch(`/api/suppliers/${editingSupplier?.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['suppliers'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isEdit) updateMutation.mutate(form)
    else createMutation.mutate(form)
  }

  const isLoading = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'تعديل المورد' : 'مورد جديد'}</DialogTitle>
          <DialogDescription>{isEdit ? 'تعديل بيانات المورد' : 'إضافة مورد جديد للنظام'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">اسم المورد *</Label>
              <Input id="name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم المورد" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nameAr">الاسم بالعربي</Label>
              <Input id="nameAr" value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} placeholder="الاسم بالعربي" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactPerson">جهة الاتصال</Label>
              <Input id="contactPerson" value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} placeholder="اسم جهة الاتصال" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">الهاتف</Label>
              <Input id="phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+966 5x xxx xxxx" dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input id="email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="taxNumber">الرقم الضريبي</Label>
              <Input id="taxNumber" value={form.taxNumber} onChange={e => setForm(f => ({ ...f, taxNumber: e.target.value }))} placeholder="300000000000003" dir="ltr" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">العنوان</Label>
              <Textarea id="address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="العنوان الكامل" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button type="submit" disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-700">
              {isLoading ? 'جاري الحفظ...' : isEdit ? 'تحديث' : 'إنشاء'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main Suppliers Module ============
export function SuppliersModule() {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<SupplierItem | null>(null)

  const { data: suppliers = [], isLoading, isError, refetch } = useQuery<SupplierItem[]>({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const res = await fetch('/api/suppliers')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/suppliers/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      fetch(`/api/suppliers/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive }) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  })

  const filtered = suppliers.filter(s => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) ||
      (s.contactPerson?.toLowerCase().includes(q)) || (s.phone?.includes(q))
  })

  // Export handler
  const handleExport = () => {
    const columns: CSVColumn[] = [
      { key: 'code', label: 'الكود' },
      { key: 'name', label: 'الاسم' },
      { key: 'contactPerson', label: 'جهة الاتصال' },
      { key: 'phone', label: 'الهاتف' },
      { key: 'taxNumber', label: 'الرقم الضريبي' },
      { key: 'status', label: 'الحالة', format: (v) => v ? 'نشط' : 'غير نشط' },
    ]
    const rows = filtered.map(s => ({
      code: s.code,
      name: s.name,
      contactPerson: s.contactPerson || '',
      phone: s.phone || '',
      taxNumber: s.taxNumber || '',
      status: s.isActive,
    }))
    exportToCSV(rows, `suppliers-${new Date().toISOString().slice(0, 10)}`, columns)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{lang === 'ar' ? 'الموردون' : 'Suppliers'}</h1>
          <p className="text-sm text-muted-foreground">{lang === 'ar' ? 'إدارة بيانات الموردين والبائعين' : 'Manage supplier and vendor data'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => window.print()} title="طباعة">
            <Printer className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleExport} title="تصدير CSV">
            <Download className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => refetch()} title="تحديث">
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditingSupplier(null); setDialogOpen(true) }}>
            <Plus className="size-4" /> مورد جديد
          </Button>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="بحث بالاسم أو الكود أو الهاتف..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pr-9"
            />
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
              <Truck className="size-12 text-gray-300" />
              <p className="text-muted-foreground">لا يوجد موردون</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditingSupplier(null); setDialogOpen(true) }}>
                <Plus className="size-4 mr-1" /> إضافة مورد
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الكود</TableHead>
                    <TableHead className="text-right">الاسم</TableHead>
                    <TableHead className="text-right">جهة الاتصال</TableHead>
                    <TableHead className="text-right">الهاتف</TableHead>
                    <TableHead className="text-right">الرقم الضريبي</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium font-mono">{s.code}</TableCell>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.contactPerson || '—'}</TableCell>
                      <TableCell dir="ltr" className="text-right">{s.phone || '—'}</TableCell>
                      <TableCell dir="ltr" className="text-right text-xs">{s.taxNumber || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={s.isActive ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'}>
                          {s.isActive ? 'نشط' : 'غير نشط'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => toggleMutation.mutate({ id: s.id, isActive: !s.isActive })} title={s.isActive ? 'إلغاء التفعيل' : 'تفعيل'}>
                            {s.isActive ? <ToggleRight className="size-4 text-emerald-600" /> : <ToggleLeft className="size-4 text-gray-400" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => { setEditingSupplier(s); setDialogOpen(true) }} title="تعديل">
                            <Pencil className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8 text-rose-600 hover:text-rose-700" onClick={() => { if (confirm('هل أنت متأكد من حذف المورد؟')) deleteMutation.mutate(s.id) }} title="حذف">
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Supplier Form Dialog */}
      <SupplierFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingSupplier={editingSupplier}
      />
    </div>
  )
}
