import { requireRoleApi } from '@/lib/auth-helpers'
// ============================================================================
// Business Flow Validation API
// نظام بِنَاء ERP - Binaa Construction ERP
//
// POST endpoint that exposes all workflow validation functions.
// Request body: { action: string, ...params }
// Response: { valid: boolean, message: string, missing?: string[] }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import {
  canCreateExtract,
  canCreateInvoice,
  canCreateTimesheet,
  canCreateDeliveryOrder,
  canApprovePurchaseOrder,
  canCreateGoodsReceipt,
  canCreateSupplierInvoice,
  canMakeSupplierPayment,
  canMakeClientPayment,
  getConstructionWorkflowProgress,
  getRentalWorkflowProgress,
  getPurchaseWorkflowProgress,
  routeSalaryCost,
  routeFuelCost,
  routeMaintenanceCost,
  routePurchaseCost,
  routeExpenseCost,
  calculateProjectProfitability,
  calculateEquipmentProfitability,
  getActivityTypeForEntity,
  type ValidationResult,
  type WorkflowProgress,
  type CostRoutingResult,
  type ProfitabilityResult,
  type EquipmentProfitabilityResult,
} from '@/lib/business-flow/engine'

export async function POST(request: NextRequest) {
  const { response } = await requireRoleApi('ADMIN', 'ACCOUNTANT')
  if (response) return response

  try {
    const body = await request.json()
    const { action } = body

    let result: ValidationResult | WorkflowProgress | CostRoutingResult | ProfitabilityResult | EquipmentProfitabilityResult | Record<string, unknown>

    switch (action) {
      // ============ WORKFLOW VALIDATION ============

      case 'canCreateExtract': {
        const { projectId } = body
        if (!projectId) {
          return NextResponse.json(
            { valid: false, message: 'projectId is required', missing: [] },
            { status: 400 }
          )
        }
        result = await canCreateExtract(projectId)
        break
      }

      case 'canCreateInvoice': {
        const { sourceType, sourceId } = body
        if (!sourceType || !sourceId) {
          return NextResponse.json(
            { valid: false, message: 'sourceType and sourceId are required', missing: [] },
            { status: 400 }
          )
        }
        result = await canCreateInvoice(sourceType, sourceId)
        break
      }

      case 'canCreateTimesheet': {
        const { rentalId } = body
        if (!rentalId) {
          return NextResponse.json(
            { valid: false, message: 'rentalId is required', missing: [] },
            { status: 400 }
          )
        }
        result = await canCreateTimesheet(rentalId)
        break
      }

      case 'canCreateDeliveryOrder': {
        const { rentalId } = body
        if (!rentalId) {
          return NextResponse.json(
            { valid: false, message: 'rentalId is required', missing: [] },
            { status: 400 }
          )
        }
        result = await canCreateDeliveryOrder(rentalId)
        break
      }

      case 'canApprovePurchaseOrder': {
        const { prId } = body
        if (!prId) {
          return NextResponse.json(
            { valid: false, message: 'prId is required', missing: [] },
            { status: 400 }
          )
        }
        result = await canApprovePurchaseOrder(prId)
        break
      }

      case 'canCreateGoodsReceipt': {
        const { poId } = body
        if (!poId) {
          return NextResponse.json(
            { valid: false, message: 'poId is required', missing: [] },
            { status: 400 }
          )
        }
        result = await canCreateGoodsReceipt(poId)
        break
      }

      case 'canCreateSupplierInvoice': {
        const { grId } = body
        if (!grId) {
          return NextResponse.json(
            { valid: false, message: 'grId is required', missing: [] },
            { status: 400 }
          )
        }
        result = await canCreateSupplierInvoice(grId)
        break
      }

      case 'canMakeSupplierPayment': {
        const { invoiceId } = body
        if (!invoiceId) {
          return NextResponse.json(
            { valid: false, message: 'invoiceId is required', missing: [] },
            { status: 400 }
          )
        }
        result = await canMakeSupplierPayment(invoiceId)
        break
      }

      case 'canMakeClientPayment': {
        const { invoiceId } = body
        if (!invoiceId) {
          return NextResponse.json(
            { valid: false, message: 'invoiceId is required', missing: [] },
            { status: 400 }
          )
        }
        result = await canMakeClientPayment(invoiceId)
        break
      }

      // ============ WORKFLOW PROGRESS ============

      case 'getConstructionProgress': {
        const { projectId } = body
        if (!projectId) {
          return NextResponse.json(
            { valid: false, message: 'projectId is required', missing: [] },
            { status: 400 }
          )
        }
        result = await getConstructionWorkflowProgress(projectId)
        break
      }

      case 'getRentalProgress': {
        const { rentalId } = body
        if (!rentalId) {
          return NextResponse.json(
            { valid: false, message: 'rentalId is required', missing: [] },
            { status: 400 }
          )
        }
        result = await getRentalWorkflowProgress(rentalId)
        break
      }

      case 'getPurchaseProgress': {
        const { purchaseRequestId } = body
        if (!purchaseRequestId) {
          return NextResponse.json(
            { valid: false, message: 'purchaseRequestId is required', missing: [] },
            { status: 400 }
          )
        }
        result = await getPurchaseWorkflowProgress(purchaseRequestId)
        break
      }

      // ============ COST FLOW ROUTING ============

      case 'routeSalaryCost': {
        const { salaryId } = body
        if (!salaryId) {
          return NextResponse.json(
            { valid: false, message: 'salaryId is required', missing: [] },
            { status: 400 }
          )
        }
        result = await routeSalaryCost(salaryId)
        break
      }

      case 'routeFuelCost': {
        const { fuelLogId } = body
        if (!fuelLogId) {
          return NextResponse.json(
            { valid: false, message: 'fuelLogId is required', missing: [] },
            { status: 400 }
          )
        }
        result = await routeFuelCost(fuelLogId)
        break
      }

      case 'routeMaintenanceCost': {
        const { maintenanceId } = body
        if (!maintenanceId) {
          return NextResponse.json(
            { valid: false, message: 'maintenanceId is required', missing: [] },
            { status: 400 }
          )
        }
        result = await routeMaintenanceCost(maintenanceId)
        break
      }

      case 'routePurchaseCost': {
        const { purchaseInvoiceId } = body
        if (!purchaseInvoiceId) {
          return NextResponse.json(
            { valid: false, message: 'purchaseInvoiceId is required', missing: [] },
            { status: 400 }
          )
        }
        result = await routePurchaseCost(purchaseInvoiceId)
        break
      }

      case 'routeExpenseCost': {
        const { expenseId } = body
        if (!expenseId) {
          return NextResponse.json(
            { valid: false, message: 'expenseId is required', missing: [] },
            { status: 400 }
          )
        }
        result = await routeExpenseCost(expenseId)
        break
      }

      // ============ PROFITABILITY ============

      case 'calculateProjectProfitability': {
        const { projectId } = body
        if (!projectId) {
          return NextResponse.json(
            { valid: false, message: 'projectId is required', missing: [] },
            { status: 400 }
          )
        }
        result = await calculateProjectProfitability(projectId)
        break
      }

      case 'calculateEquipmentProfitability': {
        const { equipmentId } = body
        if (!equipmentId) {
          return NextResponse.json(
            { valid: false, message: 'equipmentId is required', missing: [] },
            { status: 400 }
          )
        }
        result = await calculateEquipmentProfitability(equipmentId)
        break
      }

      // ============ ACTIVITY TYPE ============

      case 'getActivityType': {
        const { entityType, entityId } = body
        if (!entityType || !entityId) {
          return NextResponse.json(
            { valid: false, message: 'entityType and entityId are required', missing: [] },
            { status: 400 }
          )
        }
        const activityType = await getActivityTypeForEntity(entityType, entityId)
        result = { valid: true, activityType }
        break
      }

      default:
        return NextResponse.json(
          {
            valid: false,
            message: `Unknown action: ${action}. Supported actions: canCreateExtract, canCreateInvoice, canCreateTimesheet, canCreateDeliveryOrder, canApprovePurchaseOrder, canCreateGoodsReceipt, canCreateSupplierInvoice, canMakeSupplierPayment, canMakeClientPayment, getConstructionProgress, getRentalProgress, getPurchaseProgress, routeSalaryCost, routeFuelCost, routeMaintenanceCost, routePurchaseCost, routeExpenseCost, calculateProjectProfitability, calculateEquipmentProfitability, getActivityType`,
            missing: [],
          },
          { status: 400 }
        )
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Business Flow API] Error:', error)
    return NextResponse.json(
      {
        valid: false,
        message: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        missing: [],
      },
      { status: 500 }
    )
  }
}
