-- CreateTable
CREATE TABLE "CompanySetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "logo" TEXT,
    "logoUrl" TEXT,
    "commercialReg" TEXT,
    "taxNumber" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "bankName" TEXT,
    "bankIban" TEXT,
    "bankAccountName" TEXT,
    "stamp" TEXT,
    "defaultVatRate" DECIMAL NOT NULL DEFAULT 0.15,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "currencySymbol" TEXT,
    "currencySymbolEn" TEXT,
    "currencySymbolAr" TEXT,
    "invoiceTerms" TEXT,
    "currencySymbolImage" TEXT,
    "headerImage" TEXT,
    "footerImage" TEXT,
    "headerHeight" INTEGER NOT NULL DEFAULT 30,
    "footerHeight" INTEGER NOT NULL DEFAULT 22,
    "useThousandSeparatorsSystem" BOOLEAN NOT NULL DEFAULT true,
    "useThousandSeparatorsOfficial" BOOLEAN NOT NULL DEFAULT false,
    "decimalPlaces" INTEGER NOT NULL DEFAULT 2,
    "invoiceTemplate" TEXT NOT NULL DEFAULT 'classic',
    "invoicePrimaryColor" TEXT NOT NULL DEFAULT '#0f766e',
    "invoiceAccentColor" TEXT NOT NULL DEFAULT '#34d399',
    "invoiceFontFamily" TEXT NOT NULL DEFAULT 'default',
    "invoiceShowBankDetails" BOOLEAN NOT NULL DEFAULT true,
    "invoiceShowSignature" BOOLEAN NOT NULL DEFAULT true,
    "invoiceShowStamp" BOOLEAN NOT NULL DEFAULT false,
    "stampPosition" TEXT NOT NULL DEFAULT 'after-signatures',
    "stampWidth" INTEGER NOT NULL DEFAULT 140,
    "stampHeight" INTEGER NOT NULL DEFAULT 140,
    "stampOffsetX" INTEGER NOT NULL DEFAULT 0,
    "stampOffsetY" INTEGER NOT NULL DEFAULT 0,
    "stampOpacity" DECIMAL NOT NULL DEFAULT 0.9,
    "stampRotation" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Warehouse_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Currency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "symbol" TEXT NOT NULL,
    "symbolImage" TEXT,
    "rate" DECIMAL NOT NULL DEFAULT 1,
    "decimalPlaces" INTEGER NOT NULL DEFAULT 2,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CostCenter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CostCenter_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CostCenter" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FiscalYear" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closingJournalEntryId" TEXT,
    "openingJournalEntryId" TEXT,
    "retainedEarningsAccountCode" TEXT,
    "closedBy" TEXT,
    "closedAt" DATETIME,
    "closingNotes" TEXT,
    "totalRevenue" DECIMAL NOT NULL DEFAULT 0,
    "totalExpenses" DECIMAL NOT NULL DEFAULT 0,
    "netProfit" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FiscalPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fiscalYearId" TEXT NOT NULL,
    "periodNo" INTEGER NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FiscalPeriod_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "nameEn" TEXT,
    "contactPerson" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "taxNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "nameEn" TEXT,
    "contactPerson" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "taxNumber" TEXT,
    "commercialReg" TEXT,
    "paymentTerms" TEXT,
    "creditLimit" DECIMAL NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Subcontractor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "nameEn" TEXT,
    "specialty" TEXT,
    "idOrRegNumber" TEXT,
    "contactPerson" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "taxNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "nationality" TEXT,
    "profession" TEXT,
    "residenceNumber" TEXT,
    "residenceExpiry" DATETIME,
    "hireDate" DATETIME,
    "basicSalary" DECIMAL NOT NULL DEFAULT 0,
    "salaryType" TEXT NOT NULL DEFAULT 'MONTHLY',
    "referenceMonthlyHours" DECIMAL NOT NULL DEFAULT 240,
    "housingAllowance" DECIMAL NOT NULL DEFAULT 0,
    "transportAllowance" DECIMAL NOT NULL DEFAULT 0,
    "otherAllowances" DECIMAL NOT NULL DEFAULT 0,
    "hourlyRate" DECIMAL NOT NULL DEFAULT 0,
    "hasGosi" BOOLEAN NOT NULL DEFAULT false,
    "gosiPercentage" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "branchId" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expenseAccountId" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Employee_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Employee_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmployeeContract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "basicSalary" DECIMAL NOT NULL DEFAULT 0,
    "housingAllowance" DECIMAL NOT NULL DEFAULT 0,
    "transportAllowance" DECIMAL NOT NULL DEFAULT 0,
    "otherAllowances" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmployeeContract_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "checkIn" DATETIME,
    "checkOut" DATETIME,
    "workHours" DECIMAL NOT NULL DEFAULT 0,
    "overtimeHours" DECIMAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Salary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "projectId" TEXT,
    "activityType" TEXT NOT NULL DEFAULT 'GENERAL',
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "basicSalary" DECIMAL NOT NULL DEFAULT 0,
    "housingAllowance" DECIMAL NOT NULL DEFAULT 0,
    "transportAllowance" DECIMAL NOT NULL DEFAULT 0,
    "otherAllowances" DECIMAL NOT NULL DEFAULT 0,
    "overtimeAmount" DECIMAL NOT NULL DEFAULT 0,
    "deductions" DECIMAL NOT NULL DEFAULT 0,
    "netSalary" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "journalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Salary_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Salary_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkTeam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "specialty" TEXT,
    "projectId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkTeam_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "role" TEXT,
    "isLeader" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "WorkTeam" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeamMember_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL NOT NULL DEFAULT 0,
    "totalGosi" DECIMAL NOT NULL DEFAULT 0,
    "totalNet" DECIMAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "journalEntryId" TEXT,
    "paymentJournalEntryId" TEXT,
    "paymentAccountCode" TEXT,
    "paymentAccountNameAr" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PayrollRunLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "projectId" TEXT,
    "workTeamId" TEXT,
    "salaryType" TEXT NOT NULL,
    "basicSalary" DECIMAL NOT NULL DEFAULT 0,
    "housingAllowance" DECIMAL NOT NULL DEFAULT 0,
    "transportAllowance" DECIMAL NOT NULL DEFAULT 0,
    "otherAllowances" DECIMAL NOT NULL DEFAULT 0,
    "hourlyRate" DECIMAL NOT NULL DEFAULT 0,
    "workHours" DECIMAL NOT NULL DEFAULT 0,
    "hourlySalary" DECIMAL NOT NULL DEFAULT 0,
    "overtimeAmount" DECIMAL NOT NULL DEFAULT 0,
    "deductions" DECIMAL NOT NULL DEFAULT 0,
    "gosiDeduction" DECIMAL NOT NULL DEFAULT 0,
    "totalEntitlement" DECIMAL NOT NULL DEFAULT 0,
    "netSalary" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PayrollRunLine_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PayrollRunLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PayrollRunLine_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PayrollRunLine_workTeamId_fkey" FOREIGN KEY ("workTeamId") REFERENCES "WorkTeam" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalaryPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "payrollRunId" TEXT,
    "employeeId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "paymentDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentMethod" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
    "reference" TEXT,
    "notes" TEXT,
    "journalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalaryPayment_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalaryPayment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "location" TEXT,
    "branchId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "costCenterId" TEXT,
    "projectType" TEXT NOT NULL DEFAULT 'CONSTRUCTION',
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "contractValue" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PLANNING',
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "estimatedTotalCost" DECIMAL DEFAULT 0,
    "committedCost" DECIMAL DEFAULT 0,
    "actualCost" DECIMAL DEFAULT 0,
    "progressPercent" DECIMAL DEFAULT 0,
    "deletedAt" DATETIME,
    CONSTRAINT "Project_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Project_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "contractNo" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "value" DECIMAL NOT NULL DEFAULT 0,
    "vatRate" DECIMAL NOT NULL DEFAULT 0.15,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalValue" DECIMAL NOT NULL DEFAULT 0,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "contractType" TEXT NOT NULL DEFAULT 'PROJECT',
    "clientId" TEXT,
    "equipmentId" TEXT,
    "hourlyRate" DECIMAL,
    "deliveryFees" DECIMAL NOT NULL DEFAULT 0,
    "deliveryFeesTaxable" BOOLEAN NOT NULL DEFAULT true,
    "paymentTerms" TEXT,
    "salesOrderNo" TEXT,
    "journalEntryId" TEXT,
    "quotationNo" TEXT,
    "loaNo" TEXT,
    "purchaseOrderNo" TEXT,
    "projectDuration" TEXT,
    "warrantyPeriod" TEXT,
    "maintenancePeriod" TEXT,
    "billingMethod" TEXT,
    "firstClaimNo" TEXT,
    "advancePaymentPercent" DECIMAL DEFAULT 0,
    "retentionPercent" DECIMAL DEFAULT 0,
    "projectManager" TEXT,
    "projectEngineer" TEXT,
    "projectLocation" TEXT,
    "projectCity" TEXT,
    "projectType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Contract_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Contract_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChangeOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "changeType" TEXT NOT NULL DEFAULT 'ADDITION',
    "originalValue" DECIMAL NOT NULL DEFAULT 0,
    "changeValue" DECIMAL NOT NULL DEFAULT 0,
    "newValue" DECIMAL NOT NULL DEFAULT 0,
    "vatRate" DECIMAL NOT NULL DEFAULT 0.15,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalChangeValue" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedDate" DATETIME,
    "approvedBy" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChangeOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ChangeOrder_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Warranty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PERFORMANCE',
    "referenceNo" TEXT,
    "issuer" TEXT,
    "beneficiary" TEXT,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Warranty_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Warranty_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BOQItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL NOT NULL DEFAULT 0,
    "totalPrice" DECIMAL NOT NULL DEFAULT 0,
    "category" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "wbsElementId" TEXT,
    CONSTRAINT "BOQItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BOQItem_wbsElementId_fkey" FOREIGN KEY ("wbsElementId") REFERENCES "WBSElement" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProgressClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "claimNo" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "percentage" DECIMAL NOT NULL DEFAULT 0,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "vatRate" DECIMAL NOT NULL DEFAULT 0.15,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedDate" DATETIME,
    "notes" TEXT,
    "journalEntryId" TEXT,
    "invoiced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "certifiedAmount" DECIMAL DEFAULT 0,
    "retentionAmount" DECIMAL DEFAULT 0,
    "advanceDeduction" DECIMAL DEFAULT 0,
    CONSTRAINT "ProgressClaim_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProgressClaim_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalesInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceNo" TEXT NOT NULL,
    "projectId" TEXT,
    "contractId" TEXT,
    "clientId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "subtotal" DECIMAL NOT NULL DEFAULT 0,
    "discountRate" DECIMAL NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL NOT NULL DEFAULT 0,
    "netAmount" DECIMAL NOT NULL DEFAULT 0,
    "vatRate" DECIMAL NOT NULL DEFAULT 0.15,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "invoiceType" TEXT NOT NULL DEFAULT 'PROGRESS_CLAIM',
    "notes" TEXT,
    "paymentTerms" TEXT,
    "referenceNo" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'EXTRACT',
    "timesheetId" TEXT,
    "progressClaimId" TEXT,
    "deliveryMonth" TEXT,
    "includeDelivery" BOOLEAN NOT NULL DEFAULT false,
    "deliveryAmount" DECIMAL NOT NULL DEFAULT 0,
    "deliveryFeesTaxable" BOOLEAN NOT NULL DEFAULT true,
    "includeVat" BOOLEAN NOT NULL DEFAULT true,
    "contractNo" TEXT,
    "contractType" TEXT,
    "contractPeriodStart" DATETIME,
    "contractPeriodEnd" DATETIME,
    "salesOrderNo" TEXT,
    "equipmentName" TEXT,
    "operatingHours" DECIMAL,
    "hourlyRate" DECIMAL,
    "amountInWordsAr" TEXT,
    "amountInWordsEn" TEXT,
    "journalEntryId" TEXT,
    "zatcaQr" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "SalesInvoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesInvoice_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesInvoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SalesInvoice_timesheetId_fkey" FOREIGN KEY ("timesheetId") REFERENCES "Timesheet" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SalesInvoice_progressClaimId_fkey" FOREIGN KEY ("progressClaimId") REFERENCES "ProgressClaim" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalesInvoiceItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "descriptionEn" TEXT,
    "quantity" DECIMAL NOT NULL DEFAULT 0,
    "unit" TEXT,
    "unitPrice" DECIMAL NOT NULL DEFAULT 0,
    "totalPrice" DECIMAL NOT NULL DEFAULT 0,
    "itemType" TEXT NOT NULL DEFAULT 'PRODUCT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalesInvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PurchaseRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestNo" TEXT NOT NULL,
    "projectId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'PROJECT',
    "date" DATETIME NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "requestedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PurchaseRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PurchaseRequestItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL DEFAULT 0,
    "unit" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PurchaseRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PurchaseRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNo" TEXT NOT NULL,
    "projectId" TEXT,
    "supplierId" TEXT NOT NULL,
    "purchaseRequestId" TEXT,
    "date" DATETIME NOT NULL,
    "deliveryDate" DATETIME,
    "paymentTerms" TEXT,
    "subtotal" DECIMAL NOT NULL DEFAULT 0,
    "vatRate" DECIMAL NOT NULL DEFAULT 0.15,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "journalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PurchaseOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrder_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL DEFAULT 0,
    "unit" TEXT,
    "unitPrice" DECIMAL NOT NULL DEFAULT 0,
    "vatRate" DECIMAL NOT NULL DEFAULT 0.15,
    "totalPrice" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PurchaseOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GoodsReceipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "receiptNo" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "projectId" TEXT,
    "date" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "journalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GoodsReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GoodsReceipt_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GoodsReceipt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GoodsReceiptItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "goodsReceiptId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantityOrdered" DECIMAL NOT NULL DEFAULT 0,
    "quantityReceived" DECIMAL NOT NULL DEFAULT 0,
    "quantityRemaining" DECIMAL NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL NOT NULL DEFAULT 0,
    "totalPrice" DECIMAL NOT NULL DEFAULT 0,
    "destination" TEXT NOT NULL DEFAULT 'INVENTORY',
    "inventoryItemId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GoodsReceiptItem_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PurchaseInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceNo" TEXT NOT NULL,
    "purchaseOrderId" TEXT,
    "goodsReceiptId" TEXT,
    "projectId" TEXT,
    "equipmentId" TEXT,
    "activityType" TEXT NOT NULL DEFAULT 'EXECUTION',
    "supplierId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "supplierInvoiceNo" TEXT,
    "supplierInvoiceDate" DATETIME,
    "attachmentPath" TEXT,
    "subtotal" DECIMAL NOT NULL DEFAULT 0,
    "vatRate" DECIMAL NOT NULL DEFAULT 0.15,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "referenceNo" TEXT,
    "expenseCategory" TEXT,
    "journalEntryId" TEXT,
    "zatcaQr" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "PurchaseInvoice_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PurchaseInvoice_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PurchaseInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseInvoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PurchaseInvoice_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PurchaseInvoiceItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL NOT NULL DEFAULT 0,
    "totalPrice" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PurchaseInvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PurchaseInvoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubcontractorContract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subcontractorId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contractNo" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "value" DECIMAL NOT NULL DEFAULT 0,
    "vatRate" DECIMAL NOT NULL DEFAULT 0.15,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalValue" DECIMAL NOT NULL DEFAULT 0,
    "retentionRate" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SubcontractorContract_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SubcontractorContract_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubcontractorInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subcontractorId" TEXT NOT NULL,
    "projectId" TEXT,
    "invoiceNo" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "vatRate" DECIMAL NOT NULL DEFAULT 0.15,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "journalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "SubcontractorInvoice_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SubcontractorInvoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "equipmentId" TEXT,
    "costCenterId" TEXT,
    "expenseType" TEXT NOT NULL DEFAULT 'PROJECT',
    "activityType" TEXT NOT NULL DEFAULT 'EXECUTION',
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "vatRate" DECIMAL NOT NULL DEFAULT 0.15,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "date" DATETIME NOT NULL,
    "reference" TEXT,
    "payFrom" TEXT NOT NULL DEFAULT 'TREASURY',
    "attachmentPath" TEXT,
    "journalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Expense_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LaborCost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "employeeId" TEXT,
    "description" TEXT NOT NULL,
    "workers" INTEGER NOT NULL,
    "days" DECIMAL NOT NULL DEFAULT 0,
    "dailyRate" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "date" DATETIME NOT NULL,
    "journalEntryId" TEXT,
    "paymentSource" TEXT,
    "paymentAccountCode" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LaborCost_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LaborCost_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "type" TEXT,
    "model" TEXT,
    "manufacturer" TEXT,
    "manufactureYear" INTEGER,
    "plateNumber" TEXT,
    "serialNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "ownershipType" TEXT NOT NULL DEFAULT 'COMPANY_OWNED',
    "supplierId" TEXT,
    "ownerId" TEXT,
    "purchasePrice" DECIMAL NOT NULL DEFAULT 0,
    "sellingPrice" DECIMAL NOT NULL DEFAULT 0,
    "hourlyRate" DECIMAL NOT NULL DEFAULT 0,
    "dailyRate" DECIMAL NOT NULL DEFAULT 0,
    "monthlyRate" DECIMAL NOT NULL DEFAULT 0,
    "purchaseDate" DATETIME,
    "warrantyExpiry" DATETIME,
    "assetAccountId" TEXT,
    "assetAccountCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" DATETIME,
    "journalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Equipment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Equipment_assetAccountId_fkey" FOREIGN KEY ("assetAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EquipmentOperation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "equipmentId" TEXT NOT NULL,
    "operatorId" TEXT,
    "projectId" TEXT,
    "date" DATETIME NOT NULL,
    "hours" DECIMAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EquipmentOperation_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EquipmentOperation_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EquipmentOperation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EquipmentUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "equipmentId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "hours" DECIMAL NOT NULL DEFAULT 0,
    "description" TEXT,
    "cost" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EquipmentUsage_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EquipmentUsage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EquipmentMaintenance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "equipmentId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "cost" DECIMAL NOT NULL DEFAULT 0,
    "supplierId" TEXT,
    "nextDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "completedAt" DATETIME,
    "journalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EquipmentMaintenance_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EquipmentMaintenance_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EquipmentFuelLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "equipmentId" TEXT NOT NULL,
    "projectId" TEXT,
    "date" DATETIME NOT NULL,
    "liters" DECIMAL NOT NULL DEFAULT 0,
    "costPerLiter" DECIMAL NOT NULL DEFAULT 0,
    "totalCost" DECIMAL NOT NULL DEFAULT 0,
    "journalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EquipmentFuelLog_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EquipmentFuelLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EquipmentCost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "date" DATETIME NOT NULL,
    "costType" TEXT,
    "equipmentId" TEXT,
    "journalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EquipmentCost_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EquipmentRental" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "pricingType" TEXT NOT NULL DEFAULT 'HOURLY',
    "referenceRate" DECIMAL NOT NULL DEFAULT 0,
    "referenceHours" DECIMAL NOT NULL DEFAULT 0,
    "hourlyRate" DECIMAL NOT NULL DEFAULT 0,
    "dailyRate" DECIMAL NOT NULL DEFAULT 0,
    "monthlyRate" DECIMAL NOT NULL DEFAULT 0,
    "lumpSumAmount" DECIMAL NOT NULL DEFAULT 0,
    "workCity" TEXT,
    "workLocation" TEXT,
    "siteSupervisor" TEXT,
    "siteSupervisorPhone" TEXT,
    "deliveryFeesType" TEXT DEFAULT 'NONE',
    "deliveryFees" DECIMAL NOT NULL DEFAULT 0,
    "deliveryFeesTaxable" BOOLEAN NOT NULL DEFAULT true,
    "operationMode" TEXT NOT NULL DEFAULT 'WITHOUT_DRIVER',
    "fuelResponsibility" TEXT DEFAULT 'ON_CLIENT',
    "insuranceResponsibility" TEXT DEFAULT 'ON_CLIENT',
    "salesOrderNo" TEXT,
    "purchaseOrderNo" TEXT,
    "quotationNo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "paymentDuration" TEXT,
    "additionalTerms" TEXT,
    "notes" TEXT,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EquipmentRental_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EquipmentRental_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EquipmentRental_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EquipmentRental_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EquipmentDeliveryOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNo" TEXT NOT NULL,
    "rentalId" TEXT,
    "equipmentId" TEXT NOT NULL,
    "clientId" TEXT,
    "projectId" TEXT,
    "site" TEXT,
    "deliveryDate" DATETIME NOT NULL,
    "returnDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "EquipmentDeliveryOrder_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EquipmentDeliveryOrder_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "EquipmentRental" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EquipmentDeliveryOrder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EquipmentDeliveryOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EquipmentExpense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "equipmentId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "date" DATETIME NOT NULL,
    "reference" TEXT,
    "journalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EquipmentExpense_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Timesheet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rentalId" TEXT NOT NULL,
    "deliveryOrderId" TEXT,
    "contractId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "operatingHours" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedDate" DATETIME,
    "notes" TEXT,
    "invoiced" BOOLEAN NOT NULL DEFAULT false,
    "invoiceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Timesheet_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Timesheet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Timesheet_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Timesheet_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "EquipmentRental" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Timesheet_deliveryOrderId_fkey" FOREIGN KEY ("deliveryOrderId") REFERENCES "EquipmentDeliveryOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PettyCash" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branchId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "date" DATETIME NOT NULL,
    "category" TEXT,
    "reference" TEXT,
    "transactionType" TEXT NOT NULL DEFAULT 'DISBURSE',
    "journalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "PettyCash_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmployeeAdvance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "date" DATETIME NOT NULL,
    "settledAmount" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "journalEntryId" TEXT,
    "paymentSource" TEXT,
    "paymentAccountCode" TEXT,
    "settlementMethod" TEXT,
    "settlementAccountCode" TEXT,
    "settlementDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "EmployeeAdvance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "itemType" TEXT NOT NULL DEFAULT 'PRODUCT',
    "unit" TEXT NOT NULL,
    "purchasePrice" DECIMAL NOT NULL DEFAULT 0,
    "sellingPrice" DECIMAL NOT NULL DEFAULT 0,
    "quantity" DECIMAL NOT NULL DEFAULT 0,
    "minQuantity" DECIMAL NOT NULL DEFAULT 0,
    "warehouseId" TEXT NOT NULL,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventoryItem_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "type" TEXT NOT NULL,
    "parentId" TEXT,
    "parentCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "activityType" TEXT,
    "accountRole" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "allowPosting" BOOLEAN NOT NULL DEFAULT true,
    "level" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "descriptionAr" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "usableInExpenses" BOOLEAN NOT NULL DEFAULT false,
    "usableInProjects" BOOLEAN NOT NULL DEFAULT false,
    "usableInRental" BOOLEAN NOT NULL DEFAULT false,
    "usableInPayroll" BOOLEAN NOT NULL DEFAULT false,
    "usableInAdvances" BOOLEAN NOT NULL DEFAULT false,
    "usableInMaintenance" BOOLEAN NOT NULL DEFAULT false,
    "usableInFuel" BOOLEAN NOT NULL DEFAULT false,
    "usableInPurchases" BOOLEAN NOT NULL DEFAULT false,
    "usableInRevenue" BOOLEAN NOT NULL DEFAULT false,
    "showInCash" BOOLEAN NOT NULL DEFAULT false,
    "showInBank" BOOLEAN NOT NULL DEFAULT false,
    "allowsProject" BOOLEAN NOT NULL DEFAULT false,
    "allowsCostCenter" BOOLEAN NOT NULL DEFAULT false,
    "allowsEmployee" BOOLEAN NOT NULL DEFAULT false,
    "allowsEquipment" BOOLEAN NOT NULL DEFAULT false,
    "allowsSupplier" BOOLEAN NOT NULL DEFAULT false,
    "allowsClient" BOOLEAN NOT NULL DEFAULT false,
    "requiresEmployee" BOOLEAN NOT NULL DEFAULT false,
    "requiresProject" BOOLEAN NOT NULL DEFAULT false,
    "requiresEquipment" BOOLEAN NOT NULL DEFAULT false,
    "requiresContract" BOOLEAN NOT NULL DEFAULT false,
    "allowsVat" BOOLEAN NOT NULL DEFAULT true,
    "documentType" TEXT,
    CONSTRAINT "Account_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryNo" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "sourceType" TEXT,
    "sourceId" TEXT,
    "isReversal" BOOLEAN NOT NULL DEFAULT false,
    "reversedEntryId" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "JournalEntry_reversedEntryId_fkey" FOREIGN KEY ("reversedEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Sequence" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "lastEntryNo" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journalEntryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "costCenterId" TEXT,
    "debit" DECIMAL NOT NULL DEFAULT 0,
    "credit" DECIMAL NOT NULL DEFAULT 0,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "JournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JournalLine_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VATReturn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "totalSales" DECIMAL NOT NULL DEFAULT 0,
    "outputVat" DECIMAL NOT NULL DEFAULT 0,
    "totalPurchases" DECIMAL NOT NULL DEFAULT 0,
    "inputVat" DECIMAL NOT NULL DEFAULT 0,
    "netVat" DECIMAL NOT NULL DEFAULT 0,
    "standardRatedSales" DECIMAL NOT NULL DEFAULT 0,
    "zeroRatedSales" DECIMAL NOT NULL DEFAULT 0,
    "exemptSales" DECIMAL NOT NULL DEFAULT 0,
    "standardRatedSalesVat" DECIMAL NOT NULL DEFAULT 0,
    "standardRatedPurchases" DECIMAL NOT NULL DEFAULT 0,
    "zeroRatedPurchases" DECIMAL NOT NULL DEFAULT 0,
    "exemptPurchases" DECIMAL NOT NULL DEFAULT 0,
    "importsSubjectToVAT" DECIMAL NOT NULL DEFAULT 0,
    "standardRatedPurchasesVat" DECIMAL NOT NULL DEFAULT 0,
    "glOutputVat" DECIMAL NOT NULL DEFAULT 0,
    "glInputVat" DECIMAL NOT NULL DEFAULT 0,
    "glMatch" BOOLEAN NOT NULL DEFAULT true,
    "salesInvoiceIds" TEXT,
    "purchaseInvoiceIds" TEXT,
    "expenseIds" TEXT,
    "subcontractorInvoiceIds" TEXT,
    "progressClaimIds" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "filedDate" DATETIME,
    "paymentDate" DATETIME,
    "paymentReference" TEXT,
    "journalEntryId" TEXT,
    "paymentJournalEntryId" TEXT,
    "cancelledAt" DATETIME,
    "cancelledReason" TEXT,
    "amendedFromId" TEXT,
    "isAmendment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ClientPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "date" DATETIME NOT NULL,
    "receivedIn" TEXT NOT NULL DEFAULT 'TREASURY',
    "receivingAccountId" TEXT,
    "receivingAccountCode" TEXT,
    "receivingAccountName" TEXT,
    "paymentType" TEXT NOT NULL DEFAULT 'PAYMENT',
    "reference" TEXT,
    "notes" TEXT,
    "journalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "ClientPayment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClientPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplierId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "date" DATETIME NOT NULL,
    "paidFrom" TEXT NOT NULL DEFAULT 'TREASURY',
    "payingAccountId" TEXT,
    "payingAccountCode" TEXT,
    "payingAccountName" TEXT,
    "bankAccount" TEXT,
    "paymentMethod" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "journalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ResourceAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ResourceAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FixedAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "category" TEXT NOT NULL,
    "acquisitionDate" DATETIME NOT NULL,
    "acquisitionCost" DECIMAL NOT NULL DEFAULT 0,
    "residualValue" DECIMAL NOT NULL DEFAULT 0,
    "usefulLifeMonths" INTEGER NOT NULL,
    "usefulLifeYears" INTEGER NOT NULL DEFAULT 0,
    "depreciationRate" DECIMAL NOT NULL DEFAULT 0,
    "depreciationMethod" TEXT NOT NULL DEFAULT 'STRAIGHT_LINE',
    "monthlyDepreciation" DECIMAL NOT NULL DEFAULT 0,
    "annualDepreciation" DECIMAL NOT NULL DEFAULT 0,
    "accumulatedDepreciation" DECIMAL NOT NULL DEFAULT 0,
    "netBookValue" DECIMAL NOT NULL DEFAULT 0,
    "lastDepreciationDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "accountId" TEXT,
    "depExpenseAccountId" TEXT,
    "accumDepAccountId" TEXT,
    "journalEntryId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FixedAsset_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FixedAsset_depExpenseAccountId_fkey" FOREIGN KEY ("depExpenseAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FixedAsset_accumDepAccountId_fkey" FOREIGN KEY ("accumDepAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssetDepreciation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fixedAssetId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "depreciationAmount" DECIMAL NOT NULL DEFAULT 0,
    "beginningNBV" DECIMAL NOT NULL DEFAULT 0,
    "endingNBV" DECIMAL NOT NULL DEFAULT 0,
    "journalEntryId" TEXT,
    "reversed" BOOLEAN NOT NULL DEFAULT false,
    "reversedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AssetDepreciation_fixedAssetId_fkey" FOREIGN KEY ("fixedAssetId") REFERENCES "FixedAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Provision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "type" TEXT NOT NULL,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "currentBalance" DECIMAL NOT NULL DEFAULT 0,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "journalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProvisionMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provisionId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "movementType" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "description" TEXT,
    "journalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProvisionMovement_provisionId_fkey" FOREIGN KEY ("provisionId") REFERENCES "Provision" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bankName" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "iban" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "accountId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BankAccount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bankAccountId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "transactionType" TEXT NOT NULL,
    "reconciled" BOOLEAN NOT NULL DEFAULT false,
    "journalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BankTransaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankReconciliation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bankAccountId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "bookBalance" DECIMAL NOT NULL DEFAULT 0,
    "bankBalance" DECIMAL NOT NULL DEFAULT 0,
    "difference" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "completedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BankReconciliation_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinancialMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operationType" TEXT NOT NULL,
    "labelAr" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "description" TEXT,
    "debitRoles" TEXT NOT NULL,
    "creditRoles" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AccountingHealthCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checkDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "overallScore" INTEGER NOT NULL DEFAULT 0,
    "totalChecks" INTEGER NOT NULL DEFAULT 0,
    "passedChecks" INTEGER NOT NULL DEFAULT 0,
    "warnings" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "details" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PeriodClosing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'MONTHLY',
    "status" TEXT NOT NULL DEFAULT 'CLOSED',
    "closingEntryId" TEXT,
    "closedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WBSElement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "elementType" TEXT NOT NULL DEFAULT 'WORK_PACKAGE',
    "weight" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startDate" DATETIME,
    "endDate" DATETIME,
    "progress" DECIMAL NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WBSElement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WBSElement_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WBSElement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CostCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "parentId" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CostCode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CostCode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "wbsElementId" TEXT,
    "name" TEXT NOT NULL,
    "activityType" TEXT NOT NULL DEFAULT 'CONSTRUCTION',
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "startDate" DATETIME,
    "endDate" DATETIME,
    "plannedQuantity" DECIMAL NOT NULL DEFAULT 0,
    "actualQuantity" DECIMAL NOT NULL DEFAULT 0,
    "progress" DECIMAL NOT NULL DEFAULT 0,
    "weight" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Activity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Activity_wbsElementId_fkey" FOREIGN KEY ("wbsElementId") REFERENCES "WBSElement" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CostEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "wbsElementId" TEXT,
    "costCodeId" TEXT,
    "activityId" TEXT,
    "costCenterId" TEXT,
    "costType" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceDocument" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL DEFAULT 0,
    "unit" TEXT,
    "unitCost" DECIMAL NOT NULL DEFAULT 0,
    "amount" DECIMAL NOT NULL,
    "date" DATETIME NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "isCommitted" BOOLEAN NOT NULL DEFAULT false,
    "journalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CostEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CostEntry_wbsElementId_fkey" FOREIGN KEY ("wbsElementId") REFERENCES "WBSElement" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CostEntry_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CostEntry_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CostEntry_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CostCodeBudget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "wbsElementId" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "budgetAmount" DECIMAL NOT NULL DEFAULT 0,
    "committedAmount" DECIMAL NOT NULL DEFAULT 0,
    "actualAmount" DECIMAL NOT NULL DEFAULT 0,
    "earnedAmount" DECIMAL NOT NULL DEFAULT 0,
    "forecastAmount" DECIMAL NOT NULL DEFAULT 0,
    "variance" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CostCodeBudget_wbsElementId_fkey" FOREIGN KEY ("wbsElementId") REFERENCES "WBSElement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CostCodeBudget_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "wbsElementId" TEXT,
    "costCodeId" TEXT,
    "activityId" TEXT,
    "ledgerType" TEXT NOT NULL,
    "entryDate" DATETIME NOT NULL,
    "description" TEXT,
    "debit" DECIMAL NOT NULL DEFAULT 0,
    "credit" DECIMAL NOT NULL DEFAULT 0,
    "runningBalance" DECIMAL NOT NULL DEFAULT 0,
    "reference" TEXT,
    "journalEntryId" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectLedger_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectLedger_wbsElementId_fkey" FOREIGN KEY ("wbsElementId") REFERENCES "WBSElement" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProjectLedger_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Commitment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commitmentNo" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "commitmentType" TEXT NOT NULL,
    "vendorId" TEXT,
    "description" TEXT,
    "committedAmount" DECIMAL NOT NULL,
    "invoicedAmount" DECIMAL NOT NULL DEFAULT 0,
    "receivedAmount" DECIMAL NOT NULL DEFAULT 0,
    "remainingCommitment" DECIMAL NOT NULL DEFAULT 0,
    "commitmentDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Commitment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommitmentLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commitmentId" TEXT NOT NULL,
    "wbsElementId" TEXT,
    "costCodeId" TEXT,
    "description" TEXT,
    "quantity" DECIMAL NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL NOT NULL DEFAULT 0,
    "lineAmount" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommitmentLine_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "Commitment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubcontractorAdvance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "advanceNo" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contractId" TEXT,
    "date" DATETIME NOT NULL,
    "amount" DECIMAL NOT NULL,
    "deductionPercent" DECIMAL NOT NULL DEFAULT 0,
    "recoveryMethod" TEXT NOT NULL DEFAULT 'PER_CERTIFICATE',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "recoveredAmount" DECIMAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "journalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SubcontractorAdvance_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SubcontractorAdvance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubcontractorRetention" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "retentionNo" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "subcontractorInvoiceId" TEXT,
    "date" DATETIME NOT NULL,
    "withheldAmount" DECIMAL NOT NULL,
    "releasedAmount" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'WITHHELD',
    "releaseDate" DATETIME,
    "notes" TEXT,
    "journalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SubcontractorRetention_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SubcontractorRetention_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubcontractorPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentNo" TEXT NOT NULL,
    "subcontractorId" TEXT NOT NULL,
    "subcontractorInvoiceId" TEXT,
    "paymentDate" DATETIME NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
    "bankAccountId" TEXT,
    "chequeNo" TEXT,
    "amount" DECIMAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "journalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SubcontractorPayment_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SubcontractorPayment_subcontractorInvoiceId_fkey" FOREIGN KEY ("subcontractorInvoiceId") REFERENCES "SubcontractorInvoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClaimItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "claimId" TEXT NOT NULL,
    "boqItemId" TEXT,
    "wbsElementId" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT,
    "previousQuantity" DECIMAL NOT NULL DEFAULT 0,
    "currentQuantity" DECIMAL NOT NULL DEFAULT 0,
    "cumulativeQuantity" DECIMAL NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "retentionPercent" DECIMAL NOT NULL DEFAULT 0,
    "retentionAmount" DECIMAL NOT NULL DEFAULT 0,
    "advanceDeduction" DECIMAL NOT NULL DEFAULT 0,
    "penaltyAmount" DECIMAL NOT NULL DEFAULT 0,
    "otherDeductions" DECIMAL NOT NULL DEFAULT 0,
    "netAmount" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClaimItem_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ProgressClaim" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClaimItem_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BOQItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ClaimItem_wbsElementId_fkey" FOREIGN KEY ("wbsElementId") REFERENCES "WBSElement" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Measurement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "wbsElementId" TEXT,
    "boqItemId" TEXT,
    "claimItemId" TEXT,
    "description" TEXT NOT NULL,
    "measurementDate" DATETIME NOT NULL,
    "measuredBy" TEXT,
    "surveyorName" TEXT,
    "contractQuantity" DECIMAL NOT NULL DEFAULT 0,
    "previousQuantity" DECIMAL NOT NULL DEFAULT 0,
    "currentQuantity" DECIMAL NOT NULL DEFAULT 0,
    "cumulativeQuantity" DECIMAL NOT NULL DEFAULT 0,
    "rejectedQuantity" DECIMAL NOT NULL DEFAULT 0,
    "unit" TEXT,
    "unitRate" DECIMAL NOT NULL DEFAULT 0,
    "previousAmount" DECIMAL NOT NULL DEFAULT 0,
    "currentAmount" DECIMAL NOT NULL DEFAULT 0,
    "cumulativeAmount" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "certifiedQuantity" DECIMAL NOT NULL DEFAULT 0,
    "certifiedAmount" DECIMAL NOT NULL DEFAULT 0,
    "certifiedDate" DATETIME,
    "certifiedBy" TEXT,
    "rejectionReason" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Measurement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Measurement_wbsElementId_fkey" FOREIGN KEY ("wbsElementId") REFERENCES "WBSElement" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Measurement_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BOQItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Measurement_claimItemId_fkey" FOREIGN KEY ("claimItemId") REFERENCES "ClaimItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClaimCertification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "claimId" TEXT NOT NULL,
    "certifiedBy" TEXT,
    "certificationDate" DATETIME NOT NULL,
    "claimedAmount" DECIMAL NOT NULL DEFAULT 0,
    "certifiedAmount" DECIMAL NOT NULL DEFAULT 0,
    "deductedAmount" DECIMAL NOT NULL DEFAULT 0,
    "retentionAmount" DECIMAL NOT NULL DEFAULT 0,
    "advanceDeduction" DECIMAL NOT NULL DEFAULT 0,
    "penaltyAmount" DECIMAL NOT NULL DEFAULT 0,
    "otherDeductions" DECIMAL NOT NULL DEFAULT 0,
    "netPayable" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'CERTIFIED',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClaimCertification_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ProgressClaim" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WIPEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "wbsElementId" TEXT,
    "entryDate" DATETIME NOT NULL,
    "costsIncurred" DECIMAL NOT NULL DEFAULT 0,
    "progressPercent" DECIMAL NOT NULL DEFAULT 0,
    "revenueRecognized" DECIMAL NOT NULL DEFAULT 0,
    "grossProfit" DECIMAL NOT NULL DEFAULT 0,
    "journalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WIPEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WIPAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "adjustmentDate" DATETIME NOT NULL,
    "adjustmentType" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "reason" TEXT,
    "journalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WIPAdjustment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectBudget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "budgetType" TEXT NOT NULL DEFAULT 'ORIGINAL',
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "approvedDate" DATETIME NOT NULL,
    "approvedBy" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectBudget_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectBudgetLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "budgetId" TEXT NOT NULL,
    "wbsElementId" TEXT,
    "costCodeId" TEXT,
    "description" TEXT,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectBudgetLine_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "ProjectBudget" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectForecast" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "forecastDate" DATETIME NOT NULL,
    "contractValue" DECIMAL NOT NULL DEFAULT 0,
    "estimatedTotalCost" DECIMAL NOT NULL DEFAULT 0,
    "costsIncurredToDate" DECIMAL NOT NULL DEFAULT 0,
    "costsToComplete" DECIMAL NOT NULL DEFAULT 0,
    "expectedProfit" DECIMAL NOT NULL DEFAULT 0,
    "expectedLoss" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "pv" DECIMAL NOT NULL DEFAULT 0,
    "ev" DECIMAL NOT NULL DEFAULT 0,
    "ac" DECIMAL NOT NULL DEFAULT 0,
    "bac" DECIMAL NOT NULL DEFAULT 0,
    "etc" DECIMAL NOT NULL DEFAULT 0,
    "eac" DECIMAL NOT NULL DEFAULT 0,
    "vac" DECIMAL NOT NULL DEFAULT 0,
    "cpi" DECIMAL NOT NULL DEFAULT 0,
    "spi" DECIMAL NOT NULL DEFAULT 0,
    "cv" DECIMAL NOT NULL DEFAULT 0,
    "sv" DECIMAL NOT NULL DEFAULT 0,
    "percentComplete" DECIMAL NOT NULL DEFAULT 0,
    "percentSpent" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectForecast_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LossProvision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "provisionDate" DATETIME NOT NULL,
    "amount" DECIMAL NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "journalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LossProvision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomerAdvance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "advanceNo" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "amount" DECIMAL NOT NULL,
    "recoveredAmount" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "journalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerAdvance_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CustomerAdvance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdvanceRecovery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerAdvanceId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "date" DATETIME NOT NULL,
    "amount" DECIMAL NOT NULL,
    "notes" TEXT,
    "journalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inventoryItemId" TEXT NOT NULL,
    "movementType" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "unitCost" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "movementDate" DATETIME NOT NULL,
    "reference" TEXT,
    "journalEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Branch_code_key" ON "Branch"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

-- CreateIndex
CREATE INDEX "Warehouse_branchId_idx" ON "Warehouse"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "Currency_code_key" ON "Currency"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CostCenter_code_key" ON "CostCenter"("code");

-- CreateIndex
CREATE INDEX "CostCenter_parentId_idx" ON "CostCenter"("parentId");

-- CreateIndex
CREATE INDEX "CostCenter_isActive_idx" ON "CostCenter"("isActive");

-- CreateIndex
CREATE INDEX "Attachment_entityType_entityId_idx" ON "Attachment"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalYear_name_key" ON "FiscalYear"("name");

-- CreateIndex
CREATE INDEX "FiscalYear_status_idx" ON "FiscalYear"("status");

-- CreateIndex
CREATE INDEX "FiscalYear_startDate_endDate_idx" ON "FiscalYear"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "FiscalYear_closingJournalEntryId_idx" ON "FiscalYear"("closingJournalEntryId");

-- CreateIndex
CREATE INDEX "FiscalYear_openingJournalEntryId_idx" ON "FiscalYear"("openingJournalEntryId");

-- CreateIndex
CREATE INDEX "FiscalPeriod_fiscalYearId_idx" ON "FiscalPeriod"("fiscalYearId");

-- CreateIndex
CREATE INDEX "FiscalPeriod_status_idx" ON "FiscalPeriod"("status");

-- CreateIndex
CREATE INDEX "FiscalPeriod_startDate_endDate_idx" ON "FiscalPeriod"("startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalPeriod_fiscalYearId_periodNo_key" ON "FiscalPeriod"("fiscalYearId", "periodNo");

-- CreateIndex
CREATE UNIQUE INDEX "Client_code_key" ON "Client"("code");

-- CreateIndex
CREATE INDEX "Client_isActive_idx" ON "Client"("isActive");

-- CreateIndex
CREATE INDEX "Client_deletedAt_idx" ON "Client"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier"("code");

-- CreateIndex
CREATE INDEX "Supplier_isActive_idx" ON "Supplier"("isActive");

-- CreateIndex
CREATE INDEX "Supplier_deletedAt_idx" ON "Supplier"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Subcontractor_code_key" ON "Subcontractor"("code");

-- CreateIndex
CREATE INDEX "Subcontractor_isActive_idx" ON "Subcontractor"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_code_key" ON "Employee"("code");

-- CreateIndex
CREATE INDEX "Employee_branchId_idx" ON "Employee"("branchId");

-- CreateIndex
CREATE INDEX "Employee_expenseAccountId_idx" ON "Employee"("expenseAccountId");

-- CreateIndex
CREATE INDEX "Employee_status_idx" ON "Employee"("status");

-- CreateIndex
CREATE INDEX "Employee_isActive_idx" ON "Employee"("isActive");

-- CreateIndex
CREATE INDEX "EmployeeContract_employeeId_idx" ON "EmployeeContract"("employeeId");

-- CreateIndex
CREATE INDEX "Attendance_employeeId_idx" ON "Attendance"("employeeId");

-- CreateIndex
CREATE INDEX "Attendance_date_idx" ON "Attendance"("date");

-- CreateIndex
CREATE INDEX "Attendance_employeeId_date_idx" ON "Attendance"("employeeId", "date");

-- CreateIndex
CREATE INDEX "Salary_employeeId_idx" ON "Salary"("employeeId");

-- CreateIndex
CREATE INDEX "Salary_projectId_idx" ON "Salary"("projectId");

-- CreateIndex
CREATE INDEX "Salary_status_idx" ON "Salary"("status");

-- CreateIndex
CREATE INDEX "Salary_year_month_idx" ON "Salary"("year", "month");

-- CreateIndex
CREATE INDEX "Salary_journalEntryId_idx" ON "Salary"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkTeam_code_key" ON "WorkTeam"("code");

-- CreateIndex
CREATE INDEX "WorkTeam_projectId_idx" ON "WorkTeam"("projectId");

-- CreateIndex
CREATE INDEX "WorkTeam_isActive_idx" ON "WorkTeam"("isActive");

-- CreateIndex
CREATE INDEX "TeamMember_teamId_idx" ON "TeamMember"("teamId");

-- CreateIndex
CREATE INDEX "TeamMember_employeeId_idx" ON "TeamMember"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_code_key" ON "PayrollRun"("code");

-- CreateIndex
CREATE INDEX "PayrollRun_month_year_idx" ON "PayrollRun"("month", "year");

-- CreateIndex
CREATE INDEX "PayrollRun_status_idx" ON "PayrollRun"("status");

-- CreateIndex
CREATE INDEX "PayrollRun_year_idx" ON "PayrollRun"("year");

-- CreateIndex
CREATE INDEX "PayrollRun_journalEntryId_idx" ON "PayrollRun"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_year_month_key" ON "PayrollRun"("year", "month");

-- CreateIndex
CREATE INDEX "PayrollRunLine_payrollRunId_idx" ON "PayrollRunLine"("payrollRunId");

-- CreateIndex
CREATE INDEX "PayrollRunLine_employeeId_idx" ON "PayrollRunLine"("employeeId");

-- CreateIndex
CREATE INDEX "PayrollRunLine_projectId_idx" ON "PayrollRunLine"("projectId");

-- CreateIndex
CREATE INDEX "PayrollRunLine_workTeamId_idx" ON "PayrollRunLine"("workTeamId");

-- CreateIndex
CREATE INDEX "PayrollRunLine_salaryType_idx" ON "PayrollRunLine"("salaryType");

-- CreateIndex
CREATE INDEX "SalaryPayment_payrollRunId_idx" ON "SalaryPayment"("payrollRunId");

-- CreateIndex
CREATE INDEX "SalaryPayment_employeeId_idx" ON "SalaryPayment"("employeeId");

-- CreateIndex
CREATE INDEX "SalaryPayment_paymentDate_idx" ON "SalaryPayment"("paymentDate");

-- CreateIndex
CREATE INDEX "SalaryPayment_journalEntryId_idx" ON "SalaryPayment"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE INDEX "Project_branchId_idx" ON "Project"("branchId");

-- CreateIndex
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");

-- CreateIndex
CREATE INDEX "Project_costCenterId_idx" ON "Project"("costCenterId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_projectType_idx" ON "Project"("projectType");

-- CreateIndex
CREATE INDEX "Project_clientId_status_idx" ON "Project"("clientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_contractNo_key" ON "Contract"("contractNo");

-- CreateIndex
CREATE INDEX "Contract_projectId_idx" ON "Contract"("projectId");

-- CreateIndex
CREATE INDEX "Contract_clientId_idx" ON "Contract"("clientId");

-- CreateIndex
CREATE INDEX "Contract_status_idx" ON "Contract"("status");

-- CreateIndex
CREATE INDEX "Contract_contractType_idx" ON "Contract"("contractType");

-- CreateIndex
CREATE INDEX "Contract_projectId_status_idx" ON "Contract"("projectId", "status");

-- CreateIndex
CREATE INDEX "Contract_date_idx" ON "Contract"("date");

-- CreateIndex
CREATE INDEX "Contract_journalEntryId_idx" ON "Contract"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeOrder_orderNo_key" ON "ChangeOrder"("orderNo");

-- CreateIndex
CREATE INDEX "ChangeOrder_projectId_idx" ON "ChangeOrder"("projectId");

-- CreateIndex
CREATE INDEX "ChangeOrder_contractId_idx" ON "ChangeOrder"("contractId");

-- CreateIndex
CREATE INDEX "ChangeOrder_status_idx" ON "ChangeOrder"("status");

-- CreateIndex
CREATE INDEX "ChangeOrder_date_idx" ON "ChangeOrder"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Warranty_referenceNo_key" ON "Warranty"("referenceNo");

-- CreateIndex
CREATE INDEX "Warranty_projectId_idx" ON "Warranty"("projectId");

-- CreateIndex
CREATE INDEX "Warranty_contractId_idx" ON "Warranty"("contractId");

-- CreateIndex
CREATE INDEX "Warranty_status_idx" ON "Warranty"("status");

-- CreateIndex
CREATE INDEX "Warranty_endDate_idx" ON "Warranty"("endDate");

-- CreateIndex
CREATE INDEX "BOQItem_projectId_idx" ON "BOQItem"("projectId");

-- CreateIndex
CREATE INDEX "BOQItem_code_idx" ON "BOQItem"("code");

-- CreateIndex
CREATE INDEX "BOQItem_wbsElementId_idx" ON "BOQItem"("wbsElementId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressClaim_claimNo_key" ON "ProgressClaim"("claimNo");

-- CreateIndex
CREATE INDEX "ProgressClaim_projectId_idx" ON "ProgressClaim"("projectId");

-- CreateIndex
CREATE INDEX "ProgressClaim_contractId_idx" ON "ProgressClaim"("contractId");

-- CreateIndex
CREATE INDEX "ProgressClaim_status_idx" ON "ProgressClaim"("status");

-- CreateIndex
CREATE INDEX "ProgressClaim_date_idx" ON "ProgressClaim"("date");

-- CreateIndex
CREATE INDEX "ProgressClaim_projectId_status_idx" ON "ProgressClaim"("projectId", "status");

-- CreateIndex
CREATE INDEX "ProgressClaim_journalEntryId_idx" ON "ProgressClaim"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoice_invoiceNo_key" ON "SalesInvoice"("invoiceNo");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoice_timesheetId_key" ON "SalesInvoice"("timesheetId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoice_progressClaimId_key" ON "SalesInvoice"("progressClaimId");

-- CreateIndex
CREATE INDEX "SalesInvoice_projectId_idx" ON "SalesInvoice"("projectId");

-- CreateIndex
CREATE INDEX "SalesInvoice_contractId_idx" ON "SalesInvoice"("contractId");

-- CreateIndex
CREATE INDEX "SalesInvoice_clientId_idx" ON "SalesInvoice"("clientId");

-- CreateIndex
CREATE INDEX "SalesInvoice_status_idx" ON "SalesInvoice"("status");

-- CreateIndex
CREATE INDEX "SalesInvoice_date_idx" ON "SalesInvoice"("date");

-- CreateIndex
CREATE INDEX "SalesInvoice_clientId_status_idx" ON "SalesInvoice"("clientId", "status");

-- CreateIndex
CREATE INDEX "SalesInvoice_projectId_status_idx" ON "SalesInvoice"("projectId", "status");

-- CreateIndex
CREATE INDEX "SalesInvoice_invoiceType_idx" ON "SalesInvoice"("invoiceType");

-- CreateIndex
CREATE INDEX "SalesInvoice_journalEntryId_idx" ON "SalesInvoice"("journalEntryId");

-- CreateIndex
CREATE INDEX "SalesInvoiceItem_invoiceId_idx" ON "SalesInvoiceItem"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequest_requestNo_key" ON "PurchaseRequest"("requestNo");

-- CreateIndex
CREATE INDEX "PurchaseRequest_projectId_idx" ON "PurchaseRequest"("projectId");

-- CreateIndex
CREATE INDEX "PurchaseRequest_status_idx" ON "PurchaseRequest"("status");

-- CreateIndex
CREATE INDEX "PurchaseRequest_date_idx" ON "PurchaseRequest"("date");

-- CreateIndex
CREATE INDEX "PurchaseRequestItem_requestId_idx" ON "PurchaseRequestItem"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_orderNo_key" ON "PurchaseOrder"("orderNo");

-- CreateIndex
CREATE INDEX "PurchaseOrder_projectId_idx" ON "PurchaseOrder"("projectId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_purchaseRequestId_idx" ON "PurchaseOrder"("purchaseRequestId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_date_idx" ON "PurchaseOrder"("date");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_status_idx" ON "PurchaseOrder"("supplierId", "status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_projectId_status_idx" ON "PurchaseOrder"("projectId", "status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_journalEntryId_idx" ON "PurchaseOrder"("journalEntryId");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_orderId_idx" ON "PurchaseOrderItem"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceipt_receiptNo_key" ON "GoodsReceipt"("receiptNo");

-- CreateIndex
CREATE INDEX "GoodsReceipt_purchaseOrderId_idx" ON "GoodsReceipt"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "GoodsReceipt_supplierId_idx" ON "GoodsReceipt"("supplierId");

-- CreateIndex
CREATE INDEX "GoodsReceipt_projectId_idx" ON "GoodsReceipt"("projectId");

-- CreateIndex
CREATE INDEX "GoodsReceipt_status_idx" ON "GoodsReceipt"("status");

-- CreateIndex
CREATE INDEX "GoodsReceipt_date_idx" ON "GoodsReceipt"("date");

-- CreateIndex
CREATE INDEX "GoodsReceipt_journalEntryId_idx" ON "GoodsReceipt"("journalEntryId");

-- CreateIndex
CREATE INDEX "GoodsReceiptItem_goodsReceiptId_idx" ON "GoodsReceiptItem"("goodsReceiptId");

-- CreateIndex
CREATE INDEX "GoodsReceiptItem_inventoryItemId_idx" ON "GoodsReceiptItem"("inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseInvoice_invoiceNo_key" ON "PurchaseInvoice"("invoiceNo");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseInvoice_goodsReceiptId_key" ON "PurchaseInvoice"("goodsReceiptId");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_purchaseOrderId_idx" ON "PurchaseInvoice"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_goodsReceiptId_idx" ON "PurchaseInvoice"("goodsReceiptId");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_supplierId_idx" ON "PurchaseInvoice"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_projectId_idx" ON "PurchaseInvoice"("projectId");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_equipmentId_idx" ON "PurchaseInvoice"("equipmentId");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_status_idx" ON "PurchaseInvoice"("status");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_date_idx" ON "PurchaseInvoice"("date");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_supplierId_status_idx" ON "PurchaseInvoice"("supplierId", "status");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_journalEntryId_idx" ON "PurchaseInvoice"("journalEntryId");

-- CreateIndex
CREATE INDEX "PurchaseInvoiceItem_invoiceId_idx" ON "PurchaseInvoiceItem"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "SubcontractorContract_contractNo_key" ON "SubcontractorContract"("contractNo");

-- CreateIndex
CREATE INDEX "SubcontractorContract_subcontractorId_idx" ON "SubcontractorContract"("subcontractorId");

-- CreateIndex
CREATE INDEX "SubcontractorContract_projectId_idx" ON "SubcontractorContract"("projectId");

-- CreateIndex
CREATE INDEX "SubcontractorContract_status_idx" ON "SubcontractorContract"("status");

-- CreateIndex
CREATE INDEX "SubcontractorContract_projectId_status_idx" ON "SubcontractorContract"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SubcontractorInvoice_invoiceNo_key" ON "SubcontractorInvoice"("invoiceNo");

-- CreateIndex
CREATE INDEX "SubcontractorInvoice_subcontractorId_idx" ON "SubcontractorInvoice"("subcontractorId");

-- CreateIndex
CREATE INDEX "SubcontractorInvoice_projectId_idx" ON "SubcontractorInvoice"("projectId");

-- CreateIndex
CREATE INDEX "SubcontractorInvoice_status_idx" ON "SubcontractorInvoice"("status");

-- CreateIndex
CREATE INDEX "SubcontractorInvoice_date_idx" ON "SubcontractorInvoice"("date");

-- CreateIndex
CREATE INDEX "SubcontractorInvoice_subcontractorId_status_idx" ON "SubcontractorInvoice"("subcontractorId", "status");

-- CreateIndex
CREATE INDEX "SubcontractorInvoice_journalEntryId_idx" ON "SubcontractorInvoice"("journalEntryId");

-- CreateIndex
CREATE INDEX "Expense_projectId_idx" ON "Expense"("projectId");

-- CreateIndex
CREATE INDEX "Expense_equipmentId_idx" ON "Expense"("equipmentId");

-- CreateIndex
CREATE INDEX "Expense_costCenterId_idx" ON "Expense"("costCenterId");

-- CreateIndex
CREATE INDEX "Expense_category_idx" ON "Expense"("category");

-- CreateIndex
CREATE INDEX "Expense_date_idx" ON "Expense"("date");

-- CreateIndex
CREATE INDEX "Expense_expenseType_idx" ON "Expense"("expenseType");

-- CreateIndex
CREATE INDEX "Expense_journalEntryId_idx" ON "Expense"("journalEntryId");

-- CreateIndex
CREATE INDEX "LaborCost_projectId_idx" ON "LaborCost"("projectId");

-- CreateIndex
CREATE INDEX "LaborCost_employeeId_idx" ON "LaborCost"("employeeId");

-- CreateIndex
CREATE INDEX "LaborCost_date_idx" ON "LaborCost"("date");

-- CreateIndex
CREATE INDEX "LaborCost_journalEntryId_idx" ON "LaborCost"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_code_key" ON "Equipment"("code");

-- CreateIndex
CREATE INDEX "Equipment_supplierId_idx" ON "Equipment"("supplierId");

-- CreateIndex
CREATE INDEX "Equipment_assetAccountId_idx" ON "Equipment"("assetAccountId");

-- CreateIndex
CREATE INDEX "Equipment_status_idx" ON "Equipment"("status");

-- CreateIndex
CREATE INDEX "Equipment_isActive_idx" ON "Equipment"("isActive");

-- CreateIndex
CREATE INDEX "Equipment_ownershipType_idx" ON "Equipment"("ownershipType");

-- CreateIndex
CREATE INDEX "Equipment_journalEntryId_idx" ON "Equipment"("journalEntryId");

-- CreateIndex
CREATE INDEX "EquipmentOperation_equipmentId_idx" ON "EquipmentOperation"("equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentOperation_operatorId_idx" ON "EquipmentOperation"("operatorId");

-- CreateIndex
CREATE INDEX "EquipmentOperation_projectId_idx" ON "EquipmentOperation"("projectId");

-- CreateIndex
CREATE INDEX "EquipmentOperation_date_idx" ON "EquipmentOperation"("date");

-- CreateIndex
CREATE INDEX "EquipmentUsage_equipmentId_idx" ON "EquipmentUsage"("equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentUsage_projectId_idx" ON "EquipmentUsage"("projectId");

-- CreateIndex
CREATE INDEX "EquipmentUsage_date_idx" ON "EquipmentUsage"("date");

-- CreateIndex
CREATE INDEX "EquipmentMaintenance_equipmentId_idx" ON "EquipmentMaintenance"("equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentMaintenance_supplierId_idx" ON "EquipmentMaintenance"("supplierId");

-- CreateIndex
CREATE INDEX "EquipmentMaintenance_date_idx" ON "EquipmentMaintenance"("date");

-- CreateIndex
CREATE INDEX "EquipmentMaintenance_status_idx" ON "EquipmentMaintenance"("status");

-- CreateIndex
CREATE INDEX "EquipmentMaintenance_journalEntryId_idx" ON "EquipmentMaintenance"("journalEntryId");

-- CreateIndex
CREATE INDEX "EquipmentFuelLog_equipmentId_idx" ON "EquipmentFuelLog"("equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentFuelLog_projectId_idx" ON "EquipmentFuelLog"("projectId");

-- CreateIndex
CREATE INDEX "EquipmentFuelLog_date_idx" ON "EquipmentFuelLog"("date");

-- CreateIndex
CREATE INDEX "EquipmentFuelLog_journalEntryId_idx" ON "EquipmentFuelLog"("journalEntryId");

-- CreateIndex
CREATE INDEX "EquipmentCost_projectId_idx" ON "EquipmentCost"("projectId");

-- CreateIndex
CREATE INDEX "EquipmentCost_date_idx" ON "EquipmentCost"("date");

-- CreateIndex
CREATE INDEX "EquipmentCost_costType_idx" ON "EquipmentCost"("costType");

-- CreateIndex
CREATE INDEX "EquipmentCost_journalEntryId_idx" ON "EquipmentCost"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentRental_contractId_key" ON "EquipmentRental"("contractId");

-- CreateIndex
CREATE INDEX "EquipmentRental_contractId_idx" ON "EquipmentRental"("contractId");

-- CreateIndex
CREATE INDEX "EquipmentRental_equipmentId_idx" ON "EquipmentRental"("equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentRental_clientId_idx" ON "EquipmentRental"("clientId");

-- CreateIndex
CREATE INDEX "EquipmentRental_projectId_idx" ON "EquipmentRental"("projectId");

-- CreateIndex
CREATE INDEX "EquipmentRental_status_idx" ON "EquipmentRental"("status");

-- CreateIndex
CREATE INDEX "EquipmentRental_clientId_status_idx" ON "EquipmentRental"("clientId", "status");

-- CreateIndex
CREATE INDEX "EquipmentRental_equipmentId_status_idx" ON "EquipmentRental"("equipmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentDeliveryOrder_orderNo_key" ON "EquipmentDeliveryOrder"("orderNo");

-- CreateIndex
CREATE INDEX "EquipmentDeliveryOrder_rentalId_idx" ON "EquipmentDeliveryOrder"("rentalId");

-- CreateIndex
CREATE INDEX "EquipmentDeliveryOrder_equipmentId_idx" ON "EquipmentDeliveryOrder"("equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentDeliveryOrder_clientId_idx" ON "EquipmentDeliveryOrder"("clientId");

-- CreateIndex
CREATE INDEX "EquipmentDeliveryOrder_projectId_idx" ON "EquipmentDeliveryOrder"("projectId");

-- CreateIndex
CREATE INDEX "EquipmentDeliveryOrder_status_idx" ON "EquipmentDeliveryOrder"("status");

-- CreateIndex
CREATE INDEX "EquipmentDeliveryOrder_deliveryDate_idx" ON "EquipmentDeliveryOrder"("deliveryDate");

-- CreateIndex
CREATE INDEX "EquipmentExpense_equipmentId_idx" ON "EquipmentExpense"("equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentExpense_category_idx" ON "EquipmentExpense"("category");

-- CreateIndex
CREATE INDEX "EquipmentExpense_date_idx" ON "EquipmentExpense"("date");

-- CreateIndex
CREATE INDEX "EquipmentExpense_journalEntryId_idx" ON "EquipmentExpense"("journalEntryId");

-- CreateIndex
CREATE INDEX "Timesheet_rentalId_idx" ON "Timesheet"("rentalId");

-- CreateIndex
CREATE INDEX "Timesheet_deliveryOrderId_idx" ON "Timesheet"("deliveryOrderId");

-- CreateIndex
CREATE INDEX "Timesheet_contractId_idx" ON "Timesheet"("contractId");

-- CreateIndex
CREATE INDEX "Timesheet_projectId_idx" ON "Timesheet"("projectId");

-- CreateIndex
CREATE INDEX "Timesheet_equipmentId_idx" ON "Timesheet"("equipmentId");

-- CreateIndex
CREATE INDEX "Timesheet_status_idx" ON "Timesheet"("status");

-- CreateIndex
CREATE INDEX "Timesheet_year_month_idx" ON "Timesheet"("year", "month");

-- CreateIndex
CREATE INDEX "Timesheet_invoiced_idx" ON "Timesheet"("invoiced");

-- CreateIndex
CREATE UNIQUE INDEX "Timesheet_rentalId_year_month_key" ON "Timesheet"("rentalId", "year", "month");

-- CreateIndex
CREATE INDEX "PettyCash_branchId_idx" ON "PettyCash"("branchId");

-- CreateIndex
CREATE INDEX "PettyCash_date_idx" ON "PettyCash"("date");

-- CreateIndex
CREATE INDEX "PettyCash_category_idx" ON "PettyCash"("category");

-- CreateIndex
CREATE INDEX "PettyCash_journalEntryId_idx" ON "PettyCash"("journalEntryId");

-- CreateIndex
CREATE INDEX "EmployeeAdvance_employeeId_idx" ON "EmployeeAdvance"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeAdvance_status_idx" ON "EmployeeAdvance"("status");

-- CreateIndex
CREATE INDEX "EmployeeAdvance_date_idx" ON "EmployeeAdvance"("date");

-- CreateIndex
CREATE INDEX "EmployeeAdvance_journalEntryId_idx" ON "EmployeeAdvance"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_code_key" ON "InventoryItem"("code");

-- CreateIndex
CREATE INDEX "InventoryItem_warehouseId_idx" ON "InventoryItem"("warehouseId");

-- CreateIndex
CREATE INDEX "InventoryItem_category_idx" ON "InventoryItem"("category");

-- CreateIndex
CREATE INDEX "InventoryItem_isActive_idx" ON "InventoryItem"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Account_code_key" ON "Account"("code");

-- CreateIndex
CREATE INDEX "Account_parentId_idx" ON "Account"("parentId");

-- CreateIndex
CREATE INDEX "Account_type_idx" ON "Account"("type");

-- CreateIndex
CREATE INDEX "Account_isActive_idx" ON "Account"("isActive");

-- CreateIndex
CREATE INDEX "Account_activityType_idx" ON "Account"("activityType");

-- CreateIndex
CREATE INDEX "Account_accountRole_idx" ON "Account"("accountRole");

-- CreateIndex
CREATE INDEX "Account_parentCode_idx" ON "Account"("parentCode");

-- CreateIndex
CREATE INDEX "Account_usableInExpenses_idx" ON "Account"("usableInExpenses");

-- CreateIndex
CREATE INDEX "Account_usableInFuel_idx" ON "Account"("usableInFuel");

-- CreateIndex
CREATE INDEX "Account_usableInMaintenance_idx" ON "Account"("usableInMaintenance");

-- CreateIndex
CREATE INDEX "Account_usableInPayroll_idx" ON "Account"("usableInPayroll");

-- CreateIndex
CREATE INDEX "Account_usableInProjects_idx" ON "Account"("usableInProjects");

-- CreateIndex
CREATE INDEX "Account_usableInRental_idx" ON "Account"("usableInRental");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_entryNo_key" ON "JournalEntry"("entryNo");

-- CreateIndex
CREATE INDEX "JournalEntry_status_idx" ON "JournalEntry"("status");

-- CreateIndex
CREATE INDEX "JournalEntry_date_idx" ON "JournalEntry"("date");

-- CreateIndex
CREATE INDEX "JournalEntry_sourceType_sourceId_idx" ON "JournalEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "JournalEntry_reversedEntryId_idx" ON "JournalEntry"("reversedEntryId");

-- CreateIndex
CREATE INDEX "JournalEntry_isSystem_idx" ON "JournalEntry"("isSystem");

-- CreateIndex
CREATE INDEX "JournalLine_journalEntryId_idx" ON "JournalLine"("journalEntryId");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");

-- CreateIndex
CREATE INDEX "JournalLine_costCenterId_idx" ON "JournalLine"("costCenterId");

-- CreateIndex
CREATE INDEX "VATReturn_status_idx" ON "VATReturn"("status");

-- CreateIndex
CREATE INDEX "VATReturn_year_quarter_idx" ON "VATReturn"("year", "quarter");

-- CreateIndex
CREATE INDEX "VATReturn_period_idx" ON "VATReturn"("period");

-- CreateIndex
CREATE INDEX "VATReturn_amendedFromId_idx" ON "VATReturn"("amendedFromId");

-- CreateIndex
CREATE INDEX "VATReturn_journalEntryId_idx" ON "VATReturn"("journalEntryId");

-- CreateIndex
CREATE INDEX "ClientPayment_clientId_idx" ON "ClientPayment"("clientId");

-- CreateIndex
CREATE INDEX "ClientPayment_invoiceId_idx" ON "ClientPayment"("invoiceId");

-- CreateIndex
CREATE INDEX "ClientPayment_date_idx" ON "ClientPayment"("date");

-- CreateIndex
CREATE INDEX "ClientPayment_clientId_date_idx" ON "ClientPayment"("clientId", "date");

-- CreateIndex
CREATE INDEX "ClientPayment_paymentType_idx" ON "ClientPayment"("paymentType");

-- CreateIndex
CREATE INDEX "ClientPayment_journalEntryId_idx" ON "ClientPayment"("journalEntryId");

-- CreateIndex
CREATE INDEX "SupplierPayment_supplierId_idx" ON "SupplierPayment"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierPayment_date_idx" ON "SupplierPayment"("date");

-- CreateIndex
CREATE INDEX "SupplierPayment_supplierId_date_idx" ON "SupplierPayment"("supplierId", "date");

-- CreateIndex
CREATE INDEX "SupplierPayment_journalEntryId_idx" ON "SupplierPayment"("journalEntryId");

-- CreateIndex
CREATE INDEX "ResourceAllocation_projectId_idx" ON "ResourceAllocation"("projectId");

-- CreateIndex
CREATE INDEX "ResourceAllocation_resourceType_idx" ON "ResourceAllocation"("resourceType");

-- CreateIndex
CREATE UNIQUE INDEX "FixedAsset_assetCode_key" ON "FixedAsset"("assetCode");

-- CreateIndex
CREATE INDEX "FixedAsset_status_idx" ON "FixedAsset"("status");

-- CreateIndex
CREATE INDEX "FixedAsset_category_idx" ON "FixedAsset"("category");

-- CreateIndex
CREATE INDEX "FixedAsset_accountId_idx" ON "FixedAsset"("accountId");

-- CreateIndex
CREATE INDEX "FixedAsset_depExpenseAccountId_idx" ON "FixedAsset"("depExpenseAccountId");

-- CreateIndex
CREATE INDEX "FixedAsset_accumDepAccountId_idx" ON "FixedAsset"("accumDepAccountId");

-- CreateIndex
CREATE INDEX "FixedAsset_journalEntryId_idx" ON "FixedAsset"("journalEntryId");

-- CreateIndex
CREATE INDEX "AssetDepreciation_fixedAssetId_idx" ON "AssetDepreciation"("fixedAssetId");

-- CreateIndex
CREATE INDEX "AssetDepreciation_year_month_idx" ON "AssetDepreciation"("year", "month");

-- CreateIndex
CREATE INDEX "AssetDepreciation_journalEntryId_idx" ON "AssetDepreciation"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetDepreciation_fixedAssetId_year_month_key" ON "AssetDepreciation"("fixedAssetId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "Provision_code_key" ON "Provision"("code");

-- CreateIndex
CREATE INDEX "Provision_status_idx" ON "Provision"("status");

-- CreateIndex
CREATE INDEX "Provision_type_idx" ON "Provision"("type");

-- CreateIndex
CREATE INDEX "Provision_journalEntryId_idx" ON "Provision"("journalEntryId");

-- CreateIndex
CREATE INDEX "ProvisionMovement_provisionId_idx" ON "ProvisionMovement"("provisionId");

-- CreateIndex
CREATE INDEX "ProvisionMovement_date_idx" ON "ProvisionMovement"("date");

-- CreateIndex
CREATE INDEX "ProvisionMovement_journalEntryId_idx" ON "ProvisionMovement"("journalEntryId");

-- CreateIndex
CREATE INDEX "BankAccount_accountId_idx" ON "BankAccount"("accountId");

-- CreateIndex
CREATE INDEX "BankAccount_isActive_idx" ON "BankAccount"("isActive");

-- CreateIndex
CREATE INDEX "BankTransaction_bankAccountId_idx" ON "BankTransaction"("bankAccountId");

-- CreateIndex
CREATE INDEX "BankTransaction_date_idx" ON "BankTransaction"("date");

-- CreateIndex
CREATE INDEX "BankTransaction_reconciled_idx" ON "BankTransaction"("reconciled");

-- CreateIndex
CREATE INDEX "BankTransaction_journalEntryId_idx" ON "BankTransaction"("journalEntryId");

-- CreateIndex
CREATE INDEX "BankReconciliation_bankAccountId_idx" ON "BankReconciliation"("bankAccountId");

-- CreateIndex
CREATE INDEX "BankReconciliation_year_month_idx" ON "BankReconciliation"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "BankReconciliation_bankAccountId_year_month_key" ON "BankReconciliation"("bankAccountId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialMapping_operationType_key" ON "FinancialMapping"("operationType");

-- CreateIndex
CREATE INDEX "FinancialMapping_operationType_idx" ON "FinancialMapping"("operationType");

-- CreateIndex
CREATE INDEX "FinancialMapping_isActive_idx" ON "FinancialMapping"("isActive");

-- CreateIndex
CREATE INDEX "AccountingHealthCheck_checkDate_idx" ON "AccountingHealthCheck"("checkDate");

-- CreateIndex
CREATE INDEX "AccountingHealthCheck_overallScore_idx" ON "AccountingHealthCheck"("overallScore");

-- CreateIndex
CREATE INDEX "PeriodClosing_status_idx" ON "PeriodClosing"("status");

-- CreateIndex
CREATE INDEX "PeriodClosing_year_month_idx" ON "PeriodClosing"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodClosing_year_month_type_key" ON "PeriodClosing"("year", "month", "type");

-- CreateIndex
CREATE INDEX "WBSElement_projectId_idx" ON "WBSElement"("projectId");

-- CreateIndex
CREATE INDEX "WBSElement_parentId_idx" ON "WBSElement"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "WBSElement_projectId_code_key" ON "WBSElement"("projectId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CostCode_code_key" ON "CostCode"("code");

-- CreateIndex
CREATE INDEX "CostCode_category_idx" ON "CostCode"("category");

-- CreateIndex
CREATE INDEX "CostCode_parentId_idx" ON "CostCode"("parentId");

-- CreateIndex
CREATE INDEX "Activity_projectId_idx" ON "Activity"("projectId");

-- CreateIndex
CREATE INDEX "Activity_wbsElementId_idx" ON "Activity"("wbsElementId");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_projectId_code_key" ON "Activity"("projectId", "code");

-- CreateIndex
CREATE INDEX "CostEntry_projectId_date_idx" ON "CostEntry"("projectId", "date");

-- CreateIndex
CREATE INDEX "CostEntry_costType_idx" ON "CostEntry"("costType");

-- CreateIndex
CREATE INDEX "CostEntry_sourceType_sourceId_idx" ON "CostEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "CostEntry_wbsElementId_costCodeId_idx" ON "CostEntry"("wbsElementId", "costCodeId");

-- CreateIndex
CREATE INDEX "CostEntry_activityId_idx" ON "CostEntry"("activityId");

-- CreateIndex
CREATE INDEX "CostEntry_costCenterId_idx" ON "CostEntry"("costCenterId");

-- CreateIndex
CREATE INDEX "CostEntry_journalEntryId_idx" ON "CostEntry"("journalEntryId");

-- CreateIndex
CREATE INDEX "CostCodeBudget_projectId_idx" ON "CostCodeBudget"("projectId");

-- CreateIndex
CREATE INDEX "CostCodeBudget_costCodeId_idx" ON "CostCodeBudget"("costCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "CostCodeBudget_wbsElementId_costCodeId_key" ON "CostCodeBudget"("wbsElementId", "costCodeId");

-- CreateIndex
CREATE INDEX "ProjectLedger_projectId_entryDate_idx" ON "ProjectLedger"("projectId", "entryDate");

-- CreateIndex
CREATE INDEX "ProjectLedger_ledgerType_idx" ON "ProjectLedger"("ledgerType");

-- CreateIndex
CREATE INDEX "ProjectLedger_wbsElementId_idx" ON "ProjectLedger"("wbsElementId");

-- CreateIndex
CREATE INDEX "ProjectLedger_costCodeId_idx" ON "ProjectLedger"("costCodeId");

-- CreateIndex
CREATE INDEX "ProjectLedger_journalEntryId_idx" ON "ProjectLedger"("journalEntryId");

-- CreateIndex
CREATE INDEX "ProjectLedger_sourceType_sourceId_idx" ON "ProjectLedger"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Commitment_commitmentNo_key" ON "Commitment"("commitmentNo");

-- CreateIndex
CREATE INDEX "Commitment_projectId_idx" ON "Commitment"("projectId");

-- CreateIndex
CREATE INDEX "Commitment_status_idx" ON "Commitment"("status");

-- CreateIndex
CREATE INDEX "CommitmentLine_commitmentId_idx" ON "CommitmentLine"("commitmentId");

-- CreateIndex
CREATE UNIQUE INDEX "SubcontractorAdvance_advanceNo_key" ON "SubcontractorAdvance"("advanceNo");

-- CreateIndex
CREATE INDEX "SubcontractorAdvance_subcontractorId_idx" ON "SubcontractorAdvance"("subcontractorId");

-- CreateIndex
CREATE INDEX "SubcontractorAdvance_projectId_idx" ON "SubcontractorAdvance"("projectId");

-- CreateIndex
CREATE INDEX "SubcontractorAdvance_journalEntryId_idx" ON "SubcontractorAdvance"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "SubcontractorRetention_retentionNo_key" ON "SubcontractorRetention"("retentionNo");

-- CreateIndex
CREATE INDEX "SubcontractorRetention_subcontractorId_idx" ON "SubcontractorRetention"("subcontractorId");

-- CreateIndex
CREATE INDEX "SubcontractorRetention_projectId_idx" ON "SubcontractorRetention"("projectId");

-- CreateIndex
CREATE INDEX "SubcontractorRetention_journalEntryId_idx" ON "SubcontractorRetention"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "SubcontractorPayment_paymentNo_key" ON "SubcontractorPayment"("paymentNo");

-- CreateIndex
CREATE INDEX "SubcontractorPayment_subcontractorId_idx" ON "SubcontractorPayment"("subcontractorId");

-- CreateIndex
CREATE INDEX "SubcontractorPayment_subcontractorInvoiceId_idx" ON "SubcontractorPayment"("subcontractorInvoiceId");

-- CreateIndex
CREATE INDEX "SubcontractorPayment_journalEntryId_idx" ON "SubcontractorPayment"("journalEntryId");

-- CreateIndex
CREATE INDEX "ClaimItem_claimId_idx" ON "ClaimItem"("claimId");

-- CreateIndex
CREATE INDEX "ClaimItem_boqItemId_idx" ON "ClaimItem"("boqItemId");

-- CreateIndex
CREATE INDEX "ClaimItem_wbsElementId_idx" ON "ClaimItem"("wbsElementId");

-- CreateIndex
CREATE UNIQUE INDEX "Measurement_code_key" ON "Measurement"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Measurement_claimItemId_key" ON "Measurement"("claimItemId");

-- CreateIndex
CREATE INDEX "Measurement_projectId_idx" ON "Measurement"("projectId");

-- CreateIndex
CREATE INDEX "Measurement_status_idx" ON "Measurement"("status");

-- CreateIndex
CREATE INDEX "Measurement_wbsElementId_idx" ON "Measurement"("wbsElementId");

-- CreateIndex
CREATE INDEX "Measurement_boqItemId_idx" ON "Measurement"("boqItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimCertification_claimId_key" ON "ClaimCertification"("claimId");

-- CreateIndex
CREATE INDEX "WIPEntry_projectId_entryDate_idx" ON "WIPEntry"("projectId", "entryDate");

-- CreateIndex
CREATE INDEX "WIPEntry_journalEntryId_idx" ON "WIPEntry"("journalEntryId");

-- CreateIndex
CREATE INDEX "WIPAdjustment_projectId_idx" ON "WIPAdjustment"("projectId");

-- CreateIndex
CREATE INDEX "WIPAdjustment_journalEntryId_idx" ON "WIPAdjustment"("journalEntryId");

-- CreateIndex
CREATE INDEX "ProjectBudget_projectId_idx" ON "ProjectBudget"("projectId");

-- CreateIndex
CREATE INDEX "ProjectBudgetLine_budgetId_idx" ON "ProjectBudgetLine"("budgetId");

-- CreateIndex
CREATE INDEX "ProjectForecast_projectId_status_idx" ON "ProjectForecast"("projectId", "status");

-- CreateIndex
CREATE INDEX "LossProvision_projectId_idx" ON "LossProvision"("projectId");

-- CreateIndex
CREATE INDEX "LossProvision_journalEntryId_idx" ON "LossProvision"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAdvance_advanceNo_key" ON "CustomerAdvance"("advanceNo");

-- CreateIndex
CREATE INDEX "CustomerAdvance_clientId_idx" ON "CustomerAdvance"("clientId");

-- CreateIndex
CREATE INDEX "CustomerAdvance_projectId_idx" ON "CustomerAdvance"("projectId");

-- CreateIndex
CREATE INDEX "CustomerAdvance_journalEntryId_idx" ON "CustomerAdvance"("journalEntryId");

-- CreateIndex
CREATE INDEX "AdvanceRecovery_customerAdvanceId_idx" ON "AdvanceRecovery"("customerAdvanceId");

-- CreateIndex
CREATE INDEX "AdvanceRecovery_journalEntryId_idx" ON "AdvanceRecovery"("journalEntryId");

-- CreateIndex
CREATE INDEX "StockMovement_inventoryItemId_idx" ON "StockMovement"("inventoryItemId");

-- CreateIndex
CREATE INDEX "StockMovement_movementDate_idx" ON "StockMovement"("movementDate");

-- CreateIndex
CREATE INDEX "StockMovement_journalEntryId_idx" ON "StockMovement"("journalEntryId");


-- ============================================================
-- P1-4c: Idempotency partial unique indexes
-- Prevents double-posting and double-reversal of journal entries
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS "JournalEntry_source_isReversal_unique"
  ON "JournalEntry" ("sourceType", "sourceId")
  WHERE "isReversal" = false AND "sourceId" IS NOT NULL AND "deletedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "JournalEntry_reversedEntryId_unique"
  ON "JournalEntry" ("reversedEntryId")
  WHERE "isReversal" = true AND "reversedEntryId" IS NOT NULL AND "deletedAt" IS NULL;
