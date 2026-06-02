'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Package, Plus, Search, RefreshCw, AlertTriangle,
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
interface Warehouse { id: string; code: string; name: string; branch: { id: string; code: string; name: string } }

interface InventoryItem {
  id: string; code: string; name: string; nameAr: string | null; unit: string
  unitPrice: number; quantity: number; minQuantity: number; warehouseId: string
  category: string | null; isActive: boolean
  warehouse: Warehouse
}

// ============ Category Options ============
const categoryOptions = [
  { value: 'مواد بناء', label: { ar: 'مواد بناء', en: 'Building Materials' } },
  { value: 'حديد', label: { ar: 'حديد', en: 'Steel' } },
  { value: 'إسمنت', label: { ar: 'إسمنت', en: 'Cement' } },
  { value: 'أخشاب', label: { ar: 'أخشاب', en: 'Wood' } },
  { value: 'دهانات', label: { ar: 'دهانات', en: 'Paints' } },
  { value: 'سباكة', label: { ar: 'سباكة', en: 'Plumbing' } },
  { value: 'كهرباء', label: { ar: 'كهرباء', en: 'Electrical' } },
  { value: 'أدوات', label: { ar: 'أدوات', en: 'Tools' } },
  { value: 'أخرى', label: { ar: 'أخرى', en: 'Other' } },
]

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3">
          <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-16 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

// ============ New Inventory Item Dialog ============
function NewInventoryDialog({ open, onOpenChange, warehouses }: {
  open: boolean; onOpenChange: (v: boolean) => void; warehouses: Warehouse[]
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [unit, setUnit] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [quantity, setQuantity] = useState('')
  const [minQuantity, setMinQuantity] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [category, setCategory] = useState('')

  React.useEffect(() => {
    if (open) {
      setName(''); setNameAr(''); setUnit(''); setUnitPrice('')
      setQuantity(''); setMinQuantity(''); setWarehouseId(''); setCategory('')
    }
  }, [open])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['inventory'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({ name, nameAr, unit, unitPrice, quantity, minQuantity, warehouseId, category: category || null })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{lang === 'ar' ? 'صنف مخزون جديد' : 'New Inventory Item'}</DialogTitle>
          <DialogDescription>{lang === 'ar' ? 'إضافة صنف جديد للمخزون' : 'Add new inventory item'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'الاسم *' : 'Name *'}</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder={lang === 'ar' ? 'اسم الصنف' : 'Item name'} required />
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'الاسم بالعربي' : 'Arabic Name'}</Label>
              <Input value={nameAr} onChange={e => setNameAr(e.target.value)} placeholder={lang === 'ar' ? 'الاسم بالعربية' : 'Arabic name'} />
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'الوحدة *' : 'Unit *'}</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger><SelectValue placeholder={lang === 'ar' ? 'اختر الوحدة' : 'Select unit'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="قطعة">{lang === 'ar' ? 'قطعة' : 'Piece'}</SelectItem>
                  <SelectItem value="كجم">{lang === 'ar' ? 'كجم' : 'Kg'}</SelectItem>
                  <SelectItem value="طن">{lang === 'ar' ? 'طن' : 'Ton'}</SelectItem>
                  <SelectItem value="متر">{lang === 'ar' ? 'متر' : 'Meter'}</SelectItem>
                  <SelectItem value="متر مربع">{lang === 'ar' ? 'متر مربع' : 'Sq. Meter'}</SelectItem>
                  <SelectItem value="لتر">{lang === 'ar' ? 'لتر' : 'Liter'}</SelectItem>
                  <SelectItem value="كرتون">{lang === 'ar' ? 'كرتون' : 'Carton'}</SelectItem>
                  <SelectItem value="باكت">{lang === 'ar' ? 'باكت' : 'Packet'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'الفئة' : 'Category'}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder={lang === 'ar' ? 'اختر الفئة' : 'Select category'} /></SelectTrigger>
                <SelectContent>
                  {categoryOptions.map(c => <SelectItem key={c.value} value={c.value}>{c.label[lang]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'سعر الوحدة *' : 'Unit Price *'}</Label>
              <Input type="number" min="0" step="0.01" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} dir="ltr" required />
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'الكمية *' : 'Quantity *'}</Label>
              <Input type="number" min="0" step="0.01" value={quantity} onChange={e => setQuantity(e.target.value)} dir="ltr" required />
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'الحد الأدنى' : 'Min Quantity'}</Label>
              <Input type="number" min="0" step="0.01" value={minQuantity} onChange={e => setMinQuantity(e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>{lang === 'ar' ? 'المستودع *' : 'Warehouse *'}</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger><SelectValue placeholder={lang === 'ar' ? 'اختر المستودع' : 'Select warehouse'} /></SelectTrigger>
                <SelectContent>
                  {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
            <Button type="submit" disabled={createMutation.isPending || !name || !unit || !warehouseId} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? (lang === 'ar' ? 'جاري الإنشاء...' : 'Creating...') : (lang === 'ar' ? 'إضافة' : 'Add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main Inventory Module ============
export function InventoryModule() {
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: items = [], isLoading, isError, refetch } = useQuery<InventoryItem[]>({
    queryKey: ['inventory'],
    queryFn: async () => {
      const res = await fetch('/api/inventory')
      if (!res.ok) throw new Error()
      return res.json()
    },
  })

  const { data: warehouses = [] } = useQuery<Warehouse[]>({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const res = await fetch('/api/warehouses')
      if (!res.ok) return []
      return res.json()
    },
  })

  const filtered = items.filter(item => {
    const matchCategory = categoryFilter === 'all' || item.category === categoryFilter
    const matchSearch = !search ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.code.toLowerCase().includes(search.toLowerCase())
    return matchCategory && matchSearch
  })

  // Summary
  const totalItems = items.length
  const lowStockItems = items.filter(i => i.quantity <= i.minQuantity)
  const stockValue = items.reduce((s, i) => s + (i.quantity * i.unitPrice), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{lang === 'ar' ? 'المخزون' : 'Inventory'}</h1>
          <p className="text-sm text-muted-foreground">{lang === 'ar' ? 'إدارة أصناف المخزون' : 'Manage inventory items'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} title={lang === 'ar' ? 'تحديث' : 'Refresh'}>
            <RefreshCw className="size-4" />
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> {lang === 'ar' ? 'صنف جديد' : 'New Item'}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-emerald-50 border-emerald-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <Package className="size-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-emerald-600">{lang === 'ar' ? 'إجمالي الأصناف' : 'Total Items'}</p>
              <p className="text-xl font-bold text-emerald-700">{formatNumber(totalItems)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="size-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-amber-600">{lang === 'ar' ? 'أصناف منخفضة' : 'Low Stock'}</p>
              <p className="text-xl font-bold text-amber-700">{formatNumber(lowStockItems.length)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-teal-50 border-teal-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-full bg-teal-100 flex items-center justify-center">
              <Package className="size-5 text-teal-600" />
            </div>
            <div>
              <p className="text-sm text-teal-600">{lang === 'ar' ? 'قيمة المخزون' : 'Stock Value'}</p>
              <p className="text-xl font-bold text-teal-700">{formatSAR(stockValue, lang)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <Card className="bg-amber-50 border-amber-300">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="size-5 text-amber-600" />
              <span className="font-semibold text-amber-700">
                {lang === 'ar' ? `تنبيه: ${lowStockItems.length} أصناف تحت الحد الأدنى` : `Alert: ${lowStockItems.length} items below minimum`}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {lowStockItems.map(i => (
                <Badge key={i.id} variant="outline" className="bg-amber-100 text-amber-700">
                  {i.name} ({formatNumber(i.quantity)} / {formatNumber(i.minQuantity)})
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder={lang === 'ar' ? 'بحث بالاسم أو الكود...' : 'Search by name or code...'} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder={lang === 'ar' ? 'كل الفئات' : 'All Categories'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{lang === 'ar' ? 'كل الفئات' : 'All Categories'}</SelectItem>
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
            <div className="p-6"><TableSkeleton /></div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <p className="text-rose-600">{lang === 'ar' ? 'حدث خطأ' : 'An error occurred'}</p>
              <Button variant="outline" onClick={() => refetch()}>{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <Package className="size-12 text-gray-300" />
              <p className="text-muted-foreground">{lang === 'ar' ? 'لا توجد أصناف' : 'No items found'}</p>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
                <Plus className="size-4 mr-1" /> {lang === 'ar' ? 'إضافة صنف' : 'Add Item'}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">{lang === 'ar' ? 'الكود' : 'Code'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الاسم' : 'Name'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الوحدة' : 'Unit'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الكمية' : 'Qty'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الحد الأدنى' : 'Min Qty'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'السعر' : 'Price'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'المستودع' : 'Warehouse'}</TableHead>
                    <TableHead className="text-right">{lang === 'ar' ? 'الفئة' : 'Category'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(item => {
                    const isLow = item.quantity <= item.minQuantity
                    return (
                      <TableRow key={item.id} className={isLow ? 'bg-amber-50' : ''}>
                        <TableCell className="font-mono text-sm">{item.code}</TableCell>
                        <TableCell className="font-medium">
                          {item.name}
                          {isLow && <AlertTriangle className="size-3.5 inline mr-1 text-amber-500" />}
                        </TableCell>
                        <TableCell>{item.unit}</TableCell>
                        <TableCell className={isLow ? 'font-bold text-amber-700' : ''}>{formatNumber(item.quantity)}</TableCell>
                        <TableCell>{formatNumber(item.minQuantity)}</TableCell>
                        <TableCell>{formatSAR(item.unitPrice, lang)}</TableCell>
                        <TableCell className="text-muted-foreground">{item.warehouse.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-gray-50">{item.category || '—'}</Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <NewInventoryDialog open={dialogOpen} onOpenChange={setDialogOpen} warehouses={warehouses} />
    </div>
  )
}
