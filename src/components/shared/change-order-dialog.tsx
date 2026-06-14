'use client'

import React, { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { MoneyDisplay } from '@/components/ui/money-display'
import { useAppStore, formatDate, commonText, type Lang } from '@/stores/app-store'
import { useToast } from '@/hooks/use-toast'

// ============ Types ============
interface ChangeOrderItem {
  id: string
  contractId: string
  projectId: string
  orderNo: string
  date: string
  description: string
  changeType: string
  originalValue: number
  changeValue: number
  newValue: number
  vatRate: number
  vatAmount: number
  totalChangeValue: number
  status: string
  approvedDate: string | null
  approvedBy: string | null
  notes: string | null
  createdAt: string
  contract: { id: string; contractNo: string }
  project: { id: string; name: string; code: string }
}

interface ChangeOrderDialogProps {
  contractId: string
  projectId: string
  changeOrders: ChangeOrderItem[]
}

const changeTypeLabels: Record<string, { ar: string; en: string }> = {
  ADDITION: { ar: 'إضافة', en: 'Addition' },
  MODIFICATION: { ar: 'تعديل', en: 'Modification' },
  DELETION: { ar: 'حذف', en: 'Deletion' },
}

const coStatusConfig: Record<string, { ar: string; en: string; cls: string }> = {
  DRAFT: { ar: 'مسودة', en: 'Draft', cls: 'bg-yellow-100 text-yellow-800' },
  UNDER_REVIEW: { ar: 'قيد المراجعة', en: 'Under Review', cls: 'bg-blue-100 text-blue-800' },
  APPROVED: { ar: 'معتمد', en: 'Approved', cls: 'bg-emerald-100 text-emerald-800' },
  REJECTED: { ar: 'مرفوض', en: 'Rejected', cls: 'bg-red-100 text-red-800' },
  CANCELLED: { ar: 'ملغي', en: 'Cancelled', cls: 'bg-gray-100 text-gray-800' },
}

// ============ Form Dialog ============
function ChangeOrderFormDialog({
  open, onOpenChange, contractId, projectId, editItem,
}: {
  open: boolean; onOpenChange: (open: boolean) => void
  contractId: string; projectId: string; editItem?: ChangeOrderItem | null
}) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en
  const isEdit = !!editItem

  const [description, setDescription] = useState('')
  const [changeType, setChangeType] = useState('ADDITION')
  const [originalValue, setOriginalValue] = useState('')
  const [changeValue, setChangeValue] = useState('')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')

  React.useEffect(() => {
    if (open) {
      if (editItem) {
        setDescription(editItem.description)
        setChangeType(editItem.changeType)
        setOriginalValue(String(editItem.originalValue))
        setChangeValue(String(editItem.changeValue))
        setDate(editItem.date ? new Date(editItem.date).toISOString().split('T')[0] : '')
        setNotes(editItem.notes || '')
      } else {
        setDescription(''); setChangeType('ADDITION'); setOriginalValue(''); setChangeValue(''); setDate(''); setNotes('')
      }
    }
  }, [open, editItem])

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => {
      const payload = {
        contractId,
        projectId,
        description: data.description,
        changeType: data.changeType,
        originalValue: data.originalValue,
        changeValue: data.changeValue,
        date: data.date,
        notes: data.notes || null,
      }
      if (editItem) {
        return fetch(`/api/change-orders/${editItem.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        }).then(r => { if (!r.ok) throw new Error(); return r.json() })
      }
      return fetch('/api/change-orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      }).then(r => { if (!r.ok) throw new Error(); return r.json() })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-detail'] })
      toast({ title: t(isEdit ? 'تم التحديث' : 'تم الإنشاء', isEdit ? 'Updated' : 'Created'), description: t(isEdit ? 'تم تحديث أمر التغيير' : 'تم إنشاء أمر التغيير', isEdit ? 'Change order updated' : 'Change order created') })
      onOpenChange(false)
    },
    onError: () => {
      toast({ title: t('خطأ', 'Error'), description: t('فشل في حفظ أمر التغيير', 'Failed to save change order'), variant: 'destructive' })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    saveMutation.mutate({ description, changeType, originalValue, changeValue, date, notes })
  }

  const origVal = parseFloat(originalValue) || 0
  const chgVal = parseFloat(changeValue) || 0
  const newVal = origVal + chgVal

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t(isEdit ? 'تعديل أمر التغيير' : 'أمر تغيير جديد', isEdit ? 'Edit Change Order' : 'New Change Order')}</DialogTitle>
          <DialogDescription>{t(isEdit ? 'تعديل بيانات أمر التغيير' : 'إنشاء أمر تغيير جديد للعقد', isEdit ? 'Edit change order details' : 'Create a new change order for the contract')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t('الوصف *', 'Description *')}</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder={t('وصف التغيير', 'Change description')} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('نوع التغيير', 'Change Type')}</Label>
              <Select value={changeType} onValueChange={setChangeType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(changeTypeLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v[lang]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('التاريخ *', 'Date *')}</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>{t('القيمة الأصلية', 'Original Value')}</Label>
              <Input type="number" step="0.01" value={originalValue} onChange={e => setOriginalValue(e.target.value)} dir="ltr" placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label>{t('قيمة التغيير *', 'Change Value *')}</Label>
              <Input type="number" step="0.01" value={changeValue} onChange={e => setChangeValue(e.target.value)} dir="ltr" placeholder="0.00" required />
            </div>
            <div className="space-y-2">
              <Label>{t('القيمة الجديدة', 'New Value')}</Label>
              <Input value={newVal.toFixed(2)} readOnly className="bg-gray-50" dir="ltr" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('ملاحظات', 'Notes')}</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('ملاحظات إضافية', 'Additional notes')} rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{commonText.cancel[lang]}</Button>
            <Button type="submit" disabled={saveMutation.isPending || !description || !date || !changeValue} className="bg-emerald-600 hover:bg-emerald-700">
              {saveMutation.isPending ? t('جاري الحفظ...', 'Saving...') : isEdit ? t('حفظ التعديلات', 'Save Changes') : t('إنشاء', 'Create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Main Change Orders Section ============
export function ChangeOrderDialog({ contractId, projectId, changeOrders }: ChangeOrderDialogProps) {
  const { lang } = useAppStore()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const t = (ar: string, en: string) => lang === 'ar' ? ar : en

  const [formOpen, setFormOpen] = useState(false)
  const [editItem, setEditItem] = useState<ChangeOrderItem | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/change-orders/${id}`, { method: 'DELETE' }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-detail'] })
      toast({ title: t('تم الحذف', 'Deleted'), description: t('تم حذف أمر التغيير', 'Change order deleted') })
      setDeleteId(null)
    },
    onError: () => {
      toast({ title: t('خطأ', 'Error'), description: t('فشل في حذف أمر التغيير', 'Failed to delete change order'), variant: 'destructive' })
    },
  })

  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/change-orders/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'APPROVED' }),
      }).then(r => { if (!r.ok) throw new Error(); return r.json() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-detail'] })
      toast({ title: t('تم الاعتماد', 'Approved'), description: t('تم اعتماد أمر التغيير', 'Change order approved') })
    },
  })

  const totalChangeValue = changeOrders.reduce((s, co) => s + (co.status === 'APPROVED' ? co.changeValue : 0), 0)

  const handleEdit = (item: ChangeOrderItem) => {
    setEditItem(item)
    setFormOpen(true)
  }

  const handleCreate = () => {
    setEditItem(null)
    setFormOpen(true)
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-5 text-amber-600" />
          <h3 className="font-semibold">{t('أوامر التغيير', 'Change Orders')}</h3>
          <Badge variant="outline" className="text-xs">{changeOrders.length}</Badge>
          {totalChangeValue > 0 && (
            <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">
              {t('الإجمالي المعتمد', 'Approved Total')}: <MoneyDisplay value={totalChangeValue} lang={lang} size="xs" inline />
            </Badge>
          )}
        </div>
        <Button size="sm" className="gap-1 bg-amber-600 hover:bg-amber-700" onClick={handleCreate}>
          <Plus className="size-3.5" /> {t('أمر تغيير', 'Change Order')}
        </Button>
      </div>

      {changeOrders.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <AlertTriangle className="size-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{t('لا توجد أوامر تغيير', 'No change orders')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">{t('الرقم', 'No.')}</TableHead>
                <TableHead className="text-right">{t('الوصف', 'Description')}</TableHead>
                <TableHead className="text-right">{t('النوع', 'Type')}</TableHead>
                <TableHead className="text-right">{t('قيمة التغيير', 'Change Value')}</TableHead>
                <TableHead className="text-right">{t('القيمة الجديدة', 'New Value')}</TableHead>
                <TableHead className="text-right">{t('الحالة', 'Status')}</TableHead>
                <TableHead className="text-right">{t('الإجراءات', 'Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {changeOrders.map(co => {
                const stCfg = coStatusConfig[co.status] || coStatusConfig.DRAFT
                const chgType = changeTypeLabels[co.changeType] || changeTypeLabels.ADDITION
                return (
                  <TableRow key={co.id}>
                    <TableCell className="font-mono text-xs">{co.orderNo}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{co.description}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{chgType[lang]}</Badge></TableCell>
                    <TableCell><MoneyDisplay value={co.changeValue} lang={lang} size="sm" inline /></TableCell>
                    <TableCell className="font-semibold"><MoneyDisplay value={co.newValue} lang={lang} size="sm" inline bold /></TableCell>
                    <TableCell><span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${stCfg.cls}`}>{stCfg[lang]}</span></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {co.status === 'DRAFT' && (
                          <>
                            <Button variant="ghost" size="icon" className="size-7" onClick={() => handleEdit(co)} title={t('تعديل', 'Edit')}>
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-7 text-emerald-600" onClick={() => approveMutation.mutate(co.id)} title={t('اعتماد', 'Approve')}>
                              <AlertTriangle className="size-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-7 text-rose-500" onClick={() => setDeleteId(co.id)} title={t('حذف', 'Delete')}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          </>
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

      {/* Form Dialog */}
      <ChangeOrderFormDialog
        open={formOpen}
        onOpenChange={(open) => { setFormOpen(open); if (!open) setEditItem(null) }}
        contractId={contractId}
        projectId={projectId}
        editItem={editItem}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('حذف أمر التغيير', 'Delete Change Order')}</AlertDialogTitle>
            <AlertDialogDescription>{t('هل أنت متأكد من حذف أمر التغيير هذا؟', 'Are you sure you want to delete this change order?')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{commonText.cancel[lang]}</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
              {commonText.delete[lang]}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
