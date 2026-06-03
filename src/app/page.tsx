'use client'

import { Providers } from '@/components/layout/providers'
import { AppShell } from '@/components/layout/app-shell'
import { useAppStore } from '@/stores/app-store'
import { DashboardSection } from '@/components/sections/dashboard-section'
import { ProjectsSection } from '@/components/sections/projects-section'
import { ResourcesSection } from '@/components/sections/resources-section'
import { SupplyChainSection } from '@/components/sections/supply-chain-section'
import { WarehousesSection } from '@/components/sections/warehouses-section'
import { RentalSection } from '@/components/sections/rental-section'
import { FinanceSection } from '@/components/sections/finance-section'
import { CRMSection } from '@/components/sections/crm-section'
import { ReportsSection } from '@/components/sections/reports-section'
import { AdminSection } from '@/components/sections/admin-section'

function SectionRouter() {
  const { activeSection } = useAppStore()

  switch (activeSection) {
    case 'dashboard':
      return <DashboardSection />
    case 'projects':
      return <ProjectsSection />
    case 'resources':
      return <ResourcesSection />
    case 'supply-chain':
      return <SupplyChainSection />
    case 'warehouses':
      return <WarehousesSection />
    case 'rental':
      return <RentalSection />
    case 'finance':
      return <FinanceSection />
    case 'crm':
      return <CRMSection />
    case 'reports':
      return <ReportsSection />
    case 'admin':
      return <AdminSection />
    default:
      return <DashboardSection />
  }
}

export default function Home() {
  return (
    <Providers>
      <AppShell>
        <SectionRouter />
      </AppShell>
    </Providers>
  )
}
