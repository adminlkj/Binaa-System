'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// ============ Types ============

/** Shape of an account returned by /api/accounts/by-role */
interface AccountOption {
  id: string
  code: string
  name: string
  nameAr: string | null
  accountRole: string | null
  type?: string
  activityType?: string
  allowPosting?: boolean
}

export interface AccountSelectorProps {
  /** Array of account roles to fetch (e.g. ['CASH', 'BANK']) */
  roles: string[]
  /** Currently selected account ID */
  value: string | null
  /** Callback when the user selects an account */
  onValueChange: (
    accountId: string,
    account: {
      id: string
      code: string
      name: string
      nameAr: string | null
      accountRole: string | null
      activityType?: string | null
    }
  ) => void
  /** Label text (Arabic) */
  label?: string
  /** Placeholder text (Arabic) */
  placeholder?: string
  /** Optional filter by activityType */
  activityType?: string
  /** Optional filter by parent code instead of role */
  parentCode?: string
  /** Additional CSS classes */
  className?: string
}

// ============ Component ============

export function AccountSelector({
  roles,
  value,
  onValueChange,
  label,
  placeholder = 'اختر الحساب...',
  activityType,
  parentCode,
  className,
}: AccountSelectorProps) {
  // Build the query URL based on whether we use parentCode or roles
  const queryString = React.useMemo(() => {
    const params = new URLSearchParams()
    if (parentCode) {
      params.set('parentCode', parentCode)
    } else if (roles.length > 0) {
      params.set('role', roles.join(','))
    }
    if (activityType) {
      params.set('activityType', activityType)
    }
    return params.toString()
  }, [roles, parentCode, activityType])

  const { data: accounts = [], isLoading, isError } = useQuery<AccountOption[]>({
    queryKey: ['accounts-by-role', roles.join(','), parentCode, activityType],
    queryFn: async () => {
      if (!queryString) return []
      const res = await fetch(`/api/accounts/by-role?${queryString}`)
      if (!res.ok) throw new Error('Failed to fetch accounts')
      return res.json()
    },
    enabled: !!queryString,
    staleTime: 60_000, // Cache for 1 minute
  })

  // Build a lookup map for O(1) access when selection changes
  const accountMap = React.useMemo(() => {
    const map = new Map<string, AccountOption>()
    for (const acc of accounts) {
      map.set(acc.id, acc)
    }
    return map
  }, [accounts])

  const handleValueChange = (accountId: string) => {
    const account = accountMap.get(accountId)
    if (account) {
      onValueChange(accountId, {
        id: account.id,
        code: account.code,
        name: account.name,
        nameAr: account.nameAr,
        accountRole: account.accountRole,
        activityType: account.activityType ?? null,
      })
    }
  }

  return (
    <div className={cn('space-y-1.5', className)} dir="rtl">
      {label && (
        <Label className="text-sm font-medium">{label}</Label>
      )}

      {isLoading ? (
        <div className="space-y-1.5">
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      ) : isError ? (
        <div className="text-xs text-destructive py-1">
          خطأ في تحميل الحسابات
        </div>
      ) : (
        <Select value={value ?? undefined} onValueChange={handleValueChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {accounts.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground text-center">
                لا توجد حسابات
              </div>
            ) : (
              accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  <span className="font-mono text-xs ml-1">{account.code}</span>
                  <span className="mx-1 text-muted-foreground">-</span>
                  <span>{account.nameAr || account.name}</span>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
