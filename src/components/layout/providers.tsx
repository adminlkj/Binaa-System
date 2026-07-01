'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionProvider } from 'next-auth/react'
import { ThemeProvider } from 'next-themes'
import { useState, useEffect } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CompanyProvider, useCompany } from '@/contexts/company-context'
import { useAppStore } from '@/stores/app-store'
import { Toaster as SonnerToaster } from '@/components/ui/sonner'

/**
 * CurrencySettingsInitializer
 *
 * Subscribes to the company settings (fetched once on app boot by CompanyProvider)
 * and pushes the currency symbol image + thousand-separator settings into the
 * global Zustand store. This guarantees that <MoneyDisplay /> renders the
 * approved currency symbol image next to every amount anywhere in the system
 * without each component needing to pass it manually.
 */
function CurrencySettingsInitializer() {
  const { company } = useCompany()
  const setCurrencySymbolImage = useAppStore(s => s.setCurrencySymbolImage)
  const setThousandSeparatorSettings = useAppStore(s => s.setThousandSeparatorSettings)

  useEffect(() => {
    setCurrencySymbolImage(company.currencySymbolImage ?? null)
    // The "official documents" separator setting is intentionally kept ON
    // (thousand separators shown) when the user hasn't explicitly disabled it,
    // because the system screens and printed documents share the same display rule
    // unless ZATCA "official" mode is requested by the print template.
    setThousandSeparatorSettings(
      company.useThousandSeparatorsSystem ?? true,
      company.useThousandSeparatorsOfficial ?? false,
    )
  }, [
    company.currencySymbolImage,
    company.useThousandSeparatorsSystem,
    company.useThousandSeparatorsOfficial,
    setCurrencySymbolImage,
    setThousandSeparatorSettings,
  ])

  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <QueryClientProvider client={queryClient}>
          <CompanyProvider>
            <CurrencySettingsInitializer />
            <TooltipProvider>
              {children}
            </TooltipProvider>
          {/* Global toast notifications — success/error messages for every operation */}
          <SonnerToaster
            position="top-center"
            richColors
            closeButton
            dir="rtl"
            toastOptions={{
              style: {
                fontFamily: 'var(--font-cairo), Cairo, sans-serif',
              },
            }}
          />
          </CompanyProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SessionProvider>
  )
}
