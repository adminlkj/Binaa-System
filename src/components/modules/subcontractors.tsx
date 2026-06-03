'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  HardHat, Plus, Search, Pencil, Trash2, RefreshCw, ToggleLeft, ToggleRight,
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
import { Textarea } from '@/components/ui/textarea'
import { useAppStore, commonText } from '@/stores/app-store'

// ============ Types ============
interface SubcontractorItem {
  id: string; code: string; name: string; nameAr: string | null
  specialty: string | null; contactPerson: string | null; email: string | null
  phone: string | null; address: string | null; taxNumber: string | null
  isActive: boolean; _count: { invoices: number }
}

interface SubcontractorFormData {
  name: string; nameAr: string; specialty: string; contactPerson: string
  email: string; phone: string; address: string; taxNumber: string; isActive: boolean
}

// ============ Constants ============
const specialtyOptions = [
  { value: 'سباكة', label: 'سباكة' },
  { value: 'كهرباء', label: 'كهرباء' },
  { value: 'جبس', label: 'جبس' },
  { value: 'دهان', label: 'دهان' },
  { value: 'أعمال خرسانة', label: 'أعمال خرسانة' },
  { value: 'تشطيبات', label: 'تشطيبات' },
  { value: 'أخرى', label: 'أخرى' },
]

const specialtyColors: Record<string, string> = {
  'سباكة': 'bg-blue-100 text-blue-700 border-blue-200',
  'كهرباء': 'bg-amber-100 text-amber-700 border-amber-200',
  'جبس': 'bg-purple-100 text-purple-700 border-purple-200',
  'دهان': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'أعمال خرسانة': 'bg-gray-100 text-gray-700 border-gray-200',
  'تشطيبات': 'bg-teal-100 text-teal-700 border-teal-200',
  'أخرى': 'bg-orange-100 text-orange-700 border-orange-200',
}

const defaultForm: SubcontractorFormData = {
  name: '', nameAr: '', specialty: '', contactPerson: '',
  email: '', phone: '', address: '', taxNumber: '', isActive: true,
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
        </div>
      ))}
    </div>
  )
}

// ============ Subcontractor Form Dialog ============
function SubcontractorFormDialog({
  open, onOpenChange, editingSub,
}: {
  open: boolean; onOpenChange: (open: boolean) => void
  editingSub: SubcontractorItem | null
}) {
  const queryClient = useQueryClient()
  const isEdit = !!editingSub

  const [form, setForm] = useState<SubcontractorFormData>(defaultForm)

  React.useEffect(() => {
    if (open) {
      if (editingSub) {
        setForm({
          name: editingSub.name,
          nameAr: editingSub.nameAr || '',
          specialty: editingSub.specialty || '',
          contactPerson: editingSub.contactPerson || '',
          email: editingSub.email || '',
          phone: editingSub.phone || '',
          address: editingSub.address || '',
          taxNumber: editingSub.taxNumber || '',
          isActive: editingSub.isActive,
        })
      } else {
        setForm(defaultForm)
      }
    }
  }, [open, editingSub])

  const createMutation = useMutation({
    mutationFn: (data: SubcontractorFormData) =>
      fetch('/api/subcontractors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['subcontractors'] }); onOpenChange(false) },
  })

  const updateMutation = useMutation({
    mutationFn: (data: SubcontractorFormData) =>
      fetch(`/api/subcontractors/${editingSub?.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['subcontractors'] }); onOpenChange(false) },
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
          <DialogTitle>{isEdit ? 'تعديل مقاول الباطن' : 'مقاول باطن جديد'}</DialogTitle>
          <DialogDescription>{isEdit ? 'تعديل بيانات مقاول الباطن' : 'إضافة مقاول باطن جديد للنظام'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">اسم المقاول *</Label>
              <Input id="name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم المقاول" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nameAr">الاسم بالعربي</Label>
              <Input id="nameAr" value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} placeholder="الاسم بالعربي" />
            </div>
            <div className="space-y-2">
              <Label>التخصص *</Label>
              <Select value={form.specialty} onValueChange={v => setForm(f => ({ ...f, specialty: v }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="اختر التخصص" /></SelectTrigger>
                <SelectContent>
                  {specialtyOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                </SelectContent>
              </Select>
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

// ============ Main Subcontractors Module ============
export function SubcontractorsModule() {
  const queryClient = useQueryClient()
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSub, setEditingSub] = useState<SubcontractorItem | null>(null)

  const { data: subcontractors = [], isLoading, isError, refetch } = useQuery<SubcontractorItem[]>({
    queryKey: ['subcontractors'],
    queryFn: async () => {
      const res = await fetch('/api/subcontractors')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/subcontractors/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subcontractors'] }),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      fetch(`/api/subcontractors/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive }) }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subcontractors'] }),
  })

  const filtered = subcontractors.filter(s => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q) ||
      (s.specialty?.toLowerCase().includes(q)) || (s.contactPerson?.toLowerCase().includes(q))
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{lang === 'ar' ? 'مقاولو الباطن' : 'Subcontractors'}</h1>
          <p className="text-sm text-muted-foreground">{lang === 'ar' ? 'إدارة مقاولي الباطن والتخصصات' : 'Manage subcontractors and specialties'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} title="تحديث">
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditingSub(null); setDialogOpen(true) }}>
            <Plus className="size-4" /> مقاول جديد
          </Button>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="بحث بالاسم أو الكود أو التخصص..."
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
              <HardHat className="size-12 text-gray-300" />
              <p className="text-muted-foreground">لا يوجد مقاولو باطن</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setEditingSub(null); setDialogOpen(true) }}>
                <Plus className="size-4 mr-1" /> إضافة مقاول
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الكود</TableHead>
                    <TableHead className="text-right">الاسم</TableHead>
                    <TableHead className="text-right">التخصص</TableHead>
                    <TableHead className="text-right">جهة الاتصال</TableHead>
                    <TableHead className="text-right">الهاتف</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium font-mono">{s.code}</TableCell>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={specialtyColors[s.specialty || 'أخرى'] || specialtyColors['أخرى']}>
                          {s.specialty || '—'}
                        </Badge>
                      </TableCell>
                      <TableCell>{s.contactPerson || '—'}</TableCell>
                      <TableCell dir="ltr" className="text-right">{s.phone || '—'}</TableCell>
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
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => { setEditingSub(s); setDialogOpen(true) }} title="تعديل">
                            <Pencil className="size-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-8 text-rose-600 hover:text-rose-700" onClick={() => { if (confirm('هل أنت متأكد من حذف مقاول الباطن؟')) deleteMutation.mutate(s.id) }} title="حذف">
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

      {/* Form Dialog */}
      <SubcontractorFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingSub={editingSub}
      />
    </div>
  )
}
