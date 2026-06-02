'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Settings, Plus, RefreshCw, Building2, Warehouse, Target, Coins, Users,
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
import { useAppStore, formatNumber } from '@/stores/app-store'

// ============ Types ============
interface Branch { id: string; code: string; name: string; address: string | null; isActive: boolean }
interface Warehouse { id: string; code: string; name: string; branchId: string; isActive: boolean; branch: { id: string; code: string; name: string } }
interface CostCenter { id: string; code: string; name: string; parentId: string | null; parent: { id: string; code: string; name: string } | null; children: { id: string; code: string; name: string }[] }
interface Currency { id: string; code: string; name: string; symbol: string; rate: number; isActive: boolean }
interface Employee { id: string; code: string; name: string; position: string | null; branchId: string; phone: string | null; email: string | null; isActive: boolean; branch: { id: string; code: string; name: string } }

function TableSkeleton({ rows = 3 }: { rows?: number }) {
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

// ============ Branch Dialog ============
function BranchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')

  React.useEffect(() => { if (open) { setName(''); setAddress('') } }, [open])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/branches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['branches'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({ name, address: address || null })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{lang === 'ar' ? 'فرع جديد' : 'New Branch'}</DialogTitle>
          <DialogDescription>{lang === 'ar' ? 'إضافة فرع جديد' : 'Add new branch'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'اسم الفرع *' : 'Branch Name *'}</Label>
            <Input value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'العنوان' : 'Address'}</Label>
            <Input value={address} onChange={e => setAddress(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
            <Button type="submit" disabled={createMutation.isPending || !name} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? (lang === 'ar' ? 'جاري الإنشاء...' : 'Creating...') : (lang === 'ar' ? 'إضافة' : 'Add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Warehouse Dialog ============
function WarehouseDialog({ open, onOpenChange, branches }: { open: boolean; onOpenChange: (v: boolean) => void; branches: Branch[] }) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [branchId, setBranchId] = useState('')

  React.useEffect(() => { if (open) { setName(''); setBranchId('') } }, [open])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
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
          <DialogTitle>{lang === 'ar' ? 'مستودع جديد' : 'New Warehouse'}</DialogTitle>
          <DialogDescription>{lang === 'ar' ? 'إضافة مستودع جديد' : 'Add new warehouse'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'اسم المستودع *' : 'Warehouse Name *'}</Label>
            <Input value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'الفرع *' : 'Branch *'}</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger><SelectValue placeholder={lang === 'ar' ? 'اختر الفرع' : 'Select branch'} /></SelectTrigger>
              <SelectContent>
                {branches.filter(b => b.isActive).map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
            <Button type="submit" disabled={createMutation.isPending || !name || !branchId} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? (lang === 'ar' ? 'جاري الإنشاء...' : 'Creating...') : (lang === 'ar' ? 'إضافة' : 'Add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Cost Center Dialog ============
function CostCenterDialog({ open, onOpenChange, costCenters }: { open: boolean; onOpenChange: (v: boolean) => void; costCenters: CostCenter[] }) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')

  React.useEffect(() => { if (open) { setName(''); setParentId('') } }, [open])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch('/api/cost-centers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['cost-centers'] }); onOpenChange(false) },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({ name, parentId: parentId || null })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{lang === 'ar' ? 'مركز تكلفة جديد' : 'New Cost Center'}</DialogTitle>
          <DialogDescription>{lang === 'ar' ? 'إضافة مركز تكلفة جديد' : 'Add new cost center'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'الاسم *' : 'Name *'}</Label>
            <Input value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>{lang === 'ar' ? 'مركز أب' : 'Parent Center'}</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger><SelectValue placeholder={lang === 'ar' ? 'مركز رئيسي' : 'Root center'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{lang === 'ar' ? 'رئيسي (بدون أب)' : 'Root (no parent)'}</SelectItem>
                {costCenters.filter(cc => !cc.parentId).map(cc => (
                  <SelectItem key={cc.id} value={cc.id}>{cc.code} - {cc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
            <Button type="submit" disabled={createMutation.isPending || !name} className="bg-emerald-600 hover:bg-emerald-700">
              {createMutation.isPending ? (lang === 'ar' ? 'جاري الإنشاء...' : 'Creating...') : (lang === 'ar' ? 'إضافة' : 'Add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main Settings Module ============
export function SettingsModule() {
  const { lang } = useAppStore()
  const [activeTab, setActiveTab] = useState('branches')
  const [branchDialogOpen, setBranchDialogOpen] = useState(false)
  const [warehouseDialogOpen, setWarehouseDialogOpen] = useState(false)
  const [costCenterDialogOpen, setCostCenterDialogOpen] = useState(false)

  // Fetch data
  const { data: branches = [], isLoading: loadingBranches, refetch: refetchBranches } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: async () => { const r = await fetch('/api/branches'); if (!r.ok) return []; return r.json() },
  })

  const { data: warehouses = [], isLoading: loadingWarehouses, refetch: refetchWarehouses } = useQuery<Warehouse[]>({
    queryKey: ['warehouses'],
    queryFn: async () => { const r = await fetch('/api/warehouses'); if (!r.ok) return []; return r.json() },
  })

  const { data: costCenters = [], isLoading: loadingCC, refetch: refetchCC } = useQuery<CostCenter[]>({
    queryKey: ['cost-centers'],
    queryFn: async () => { const r = await fetch('/api/cost-centers'); if (!r.ok) return []; return r.json() },
  })

  const { data: currencies = [], isLoading: loadingCurrencies } = useQuery<Currency[]>({
    queryKey: ['currencies'],
    queryFn: async () => { const r = await fetch('/api/currencies'); if (!r.ok) return []; return r.json() },
  })

  const { data: employees = [], isLoading: loadingEmployees } = useQuery<Employee[]>({
    queryKey: ['employees-full'],
    queryFn: async () => { const r = await fetch('/api/employees'); if (!r.ok) return []; return r.json() },
  })

  const refetchAll = () => { refetchBranches(); refetchWarehouses(); refetchCC() }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{lang === 'ar' ? 'الإعدادات' : 'Settings'}</h1>
          <p className="text-sm text-muted-foreground">{lang === 'ar' ? 'إعدادات النظام والبيانات الأساسية' : 'System settings and master data'}</p>
        </div>
        <Button variant="outline" size="icon" onClick={refetchAll}><RefreshCw className="size-4" /></Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full max-w-xl">
          <TabsTrigger value="branches" className="gap-1 text-xs"><Building2 className="size-3" /> {lang === 'ar' ? 'الفروع' : 'Branches'}</TabsTrigger>
          <TabsTrigger value="warehouses" className="gap-1 text-xs"><Warehouse className="size-3" /> {lang === 'ar' ? 'المستودعات' : 'Warehouses'}</TabsTrigger>
          <TabsTrigger value="cost-centers" className="gap-1 text-xs"><Target className="size-3" /> {lang === 'ar' ? 'التكلفة' : 'Cost Ctrs'}</TabsTrigger>
          <TabsTrigger value="currencies" className="gap-1 text-xs"><Coins className="size-3" /> {lang === 'ar' ? 'العملات' : 'Currencies'}</TabsTrigger>
          <TabsTrigger value="employees" className="gap-1 text-xs"><Users className="size-3" /> {lang === 'ar' ? 'الموظفين' : 'Employees'}</TabsTrigger>
        </TabsList>

        {/* Branches Tab */}
        <TabsContent value="branches" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setBranchDialogOpen(true)}>
              <Plus className="size-3.5" /> {lang === 'ar' ? 'فرع جديد' : 'New Branch'}
            </Button>
          </div>
          {loadingBranches ? <TableSkeleton /> : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">{lang === 'ar' ? 'الكود' : 'Code'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الاسم' : 'Name'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'العنوان' : 'Address'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {branches.map(b => (
                        <TableRow key={b.id}>
                          <TableCell className="font-mono">{b.code}</TableCell>
                          <TableCell className="font-medium">{b.name}</TableCell>
                          <TableCell className="text-muted-foreground">{b.address || '—'}</TableCell>
                          <TableCell>
                            <Badge className={b.isActive ? 'bg-emerald-100 text-emerald-700 border-0' : 'bg-gray-100 text-gray-700 border-0'}>
                              {b.isActive ? (lang === 'ar' ? 'نشط' : 'Active') : (lang === 'ar' ? 'غير نشط' : 'Inactive')}
                            </Badge>
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

        {/* Warehouses Tab */}
        <TabsContent value="warehouses" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setWarehouseDialogOpen(true)}>
              <Plus className="size-3.5" /> {lang === 'ar' ? 'مستودع جديد' : 'New Warehouse'}
            </Button>
          </div>
          {loadingWarehouses ? <TableSkeleton /> : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">{lang === 'ar' ? 'الكود' : 'Code'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الاسم' : 'Name'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الفرع' : 'Branch'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {warehouses.map(w => (
                        <TableRow key={w.id}>
                          <TableCell className="font-mono">{w.code}</TableCell>
                          <TableCell className="font-medium">{w.name}</TableCell>
                          <TableCell className="text-muted-foreground">{w.branch.name}</TableCell>
                          <TableCell>
                            <Badge className={w.isActive ? 'bg-emerald-100 text-emerald-700 border-0' : 'bg-gray-100 text-gray-700 border-0'}>
                              {w.isActive ? (lang === 'ar' ? 'نشط' : 'Active') : (lang === 'ar' ? 'غير نشط' : 'Inactive')}
                            </Badge>
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

        {/* Cost Centers Tab */}
        <TabsContent value="cost-centers" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setCostCenterDialogOpen(true)}>
              <Plus className="size-3.5" /> {lang === 'ar' ? 'مركز تكلفة جديد' : 'New Cost Center'}
            </Button>
          </div>
          {loadingCC ? <TableSkeleton /> : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">{lang === 'ar' ? 'الكود' : 'Code'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الاسم' : 'Name'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'مركز أب' : 'Parent'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {costCenters.map(cc => (
                        <TableRow key={cc.id}>
                          <TableCell className="font-mono">{cc.code}</TableCell>
                          <TableCell className="font-medium">{cc.name}</TableCell>
                          <TableCell className="text-muted-foreground">{cc.parent ? `${cc.parent.code} - ${cc.parent.name}` : '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Currencies Tab */}
        <TabsContent value="currencies" className="space-y-3">
          {loadingCurrencies ? <TableSkeleton /> : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">{lang === 'ar' ? 'الكود' : 'Code'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الاسم' : 'Name'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الرمز' : 'Symbol'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'السعر' : 'Rate'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currencies.map(c => (
                        <TableRow key={c.id}>
                          <TableCell className="font-mono">{c.code}</TableCell>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell>{c.symbol}</TableCell>
                          <TableCell dir="ltr">{formatNumber(c.rate)}</TableCell>
                          <TableCell>
                            <Badge className={c.isActive ? 'bg-emerald-100 text-emerald-700 border-0' : 'bg-gray-100 text-gray-700 border-0'}>
                              {c.isActive ? (lang === 'ar' ? 'نشط' : 'Active') : (lang === 'ar' ? 'غير نشط' : 'Inactive')}
                            </Badge>
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

        {/* Employees Tab */}
        <TabsContent value="employees" className="space-y-3">
          {loadingEmployees ? <TableSkeleton /> : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">{lang === 'ar' ? 'الكود' : 'Code'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الاسم' : 'Name'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'المنصب' : 'Position'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الفرع' : 'Branch'}</TableHead>
                        <TableHead className="text-right">{lang === 'ar' ? 'الحالة' : 'Status'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employees.map(emp => (
                        <TableRow key={emp.id}>
                          <TableCell className="font-mono">{emp.code}</TableCell>
                          <TableCell className="font-medium">{emp.name}</TableCell>
                          <TableCell className="text-muted-foreground">{emp.position || '—'}</TableCell>
                          <TableCell className="text-muted-foreground">{emp.branch?.name || '—'}</TableCell>
                          <TableCell>
                            <Badge className={emp.isActive ? 'bg-emerald-100 text-emerald-700 border-0' : 'bg-gray-100 text-gray-700 border-0'}>
                              {emp.isActive ? (lang === 'ar' ? 'نشط' : 'Active') : (lang === 'ar' ? 'غير نشط' : 'Inactive')}
                            </Badge>
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

      {/* Dialogs */}
      <BranchDialog open={branchDialogOpen} onOpenChange={setBranchDialogOpen} />
      <WarehouseDialog open={warehouseDialogOpen} onOpenChange={setWarehouseDialogOpen} branches={branches} />
      <CostCenterDialog open={costCenterDialogOpen} onOpenChange={setCostCenterDialogOpen} costCenters={costCenters} />
    </div>
  )
}
