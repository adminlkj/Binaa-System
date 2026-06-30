'use client'

// ============================================================================
// شاشة إدارة المستخدمين — UsersModule
// ============================================================================
// تعرض قائمة المستخدمين، إنشاء/تعديل/حذف/تفعيل.
// الحسابات الدائمة (admin, developer) محمية: لا يمكن حذفها أو تغيير دورها
// أو إلغاء تفعيلها، لكن يمكن تغيير كلمة مرورها أو اسمها أو بريدها.

import React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import {
  UserPlus, Pencil, Trash2, ShieldCheck, ShieldAlert, Key, Loader2,
} from 'lucide-react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

type Role = 'ADMIN' | 'ACCOUNTANT' | 'MANAGER' | 'VIEWER'

interface UserRow {
  id: string
  username: string
  email: string
  name: string
  role: Role
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
  isProtected: boolean
}

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'مدير النظام',
  ACCOUNTANT: 'محاسب',
  MANAGER: 'مدير مشاريع',
  VIEWER: 'مشاهدة',
}

const ROLE_BADGE: Record<Role, string> = {
  ADMIN: 'bg-red-100 text-red-700 border-red-200',
  ACCOUNTANT: 'bg-teal-100 text-teal-700 border-teal-200',
  MANAGER: 'bg-violet-100 text-violet-700 border-violet-200',
  VIEWER: 'bg-gray-100 text-gray-700 border-gray-200',
}

export function UsersModule() {
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingUser, setEditingUser] = React.useState<UserRow | null>(null)
  const [passwordDialogOpen, setPasswordDialogOpen] = React.useState(false)
  const [passwordTarget, setPasswordTarget] = React.useState<UserRow | null>(null)

  const { data, isLoading } = useQuery<{ success: boolean; data: UserRow[] }>({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await fetch('/api/users')
      if (!res.ok) throw new Error('فشل تحميل المستخدمين')
      return res.json()
    },
  })

  const createUser = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل الإنشاء')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('تم إنشاء المستخدم بنجاح')
      setDialogOpen(false)
    },
    onError: (e: Error) => toast.error('خطأ', { description: e.message }),
  })

  const updateUser = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل التحديث')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('تم تحديث المستخدم')
      setDialogOpen(false)
      setEditingUser(null)
    },
    onError: (e: Error) => toast.error('خطأ', { description: e.message }),
  })

  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل الحذف')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('تم حذف المستخدم')
    },
    onError: (e: Error) => toast.error('خطأ', { description: e.message }),
  })

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل التغيير')
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: (e: Error) => toast.error('خطأ', { description: e.message }),
  })

  const changePassword = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل تغيير كلمة المرور')
      return data
    },
    onSuccess: () => {
      toast.success('تم تغيير كلمة المرور')
      setPasswordDialogOpen(false)
      setPasswordTarget(null)
    },
    onError: (e: Error) => toast.error('خطأ', { description: e.message }),
  })

  const users = data?.data || []
  const currentUserId = (session?.user as { id?: string })?.id

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">إدارة المستخدمين</h1>
          <p className="text-sm text-muted-foreground">
            إنشاء وتعديل وحذف مستخدمي النظام وإدارة صلاحياتهم
          </p>
        </div>
        <Button
          className="gap-2"
          onClick={() => { setEditingUser(null); setDialogOpen(true) }}
        >
          <UserPlus className="size-4" />
          مستخدم جديد
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">المستخدمون ({users.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الاسم</TableHead>
                    <TableHead>اسم المستخدم</TableHead>
                    <TableHead>البريد</TableHead>
                    <TableHead>الصلاحية</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>آخر دخول</TableHead>
                    <TableHead className="text-left">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {u.name}
                          {u.isProtected && (
                            <span title="حساب دائم" className="text-emerald-600">
                              <ShieldCheck className="size-4" />
                            </span>
                          )}
                          {u.id === currentUserId && (
                            <Badge variant="outline" className="text-xs">أنت</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{u.username}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <Badge className={ROLE_BADGE[u.role]} variant="outline">
                          {ROLE_LABELS[u.role]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={u.isActive}
                          disabled={u.isProtected}
                          onCheckedChange={(checked) => toggleActive.mutate({ id: u.id, isActive: checked })}
                        />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {u.lastLoginAt
                          ? new Date(u.lastLoginAt).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            title="تغيير كلمة المرور"
                            onClick={() => { setPasswordTarget(u); setPasswordDialogOpen(true) }}
                          >
                            <Key className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            title="تعديل"
                            onClick={() => { setEditingUser(u); setDialogOpen(true) }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-red-600 hover:text-red-700"
                            title="حذف"
                            disabled={u.isProtected || u.id === currentUserId}
                            onClick={() => {
                              if (confirm(`حذف المستخدم "${u.name}"؟ لا يمكن التراجع.`)) {
                                deleteUser.mutate(u.id)
                              }
                            }}
                          >
                            {u.isProtected ? <ShieldAlert className="size-4 text-muted-foreground" /> : <Trash2 className="size-4" />}
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

      {/* Create/Edit Dialog */}
      <UserFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingUser={editingUser}
        onSubmit={(payload) => {
          if (editingUser) {
            updateUser.mutate({ id: editingUser.id, payload })
          } else {
            createUser.mutate(payload)
          }
        }}
        isPending={createUser.isPending || updateUser.isPending}
      />

      {/* Password Change Dialog */}
      <PasswordDialog
        open={passwordDialogOpen}
        onOpenChange={setPasswordDialogOpen}
        target={passwordTarget}
        onSubmit={(password) => {
          if (passwordTarget) changePassword.mutate({ id: passwordTarget.id, password })
        }}
        isPending={changePassword.isPending}
      />
    </div>
  )
}

// ============ User Form Dialog ============
function UserFormDialog({
  open, onOpenChange, editingUser, onSubmit, isPending,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editingUser: UserRow | null
  onSubmit: (payload: Record<string, unknown>) => void
  isPending: boolean
}) {
  const [name, setName] = React.useState('')
  const [username, setUsername] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [role, setRole] = React.useState<Role>('VIEWER')
  const [isActive, setIsActive] = React.useState(true)

  React.useEffect(() => {
    if (open) {
      if (editingUser) {
        setName(editingUser.name)
        setUsername(editingUser.username)
        setEmail(editingUser.email)
        setPassword('')
        setRole(editingUser.role)
        setIsActive(editingUser.isActive)
      } else {
        setName('')
        setUsername('')
        setEmail('')
        setPassword('')
        setRole('VIEWER')
        setIsActive(true)
      }
    }
  }, [open, editingUser])

  const isProtected = editingUser?.isProtected ?? false

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload: Record<string, unknown> = { name, username, email, role, isActive }
    if (password) payload.password = password
    if (editingUser && !password) {
      // لا نرسل كلمة المرور عند التعديل إن كانت فارغة
    } else if (!editingUser && !password) {
      return // كلمة المرور مطلوبة عند الإنشاء
    }
    onSubmit(payload)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editingUser ? 'تعديل المستخدم' : 'مستخدم جديد'}</DialogTitle>
          <DialogDescription>
            {editingUser
              ? `تعديل بيانات ${editingUser.name}`
              : 'إنشاء مستخدم جديد في النظام'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">الاسم الكامل *</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">اسم المستخدم *</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={isProtected}
            />
            {isProtected && (
              <p className="text-xs text-muted-foreground">حساب دائم — لا يمكن تغيير اسم المستخدم</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">البريد الإلكتروني *</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">
              كلمة المرور {editingUser ? '(اتركها فارغة للإبقاء عليها)' : '*'}
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!editingUser}
              minLength={8}
              placeholder="8 أحرف على الأقل"
            />
          </div>
          <div className="space-y-2">
            <Label>الصلاحية</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)} disabled={isProtected}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">مدير النظام</SelectItem>
                <SelectItem value="ACCOUNTANT">محاسب</SelectItem>
                <SelectItem value="MANAGER">مدير مشاريع</SelectItem>
                <SelectItem value="VIEWER">مشاهدة</SelectItem>
              </SelectContent>
            </Select>
            {isProtected && (
              <p className="text-xs text-muted-foreground">حساب دائم — لا يمكن تغيير الصلاحية</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} disabled={isProtected} id="active" />
            <Label htmlFor="active">الحساب نشط</Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="size-4 animate-spin ml-2" />}
              {editingUser ? 'حفظ' : 'إنشاء'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ============ Password Dialog ============
function PasswordDialog({
  open, onOpenChange, target, onSubmit, isPending,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  target: UserRow | null
  onSubmit: (password: string) => void
  isPending: boolean
}) {
  const [password, setPassword] = React.useState('')
  const [confirm, setConfirm] = React.useState('')

  React.useEffect(() => {
    if (open) {
      setPassword('')
      setConfirm('')
    }
  }, [open])

  const mismatch = password && confirm && password !== confirm

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>تغيير كلمة المرور</DialogTitle>
          <DialogDescription>
            {target ? `تغيير كلمة مرور: ${target.name} (${target.username})` : ''}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (password && password === confirm) onSubmit(password)
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="newpw">كلمة المرور الجديدة *</Label>
            <Input
              id="newpw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="8 أحرف على الأقل"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmpw">تأكيد كلمة المرور *</Label>
            <Input
              id="confirmpw"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            {mismatch && <p className="text-xs text-red-600">كلمتا المرور غير متطابقتين</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button type="submit" disabled={isPending || !password || mismatch}>
              {isPending && <Loader2 className="size-4 animate-spin ml-2" />}
              تغيير كلمة المرور
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
