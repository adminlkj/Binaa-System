'use client'

import React, { useState, useMemo } from 'react'
import { BookOpen, ChevronDown, ChevronUp, CircleDot } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { MoneyDisplay } from '@/components/ui/money-display'
import { cn } from '@/lib/utils'

// ============ Types ============

export interface JePreviewLine {
  accountCode: string
  accountNameAr: string
  debit: number
  credit: number
}

export interface JePreviewProps {
  /** Array of expected journal entry lines */
  lines: JePreviewLine[]
  /** Section title (default: "القيد المحاسبي المتوقع") */
  title?: string
  /** Whether to show the preview */
  visible?: boolean
  /** Additional CSS classes */
  className?: string
}

// ============ Component ============

export function JePreview({
  lines,
  title = 'القيد المحاسبي المتوقع',
  visible = true,
  className,
}: JePreviewProps) {
  const [isOpen, setIsOpen] = useState(true)

  // Compute totals
  const totalDebit = useMemo(
    () => lines.reduce((sum, line) => sum + (line.debit || 0), 0),
    [lines]
  )
  const totalCredit = useMemo(
    () => lines.reduce((sum, line) => sum + (line.credit || 0), 0),
    [lines]
  )
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01

  // Don't render if not visible or no lines
  if (!visible || lines.length === 0) return null

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} dir="rtl">
      <Card
        className={cn(
          'border-emerald-300 bg-emerald-50/30 overflow-hidden',
          className
        )}
      >
        <CardHeader className="pb-0 pt-3 px-4">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between gap-2 h-auto p-0 hover:bg-transparent"
            >
              <div className="flex items-center gap-2">
                <BookOpen className="size-4 text-emerald-600" />
                <CardTitle className="text-sm font-semibold text-emerald-800">
                  {title}
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                {isBalanced ? (
                  <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs gap-1">
                    <CircleDot className="size-2.5" />
                    متوازن
                  </Badge>
                ) : (
                  <Badge className="bg-rose-100 text-rose-700 border-0 text-xs gap-1">
                    <CircleDot className="size-2.5" />
                    غير متوازن
                  </Badge>
                )}
                {isOpen ? (
                  <ChevronUp className="size-4 text-emerald-600" />
                ) : (
                  <ChevronDown className="size-4 text-emerald-600" />
                )}
              </div>
            </Button>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="px-4 pb-3 pt-2 space-y-3">
            <Separator className="bg-emerald-200" />

            {/* Lines table */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right h-8 text-xs">كود الحساب</TableHead>
                    <TableHead className="text-right h-8 text-xs">اسم الحساب</TableHead>
                    <TableHead className="text-right h-8 text-xs">مدين</TableHead>
                    <TableHead className="text-right h-8 text-xs">دائن</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-mono text-xs py-1.5">
                        <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">
                          {line.accountCode}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs py-1.5">
                        {line.accountNameAr}
                      </TableCell>
                      <TableCell className="py-1.5">
                        {line.debit > 0 ? (
                          <span className="text-emerald-700 font-medium">
                            <MoneyDisplay value={line.debit} lang="ar" size="xs" inline showSymbol={false} />
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5">
                        {line.credit > 0 ? (
                          <span className="text-rose-700 font-medium">
                            <MoneyDisplay value={line.credit} lang="ar" size="xs" inline showSymbol={false} />
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Totals row */}
            <div className="flex justify-between items-center bg-white/70 rounded-md px-3 py-2 border border-emerald-200">
              <div className="flex items-center gap-4 text-xs">
                <span>
                  إجمالي مدين:{' '}
                  <strong className="text-emerald-700">
                    <MoneyDisplay value={totalDebit} lang="ar" size="xs" inline showSymbol={false} />
                  </strong>
                </span>
                <span>
                  إجمالي دائن:{' '}
                  <strong className="text-rose-700">
                    <MoneyDisplay value={totalCredit} lang="ar" size="xs" inline showSymbol={false} />
                  </strong>
                </span>
              </div>
              {isBalanced ? (
                <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs gap-1">
                  <CircleDot className="size-2.5" />
                  متوازن
                </Badge>
              ) : (
                <Badge className="bg-rose-100 text-rose-700 border-0 text-xs gap-1">
                  <CircleDot className="size-2.5" />
                  غير متوازن
                </Badge>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
