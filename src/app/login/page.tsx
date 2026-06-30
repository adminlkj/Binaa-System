'use client'

import { useState, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Building2, Loader2, Lock, User, AlertCircle, ShieldCheck } from 'lucide-react'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const callbackUrl = params.get('callbackUrl') || '/'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username || !password) {
      setError('يرجى إدخال اسم المستخدم وكلمة المرور')
      return
    }
    setLoading(true)
    setError(null)

    const res = await signIn('credentials', {
      username,
      password,
      redirect: false,
    })

    setLoading(false)

    if (res?.error) {
      setError('اسم المستخدم أو كلمة المرور غير صحيحة')
      return
    }

    if (res?.ok) {
      router.push(callbackUrl)
      router.refresh()
    }
  }

  return (
    <Card className="w-full max-w-md shadow-2xl border-border/60 backdrop-blur-sm">
      <CardHeader className="space-y-4 text-center pb-6">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
        </div>
        <div className="space-y-1.5">
          <CardTitle className="text-2xl font-bold tracking-tight">
            نظام بِنَاء ERP
          </CardTitle>
          <CardDescription className="text-base">
            نظام إدارة موارد المقاولات الشامل
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="username" className="text-sm font-medium">
              اسم المستخدم
            </Label>
            <div className="relative">
              <User className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="username"
                type="text"
                autoComplete="username"
                autoFocus
                placeholder="أدخل اسم المستخدم"
                className="pr-10"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">
              كلمة المرور
            </Label>
            <div className="relative">
              <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                className="pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <Button type="submit" className="w-full h-11 text-base font-medium" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                جاري تسجيل الدخول...
              </>
            ) : (
              <>
                <ShieldCheck className="ml-2 h-4 w-4" />
                تسجيل الدخول
              </>
            )}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          جميع العمليات في النظام مسجلة ومُدققة. الاستخدام غير المصرح به ممنوع.
        </p>
      </CardContent>
    </Card>
  )
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4">
      <Suspense
        fallback={
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  )
}
