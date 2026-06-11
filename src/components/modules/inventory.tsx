'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Package, Plus, Search, RefreshCw, AlertTriangle, Tag, Wrench,
  Warehouse as WarehouseIcon, Building2,
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
import { useAppStore, formatDate, formatNumber } from '@/stores/app-store'
import { MoneyDisplay } from '@/components/ui/money-display'
import { ModuleLayout } from '@/components/shared/module-layout'
import { PrintButton } from '@/components/shared/print-button'

// ============ Types ============
interface Branch { id: string; code: string; name: string }
interface Warehouse { id: string; code: string; name: string; branchId: string; isActive: boolean; branch: Branch }

interface InventoryItem {
  id: string; code: string; name: string; nameAr: string | null
  itemType: string; unit: string
  purchasePrice: number; sellingPrice: number
  quantity: number; minQuantity: number; warehouseId: string
  category: string | null; isActive: boolean
  warehouse: Warehouse
}

// ============ Category & Type Config ============
const categoryOptions = [
  { value: 'مواد بناء', label: { ar: 'مواد بناء', en: 'Building Materials' } },
  { value: 'حديد', label: { ar: 'حديد', en: 'Steel' } },
  { value: 'إسمنت', label: { ar: 'إسمنت', en: 'Cement' } },
  { value: 'أخشاب', label: { ar: 'أخشاب', en: 'Wood' } },
  { value: 'دهانات', label: { ar: 'دهانات', en: 'Paints' } },
  { value: 'سباكة', label: { ar: 'سباكة', en: 'Plumbing' } },
  { value: 'كهرباء', label: { ar: 'كهرباء', en: 'Electrical' } },
  { value: 'أدوات', label: { ar: 'أدوات', en: 'Tools' } },
  { value: 'خدمات', label: { ar: 'خدمات', en: 'Services' } },
  { value: 'أخرى', label: { ar: 'أخرى', en: 'Other' } },
]

const itemTypeConfig: Record<string, { label: { ar: string; en: string }; color: string; bg: string }> = {
  PRODUCT: { label: { ar: 'منتج', en: 'Product' }, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  SERVICE: { label: { ar: 'خدمة', en: 'Service' }, color: 'text-amber-700', bg: 'bg-amber-100' },
}

function ItemTypeBadge({ itemType, lang }: { itemType: string; lang: 'ar' | 'en' }) {
  const cfg = itemTypeConfig[itemType] || itemTypeConfig.PRODUCT
  return <Badge className={`${cfg.bg} ${cfg.color} border-0`}>{cfg.label[lang]}</Badge>
}

function t(ar: string, en: string, lang: 'ar' | 'en') { return lang === 'ar' ? ar : en }

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 p-3">
          <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-16 animate-pulse rounded bg-gray-200" />
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
  const [itemType, setItemType] = useState('PRODUCT')
  const [unit, setUnit] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [quantity, setQuantity] = useState('')
  const [minQuantity, setMinQuantity] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [category, setCategory] = useState('')

  React.useEffect(() => {
    if (open) {
      setName(''); setNameAr(''); setItemType('PRODUCT'); setUnit('')
      setPurchasePrice(''); setSellingPrice(''); setQuantity('')
      setMinQuantity(''); setWarehouseId(''); setCategory('')
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
    createMutation.mutate({ name, nameAr, itemType, unit, purchasePrice, sellingPrice, quantity, minQuantity, warehouseId, category: category || null })
  }

  const isService = itemType === 'SERVICE'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('صنف مخزون جديد', 'New Inventory Item', lang)}</DialogTitle>
          <DialogDescription>{t('إضافة صنف جديد (منتج أو خدمة)', 'Add new item (product or service)', lang)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>{t('الاسم *', 'Name *', lang)}</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder={t('اسم الصنف', 'Item name', lang)} required /></div>
            <div className="space-y-2"><Label>{t('الاسم بالعربي', 'Arabic Name', lang)}</Label><Input value={nameAr} onChange={e => setNameAr(e.target.value)} placeholder={t('الاسم بالعربية', 'Arabic name', lang)} /></div>
            <div className="space-y-2">
              <Label>{t('النوع *', 'Type *', lang)}</Label>
              <Select value={itemType} onValueChange={setItemType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(itemTypeConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label[lang]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('الوحدة *', 'Unit *', lang)}</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger><SelectValue placeholder={t('اختر الوحدة', 'Select unit', lang)} /></SelectTrigger>
                <SelectContent>
                  {['قطعة', 'كجم', 'طن', 'متر', 'متر مربع', 'لتر', 'كرتون', 'باكت', 'خدمة', 'ساعة', 'يوم'].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('الفئة', 'Category', lang)}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder={t('اختر الفئة', 'Select category', lang)} /></SelectTrigger>
                <SelectContent>
                  {categoryOptions.map(c => <SelectItem key={c.value} value={c.value}>{c.label[lang]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('المستودع *', 'Warehouse *', lang)}</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger><SelectValue placeholder={t('اختر المستودع', 'Select warehouse', lang)} /></SelectTrigger>
                <SelectContent>
                  {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>{t('سعر الشراء', 'Purchase Price', lang)}</Label><Input type="number" min="0" step="0.01" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} dir="ltr" placeholder="0.00" /></div>
            <div className="space-y-2"><Label>{t('سعر البيع', 'Selling Price', lang)}</Label><Input type="number" min="0" step="0.01" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} dir="ltr" placeholder="0.00" /></div>
            {!isService && (<>
              <div className="space-y-2"><Label>{t('الكمية', 'Quantity', lang)}</Label><Input type="number" min="0" step="0.01" value={quantity} onChange={e => setQuantity(e.target.value)} dir="ltr" placeholder="0" /></div>
              <div className="space-y-2"><Label>{t('الحد الأدنى', 'Min Quantity', lang)}</Label><Input type="number" min="0" step="0.01" value={minQuantity} onChange={e => setMinQuantity(e.target.value)} dir="ltr" placeholder="0" /></div>
            </>)}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button type="submit" disabled={createMutation.isPending || !name || !unit || !warehouseId} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? t('جاري الإنشاء...', 'Creating...', lang) : t('إضافة', 'Add', lang)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ New Warehouse Dialog ============
function NewWarehouseDialog({ open, onOpenChange, branches }: {
  open: boolean; onOpenChange: (v: boolean) => void; branches: Branch[]
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [branchId, setBranchId] = useState('')

  React.useEffect(() => { if (open) { setName(''); setBranchId('') } }, [open])

  const createMutation = useMutation({
    mutationFn: (data: { name: string; branchId: string }) =>
      fetch('/api/warehouses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['warehouses'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({ name, branchId })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('مستودع جديد', 'New Warehouse', lang)}</DialogTitle>
          <DialogDescription>{t('إضافة مستودع جديد', 'Add a new warehouse', lang)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t('اسم المستودع *', 'Warehouse Name *', lang)}</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder={t('اسم المستودع', 'Warehouse name', lang)} required />
          </div>
          <div className="space-y-2">
            <Label>{t('الفرع *', 'Branch *', lang)}</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger><SelectValue placeholder={t('اختر الفرع', 'Select branch', lang)} /></SelectTrigger>
              <SelectContent>
                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button type="submit" disabled={createMutation.isPending || !name || !branchId} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? t('جاري الإنشاء...', 'Creating...', lang) : t('إضافة', 'Add', lang)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Items Tab ============
function ItemsTab({ items, warehouses, isLoading, isError, refetch }: {
  items: InventoryItem[]; warehouses: Warehouse[]
  isLoading: boolean; isError: boolean; refetch: () => void
}) {
  const { lang } = useAppStore()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)

  const filtered = items.filter(item => {
    const matchCategory = categoryFilter === 'all' || item.category === categoryFilter
    const matchType = typeFilter === 'all' || item.itemType === typeFilter
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase()) || item.code.toLowerCase().includes(search.toLowerCase())
    return matchCategory && matchType && matchSearch
  })

  const productItems = items.filter(i => i.itemType === 'PRODUCT')
  const lowStockItems = productItems.filter(i => i.quantity <= i.minQuantity)
  const stockValue = productItems.reduce((s, i) => s + (i.quantity * i.purchasePrice), 0)

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-emerald-50 border-emerald-200"><CardContent className="p-4 flex items-center gap-3">
          <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center"><Package className="size-5 text-emerald-600" /></div>
          <div><p className="text-sm text-emerald-600">{t('إجمالي الأصناف', 'Total Items', lang)}</p><p className="text-xl font-bold text-emerald-700">{formatNumber(items.length)}</p></div>
        </CardContent></Card>
        <Card className="bg-teal-50 border-teal-200"><CardContent className="p-4 flex items-center gap-3">
          <div className="size-10 rounded-full bg-teal-100 flex items-center justify-center"><Tag className="size-5 text-teal-600" /></div>
          <div><p className="text-sm text-teal-600">{t('قيمة المخزون', 'Stock Value', lang)}</p><MoneyDisplay value={stockValue} lang={lang} size="sm" bold className="text-teal-700" /></div>
        </CardContent></Card>
        <Card className="bg-amber-50 border-amber-200"><CardContent className="p-4 flex items-center gap-3">
          <div className="size-10 rounded-full bg-amber-100 flex items-center justify-center"><AlertTriangle className="size-5 text-amber-600" /></div>
          <div><p className="text-sm text-amber-600">{t('أصناف منخفضة', 'Low Stock', lang)}</p><p className="text-xl font-bold text-amber-700">{formatNumber(lowStockItems.length)}</p></div>
        </CardContent></Card>
        <Card className="bg-purple-50 border-purple-200"><CardContent className="p-4 flex items-center gap-3">
          <div className="size-10 rounded-full bg-purple-100 flex items-center justify-center"><Wrench className="size-5 text-purple-600" /></div>
          <div><p className="text-sm text-purple-600">{t('خدمات', 'Services', lang)}</p><p className="text-xl font-bold text-purple-700">{formatNumber(items.filter(i => i.itemType === 'SERVICE').length)}</p></div>
        </CardContent></Card>
      </div>

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <Card className="bg-amber-50 border-amber-300">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2"><AlertTriangle className="size-5 text-amber-600" /><span className="font-semibold text-amber-700">{t(`تنبيه: ${lowStockItems.length} أصناف تحت الحد الأدنى`, `Alert: ${lowStockItems.length} items below minimum`, lang)}</span></div>
            <div className="flex flex-wrap gap-2">
              {lowStockItems.map(i => <Badge key={i.id} variant="outline" className="bg-amber-100 text-amber-700">{i.name} ({formatNumber(i.quantity)} / {formatNumber(i.minQuantity)})</Badge>)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card><CardContent className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1"><Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input placeholder={t('بحث بالاسم أو الكود...', 'Search by name or code...', lang)} value={search} onChange={e => setSearch(e.target.value)} className="pr-9" /></div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder={t('كل الأنواع', 'All Types', lang)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('كل الأنواع', 'All Types', lang)}</SelectItem>
              {Object.entries(itemTypeConfig).map(([k, v]) => <SelectItem key={k} value={k}>{v.label[lang]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder={t('كل الفئات', 'All Categories', lang)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('كل الفئات', 'All Categories', lang)}</SelectItem>
              {categoryOptions.map(c => <SelectItem key={c.value} value={c.value}>{c.label[lang]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardContent></Card>

      {/* Table */}
      <Card><CardContent className="p-0">
        {isLoading ? (<div className="p-6"><TableSkeleton /></div>) : isError ? (
          <div className="flex flex-col items-center gap-3 py-10"><p className="text-rose-600">{t('حدث خطأ', 'An error occurred', lang)}</p><Button variant="outline" onClick={() => refetch()}>{t('إعادة المحاولة', 'Retry', lang)}</Button></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10"><Package className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('لا توجد أصناف', 'No items found', lang)}</p>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}><Plus className="size-4 mr-1" />{t('إضافة صنف', 'Add Item', lang)}</Button></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-right">{t('الكود', 'Code', lang)}</TableHead>
                <TableHead className="text-right">{t('الاسم', 'Name', lang)}</TableHead>
                <TableHead className="text-right">{t('النوع', 'Type', lang)}</TableHead>
                <TableHead className="text-right">{t('الوحدة', 'Unit', lang)}</TableHead>
                <TableHead className="text-right">{t('سعر الشراء', 'Purchase', lang)}</TableHead>
                <TableHead className="text-right">{t('سعر البيع', 'Selling', lang)}</TableHead>
                <TableHead className="text-right">{t('الكمية', 'Qty', lang)}</TableHead>
                <TableHead className="text-right">{t('الحد الأدنى', 'Min', lang)}</TableHead>
                <TableHead className="text-right">{t('المستودع', 'Warehouse', lang)}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map(item => {
                  const isLow = item.itemType === 'PRODUCT' && item.quantity <= item.minQuantity
                  return (
                    <TableRow key={item.id} className={isLow ? 'bg-amber-50' : ''}>
                      <TableCell className="font-mono text-sm">{item.code}</TableCell>
                      <TableCell className="font-medium">{item.name}{isLow && <AlertTriangle className="size-3.5 inline mr-1 text-amber-500" />}</TableCell>
                      <TableCell><ItemTypeBadge itemType={item.itemType} lang={lang} /></TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell><MoneyDisplay value={item.purchasePrice} lang={lang} size="sm" className="text-teal-700" /></TableCell>
                      <TableCell><MoneyDisplay value={item.sellingPrice} lang={lang} size="sm" className="text-purple-700" /></TableCell>
                      <TableCell className={isLow ? 'font-bold text-amber-700' : ''}>{formatNumber(item.quantity)}</TableCell>
                      <TableCell>{formatNumber(item.minQuantity)}</TableCell>
                      <TableCell className="text-muted-foreground">{item.warehouse.name}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent></Card>

      <NewInventoryDialog open={dialogOpen} onOpenChange={setDialogOpen} warehouses={warehouses} />
    </div>
  )
}

// ============ Warehouses Tab ============
function WarehousesTab({ warehouses, branches, isLoading }: {
  warehouses: Warehouse[]; branches: Branch[]; isLoading: boolean
}) {
  const { lang } = useAppStore()
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />{t('مستودع جديد', 'New Warehouse', lang)}
        </Button>
      </div>

      {isLoading ? (<TableSkeleton />) : warehouses.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10"><WarehouseIcon className="size-12 text-gray-300" /><p className="text-muted-foreground">{t('لا توجد مستودعات', 'No warehouses found', lang)}</p></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {warehouses.map(w => (
            <Card key={w.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center"><WarehouseIcon className="size-5 text-emerald-600" /></div>
                  <div className="flex-1">
                    <h3 className="font-semibold">{w.name}</h3>
                    <p className="text-sm text-muted-foreground">{w.code} • {w.branch.name}</p>
                  </div>
                  <Badge variant="outline" className={w.isActive ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'}>
                    {w.isActive ? t('نشط', 'Active', lang) : t('غير نشط', 'Inactive', lang)}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NewWarehouseDialog open={dialogOpen} onOpenChange={setDialogOpen} branches={branches} />
    </div>
  )
}

// ============ Main Inventory Module ============
export function InventoryModule() {
  const { lang } = useAppStore()
  const [activeTab, setActiveTab] = useState('items')

  const { data: items = [], isLoading: loadingItems, isError: itemsError, refetch: refetchItems } = useQuery<InventoryItem[]>({
    queryKey: ['inventory'],
    queryFn: async () => { const res = await fetch('/api/inventory'); if (!res.ok) throw new Error(); return res.json() },
  })

  const { data: warehouses = [], isLoading: loadingWarehouses } = useQuery<Warehouse[]>({
    queryKey: ['warehouses'],
    queryFn: async () => { const res = await fetch('/api/warehouses'); if (!res.ok) return []; return res.json() },
  })

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: async () => { const res = await fetch('/api/branches'); if (!res.ok) return []; return res.json() },
  })

  return (
    <ModuleLayout
      title={{ ar: 'المخزون', en: 'Inventory' }}
      subtitle={{ ar: 'إدارة المنتجات والخدمات والمستودعات', en: 'Manage products, services & warehouses' }}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton type="generic-table" size="icon" />
          <Button variant="outline" size="icon" onClick={() => refetchItems()} title={t('تحديث', 'Refresh', lang)}><RefreshCw className="size-4" /></Button>
          {activeTab === 'items' && (
            <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => {/* dialog handled in ItemsTab */}}>
              <Plus className="size-4" />{t('صنف جديد', 'New Item', lang)}
            </Button>
          )}
        </div>
      }
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-2 w-full max-w-md">
          <TabsTrigger value="items" className="gap-1"><Package className="size-3.5" />{t('الأصناف', 'Items', lang)}</TabsTrigger>
          <TabsTrigger value="warehouses" className="gap-1"><WarehouseIcon className="size-3.5" />{t('المخازن', 'Warehouses', lang)}</TabsTrigger>
        </TabsList>

        <TabsContent value="items">
          <ItemsTab items={items} warehouses={warehouses} isLoading={loadingItems} isError={itemsError} refetch={refetchItems} />
        </TabsContent>

        <TabsContent value="warehouses">
          <WarehousesTab warehouses={warehouses} branches={branches} isLoading={loadingWarehouses} />
        </TabsContent>
      </Tabs>
    </ModuleLayout>
  )
}
