import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, ShadingType, WidthType, BorderStyle,
  PageBreak, TableOfContents, NumberFormat, PageNumber, Header, Footer,
  ImageRun, Tab, TabStopType, TabStopPosition
} from "docx";
import * as fs from "fs";

// ── Color Palette ──
const C = {
  primary: "1B4332",      // Deep green (construction theme)
  accent: "2D6A4F",       // Medium green
  accent2: "40916C",      // Light green
  body: "1A1A2E",         // Near black
  secondary: "4A5568",    // Gray
  surface: "F0FFF4",      // Very light green
  white: "FFFFFF",
  tableBg: "E8F5E9",      // Light green for table headers
  tableBg2: "F1F8F4",     // Alt row
  border: "C8E6C9",       // Light border
  gold: "B7791F",         // Gold accent
  red: "C53030",          // Warning red
  blue: "2B6CB0",         // Info blue
};

// ── Helper Functions ──
function heading1(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 200 },
    keepNext: true,
    children: [
      new TextRun({
        text,
        bold: true,
        size: 36,
        font: "Calibri",
        color: C.primary,
      }),
    ],
  });
}

function heading2(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 160 },
    keepNext: true,
    children: [
      new TextRun({
        text,
        bold: true,
        size: 30,
        font: "Calibri",
        color: C.accent,
      }),
    ],
  });
}

function heading3(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 120 },
    keepNext: true,
    children: [
      new TextRun({
        text,
        bold: true,
        size: 26,
        font: "Calibri",
        color: C.accent2,
      }),
    ],
  });
}

function para(text: string, opts?: { bold?: boolean; color?: string; indent?: boolean }): Paragraph {
  return new Paragraph({
    spacing: { after: 120, line: 312 },
    alignment: AlignmentType.RIGHT,
    bidirectional: true,
    indent: opts?.indent ? { firstLine: 420 } : undefined,
    children: [
      new TextRun({
        text,
        bold: opts?.bold || false,
        size: 22,
        font: "Calibri",
        color: opts?.color || C.body,
        rightToLeft: true,
      }),
    ],
  });
}

function bullet(text: string, level: number = 0): Paragraph {
  return new Paragraph({
    spacing: { after: 80, line: 312 },
    alignment: AlignmentType.RIGHT,
    bidirectional: true,
    indent: { left: 600 + level * 400 },
    children: [
      new TextRun({
        text: level === 0 ? "● " : "○ ",
        size: 18,
        font: "Calibri",
        color: C.accent,
      }),
      new TextRun({
        text,
        size: 22,
        font: "Calibri",
        color: C.body,
        rightToLeft: true,
      }),
    ],
  });
}

function spacer(h: number = 100): Paragraph {
  return new Paragraph({ spacing: { after: h } });
}

function pageBreak(): Paragraph {
  return new Paragraph({ children: [new PageBreak()] });
}

// ── Table Helper ──
interface ColDef {
  text: string;
  width: number;
  shading?: string;
  align?: typeof AlignmentType[keyof typeof AlignmentType];
}

function makeRow(cols: ColDef[], isHeader: boolean = false): TableRow {
  return new TableRow({
    tableHeader: isHeader,
    cantSplit: true,
    children: cols.map((c) =>
      new TableCell({
        width: { size: c.width, type: WidthType.DXA },
        shading: {
          fill: c.shading || (isHeader ? C.tableBg : C.white),
          type: ShadingType.CLEAR,
        },
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [
          new Paragraph({
            alignment: c.align || AlignmentType.CENTER,
            bidirectional: true,
            children: [
              new TextRun({
                text: c.text,
                bold: isHeader,
                size: isHeader ? 21 : 20,
                font: "Calibri",
                color: isHeader ? C.primary : C.body,
                rightToLeft: true,
              }),
            ],
          }),
        ],
      })
    ),
  });
}

function makeTable(headers: ColDef[], rows: ColDef[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: C.border },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: C.border },
      left: { style: BorderStyle.SINGLE, size: 1, color: C.border },
      right: { style: BorderStyle.SINGLE, size: 1, color: C.border },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: C.border },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: C.border },
    },
    rows: [
      makeRow(headers, true),
      ...rows.map((r, i) =>
        makeRow(
          r.map((c) => ({
            ...c,
            shading: c.shading || (i % 2 === 1 ? C.tableBg2 : C.white),
          })),
          false
        )
      ),
    ],
  });
}

// ── Journal Entry Table ──
function jeTable(debitLines: { account: string; name: string; amount: string }[], creditLines: { account: string; name: string; amount: string }[]): Table {
  const maxRows = Math.max(debitLines.length, creditLines.length);
  const rows: ColDef[][] = [];
  for (let i = 0; i < maxRows; i++) {
    const d = debitLines[i];
    const c = creditLines[i];
    rows.push([
      { text: d?.account || "", width: 15, align: AlignmentType.CENTER },
      { text: d?.name || "", width: 25, align: AlignmentType.RIGHT },
      { text: d?.amount || "", width: 10, align: AlignmentType.CENTER },
      { text: c?.account || "", width: 15, align: AlignmentType.CENTER },
      { text: c?.name || "", width: 25, align: AlignmentType.RIGHT },
      { text: c?.amount || "", width: 10, align: AlignmentType.CENTER },
    ]);
  }
  return makeTable(
    [
      { text: "كود الحساب", width: 15 },
      { text: "اسم الحساب - مدين", width: 25 },
      { text: "مبلغ", width: 10 },
      { text: "كود الحساب", width: 15 },
      { text: "اسم الحساب - دائن", width: 25 },
      { text: "مبلغ", width: 10 },
    ],
    rows
  );
}

// ── BUILD DOCUMENT ──
const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: "Calibri", size: 22 },
        paragraph: { spacing: { line: 312 } },
      },
    },
  },
  sections: [
    // ═══════════════════════════════════════
    // SECTION 1: COVER PAGE
    // ═══════════════════════════════════════
    {
      properties: {
        page: {
          margin: { top: 0, bottom: 0, left: 0, right: 0 },
          size: { width: 11906, height: 16838 },
        },
      },
      children: [
        // Cover via full-page table
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              height: { value: 16838, rule: "exact" as any },
              children: [
                new TableCell({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  shading: { fill: C.primary, type: ShadingType.CLEAR },
                  margins: { top: 2000, bottom: 1000, left: 1500, right: 1500 },
                  borders: {
                    top: { style: BorderStyle.NONE, size: 0 },
                    bottom: { style: BorderStyle.NONE, size: 0 },
                    left: { style: BorderStyle.NONE, size: 0 },
                    right: { style: BorderStyle.NONE, size: 0 },
                  },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: { after: 200 },
                      children: [
                        new TextRun({
                          text: "بِنَاء",
                          bold: true,
                          size: 44,
                          font: "Calibri",
                          color: C.white,
                          rightToLeft: true,
                        }),
                      ],
                    }),
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: { after: 100 },
                      children: [
                        new TextRun({
                          text: "BINA ERP",
                          bold: true,
                          size: 44,
                          font: "Calibri",
                          color: "A7D9A0",
                        }),
                      ],
                    }),
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: { after: 600 },
                      children: [
                        new TextRun({
                          text: "━━━━━━━━━━━━━━━━━━━━━━━━",
                          color: C.accent2,
                          size: 20,
                          font: "Calibri",
                        }),
                      ],
                    }),
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: { after: 200 },
                      children: [
                        new TextRun({
                          text: "وثيقة النظام الشاملة",
                          bold: true,
                          size: 44,
                          font: "Calibri",
                          color: C.white,
                          rightToLeft: true,
                        }),
                      ],
                    }),
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: { after: 120 },
                      children: [
                        new TextRun({
                          text: "Comprehensive System Documentation",
                          size: 28,
                          font: "Calibri",
                          color: "A7D9A0",
                        }),
                      ],
                    }),
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: { after: 600 },
                      children: [
                        new TextRun({
                          text: "نظام تخطيط موارد المؤسسات للمشاريع الإنشائية وتأجير المعدات",
                          size: 24,
                          font: "Calibri",
                          color: "D4E7D0",
                          rightToLeft: true,
                        }),
                      ],
                    }),
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: { after: 100 },
                      children: [
                        new TextRun({
                          text: "المملكة العربية السعودية",
                          size: 24,
                          font: "Calibri",
                          color: C.white,
                          rightToLeft: true,
                        }),
                      ],
                    }),
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: { after: 100 },
                      children: [
                        new TextRun({
                          text: "متوافق مع معايير هيئة المحاسبين القانونيين SOCPA",
                          size: 20,
                          font: "Calibri",
                          color: "A7D9A0",
                          rightToLeft: true,
                        }),
                      ],
                    }),
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      spacing: { after: 100 },
                      children: [
                        new TextRun({
                          text: "متوافق مع متطلبات هيئة الزكاة والدخل ZATCA",
                          size: 20,
                          font: "Calibri",
                          color: "A7D9A0",
                          rightToLeft: true,
                        }),
                      ],
                    }),
                    spacer(800),
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [
                        new TextRun({
                          text: "الإصدار 3.0 | مارس 2025",
                          size: 22,
                          font: "Calibri",
                          color: "D4E7D0",
                          rightToLeft: true,
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    },

    // ═══════════════════════════════════════
    // SECTION 2: TOC
    // ═══════════════════════════════════════
    {
      properties: {
        page: {
          margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
        },
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [
            new TextRun({
              text: "فهرس المحتويات",
              bold: true,
              size: 36,
              font: "Calibri",
              color: C.primary,
              rightToLeft: true,
            }),
          ],
        }),
        new TableOfContents("Table of Contents", {
          hyperlink: true,
          headingStyleRange: "1-3",
        }),
        new Paragraph({
          spacing: { before: 200 },
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "ملاحظة: انقر بزر الماوس الأيمن على الفهرس واختر 'تحديث الحقل' لتحديث أرقام الصفحات",
              italics: true,
              size: 18,
              font: "Calibri",
              color: C.secondary,
              rightToLeft: true,
            }),
          ],
        }),
        pageBreak(),
      ],
    },

    // ═══════════════════════════════════════
    // SECTION 3: MAIN CONTENT
    // ═══════════════════════════════════════
    {
      properties: {
        page: {
          margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
          pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: "بِنَاء ERP - وثيقة النظام الشاملة",
                  size: 16,
                  font: "Calibri",
                  color: C.secondary,
                  rightToLeft: true,
                }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: "صفحة ",
                  size: 16,
                  font: "Calibri",
                  color: C.secondary,
                  rightToLeft: true,
                }),
                new TextRun({
                  children: [PageNumber.CURRENT],
                  size: 16,
                  font: "Calibri",
                  color: C.secondary,
                }),
              ],
            }),
          ],
        }),
      },
      children: [

        // ═══════════════════════════════════════
        // CHAPTER 1: نظرة عامة على النظام
        // ═══════════════════════════════════════
        heading1("الفصل الأول: نظرة عامة على النظام"),

        heading2("1.1 التعريف بالنظام"),
        para("نظام بِنَاء (BINA ERP) هو نظام تخطيط موارد مؤسسات متكامل مصمم خصيصاً لشركات المقاولات الإنشائية وتأجير المعدات في المملكة العربية السعودية. يوفر النظام حلاً شاملاً يغطي جميع العمليات التشغيلية والمالية والمحاسبية وفقاً للمعايير المحاسبية السعودية (SOCPA) ومتطلبات هيئة الزكاة والدخل (ZATCA).", { indent: true }),

        heading2("1.2 الرؤية والفلسفة"),
        para("يقوم النظام على فلسفة محورية أساسية: دليل الحسابات هو المحرك الرئيسي للنظام. كل عملية مالية ترتبط تلقائياً بقيد محاسبي، وكل شاشة تعرف حساباتها المحاسبية وعرض القيد المتوقع قبل الحفظ. هذا يضمن السلامة المالية الكاملة من أول عملية وحتى القوائم المالية.", { indent: true }),

        heading2("1.3 التقنيات المستخدمة"),
        makeTable(
          [
            { text: "التقنية", width: 30 },
            { text: "الوصف", width: 40 },
            { text: "الإصدار", width: 30 },
          ],
          [
            [{ text: "Next.js", width: 30 }, { text: "إطار عمل الويب الرئيسي مع App Router", width: 40 }, { text: "16", width: 30 }],
            [{ text: "TypeScript", width: 30 }, { text: "لغة البرمجة الأساسية", width: 40 }, { text: "5", width: 30 }],
            [{ text: "Tailwind CSS", width: 30 }, { text: "نظام التنسيق والتصميم", width: 40 }, { text: "4", width: 30 }],
            [{ text: "shadcn/ui", width: 30 }, { text: "مكتبة المكونات الواجهية", width: 40 }, { text: "أحدث", width: 30 }],
            [{ text: "Prisma ORM", width: 30 }, { text: "طبقة الوصول لقاعدة البيانات", width: 40 }, { text: "أحدث", width: 30 }],
            [{ text: "SQLite", width: 30 }, { text: "قاعدة البيانات العلائقية", width: 40 }, { text: "3", width: 30 }],
            [{ text: "Zustand", width: 30 }, { text: "إدارة الحالة على جانب العميل", width: 40 }, { text: "أحدث", width: 30 }],
            [{ text: "Socket.IO", width: 30 }, { text: "التواصل الفوري والخدمات المصغرة", width: 40 }, { text: "أحدث", width: 30 }],
          ]
        ),
        spacer(200),

        heading2("1.4 المتطلبات والمواءمة"),
        bullet("متوافق مع معايير المحاسبة السعودية SOCPA (دليل الحسابات الموحد)"),
        bullet("متوافق مع متطلبات الفوترة الإلكترونية ZATCA (رمز QR)"),
        bullet("ضريبة القيمة المضافة 15% محسوبة تلقائياً"),
        bullet("دعم كامل للغة العربية (RTL) مع واجهة ثنائية اللغة"),
        bullet("العملة الأساسية: الريال السعودي (SAR)"),

        // ═══════════════════════════════════════
        // CHAPTER 2: هيكل النظام المعماري
        // ═══════════════════════════════════════
        pageBreak(),
        heading1("الفصل الثاني: هيكل النظام المعماري"),

        heading2("2.1 البنية العامة"),
        para("يعتمد النظام بنية مركزية قائمة على مركزين أساسيين (Hubs) يغذيهما خدمات مشتركة، ويتصل الجميع بمحرك المحاسبة كمرجع وحيد للحقيقة المالية:", { indent: true }),

        makeTable(
          [
            { text: "الطبقة", width: 20 },
            { text: "المكونات", width: 50 },
            { text: "الدور", width: 30 },
          ],
          [
            [{ text: "واجهة المستخدم", width: 20 }, { text: "شاشات + مكونات UI + Zustand", width: 50 }, { text: "التفاعل مع المستخدم", width: 30 }],
            [{ text: "طبقة API", width: 20 }, { text: "+100 نقطة API REST", width: 50 }, { text: "الوسيط بين الواجهة والبيانات", width: 30 }],
            [{ text: "محرك الأعمال", width: 20 }, { text: "محرك سير العمل + توجيه التكاليف + حساب الربحية", width: 50 }, { text: "المنطق التجاري", width: 30 }],
            [{ text: "محرك المحاسبة", width: 20 }, { text: "دليل الحسابات + 18 دالة قيد تلقائي + التقارير المالية", width: 50 }, { text: "المرجع المالي الوحيد", width: 30 }],
            [{ text: "قاعدة البيانات", width: 20 }, { text: "Prisma + SQLite (37 نموذج بيانات)", width: 50 }, { text: "التخزين المستمر", width: 30 }],
          ]
        ),
        spacer(200),

        heading2("2.2 مركزا النظام الأساسيان"),
        heading3("مركز المشاريع الإنشائية (Construction Hub)"),
        para("يغطي دورة حياة المشروع الإنشائي الكاملة من العميل وحتى التحصيل:", { indent: true }),
        bullet("عميل ← مشروع ← عقد ← جدول كميات ← ساعات عمل ← مصروفات"),
        bullet("مقاولون فرعيون ← مشتريات (طلب←أمر شراء←استلام←فاتورة)"),
        bullet("مستخلصات ← فواتير مبيعات ← تحصيلات ← قيد محاسبي"),

        heading3("مركز تأجير المعدات (Rental Hub)"),
        para("يغطي دورة تأجير المعدات من العقد وحتى إصدار الفاتورة:", { indent: true }),
        bullet("عميل ← عقد تأجير ← أمر توصيل ← سجل ساعات ← فاتورة تأجير ← تحصيل"),

        heading3("الخدمات المشتركة"),
        bullet("الموارد البشرية (موظفون، رواتب، فرق عمل)"),
        bullet("سلسلة التوريد (طلبات شراء، أوامر شراء، استلام بضائع)"),
        bullet("المصروفات والمشتريات"),
        bullet("المخزون والمستودعات"),
        bullet("الإعدادات والبيانات الأساسية"),

        heading2("2.3 محرك المحاسبة - القلب النابض"),
        para("يمثل محرك المحاسبة المرجع الوحيد للحقيقة المالية في النظام. كل عملية مالية تولّد تلقائياً قيداً محاسبياً وفقاً لنظام القيد المزدوج. القاعدة الذهبية: لا عملية بدون أثر محاسبي.", { indent: true }),

        heading3("القواعد الذهبية للمحاسبة"),
        makeTable(
          [
            { text: "الرقم", width: 10 },
            { text: "القاعدة", width: 50 },
            { text: "التفصيل", width: 40 },
          ],
          [
            [{ text: "1", width: 10 }, { text: "لا عملية بدون أثر محاسبي", width: 50 }, { text: "كل معاملة مالية تولّد قيداً تلقائياً", width: 40 }],
            [{ text: "2", width: 10 }, { text: "القيد هو المصدر الوحيد للحقيقة", width: 50 }, { text: "جميع التقارير المالية مشتقة من القيود", width: 40 }],
            [{ text: "3", width: 10 }, { text: "دليل الحسابات هو المحرك", width: 50 }, { text: "كل شاشة تستعلم حساباتها ديناميكياً", width: 40 }],
            [{ text: "4", width: 10 }, { text: "لا حذف مباشر للقيود", width: 50 }, { text: "استخدام قيد عكسي بدلاً من الحذف", width: 40 }],
            [{ text: "5", width: 10 }, { text: "القيود المرحلة غير قابلة للتعديل", width: 50 }, { text: "التعديل = عكس + إنشاء قيد جديد", width: 40 }],
            [{ text: "6", width: 10 }, { text: "عكس متسلسل", width: 50 }, { text: "يجب عكس العمليات التابعة قبل الأم", width: 40 }],
            [{ text: "7", width: 10 }, { text: "عرض القيد قبل الحفظ", width: 50 }, { text: "كل شاشة تعرض الأثر المحاسبي المتوقع", width: 40 }],
          ]
        ),
        spacer(200),

        // ═══════════════════════════════════════
        // CHAPTER 3: دليل الحسابات
        // ═══════════════════════════════════════
        pageBreak(),
        heading1("الفصل الثالث: دليل الحسابات - المحرك الرئيسي"),

        heading2("3.1 فلسفة دليل الحسابات"),
        para("دليل الحسابات في نظام بِنَاء ليس مجرد قائمة حسابات، بل هو المحرك الذي يحرك النظام بالكامل. كل حساب يُضاف إلى الدليل يصبح فوراً متاحاً في جميع الشاشات ذات الصلة عبر نظام الأدوار الوظيفية (accountRole). لا توجد قوائم منسدلة ثابتة في النظام - كل اختيار حسابي يأتي من استعلام ديناميكي.", { indent: true }),

        heading2("3.2 هيكل دليل الحسابات SOCPA"),
        para("يتوافق الدليل مع تصنيف هيئة المحاسبين القانونيين السعوديين:"),

        makeTable(
          [
            { text: "المدى", width: 12 },
            { text: "التصنيف", width: 20 },
            { text: "أمثلة", width: 68 },
          ],
          [
            [{ text: "1xxx", width: 12 }, { text: "الأصول المتداولة", width: 20 }, { text: "1110 النقدية | 1120 البنوك | 1130 الصندوق | 1210 العملاء | 1220 المحتجزات | 1230 سلف الموظفين | 1240 مسترد ضريبي | 1410 ضريبة مدخلات", width: 68 }],
            [{ text: "2xxx", width: 12 }, { text: "الأصول الثابتة", width: 20 }, { text: "2110 معدات إنشائية | 2120 معدات تأجير | 2130 مركبات | 2140 أثاث ومعدات | 2210-2240 مجمع الإهلاك", width: 68 }],
            [{ text: "3xxx", width: 12 }, { text: "الالتزامات", width: 20 }, { text: "3110 ضريبة مخرجات | 3120 ضريبة مدخلات | 3130 ضريبة مستحقة | 3210 الموردين | 3220 المقاولين الفرعيين | 3310 مستحق الرواتب | 3410/3420 دفعات مقدمة عملاء | 3710 مخصص نهاية خدمة | 3810 مستحق الزكاة | 3830 مستحق التأمينات", width: 68 }],
            [{ text: "4xxx", width: 12 }, { text: "حقوق الملكية", width: 20 }, { text: "4100 رأس المال | 4400 الأرباح المبقاة", width: 68 }],
            [{ text: "6xxx", width: 12 }, { text: "الإيرادات", width: 20 }, { text: "6110 إيرادات المشاريع | 6210 إيرادات التأجير | 6220 إيرادات التوصيل | 6310 أرباح بيع أصول | 6340 إيرادات خدمات", width: 68 }],
            [{ text: "7xxx", width: 12 }, { text: "التكاليف المباشرة", width: 20 }, { text: "7110 تكاليف المشاريع | 7130 مقاولون فرعيون | 7160 تراخيص | 7210 تكاليف التأجير | 7220 صيانة | 7230 سائقين | 7240 نقل | 7250 إهلاك التأجير | 7300 تكاليف أخرى | 7400 تأمين", width: 68 }],
            [{ text: "8xxx", width: 12 }, { text: "المصروفات الإدارية", width: 20 }, { text: "8110 رواتب وأجور | 8120 إيجارات | 8130 مرافق | 8140 مصروفات مكتبية | 8210 تأمينات اجتماعية | 8310-8340 إهلاك | 8510 زكاة | 8610 خسارة تصرف | 8630 متنوعة", width: 68 }],
          ]
        ),
        spacer(200),

        heading2("3.3 نظام الأدوار الوظيفية (accountRole)"),
        para("كل حساب في الدليل يحمل دوراً وظيفياً يحدد أين وكيف يُستخدم في الشاشات. عندما تضيف حساباً جديداً بنفس الدور، يظهر تلقائياً في الشاشات ذات الصلة:"),

        makeTable(
          [
            { text: "الدور الوظيفي", width: 25 },
            { text: "الأمثلة", width: 40 },
            { text: "الشاشات المستخدمة", width: 35 },
          ],
          [
            [{ text: "CASH", width: 25 }, { text: "1110 النقدية، 1130 الصندوق", width: 40 }, { text: "التحصيلات، المدفوعات، المصروفات", width: 35 }],
            [{ text: "BANK", width: 25 }, { text: "1120 البنوك، 1121-1123 بنوك فرعية", width: 40 }, { text: "التحصيلات، المدفوعات، التحويلات", width: 35 }],
            [{ text: "CUSTOMER_AR", width: 25 }, { text: "1210 العملاء", width: 40 }, { text: "الفواتير، المستخلصات", width: 35 }],
            [{ text: "SUPPLIER_AP", width: 25 }, { text: "3210 الموردين، 3220 المقاولين", width: 40 }, { text: "فواتير الموردين، المدفوعات", width: 35 }],
            [{ text: "RENTAL_REVENUE", width: 25 }, { text: "6210 إيرادات التأجير، 6220 التوصيل", width: 40 }, { text: "فواتير التأجير", width: 35 }],
            [{ text: "PROJECT_REVENUE", width: 25 }, { text: "6110 إيرادات المشاريع", width: 40 }, { text: "المستخلصات، فواتير المبيعات", width: 35 }],
            [{ text: "FUEL_EXPENSE", width: 25 }, { text: "7240 نقل، 7300 أخرى", width: 40 }, { text: "سجل الوقود، المصروفات", width: 35 }],
            [{ text: "MAINTENANCE_EXPENSE", width: 25 }, { text: "7220 صيانة", width: 40 }, { text: "صيانة المعدات، المصروفات", width: 35 }],
            [{ text: "PAYROLL_EXPENSE", width: 25 }, { text: "8110 رواتب، 7120 عمالة", width: 40 }, { text: "الرواتب، مسير الرواتب", width: 35 }],
            [{ text: "FIXED_ASSET", width: 25 }, { text: "2110 معدات إنشائية، 2120 تأجير", width: 40 }, { text: "المعدات، الأصول الثابتة", width: 35 }],
            [{ text: "VAT_INPUT", width: 25 }, { text: "1410 ضريبة مدخلات", width: 40 }, { text: "فواتير الموردين، المصروفات", width: 35 }],
            [{ text: "VAT_OUTPUT", width: 25 }, { text: "3110 ضريبة مخرجات", width: 40 }, { text: "فواتير المبيعات، التأجير", width: 35 }],
          ]
        ),
        spacer(200),

        heading2("3.4 الاستعلام الديناميكي"),
        para("بدلاً من ترميز أرقام الحسابات في الكود، تستعلم الشاشات الحسابات ديناميكياً عبر الدور الوظيفي. مثال:", { indent: true }),
        para("عند إنشاء تحصيل جديد، الشاشة تستعلم:", { bold: true }),
        para("SELECT * FROM Account WHERE accountRole IN ('CASH', 'BANK') AND allowPosting = true"),
        para("وهكذا تظهر تلقائياً جميع حسابات النقدية والبنوك المتاحة، بغض النظر عن عدد الحسابات المضافة.", { indent: true }),

        heading2("3.5 نمط الدور ← مجموعة الحساب ← الحساب"),
        para("يتبع النظام نمطاً ثلاثي الطبقات يحاكي أنظمة SAP وOracle NetSuite وDynamics 365. عند ربط دور وظيفي بحساب، يمكن أن يكون الحساب حساباً تجميعياً (أب) يحتوي على حسابات فرعية (أبناء). في هذه الحالة، تستعلم الشاشات الحسابات الفرعية بدلاً من الحساب الأب:", { indent: true }),
        spacer(100),
        para("مثال تطبيقي - دور البنوك (BANK):", { bold: true, color: C.accent }),
        bullet("الحساب الأب: 1120 البنوك (allowPosting = false)"),
        bullet("الحسابات الفرعية: 1121 بنك الراجحي، 1122 بنك الأهلي، 1123 بنك الإنماء"),
        bullet("عند التحصيل، يختار المستخدم من الحسابات الفرعية تلقائياً"),
        bullet("إذا أضاف المحاسب بنكاً جديداً (1124 بنك السعودي الفرنسي)، يظهر فوراً في جميع شاشات التحصيل والمدفوعات"),
        spacer(100),
        para("دالة الحل الذكية (resolveRoleToAccounts):", { bold: true, color: C.accent }),
        bullet("تبحث عن جميع الحسابات النشطة المرتبطة بالدور"),
        bullet("تفصل الحسابات القابلة للترحيل عن الحسابات التجميعية"),
        bullet("للحسابات التجميعية، تجلب جميع الأبناء القابلة للترحيل"),
        bullet("للحسابات القابلة للترحيل التي لها أبناء، تُستبدل بالأبناء"),
        bullet("تُزيل التكرار وتعيد قائمة نهائية للحسابات القابلة للاختيار"),

        heading2("3.6 الحذف الناعم وإلغاء التفعيل"),
        para("لا يمكن حذف أي حساب استُخدم في قيد محاسبي. هذا يضمن سلامة السجل المحاسبي التاريخي. بدلاً من الحذف، يُستخدم نظام إلغاء التفعيل (Soft Delete):", { indent: true }),
        spacer(100),
        para("آلية الإلغاء:", { bold: true, color: C.accent }),
        bullet("الحساب يحمل حقل isActive (افتراضي: true)"),
        bullet("عند محاولة الحذف، يفحص النظام أثر الحساب أولاً"),
        bullet("إذا وُجدت قيود مرتبطة، يُمنع الحذف ويُعرض قائمة الحظر"),
        bullet("بدلاً من الحذف، يُعطّل الحساب (isActive = false)"),
        bullet("الحساب المعطّل لا يظهر في القوائم المنسدلة الجديدة"),
        bullet("لكنه يبقى محفوظاً في القيود التاريخية والتقارير"),
        spacer(100),
        para("حظر الإلغاء (Deactivation Blockers):", { bold: true, color: C.accent }),
        bullet("وجود بنود قيود محاسبية مرتبطة بالحساب"),
        bullet("وجود مستندات تشغيلية (فواتير، تحصيلات، مدفوعات)"),
        bullet("وجود أبناء نشطين مرتبطين بالحساب الأب"),
        bullet("وجود ربط بدور وظيفي مستخدم في محرك الربط المالي"),

        heading2("3.7 كشف حساب لكل حساب"),
        para("يمكن إنشاء كشف حساب لأي حساب في دليل الحسابات، وليس فقط للعملاء والموردين. يعرض الكشف:", { indent: true }),
        bullet("الرصيد الافتتاحي في تاريخ البداية"),
        bullet("جميع الحركات (قيود يومية) خلال الفترة مع المدين والدائن والرصيد الجاري"),
        bullet("الرصيد الختامي في تاريخ النهاية"),
        bullet("إجمالي الحركات: عدد القيود، إجمالي المدين، إجمالي الدائن"),
        bullet("فلترة حسب الفترة الزمنية ومركز التكلفة"),
        spacer(100),
        para("يُستخدم كشف الحساب من شاشة دليل الحسابات عبر زر 'كشف حساب' بجانب كل حساب، أو من شاشة دفتر الأستاذ العام.", { indent: true }),

        // ═══════════════════════════════════════
        // CHAPTER 4: محرك الربط المالي (Financial Mapping Engine)
        // ═══════════════════════════════════════
        pageBreak(),
        heading1("الفصل الرابع: محرك الربط المالي - طبقة المنطق المحاسبي"),

        heading2("4.1 نظرة عامة"),
        para("محرك الربط المالي (Financial Mapping Engine) هو طبقة وسيطة بين دليل الحسابات والعمليات التشغيلية. يُعرّف هذا المحرك البنية الكاملة للقيد المحاسبي (مدين ودائن) لكل نوع عملية تجارية. عند تغيير المحاسب لأي حساب في دليل الحسابات، ينتشر التغيير تلقائياً إلى جميع الفواتير والقيود والتقارير والقوائم المالية دون أي تعديل في الكود.", { indent: true }),
        spacer(100),
        para("المعادلة المعمارية الكاملة:", { bold: true, color: C.primary }),
        para("دليل الحسابات ← الأدوار الوظيفية ← محرك الربط المالي ← العمليات التجارية ← القيود المحاسبية ← دفتر الأستاذ العام ← القوائم المالية", { bold: true, color: C.accent, indent: true }),

        heading2("4.2 أنواع العمليات (24 نوع)"),
        para("يُعرّف المحرك 24 نوع عملية تجارية، كل واحد منها يحدد الأدوار المدينة والدائنة. الجدول التالي يوضح أهمها:", { indent: true }),

        makeTable(
          [
            { text: "نوع العملية", width: 22 },
            { text: "الوصف العربي", width: 28 },
            { text: "مدين", width: 25 },
            { text: "دائن", width: 25 },
          ],
          [
            [{ text: "RENTAL_INVOICE", width: 22 }, { text: "فاتورة تأجير", width: 28 }, { text: "ذمم العملاء", width: 25 }, { text: "إيرادات التأجير + ضريبة مخرجات", width: 25 }],
            [{ text: "PROJECT_INVOICE", width: 22 }, { text: "فاتورة مشروع", width: 28 }, { text: "ذمم العملاء", width: 25 }, { text: "إيرادات المشاريع + ضريبة مخرجات", width: 25 }],
            [{ text: "CLIENT_PAYMENT", width: 22 }, { text: "تحصيل عميل", width: 28 }, { text: "البنك / النقدية", width: 25 }, { text: "ذمم العملاء", width: 25 }],
            [{ text: "SUPPLIER_PAYMENT", width: 22 }, { text: "سداد مورد", width: 28 }, { text: "ذمم الموردين", width: 25 }, { text: "البنك / النقدية", width: 25 }],
            [{ text: "PURCHASE_INVOICE", width: 22 }, { text: "فاتورة شراء", width: 28 }, { text: "التكاليف + ضريبة مدخلات", width: 25 }, { text: "ذمم الموردين", width: 25 }],
            [{ text: "PAYROLL", width: 22 }, { text: "مسير الرواتب", width: 28 }, { text: "مصروف الرواتب + مصروف التأمينات", width: 25 }, { text: "رواتب مستحقة + مستحقات التأمينات", width: 25 }],
            [{ text: "FUEL_EXPENSE", width: 22 }, { text: "مصروف وقود", width: 28 }, { text: "تكاليف الوقود + ضريبة مدخلات", width: 25 }, { text: "البنك / النقدية", width: 25 }],
            [{ text: "MAINTENANCE_EXPENSE", width: 22 }, { text: "مصروف صيانة", width: 28 }, { text: "تكاليف الصيانة + ضريبة مدخلات", width: 25 }, { text: "البنك / النقدية", width: 25 }],
            [{ text: "GENERAL_EXPENSE", width: 22 }, { text: "مصروف عام", width: 28 }, { text: "مصروفات إدارية + ضريبة مدخلات", width: 25 }, { text: "البنك / النقدية", width: 25 }],
            [{ text: "ASSET_ACQUISITION", width: 22 }, { text: "شراء أصل", width: 28 }, { text: "الأصول الثابتة + ضريبة مدخلات", width: 25 }, { text: "البنك / ذمم الموردين", width: 25 }],
            [{ text: "ASSET_DEPRECIATION", width: 22 }, { text: "إهلاك أصل", width: 28 }, { text: "مصروف الإهلاك", width: 25 }, { text: "مجمع الإهلاك", width: 25 }],
            [{ text: "VAT_RETURN", width: 22 }, { text: "إقرار ضريبي", width: 28 }, { text: "ضريبة مخرجات", width: 25 }, { text: "ضريبة مدخلة + ضريبة مستحقة", width: 25 }],
            [{ text: "EMPLOYEE_ADVANCE", width: 22 }, { text: "سلفة موظف", width: 28 }, { text: "سلف الموظفين", width: 25 }, { text: "البنك / النقدية", width: 25 }],
            [{ text: "PROVISION", width: 22 }, { text: "مخصص", width: 28 }, { text: "مصروف المخصص", width: 25 }, { text: "مخصص نهاية الخدمة", width: 25 }],
            [{ text: "ZAKAT", width: 22 }, { text: "زكاة", width: 28 }, { text: "مصروف الزكاة", width: 25 }, { text: "الزكاة المستحقة", width: 25 }],
          ]
        ),
        spacer(200),

        heading2("4.3 آلية التحديث التلقائي"),
        para("عند تغيير المحاسب للحساب المرتبط بدور وظيفي (مثلاً تغيير حساب إيرادات التأجير من 6210 إلى 6215)، يحدث التالي تلقائياً:", { indent: true }),
        bullet("جميع الفواتير الجديدة تستخدم الحساب الجديد 6215"),
        bullet("جميع القيود المحاسبية الجديدة ترحّل على الحساب الجديد"),
        bullet("التقارير المالية تستعلم الحساب الجديد عبر الدور"),
        bullet("قائمة الدخل تعرض الإيرادات من الحساب الجديد"),
        bullet("ميزان المراجعة يعرض رصيد الحساب الجديد"),
        bullet("لا توجد أي تغييرات في الكود - كل شيء ديناميكي"),
        spacer(100),
        para("دالة حل العمليات (resolveOperationAccounts):", { bold: true, color: C.accent }),
        bullet("تستقبل نوع العملية (مثل RENTAL_INVOICE)"),
        bullet("تجلب الربط المالي من قاعدة البيانات"),
        bullet("تحل كل دور إلى حساباته الفعلية"),
        bullet("تعيد قائمة الحسابات المدينة والدائنة مع التفاصيل الكاملة"),

        heading2("4.4 شاشة محرك الربط المحاسبي"),
        para("تتيح شاشة محرك الربط المحاسبي للمحاسب عرض وتعديل الربط لكل نوع عملية. الشاشة تعرض:", { indent: true }),
        bullet("قائمة بجميع أنواع العمليات الـ24"),
        bullet("الأدوار المدينة والدائنة لكل عملية"),
        bullet("الحسابات الفعلية المرتبطة بكل دور"),
        bullet("إمكانية تعديل الأدوار لكل عملية"),
        bullet("التحقق من صحة الربط قبل الحفظ"),
        bullet("منع الحفظ إذا كان هناك دور غير مربوط بحساب"),

        // ═══════════════════════════════════════
        // CHAPTER 5: فحص السلامة المحاسبية (Accounting Health Check)
        // ═══════════════════════════════════════
        pageBreak(),
        heading1("الفصل الخامس: فحص السلامة المحاسبية"),

        heading2("5.1 نظرة عامة"),
        para("يحتوي النظام على محرك فحص سلامة محاسبي شامل يفحص تكامل النظام المحاسبي يومياً ويعرض نتيجة مئوية (0-100%) مع مؤشر لوني على لوحة القيادة. يهدف هذا الفحص إلى كشف المشاكل قبل أن تؤثر على العمليات اليومية.", { indent: true }),
        spacer(100),
        para("مؤشر الصحة على لوحة القيادة:", { bold: true, color: C.accent }),
        bullet("أخضر (🟢 100%): جميع الفحوصات ناجحة - النظام سليم تماماً"),
        bullet("أصفر (🟡 80-99%): توجد تحذيرات - يُنصح بمراجعتها"),
        bullet("أحمر (🔴 أقل من 80%): توجد أخطاء حرجة - يجب معالجتها فوراً"),

        heading2("5.2 الفحوصات السبعة"),
        para("ينفذ المحرك 7 فحوصات شاملة على النظام المحاسبي:", { indent: true }),

        makeTable(
          [
            { text: "#", width: 6 },
            { text: "الفحص", width: 30 },
            { text: "الخطورة", width: 14 },
            { text: "الوصف", width: 50 },
          ],
          [
            [{ text: "1", width: 6 }, { text: "أدوار بدون ربط", width: 30 }, { text: "حرج", width: 14 }, { text: "يفحص هل توجد أدوار وظيفية بدون أي حساب مرتبط - يسبب فشل العمليات", width: 50 }],
            [{ text: "2", width: 6 }, { text: "حسابات معطلة في الربط", width: 30 }, { text: "تحذير", width: 14 }, { text: "يفحص هل توجد حسابات معطلة (isActive=false) مازالت مربوطة بأدوار", width: 50 }],
            [{ text: "3", width: 6 }, { text: "أدوار بحسابات أب فقط", width: 30 }, { text: "تحذير", width: 14 }, { text: "يفحص هل توجد أدوار مربوطة بحسابات تجميعية بدون أبناء قابلة للترحيل", width: 50 }],
            [{ text: "4", width: 6 }, { text: "أدوار بحسابات متعددة", width: 30 }, { text: "معلومة", width: 14 }, { text: "يفحص هل توجد أدوار مربوطة بأكثر من حساب افتراضي (مقبول لكن يستحق المراجعة)", width: 50 }],
            [{ text: "5", width: 6 }, { text: "قيود بحسابات معطلة", width: 30 }, { text: "حرج", width: 14 }, { text: "يفحص هل توجد قيود يومية تستخدم حسابات معطلة - خطر على سلامة البيانات", width: 50 }],
            [{ text: "6", width: 6 }, { text: "عمليات بدون ربط", width: 30 }, { text: "تحذير", width: 14 }, { text: "يفحص هل توجد أنواع عمليات بدون ربط محاسبي مُعرّف", width: 50 }],
            [{ text: "7", width: 6 }, { text: "أدوار على حسابات أب", width: 30 }, { text: "معلومة", width: 14 }, { text: "يفحص هل توجد أدوار مربوطة بحسابات تجميعية لها أبناء (يُحل تلقائياً)", width: 50 }],
          ]
        ),
        spacer(200),

        heading2("5.3 حساب النتيجة"),
        para("تُحسب النتيجة الإجمالية بمرجحة الخطورة:", { indent: true }),
        bullet("الخطأ (error): وزن 2 - يخفض النتيجة بشكل كامل"),
        bullet("التحذير (warning): وزن 1.5 - يخفض النتيجة بنصف الوزن"),
        bullet("المعلومة (info): وزن 1 - لا تؤثر على النتيجة"),
        spacer(100),
        para("المعادلة: النتيجة = (الوزن المكتسب / إجمالي الوزن) × 100", { bold: true, color: C.accent }),

        heading2("5.4 معالجة المشاكل"),
        para("عند اكتشاف مشكلة، يعرض الفحص:", { indent: true }),
        bullet("اسم الفحص ووصفه العربي والإنجليزي"),
        bullet("رسالة مفصلة بالحسابات/الأدوار المتأثرة"),
        bullet("روابط مباشرة لشاشة المعالجة المناسبة"),
        bullet("إمكانية المعالجة الفورية من شاشة الفحص"),

        // ═══════════════════════════════════════
        // CHAPTER 6: أثر الحسابات على النظام (Account Impact)
        // ═══════════════════════════════════════
        pageBreak(),
        heading1("الفصل السادس: أثر الحسابات على النظام"),

        heading2("6.1 نظرة عامة"),
        para("قبل أن يغير المحاسب أي حساب أو يحاول تعطيله، يجب أن يفهم أثره الكامل على النظام. شاشة أثر الحسابات (Account Impact) تحلل كل حساب وتعرض أين وكيف يُستخدم عبر جميع وحدات النظام. هذا يمنع الأخطاء المكلفة ويضمن قرارات مستنيرة.", { indent: true }),

        heading2("6.2 معلومات الأثر"),
        para("لكل حساب، تعرض شاشة الأثر المعلومات التالية:", { indent: true }),

        heading3("معلومات الحساب الأساسية"),
        bullet("الكود، الاسم العربي، الاسم الإنجليزي، النوع"),
        bullet("الدور الوظيفي المرتبط"),
        bullet("الحساب الأب والحسابات الفرعية (الأبناء)"),
        bullet("حالة التفعيل وإمكانية الترحيل"),

        heading3("العمليات المستخدمة"),
        bullet("قائمة بأنواع العمليات التي تستخدم هذا الحساب"),
        bullet("جانب الحساب في كل عملية (مدين/دائن/كلاهما)"),
        bullet("الربط المالي الكامل لكل عملية"),

        heading3("إحصائيات الاستخدام"),
        bullet("عدد بنود القيود المحاسبية المرتبطة"),
        bullet("إجمالي المدين وإجمالي الدائن"),
        bullet("الرصيد الصافي الحالي"),
        bullet("تاريخ آخر استخدام"),

        heading3("مراجع المستندات"),
        bullet("عدد فواتير المبيعات المرتبطة"),
        bullet("عدد فواتير الشراء المرتبطة"),
        bullet("عدد التحصيلات والمدفوعات المرتبطة"),
        bullet("عدد المصروفات والرواتب المرتبطة"),
        bullet("عدد عقود التأجير المرتبطة"),

        heading2("6.3 حظر الإلغاء"),
        para("عند محاولة تعطيل حساب، يفحص النظام أثره أولاً. إذا وُجدت أي من الحالات التالية، يُمنع التعطيل ويُعرض سبب المنع:", { indent: true }),
        bullet("وجود قيود محاسبية مرحّلة تستخدم الحساب"),
        bullet("وجود مستندات تشغيلية مرتبطة (فواتير، تحصيلات، مدفوعات)"),
        bullet("وجود أبناء نشطين للحساب الأب"),
        bullet("وجود ربط بدور وظيفي نشط في محرك الربط المالي"),
        spacer(100),
        para("في حالة وجود حظر، يُعرض للمستخدم:", { bold: true, color: C.accent }),
        bullet("قائمة كاملة بأسباب المنع"),
        bullet("عدد المستندات/القيود المتأثرة لكل سبب"),
        bullet("روابط لعرض التفاصيل"),
        bullet("توصية: تعطيل الحساب غير ممكن، يُنصح بإنشاء حساب بديل وتحديث الربط"),

        heading2("6.4 سير عمل المحاسب"),
        para("السير العمل الموصى به للمحاسب عند تعديل الحسابات:", { indent: true }),
        bullet("1. فحص أثر الحساب قبل أي تغيير"),
        bullet("2. مراجعة العمليات والمستندات المستخدمة"),
        bullet("3. إنشاء حساب بديل إذا لزم الأمر"),
        bullet("4. تحديث الربط الوظيفي من شاشة ربط الحسابات"),
        bullet("5. تعطيل الحساب القديم (إن لم يكن مستخدماً في قيود)"),
        bullet("6. إعادة فحص السلامة المحاسبية للتأكد من النتيجة 100%"),

        // ═══════════════════════════════════════
        // CHAPTER 7: الشاشات والوظائف
        // ═══════════════════════════════════════
        pageBreak(),
        heading1("الفصل السابع: الشاشات والوظائف التفصيلية"),

        para("يحتوي النظام على 44 شاشة موزعة على 8 مجموعات رئيسية. كل شاشة متكاملة مع محرك المحاسبة وتعرض القيد المتوقع قبل الحفظ.", { indent: true }),

        // ── المجموعة 1: الرئيسية ──
        heading2("7.1 لوحة القيادة (Dashboard)"),
        heading3("الوظيفة"),
        para("لوحة القيادة المركزية التي تعرض ملخصاً شاملاً لجميع عمليات النظام والأرقام المالية الرئيسية.", { indent: true }),
        heading3("المحتويات"),
        bullet("بطاقات ملخص مالي: النقدية، الإيرادات، المصروفات، الأرباح الصافية"),
        bullet("رسم بياني للإيرادات والمصروفات الشهرية"),
        bullet("ملخص المشاريع النشطة مع نسب الإنجاز"),
        bullet("ملخص المعدات المتاحة والمؤجرة"),
        bullet("المستحقات العملاء والموردين"),
        bullet("آخر العمليات والقيود المحاسبية"),
        heading3("المصدر المحاسبي"),
        para("جميع الأرقام مشتقة من دفتر الأستاذ العام (GL) وليس من الجداول التشغيلية، مما يضمن الدقة المالية الكاملة.", { bold: true, color: C.red }),

        // ── المجموعة 2: المشاريع الإنشائية ──
        pageBreak(),
        heading2("7.2 مركز المشاريع الإنشائية"),

        heading3("7.2.1 شاشة المشاريع"),
        para("إدارة المشاريع الإنشائية الكاملة مع تتبع التكاليف والإيرادات والربحية.", { indent: true }),
        makeTable(
          [
            { text: "العنصر", width: 25 },
            { text: "الوصف", width: 75 },
          ],
          [
            [{ text: "الوظيفة", width: 25 }, { text: "إنشاء وتعديل مشاريع إنشائية مع ربطها بالعميل والفرع", width: 75 }],
            [{ text: "البيانات", width: 25 }, { text: "رمز المشروع، الاسم، العميل، نوع المشروع (إنشائي/تأجير)، قيمة العقد، الحالة، التفرع", width: 75 }],
            [{ text: "الحالات", width: 25 }, { text: "تخطيط ← نشط ← متوقف ← مكتمل ← ملغى", width: 75 }],
            [{ text: "الارتباطات", width: 25 }, { text: "العقود، جدول الكميات، المستخلصات، المصروفات، فواتير البيع، المعدات، فرق العمل", width: 75 }],
            [{ text: "حساب الربحية", width: 25 }, { text: "الإيرادات - (مواد + عمالة + مقاولين فرعيين + معدات + وقود + صيانة + مصروفات + مشتريات)", width: 75 }],
          ]
        ),
        spacer(100),

        heading3("7.2.2 شاشة العقود"),
        para("إدارة عقود المشاريع مع شروط الدفع والضمانات.", { indent: true }),
        makeTable(
          [
            { text: "العنصر", width: 25 },
            { text: "الوصف", width: 75 },
          ],
          [
            [{ text: "الوظيفة", width: 25 }, { text: "إنشاء عقود مشاريع مع تفاصيل الشروط والضمانات", width: 75 }],
            [{ text: "البيانات", width: 25 }, { text: "نوع العقد (مشروع/تأجير/خدمي)، القيمة، ضريبة القيمة المضافة، طريقة الفوترة، نسبة الدفعة المقدمة، نسبة المحتجزات", width: 75 }],
            [{ text: "الضمانات", width: 25 }, { text: "أداء، دفعة مقدمة، محتجزات، صيانة - مع المُصدِر والمستفيد والمبلغ والتواريخ", width: 75 }],
            [{ text: "الارتباطات", width: 25 }, { text: "المشروع، أوامر التغيير، المستخلصات", width: 75 }],
          ]
        ),
        spacer(100),

        heading3("7.2.3 شاشة جدول الكميات (BOQ)"),
        para("تفصيل بنود الأعمال والكميات والأسعار لكل مشروع.", { indent: true }),
        bullet("بنود تفصيلية: كود، وصف، وحدة، كمية، سعر الوحدة، الإجمالي"),
        bullet("تصنيف البنود حسب الفئات"),
        bullet("ربط كل بند بالمشروع والعقد"),
        bullet("أساس حساب المستخلصات ونسب الإنجاز"),

        heading3("7.2.4 شاشة المستخلصات"),
        para("إنشاء مستخلصات الدورية للمشاريع مع احتساب المحتجزات والضريبة.", { indent: true }),
        makeTable(
          [
            { text: "العنصر", width: 25 },
            { text: "الوصف", width: 75 },
          ],
          [
            [{ text: "الوظيفة", width: 25 }, { text: "إنشاء مستخلصات دورية تعكس نسبة الإنجاز الفعلية", width: 75 }],
            [{ text: "البيانات", width: 25 }, { text: "رقم المستخلص، النسبة المئوية، المبلغ، المحتجزات، الصافي، cumulative، الضريبة", width: 75 }],
            [{ text: "الحالات", width: 25 }, { text: "مسودة ← مقدمة ← معتمدة ← مدفوعة جزئياً ← مدفوعة بالكامل ← مرفوضة", width: 75 }],
            [{ text: "القيد المحاسبي", width: 25 }, { text: "مدين: 1210 العملاء | دائن: 6110 إيرادات المشاريع + 3110 ضريبة مخرجات", width: 75 }],
            [{ text: "الشروط", width: 25 }, { text: "يتطلب: عميل + عقد + جدول كميات", width: 75 }],
          ]
        ),
        spacer(100),

        heading3("7.2.5 شاشة فواتير المبيعات"),
        para("إصدار فواتير مبيعات للمشاريع والتأجير والخدمات.", { indent: true }),
        makeTable(
          [
            { text: "العنصر", width: 25 },
            { text: "الوصف", width: 75 },
          ],
          [
            [{ text: "أنواع الفواتير", width: 25 }, { text: "مستخلص، تأجير، خدمية", width: 75 }],
            [{ text: "البيانات", width: 25 }, { text: "رقم الفاتورة، النوع، البنود، المجاميع، المدفوع، رمز ZATCA QR", width: 75 }],
            [{ text: "الضريبة", width: 25 }, { text: "15% ضريبة قيمة مضافة محسوبة تلقائياً", width: 75 }],
            [{ text: "ZATCA", width: 25 }, { text: "رمز QR يُنشأ تلقائياً بترميز TLV (اسم البائع، الرقم الضريبي، التاريخ، المبالغ)", width: 75 }],
            [{ text: "المبلغ بالحروف", width: 25 }, { text: "تحويل تلقائي للأرقام إلى حروف بالعربية والإنجليزية", width: 75 }],
            [{ text: "القيد المحاسبي", width: 25 }, { text: "مدين: 1210 العملاء | دائن: 6110/6210/6340 الإيرادات + 3110 ضريبة مخرجات", width: 75 }],
          ]
        ),
        spacer(100),

        heading3("7.2.6 شاشة تحصيلات العملاء"),
        para("تسجيل تحصيلات العملاء مع ربطها بالحسابات البنكية أو النقدية.", { indent: true }),
        makeTable(
          [
            { text: "العنصر", width: 25 },
            { text: "الوصف", width: 75 },
          ],
          [
            [{ text: "الوظيفة", width: 25 }, { text: "تسجيل المدفوعات الواردة من العملاء", width: 75 }],
            [{ text: "اختيار الحساب", width: 25 }, { text: "ديناميكي من دليل الحسابات (CASH أو BANK) بدلاً من أزرار ثابتة", width: 75 }],
            [{ text: "نوع الدفع", width: 25 }, { text: "عميل (مشروع) أو تأجير", width: 75 }],
            [{ text: "القيد المحاسبي", width: 25 }, { text: "مدين: 1110/1120 النقدية/البنك | دائن: 1210 العملاء", width: 75 }],
          ]
        ),
        spacer(100),

        // ── المجموعة 3: تأجير المعدات ──
        pageBreak(),
        heading2("7.3 مركز تأجير المعدات"),

        heading3("7.3.1 شاشة المعدات"),
        para("إدارة سجل المعدات الكامل مع الارتباط المحاسبي.", { indent: true }),
        makeTable(
          [
            { text: "العنصر", width: 25 },
            { text: "الوصف", width: 75 },
          ],
          [
            [{ text: "الوظيفة", width: 25 }, { text: "إدارة سجل المعدات الأساسي والتشغيلي والمحاسبي", width: 75 }],
            [{ text: "البيانات", width: 25 }, { text: "رمز المعدة، نوع الملكية، المعدلات (ساعي/يومي/شهري)، سعر الشراء، العمر الإنتاجي", width: 75 }],
            [{ text: "أنواع الملكية", width: 25 }, { text: "ملكية الشركة، مؤجرة من طرف ثالث، مشتراة، عقد إيجار، ملك العميل", width: 75 }],
            [{ text: "الحالات التشغيلية", width: 25 }, { text: "متاحة، قيد الاستخدام، صيانة، خارج الخدمة، مؤجرة", width: 75 }],
            [{ text: "الحسابات المرتبطة", width: 25 }, { text: "حساب الأصل (2110/2120)، مصروف الإهلاك، مجمع الإهلاك - كلها من دليل الحسابات", width: 75 }],
            [{ text: "القيد عند الشراء", width: 25 }, { text: "مدين: 2110/2120 الأصل | دائن: 1110/1120 النقدية أو 3210 الموردين", width: 75 }],
          ]
        ),
        spacer(100),

        heading3("7.3.2 شاشة عقود التأجير"),
        para("إدارة عقود تأجير المعدات للعملاء.", { indent: true }),
        bullet("نوع التسعير: ساعي / يومي / شهري / مقطوع"),
        bullet("معدل مرجعي وساعات مرجعية"),
        bullet("موقع العمل والمدينة"),
        bullet("رسوم التوصيل (نوع ومبلغ)"),
        bullet("نوع التشغيل: بدون سائق / مع سائق / مع طاقم"),
        bullet("مسؤولية الوقود والتأمين"),

        heading3("7.3.3 شاشة أوامر التوصيل"),
        para("إدارة أوامر توصيل المعدات للمواقع.", { indent: true }),
        bullet("رقم الأمر، عقد التأجير، الموقع، تاريخ التوصيل والإرجاع"),
        bullet("الحالات: قيد الانتظار ← تم التوصيل ← تم الإرجاع ← ملغى"),

        heading3("7.3.4 شاشة سجلات الساعات (Timesheets)"),
        para("تسجيل ساعات عمل المعدات المؤجرة شهرياً.", { indent: true }),
        makeTable(
          [
            { text: "العنصر", width: 25 },
            { text: "الوصف", width: 75 },
          ],
          [
            [{ text: "الوظيفة", width: 25 }, { text: "تسجيل ساعات التشغيل الفعلية لكل معدة مؤجرة شهرياً", width: 75 }],
            [{ text: "البيانات", width: 25 }, { text: "عقد التأجير، الشهر/السنة، ساعات التشغيل، الحالة", width: 75 }],
            [{ text: "الحالات", width: 25 }, { text: "مسودة ← مقدمة ← معتمدة ← مفوترة", width: 75 }],
            [{ text: "الارتباط", width: 25 }, { text: "أساس إصدار فاتورة التأجير - لا فاتورة بدون سجل ساعات معتمد", width: 75 }],
          ]
        ),
        spacer(100),

        heading3("7.3.5 شاشة فواتير التأجير"),
        para("إصدار فواتير تأجير المعدات بناءً على سجلات الساعات المعتمدة.", { indent: true }),
        makeTable(
          [
            { text: "العنصر", width: 25 },
            { text: "الوصف", width: 75 },
          ],
          [
            [{ text: "الوظيفة", width: 25 }, { text: "إصدار فواتير تأجير تلقائياً من سجلات الساعات المعتمدة", width: 75 }],
            [{ text: "الحسابات", width: 25 }, { text: "إيرادات التأجير (6210)، إيرادات التوصيل (6220)، إيرادات أخرى (6230) - من دليل الحسابات", width: 75 }],
            [{ text: "القيد المحاسبي", width: 25 }, { text: "مدين: 1210 العملاء | دائن: 6210 إيرادات التأجير + 3110 ضريبة مخرجات", width: 75 }],
            [{ text: "مع رسوم التوصيل", width: 25 }, { text: "مدين: 1210 العملاء | دائن: 6220 إيرادات التوصيل + 3110 ضريبة مخرجات", width: 75 }],
            [{ text: "الشرط", width: 25 }, { text: "يتطلب: عقد تأجير + أمر توصيل + سجل ساعات معتمد", width: 75 }],
          ]
        ),
        spacer(100),

        heading3("7.3.6 شاشة تحصيلات التأجير"),
        para("تسجيل تحصيلات فواتير التأجير.", { indent: true }),
        bullet("اختيار حساب الاستلام ديناميكياً من دليل الحسابات (CASH/BANK)"),
        bullet("القيد: مدين: 1110/1120 | دائن: 1210 العملاء"),

        // ── المجموعة 4: الموارد البشرية ──
        pageBreak(),
        heading2("7.4 الموارد البشرية"),

        heading3("7.4.1 شاشة الموظفين"),
        para("إدارة البيانات الأساسية للموظفين.", { indent: true }),
        makeTable(
          [
            { text: "العنصر", width: 25 },
            { text: "الوصف", width: 75 },
          ],
          [
            [{ text: "البيانات الأساسية", width: 25 }, { text: "رمز الموظف، الاسم، الفرع، المشروع، الحالة", width: 75 }],
            [{ text: "بيانات الراتب", width: 25 }, { text: "الراتب الأساسي، النوع (شهري/ساعي)، بدل السكن، بدل المواصلات", width: 75 }],
            [{ text: "التأمينات", width: 25 }, { text: "خاضع لظام التأمينات، نسبة التأمينات", width: 75 }],
            [{ text: "الحالات", width: 25 }, { text: "نشط ← إجازة ← منتهية خدمة ← مستقيل", width: 75 }],
          ]
        ),
        spacer(100),

        heading3("7.4.2 شاشة عقود الموظفين"),
        para("إدارة عقود العمل للموظفين مع تفاصيل الرواتب والبدلات.", { indent: true }),
        bullet("تاريخ البداية والنهاية، الراتب + البدلات"),

        heading3("7.4.3 شاشة الحضور والانصراف"),
        para("تسجيل الحضور اليومي للموظفين.", { indent: true }),
        bullet("وقت الحضور والانصراف، ساعات العمل، ساعات إضافية"),
        bullet("الحالات: حاضر، غائب، إجازة، عطلة"),

        heading3("7.4.4 شاشة الرواتب"),
        para("عرض وإدارة سجلات الرواتب الشهرية الفردية.", { indent: true }),
        makeTable(
          [
            { text: "العنصر", width: 25 },
            { text: "الوصف", width: 75 },
          ],
          [
            [{ text: "البيانات", width: 25 }, { text: "الشهر/السنة، جميع مكونات الراتب، خصم السلف، خصم الغياب، خصم التأمينات، الصافي", width: 75 }],
            [{ text: "نوع النشاط", width: 25 }, { text: "تنفيذي، تأجيري، عام - يحدد الحساب المحاسبي", width: 75 }],
            [{ text: "القيد المحاسبي", width: 25 }, { text: "مدين: 8110 رواتب | دائن: 3310 مستحق الرواتب + 3830 مستحق التأمينات + 1110/1120 نقدي/بنك", width: 75 }],
            [{ text: "الحالات", width: 25 }, { text: "مسودة ← معتمدة ← مدفوعة", width: 75 }],
          ]
        ),
        spacer(100),

        heading3("7.4.5 شاشة مسير الرواتب (Payroll Runs)"),
        para("تشغيل مسير رواتب شهري شامل لجميع الموظفين.", { indent: true }),
        makeTable(
          [
            { text: "العنصر", width: 25 },
            { text: "الوصف", width: 75 },
          ],
          [
            [{ text: "الوظيفة", width: 25 }, { text: "تشغيل مسير رواتب دفعة واحدة لشهر كامل", width: 75 }],
            [{ text: "البيانات", width: 25 }, { text: "الشهر/السنة، الحالة، الإجمالي، الصافي", width: 75 }],
            [{ text: "البنود", width: 25 }, { text: "سطر لكل موظف يشمل جميع مكونات الراتب", width: 75 }],
            [{ text: "حساب الدفع", width: 25 }, { text: "اختيار حساب البنك ديناميكياً من دليل الحسابات (BANK)", width: 75 }],
            [{ text: "الحالات", width: 25 }, { text: "مسودة ← مدفوعة", width: 75 }],
            [{ text: "القيد المتوقع", width: 25 }, { text: "مدين: 8110 رواتب + 8210 تأمينات | دائن: 3310 مستحق الرواتب + 3830 تأمينات + بنك", width: 75 }],
          ]
        ),
        spacer(100),

        heading3("7.4.6 شاشة فرق العمل"),
        para("إدارة فرق العمل مع تخصيص الأعضاء والمهام.", { indent: true }),
        bullet("رمز الفريق، التخصص، المشروع"),
        bullet("أعضاء الفريق: الموظف، الدور، القائد"),

        heading3("7.4.7 شاشة توزيع الموارد"),
        para("توزيع الموارد البشرية والمعدات على المشاريع.", { indent: true }),
        bullet("نوع المورد: موظف / فريق / معدة"),
        bullet("تواريخ البداية والنهاية"),

        // ── المجموعة 5: سلسلة التوريد ──
        pageBreak(),
        heading2("7.5 سلسلة التوريد"),

        heading3("7.5.1 شاشة طلبات الشراء"),
        para("إنشاء طلبات شراء جديدة من الأقسام المختلفة.", { indent: true }),
        makeTable(
          [
            { text: "العنصر", width: 25 },
            { text: "الوصف", width: 75 },
          ],
          [
            [{ text: "الوظيفة", width: 25 }, { text: "إنشاء طلبات شراء تخضع لسير عمل الموافقة", width: 75 }],
            [{ text: "المصدر", width: 25 }, { text: "مشروع، مخزون، ورشة، إدارة", width: 75 }],
            [{ text: "البنود", width: 25 }, { text: "وصف، كمية، وحدة لكل بند", width: 75 }],
            [{ text: "الحالات", width: 25 }, { text: "جديد ← معتمد ← محول لأمر شراء ← ملغى", width: 75 }],
          ]
        ),
        spacer(100),

        heading3("7.5.2 شاشة أوامر الشراء"),
        para("إصدار أوامر شراء للموردين بناءً على الطلبات المعتمدة.", { indent: true }),
        makeTable(
          [
            { text: "العنصر", width: 25 },
            { text: "الوصف", width: 75 },
          ],
          [
            [{ text: "الوظيفة", width: 25 }, { text: "إصدار أوامر شراء رسمية للموردين", width: 75 }],
            [{ text: "البيانات", width: 25 }, { text: "رقم الأمر، المورد، المجاميع الفرعية، الضريبة، الإجمالي، المدفوع", width: 75 }],
            [{ text: "الحالات", width: 25 }, { text: "مسودة ← بانتظار الموافقة ← معتمد ← مستلم جزئياً ← مستلم بالكامل ← ملغى", width: 75 }],
            [{ text: "الشرط", width: 25 }, { text: "يتطلب طلب شراء معتمد", width: 75 }],
          ]
        ),
        spacer(100),

        heading3("7.5.3 شاشة استلام البضائع"),
        para("تسجيل استلام البضائع من أوامر الشراء.", { indent: true }),
        makeTable(
          [
            { text: "العنصر", width: 25 },
            { text: "الوصف", width: 75 },
          ],
          [
            [{ text: "الوظيفة", width: 25 }, { text: "تسجيل استلام البضائع مقابل أوامر الشراء", width: 75 }],
            [{ text: "البنود", width: 25 }, { text: "الكمية المطلوبة / المستلمة / المتبقية، الوجهة (مخزون/مشروع)", width: 75 }],
            [{ text: "الحالات", width: 25 }, { text: "قيد الانتظار ← جزئي ← مكتمل ← ملغى", width: 75 }],
          ]
        ),
        spacer(100),

        heading3("7.5.4 شاشة فواتير الموردين"),
        para("تسجيل فواتير الموردين مع الأثر المحاسبي الكامل.", { indent: true }),
        makeTable(
          [
            { text: "العنصر", width: 25 },
            { text: "الوصف", width: 75 },
          ],
          [
            [{ text: "الوظيفة", width: 25 }, { text: "تسجيل فواتير الموردين مع تخصيص حسابات التكاليف", width: 75 }],
            [{ text: "الحسابات", width: 25 }, { text: "حساب المصروف من دليل الحسابات (7xxx/8xxx)، ضريبة المدخلات (1410)", width: 75 }],
            [{ text: "القيد المحاسبي", width: 25 }, { text: "مدين: 7xxx تكاليف + 1410 ضريبة مدخلات | دائن: 3210 الموردين", width: 75 }],
            [{ text: "ZATCA", width: 25 }, { text: "رمز QR تلقائي لفواتير الموردين", width: 75 }],
          ]
        ),
        spacer(100),

        heading3("7.5.5 شاشة مدفوعات الموردين"),
        para("تسجيل مدفوعات الموردين مع اختيار حساب الدفع.", { indent: true }),
        bullet("اختيار حساب الدفع ديناميكياً من دليل الحسابات (CASH/BANK)"),
        bullet("القيد: مدين: 3210 الموردين | دائن: 1110/1120 نقدي/بنك"),

        // ── المجموعة 6: التشغيل والصيانة ──
        pageBreak(),
        heading2("7.6 التشغيل والصيانة"),

        heading3("7.6.1 شاشة عمليات المعدات"),
        para("تسجيل العمليات اليومية للمعدات.", { indent: true }),
        bullet("المعدة، المشغّل، المشروع، الساعات"),

        heading3("7.6.2 شاشة صيانة المعدات"),
        para("تسجيل أعمال الصيانة مع تتبع التكاليف.", { indent: true }),
        makeTable(
          [
            { text: "العنصر", width: 25 },
            { text: "الوصف", width: 75 },
          ],
          [
            [{ text: "الوظيفة", width: 25 }, { text: "تسجيل أعمال الصيانة وربطها بالمعدات والموردين", width: 75 }],
            [{ text: "البيانات", width: 25 }, { text: "المعدة، التكلفة، المورد، تاريخ الصيانة القادم", width: 75 }],
            [{ text: "القيد المحاسبي", width: 25 }, { text: "مدين: 7220 صيانة | دائن: 1110/1120 نقدي/بنك أو 3210 موردين", width: 75 }],
          ]
        ),
        spacer(100),

        heading3("7.6.3 شاشة سجل الوقود"),
        para("تتبع استهلاك الوقود للمعدات.", { indent: true }),
        makeTable(
          [
            { text: "العنصر", width: 25 },
            { text: "الوصف", width: 75 },
          ],
          [
            [{ text: "البيانات", width: 25 }, { text: "المعدة، اللترات، سعر اللتر، التكلفة الإجمالية", width: 75 }],
            [{ text: "القيد المحاسبي", width: 25 }, { text: "مدين: 7240 نقل/وقود | دائن: 1110/1120 نقدي/بنك", width: 75 }],
          ]
        ),
        spacer(100),

        heading3("7.6.4 شاشة المقاولين الفرعيين"),
        para("إدارة المقاولين الفرعيين وفواتيرهم.", { indent: true }),
        bullet("التخصص، رقم السجل/الهوية"),
        bullet("عقود المقاولين الفرعيين مع نسب المحتجزات والضريبة"),
        bullet("فواتير المقاولين: مدين: 7130 تكاليف مقاولين فرعيين + 3120 ضريبة | دائن: 3220 مقاولين فرعيين"),

        heading3("7.6.5 شاشة المصروفات"),
        para("تسجيل المصروفات العامة والمشروعية مع الارتباط المحاسبي.", { indent: true }),
        makeTable(
          [
            { text: "العنصر", width: 25 },
            { text: "الوصف", width: 75 },
          ],
          [
            [{ text: "النوع", width: 25 }, { text: "مشروعي (PROJECT) أو داخلي (INTERNAL)", width: 75 }],
            [{ text: "النشاط", width: 25 }, { text: "تنفيذي (EXECUTION)، تأجيري (RENTAL)، عام (GENERAL)", width: 75 }],
            [{ text: "الفئات (18)", width: 25 }, { text: "إيجار، صيانة، نقل، وقود، رواتب، مكتبية، مرافق، تأمين، تصاريح، إلخ", width: 75 }],
            [{ text: "الصرف من", width: 25 }, { text: "خزينة، صندوق طوارئ، بنك - من دليل الحسابات ديناميكياً", width: 75 }],
            [{ text: "الحساب", width: 25 }, { text: "اختيار حساب المصروف من دليل الحسابات (7xxx/8xxx) حسب الدور الوظيفي", width: 75 }],
            [{ text: "القيد المحاسبي", width: 25 }, { text: "مدين: 7xxx/8xxx مصروف + 1410 ضريبة مدخلات | دائن: 1110/1120/1130 نقدي/بنك أو 3210 موردين", width: 75 }],
          ]
        ),
        spacer(100),

        // ── المجموعة 7: المحاسبة والتقارير ──
        pageBreak(),
        heading2("7.7 المحاسبة والتقارير"),

        heading3("7.7.1 شاشة المحاسبة (دليل الحسابات والقيود)"),
        para("المركز المحاسبي الرئيسي للنظام.", { indent: true }),
        makeTable(
          [
            { text: "العنصر", width: 25 },
            { text: "الوصف", width: 75 },
          ],
          [
            [{ text: "دليل الحسابات", width: 25 }, { text: "عرض وإدارة الشجرة المحاسبية الكاملة مع الأدوار الوظيفية", width: 75 }],
            [{ text: "القيود المحاسبية", width: 25 }, { text: "إنشاء وعرض وترحيل وعكس القيود المحاسبية", width: 75 }],
            [{ text: "أنواع المصدر", width: 25 }, { text: "20+ نوع: فاتورة مبيعات، فاتورة مشتريات، مصروف، راتب، تحصيل، دفع، إهلاك، زكاة، إلخ", width: 75 }],
            [{ text: "الحالات", width: 25 }, { text: "مسودة ← مرحّلة ← ملغاة", width: 75 }],
            [{ text: "عكس القيود", width: 25 }, { text: "فحص التبعيات قبل العكس، إنشاء قيد عكسي تلقائي", width: 75 }],
            [{ text: "سجل المراجعة", width: 25 }, { text: "تتبع كامل: إنشاء ← ترحيل ← عكس ← إلغاء ← طباعة", width: 75 }],
          ]
        ),
        spacer(100),

        heading3("7.7.2 شاشة ضريبة القيمة المضافة"),
        para("إدارة الإقرارات الضريبية الفصلية.", { indent: true }),
        makeTable(
          [
            { text: "العنصر", width: 25 },
            { text: "الوصف", width: 75 },
          ],
          [
            [{ text: "الوظيفة", width: 25 }, { text: "إنشاء إقرارات ضريبية ربع سنوية", width: 75 }],
            [{ text: "البيانات", width: 25 }, { text: "السنة/الربع، إجمالي المبيعات، إجمالي المشتريات، ضريبة المخرجات، ضريبة المدخلات، الضريبة الصافية", width: 75 }],
            [{ text: "الحالات", width: 25 }, { text: "مسودة ← مقدمة ← مدفوعة", width: 75 }],
            [{ text: "القيد - إقرار", width: 25 }, { text: "مدين: 3110 ضريبة مخرجات | دائن: 3120 ضريبة مدخلات + 3130 ضريبة مستحقة", width: 75 }],
            [{ text: "القيد - دفع", width: 25 }, { text: "مدين: 3130 ضريبة مستحقة | دائن: 1120 بنك", width: 75 }],
          ]
        ),
        spacer(100),

        heading3("7.7.3 شاشة التقارير"),
        para("مركز التقارير المالية والتشغيلية الشامل.", { indent: true }),
        makeTable(
          [
            { text: "التقرير", width: 30 },
            { text: "الوصف", width: 40 },
            { text: "المصدر", width: 30 },
          ],
          [
            [{ text: "ميزان المراجعة", width: 30 }, { text: "ملخص أرصدة جميع الحسابات", width: 40 }, { text: "القيود المرحلة", width: 30 }],
            [{ text: "دفتر الأستاذ العام", width: 30 }, { text: "الحركات التفصيلية لكل حساب مع الرصيد الجاري", width: 40 }, { text: "القيود المرحلة", width: 30 }],
            [{ text: "الميزانية العمومية", width: 30 }, { text: "الأصول والالتزامات وحقوق الملكية", width: 40 }, { text: "GL + الأرصدة", width: 30 }],
            [{ text: "قائمة الدخل", width: 30 }, { text: "الإيرادات والمصروفات وصافي الربح", width: 40 }, { text: "GL + الأرصدة", width: 30 }],
            [{ text: "قائمة التدفقات النقدية", width: 30 }, { text: "التدفقات النقدية التشغيلية والاستثمارية والتمويلية", width: 40 }, { text: "القيود النقدية", width: 30 }],
            [{ text: "كشف حساب عميل", width: 30 }, { text: "الفواتير والتحصيلات والرصيد", width: 40 }, { text: "القيود المرحلة", width: 30 }],
            [{ text: "كشف حساب مورد", width: 30 }, { text: "الفواتير والمدفوعات والرصيد", width: 40 }, { text: "القيود المرحلة", width: 30 }],
            [{ text: "كشف حساب مشروع", width: 30 }, { text: "التكاليف والإيرادات والربحية", width: 40 }, { text: "القيود + العمليات", width: 30 }],
            [{ text: "تكاليف المشاريع", width: 30 }, { text: "تفصيل التكاليف لكل مشروع", width: 40 }, { text: "القيود + العمليات", width: 30 }],
            [{ text: "أرصدة العملاء", width: 30 }, { text: "ملخص أرصدة جميع العملاء", width: 40 }, { text: "GL - حساب 1210", width: 30 }],
            [{ text: "أرصدة الموردين", width: 30 }, { text: "ملخص أرصدة جميع الموردين", width: 40 }, { text: "GL - حساب 3210", width: 30 }],
          ]
        ),
        spacer(100),

        // ── المجموعة 8: الإعدادات ──
        heading2("7.8 الإعدادات والبيانات الأساسية"),

        heading3("7.8.1 شاشة العملاء"),
        para("إدارة سجل العملاء.", { indent: true }),
        bullet("البيانات: الاسم، الرقم الضريبي، الحد الائتماني، شروط الدفع"),
        bullet("الارتباطات: المشاريع، العقود، الفواتير، التحصيلات، القيود المحاسبية"),
        bullet("كشف حساب العملاء متاح من التقارير"),

        heading3("7.8.2 شاشة الموردين"),
        para("إدارة سجل الموردين.", { indent: true }),
        bullet("البيانات: الاسم، الرقم الضريبي، الحد الائتماني، شروط الدفع"),
        bullet("الارتباطات: أوامر الشراء، فواتير الموردين، المعدات، المصروفات"),

        heading3("7.8.3 شاشة المخزون"),
        para("إدارة المواد والأصناف.", { indent: true }),
        bullet("نوع الصنف: منتج / خدمة"),
        bullet("سعر الشراء والبيع، الكمية، الحد الأدنى"),
        bullet("ربط بالمستودع"),

        heading3("7.8.4 شاشة الإعدادات"),
        para("إعدادات النظام الأساسية.", { indent: true }),
        bullet("بيانات الشركة: الاسم، الشعار، الرقم الضريبي، بيانات البنك"),
        bullet("نسبة ضريبة القيمة المضافة (15%)"),
        bullet("العملة الأساسية (SAR)"),
        bullet("شروط الفوترة الافتراضية"),
        bullet("صور رأس وتذييل الفواتير"),

        // ═══════════════════════════════════════
        // CHAPTER 5: تكامل الشاشات
        // ═══════════════════════════════════════
        pageBreak(),
        heading1("الفصل الثامن: تكامل الشاشات وترابطها"),

        heading2("8.1 سير العمل الإنشائي (Construction Flow)"),
        para("المسار الإلزامي لعمليات المشاريع الإنشائية - لا يمكن تجاوز أي خطوة:", { indent: true }),
        para("عميل ← مشروع ← عقد ← جدول كميات ← ساعات عمل ← مصروفات ← مقاولون فرعيون ← مشتريات (طلب ← أمر ← استلام ← فاتورة) ← مستخلص ← فاتورة عميل ← تحصيل ← قيد محاسبي", { bold: true, color: C.primary }),
        spacer(100),
        makeTable(
          [
            { text: "الخطوة", width: 8 },
            { text: "العملية", width: 20 },
            { text: "المخرجات", width: 35 },
            { text: "الأثر المحاسبي", width: 37 },
          ],
          [
            [{ text: "1", width: 8 }, { text: "إنشاء عميل", width: 20 }, { text: "سجل عميل جديد في النظام", width: 35 }, { text: "لا أثر مباشر", width: 37 }],
            [{ text: "2", width: 8 }, { text: "إنشاء مشروع", width: 20 }, { text: "مشروع مرتبط بالعميل", width: 35 }, { text: "لا أثر مباشر", width: 37 }],
            [{ text: "3", width: 8 }, { text: "إنشاء عقد", width: 20 }, { text: "عقد بقيمة وشروط وضمانات", width: 35 }, { text: "لا أثر مباشر", width: 37 }],
            [{ text: "4", width: 8 }, { text: "جدول كميات", width: 20 }, { text: "بنود الأعمال والكميات والأسعار", width: 35 }, { text: "لا أثر مباشر", width: 37 }],
            [{ text: "5", width: 8 }, { text: "تسجيل مصروفات", width: 20 }, { text: "مصروفات مشروعية", width: 35 }, { text: "مدين: مصروف | دائن: نقدي/موردين", width: 37 }],
            [{ text: "6", width: 8 }, { text: "إنشاء مستخلص", width: 20 }, { text: "مستخلص بنسبة الإنجاز", width: 35 }, { text: "مدين: عملاء | دائن: إيرادات + ضريبة", width: 37 }],
            [{ text: "7", width: 8 }, { text: "إصدار فاتورة", width: 20 }, { text: "فاتورة مبيعات مع ZATCA QR", width: 35 }, { text: "مدين: عملاء | دائن: إيرادات + ضريبة", width: 37 }],
            [{ text: "8", width: 8 }, { text: "تحصيل", width: 20 }, { text: "تحصيل مبلغ من العميل", width: 35 }, { text: "مدين: نقدي/بنك | دائن: عملاء", width: 37 }],
          ]
        ),
        spacer(200),

        heading2("8.2 سير عمل التأجير (Rental Flow)"),
        para("المسار الإلزامي لعمليات تأجير المعدات:", { indent: true }),
        para("عميل ← عقد تأجير ← أمر توصيل ← سجل ساعات ← فاتورة تأجير ← تحصيل ← قيد محاسبي", { bold: true, color: C.accent }),
        spacer(100),
        makeTable(
          [
            { text: "الخطوة", width: 8 },
            { text: "العملية", width: 20 },
            { text: "المخرجات", width: 35 },
            { text: "الأثر المحاسبي", width: 37 },
          ],
          [
            [{ text: "1", width: 8 }, { text: "إنشاء عقد تأجير", width: 20 }, { text: "عقد مع نوع التسعير والشروط", width: 35 }, { text: "لا أثر مباشر", width: 37 }],
            [{ text: "2", width: 8 }, { text: "أمر توصيل", width: 20 }, { text: "توصيل المعدة للموقع", width: 35 }, { text: "لا أثر مباشر", width: 37 }],
            [{ text: "3", width: 8 }, { text: "سجل ساعات", width: 20 }, { text: "ساعات التشغيل الشهرية", width: 35 }, { text: "لا أثر مباشر", width: 37 }],
            [{ text: "4", width: 8 }, { text: "اعتماد الساعات", width: 20 }, { text: "ساعات معتمدة قابلة للفوترة", width: 35 }, { text: "لا أثر مباشر", width: 37 }],
            [{ text: "5", width: 8 }, { text: "فاتورة تأجير", width: 20 }, { text: "فاتورة بالساعات × المعدل", width: 35 }, { text: "مدين: عملاء | دائن: إيرادات تأجير + ضريبة", width: 37 }],
            [{ text: "6", width: 8 }, { text: "تحصيل", width: 20 }, { text: "تحصيل مبلغ من العميل", width: 35 }, { text: "مدين: نقدي/بنك | دائن: عملاء", width: 37 }],
          ]
        ),
        spacer(200),

        heading2("8.3 سير عمل المشتريات (Purchase Flow)"),
        para("المسار الإلزامي لعمليات الشراء والتوريد:", { indent: true }),
        para("طلب شراء ← أمر شراء ← استلام بضائع ← فاتورة مورد ← دفع ← قيد محاسبي", { bold: true, color: C.blue }),
        spacer(100),
        makeTable(
          [
            { text: "الخطوة", width: 8 },
            { text: "العملية", width: 20 },
            { text: "المخرجات", width: 35 },
            { text: "الأثر المحاسبي", width: 37 },
          ],
          [
            [{ text: "1", width: 8 }, { text: "طلب شراء", width: 20 }, { text: "طلب من قسم مع مصدره", width: 35 }, { text: "لا أثر مباشر", width: 37 }],
            [{ text: "2", width: 8 }, { text: "اعتماد الطلب", width: 20 }, { text: "طلب معتمد قابل للتحويل", width: 35 }, { text: "لا أثر مباشر", width: 37 }],
            [{ text: "3", width: 8 }, { text: "أمر شراء", width: 20 }, { text: "أمر شراء رسمي للمورد", width: 35 }, { text: "لا أثر مباشر (التزام محتمل)", width: 37 }],
            [{ text: "4", width: 8 }, { text: "استلام بضائع", width: 20 }, { text: "بضاعة مستلمة في المخزون/المشروع", width: 35 }, { text: "لا أثر مباشر", width: 37 }],
            [{ text: "5", width: 8 }, { text: "فاتورة مورد", width: 20 }, { text: "فاتورة مع ضريبة مدخلات", width: 35 }, { text: "مدين: تكاليف + ضريبة | دائن: موردين", width: 37 }],
            [{ text: "6", width: 8 }, { text: "دفع مورد", width: 20 }, { text: "دفع للمورد", width: 35 }, { text: "مدين: موردين | دائن: نقدي/بنك", width: 37 }],
          ]
        ),
        spacer(200),

        heading2("8.4 سير عمل الرواتب (Payroll Flow)"),
        para("مسار معالجة الرواتب الشهرية:", { indent: true }),
        para("بيانات الموظف ← حضور ← حساب راتب ← مسير رواتب ← دفع راتب ← قيد محاسبي", { bold: true, color: C.gold }),
        spacer(100),
        makeTable(
          [
            { text: "الخطوة", width: 8 },
            { text: "العملية", width: 20 },
            { text: "المخرجات", width: 35 },
            { text: "الأثر المحاسبي", width: 37 },
          ],
          [
            [{ text: "1", width: 8 }, { text: "بيانات الموظف", width: 20 }, { text: "راتب أساسي + بدلات", width: 35 }, { text: "لا أثر مباشر", width: 37 }],
            [{ text: "2", width: 8 }, { text: "تسجيل الحضور", width: 20 }, { text: "ساعات العمل والغياب", width: 35 }, { text: "لا أثر مباشر", width: 37 }],
            [{ text: "3", width: 8 }, { text: "حساب الراتب", width: 20 }, { text: "راتب شامل مع الخصومات", width: 35 }, { text: "لا أثر مباشر (مسودة)", width: 37 }],
            [{ text: "4", width: 8 }, { text: "مسير الرواتب", width: 20 }, { text: "مسير شامل لجميع الموظفين", width: 35 }, { text: "لا أثر مباشر (مسودة)", width: 37 }],
            [{ text: "5", width: 8 }, { text: "اعتماد ودفع", width: 20 }, { text: "دفع الرواتب عبر البنك", width: 35 }, { text: "مدين: 8110+8210 | دائن: 3310+3830+بنك", width: 37 }],
          ]
        ),
        spacer(200),

        heading2("8.5 توجيه التكاليف التلقائي"),
        para("يقوم النظام تلقائياً بتوجيه التكاليف إلى المركز المناسب:", { indent: true }),
        makeTable(
          [
            { text: "الشرط", width: 30 },
            { text: "التوجيه", width: 20 },
            { text: "نوع النشاط", width: 20 },
            { text: "المركز", width: 30 },
          ],
          [
            [{ text: "مرتبط بمشروع إنشائي", width: 30 }, { text: "تكلفة مشروع", width: 20 }, { text: "EXECUTION", width: 20 }, { text: "مركز المشاريع الإنشائية", width: 30 }],
            [{ text: "مرتبط بمعدة مؤجرة", width: 30 }, { text: "تكلفة تأجير", width: 20 }, { text: "RENTAL", width: 20 }, { text: "مركز تأجير المعدات", width: 30 }],
            [{ text: "غير مرتبط بأي منهما", width: 30 }, { text: "تكلفة تشغيلية", width: 20 }, { text: "GENERAL", width: 20 }, { text: "المصروفات العامة", width: 30 }],
          ]
        ),

        // ═══════════════════════════════════════
        // CHAPTER 6: القيود المحاسبية التفصيلية
        // ═══════════════════════════════════════
        pageBreak(),
        heading1("الفصل التاسع: القيود المحاسبية - الأثر التفصيلي لكل عملية"),

        para("كل عملية مالية في النظام تولّد تلقائياً قيداً محاسبياً وفقاً لنظام القيد المزدوج. فيما يلي تفصيل القيود لكل نوع عملية:", { indent: true }),

        heading2("9.1 فاتورة مبيعات"),
        jeTable(
          [{ account: "1210", name: "العملاء", amount: "المبلغ + الضريبة" }],
          [{ account: "6110/6210/6340", name: "إيرادات المشاريع/التأجير/الخدمات", amount: "المبلغ قبل الضريبة" }, { account: "3110", name: "ضريبة القيمة المضافة - مخرجات", amount: "15%" }]
        ),
        spacer(200),

        heading2("9.2 فاتورة مورد"),
        jeTable(
          [{ account: "7xxx/8xxx", name: "حساب التكلفة/المصروف", amount: "المبلغ قبل الضريبة" }, { account: "1410", name: "ضريبة القيمة المضافة - مدخلات", amount: "15%" }],
          [{ account: "3210", name: "الموردين", amount: "المبلغ + الضريبة" }]
        ),
        spacer(200),

        heading2("9.3 مستخلص مشروع"),
        jeTable(
          [{ account: "1210", name: "العملاء", amount: "المبلغ + الضريبة" }],
          [{ account: "6110", name: "إيرادات المشاريع الإنشائية", amount: "المبلغ قبل الضريبة" }, { account: "3110", name: "ضريبة القيمة المضافة - مخرجات", amount: "15%" }]
        ),
        spacer(200),

        heading2("9.4 فاتورة تأجير"),
        jeTable(
          [{ account: "1210", name: "العملاء", amount: "المبلغ + الضريبة" }],
          [{ account: "6210", name: "إيرادات تأجير المعدات", amount: "مبلغ التأجير" }, { account: "3110", name: "ضريبة القيمة المضافة - مخرجات", amount: "15%" }]
        ),
        spacer(100),
        para("مع رسوم التوصيل:", { bold: true }),
        jeTable(
          [{ account: "1210", name: "العملاء", amount: "المبلغ الكلي + الضريبة" }],
          [{ account: "6210", name: "إيرادات تأجير المعدات", amount: "مبلغ التأجير" }, { account: "6220", name: "إيرادات رسوم التوصيل", amount: "رسوم التوصيل" }, { account: "3110", name: "ضريبة القيمة المضافة - مخرجات", amount: "15%" }]
        ),
        spacer(200),

        heading2("9.5 تحصيل من عميل"),
        jeTable(
          [{ account: "1110/1120", name: "النقدية/البنك", amount: "المبلغ المحصّل" }],
          [{ account: "1210", name: "العملاء", amount: "المبلغ المحصّل" }]
        ),
        spacer(200),

        heading2("9.6 دفع لمورد"),
        jeTable(
          [{ account: "3210", name: "الموردين", amount: "المبلغ المدفوع" }],
          [{ account: "1110/1120", name: "النقدية/البنك", amount: "المبلغ المدفوع" }]
        ),
        spacer(200),

        heading2("9.7 مصروف عام"),
        jeTable(
          [{ account: "7xxx/8xxx", name: "حساب المصروف (حسب النوع)", amount: "المبلغ قبل الضريبة" }, { account: "1410", name: "ضريبة مدخلات (إن وجدت)", amount: "15%" }],
          [{ account: "1110/1120/1130", name: "النقدية/البنك/الصندوق", amount: "المبلغ الكلي" }]
        ),
        spacer(100),
        para("أو إذا كان المصروف آجلاً:", { bold: true }),
        jeTable(
          [{ account: "7xxx/8xxx", name: "حساب المصروف", amount: "المبلغ قبل الضريبة" }, { account: "1410", name: "ضريبة مدخلات", amount: "15%" }],
          [{ account: "3210", name: "الموردين", amount: "المبلغ + الضريبة" }]
        ),
        spacer(200),

        heading2("9.8 رواتب وأجور"),
        para("القيد الكامل عند دفع الرواتب:", { indent: true }),
        jeTable(
          [{ account: "8110", name: "رواتب وأجور", amount: "إجمالي الرواتب" }, { account: "8210", name: "مصروف التأمينات الاجتماعية", amount: "حصة المنشأة" }],
          [{ account: "3310", name: "مستحق الرواتب", amount: "صافي الرواتب" }, { account: "3830", name: "مستحق التأمينات الاجتماعية", amount: "إجمالي التأمينات" }, { account: "1110/1120", name: "النقدية/البنك", amount: "صافي المدفوع" }]
        ),
        spacer(200),

        heading2("9.9 إهلاك الأصول الثابتة"),
        jeTable(
          [{ account: "8310-8340", name: "مصروف الإهلاك (حسب نوع الأصل)", amount: "قسط الإهلاك" }],
          [{ account: "2210-2240", name: "مجمع الإهلاك", amount: "قسط الإهلاك" }]
        ),
        spacer(100),
        para("إهلاك معدات التأجير:", { bold: true }),
        jeTable(
          [{ account: "7250", name: "إهلاك معدات التأجير", amount: "قسط الإهلاك" }],
          [{ account: "2220", name: "مجمع إهلاك معدات التأجير", amount: "قسط الإهلاك" }]
        ),
        spacer(200),

        heading2("9.10 سلفة موظف"),
        jeTable(
          [{ account: "1230", name: "سلف الموظفين", amount: "مبلغ السلفة" }],
          [{ account: "1110", name: "النقدية", amount: "مبلغ السلفة" }]
        ),
        spacer(100),
        para("تسوية السلفة:", { bold: true }),
        jeTable(
          [{ account: "8110", name: "رواتب وأجور", amount: "مبلغ التسوية" }],
          [{ account: "1230", name: "سلف الموظفين", amount: "مبلغ التسوية" }]
        ),
        spacer(200),

        heading2("9.11 إقرار ضريبة القيمة المضافة"),
        jeTable(
          [{ account: "3110", name: "ضريبة القيمة المضافة - مخرجات", amount: "إجمالي المخرجات" }],
          [{ account: "3120", name: "ضريبة القيمة المضافة - مدخلات", amount: "إجمالي المدخلات" }, { account: "3130", name: "الضريبة المستحقة", amount: "الفرق" }]
        ),
        spacer(100),
        para("دفع الضريبة المستحقة:", { bold: true }),
        jeTable(
          [{ account: "3130", name: "الضريبة المستحقة", amount: "المبلغ" }],
          [{ account: "1120", name: "البنك", amount: "المبلغ" }]
        ),
        spacer(200),

        heading2("9.12 دفعة مقدمة من عميل"),
        jeTable(
          [{ account: "1110/1120", name: "النقدية/البنك", amount: "مبلغ الدفعة" }],
          [{ account: "3410/3420", name: "دفعات العملاء المقدمة", amount: "مبلغ الدفعة" }]
        ),
        spacer(200),

        heading2("9.13 فاتورة مقاول فرعي"),
        jeTable(
          [{ account: "7130", name: "تكاليف المقاولين الفرعيين", amount: "المبلغ قبل الضريبة" }, { account: "3120", name: "ضريبة مدخلات", amount: "15%" }],
          [{ account: "3220", name: "المقاولون الفرعيون", amount: "المبلغ + الضريبة" }]
        ),
        spacer(200),

        heading2("9.14 محتجزات"),
        jeTable(
          [{ account: "1220", name: "المحتجزات - العملاء", amount: "مبلغ المحتجزات" }],
          [{ account: "1210", name: "العملاء", amount: "مبلغ المحتجزات" }]
        ),
        spacer(200),

        heading2("9.15 الزكاة"),
        jeTable(
          [{ account: "8510", name: "مصروف الزكاة", amount: "مبلغ الزكاة" }],
          [{ account: "3810", name: "مستحق الزكاة", amount: "مبلغ الزكاة" }]
        ),
        spacer(200),

        heading2("9.16 مخصص نهاية الخدمة"),
        jeTable(
          [{ account: "8110", name: "رواتب وأجور", amount: "قسط المخصص" }],
          [{ account: "3710", name: "مخصص نهاية الخدمة", amount: "قسط المخصص" }]
        ),

        // ═══════════════════════════════════════
        // CHAPTER 7: محرك القيود التلقائية
        // ═══════════════════════════════════════
        pageBreak(),
        heading1("الفصل العاشر: محرك القيود التلقائية"),

        heading2("10.1 نظرة عامة"),
        para("يحتوي محرك المحاسبة على 18 دالة لإنشاء القيود المحاسبية تلقائياً. كل دالة تتلقى بيانات العملية وتُنشئ القيد المحاسبي المناسب مع بنوده (مدين ودائن) وتخزنه في قاعدة البيانات كوحدة واحدة ذرية (Atomic Transaction).", { indent: true }),

        heading2("10.2 الدوال التفصيلية"),
        makeTable(
          [
            { text: "الدالة", width: 30 },
            { text: "المصدر", width: 20 },
            { text: "المدين", width: 25 },
            { text: "الدائن", width: 25 },
          ],
          [
            [{ text: "autoEntrySalesInvoice", width: 30 }, { text: "فاتورة مبيعات", width: 20 }, { text: "1210 العملاء", width: 25 }, { text: "الإيرادات + 3110 ضريبة", width: 25 }],
            [{ text: "autoEntryPurchaseInvoice", width: 30 }, { text: "فاتورة مشتريات", width: 20 }, { text: "التكلفة + 3120 ضريبة", width: 25 }, { text: "3210 الموردين", width: 25 }],
            [{ text: "autoEntryProgressClaim", width: 30 }, { text: "مستخلص", width: 20 }, { text: "1210 العملاء", width: 25 }, { text: "6110 الإيرادات + 3110 ضريبة", width: 25 }],
            [{ text: "autoEntryExpense", width: 30 }, { text: "مصروف", width: 20 }, { text: "المصروف + 1410 ضريبة", width: 25 }, { text: "النقدية أو الموردين", width: 25 }],
            [{ text: "autoEntryClientPayment", width: 30 }, { text: "تحصيل عميل", width: 20 }, { text: "النقدية/البنك", width: 25 }, { text: "1210 العملاء", width: 25 }],
            [{ text: "autoEntrySupplierPayment", width: 30 }, { text: "دفع مورد", width: 20 }, { text: "3210 الموردين", width: 25 }, { text: "النقدية/البنك", width: 25 }],
            [{ text: "autoEntryRentalInvoice", width: 30 }, { text: "فاتورة تأجير", width: 20 }, { text: "1210 العملاء", width: 25 }, { text: "6210 إيرادات تأجير + ضريبة", width: 25 }],
            [{ text: "autoEntryDeliveryFees", width: 30 }, { text: "رسوم توصيل", width: 20 }, { text: "1210 العملاء", width: 25 }, { text: "6220 إيرادات توصيل + ضريبة", width: 25 }],
            [{ text: "autoEntrySubcontractorInvoice", width: 30 }, { text: "فاتورة مقاول فرعي", width: 20 }, { text: "7130 + ضريبة", width: 25 }, { text: "3220 مقاولين فرعيين", width: 25 }],
            [{ text: "autoEntryEquipmentCost", width: 30 }, { text: "تكلفة معدات", width: 20 }, { text: "7210-7300 تكلفة", width: 25 }, { text: "النقدية أو الموردين", width: 25 }],
            [{ text: "autoEntrySalary", width: 30 }, { text: "راتب", width: 20 }, { text: "8110 + 8210", width: 25 }, { text: "3310 + 3830 + النقدية", width: 25 }],
            [{ text: "autoEntryGOSI", width: 30 }, { text: "تأمينات اجتماعية", width: 20 }, { text: "8210 مصروف تأمينات", width: 25 }, { text: "3830 مستحق التأمينات", width: 25 }],
            [{ text: "autoEntryDepreciation", width: 30 }, { text: "إهلاك أصول", width: 20 }, { text: "8310-8340 مصروف إهلاك", width: 25 }, { text: "2210-2240 مجمع إهلاك", width: 25 }],
            [{ text: "autoEntryRentalDepreciation", width: 30 }, { text: "إهلاك تأجير", width: 20 }, { text: "7250 إهلاك تأجير", width: 25 }, { text: "2220 مجمع إهلاك", width: 25 }],
            [{ text: "autoEntryPettyCash", width: 30 }, { text: "صندوق طوارئ", width: 20 }, { text: "المصروف", width: 25 }, { text: "1130 صندوق طوارئ", width: 25 }],
            [{ text: "autoEntryEmployeeAdvance", width: 30 }, { text: "سلفة موظف", width: 20 }, { text: "1230 سلف الموظفين", width: 25 }, { text: "1110 النقدية", width: 25 }],
            [{ text: "autoEntryAdvanceSettlement", width: 30 }, { text: "تسوية سلفة", width: 20 }, { text: "8110 رواتب", width: 25 }, { text: "1230 سلف الموظفين", width: 25 }],
            [{ text: "autoEntryContractAdvance", width: 30 }, { text: "دفعة مقدمة عقد", width: 20 }, { text: "النقدية/البنك", width: 25 }, { text: "3410/3420 دفعات مقدمة", width: 25 }],
          ]
        ),
        spacer(200),

        heading2("10.3 آلية العكس (Reversal)"),
        para("لا يمكن حذف قيد محاسبي مرحّل مباشرة. بدلاً من ذلك، يُنشأ النظام قيداً عكسياً يبدّل المدين والدائن:", { indent: true }),
        bullet("فحص التبعيات: هل توجد عمليات لاحقة تعتمد على هذا القيد؟"),
        bullet("إنشاء قيد عكسي: تبديل المدين والدائن في جميع البنود"),
        bullet("ربط القيد العكسي بالقيد الأصلي عبر reversedEntryId"),
        bullet("تسجيل العملية في سجل المراجعة: REVERSED"),
        bullet("سلسلة العكس: يجب عكس العمليات التابعة قبل العكس الأم"),

        heading2("10.4 سجل المراجعة"),
        para("كل قيد محاسبي يمر بسجل مراجعة كامل:", { indent: true }),
        bullet("CREATED: تم إنشاء القيد"),
        bullet("POSTED: تم ترحيل القيد (أصبح نهائياً)"),
        bullet("REVERSED: تم عكس القيد"),
        bullet("CANCELLED: تم إلغاء القيد"),
        bullet("PRINTED: تم طباعة القيد"),

        // ═══════════════════════════════════════
        // CHAPTER 8: التقارير المالية
        // ═══════════════════════════════════════
        pageBreak(),
        heading1("الفصل الحادي عشر: التقارير المالية"),

        heading2("11.1 ميزان المراجعة (Trial Balance)"),
        para("يلخص أرصدة جميع الحسابات في تاريخ محدد. يحسب الرصيد الصافي (مدين/دائن) لكل حساب باستخدام قواعد الرصيد الطبيعي:", { indent: true }),
        bullet("الأصول والمصروفات: الرصيد الطبيعي مدين"),
        bullet("الالتزامات وحقوق الملكية والإيرادات: الرصيد الطبيعي دائن"),
        bullet("المصدر: القيود المحاسبية المرحّلة فقط"),

        heading2("11.2 دفتر الأستاذ العام (General Ledger)"),
        para("يعرض الحركات التفصيلية لكل حساب مع الرصيد الجاري:", { indent: true }),
        bullet("تاريخ القيد، رقم القيد، الوصف، المدين، الدائن، الرصيد الجاري"),
        bullet("فلترة حسب الحساب والفترة الزمنية"),
        bullet("المصدر: القيود المرحّلة"),

        heading2("11.3 الميزانية العمومية (Balance Sheet)"),
        para("تعرض المركز المالي في تاريخ محدد:", { indent: true }),
        makeTable(
          [
            { text: "القسم", width: 25 },
            { text: "المدى", width: 15 },
            { text: "الحسابات الرئيسية", width: 60 },
          ],
          [
            [{ text: "الأصول المتداولة", width: 25 }, { text: "1xxx", width: 15 }, { text: "نقدية، بنوك، عملاء، محتجزات، سلف، ضريبة مستردة", width: 60 }],
            [{ text: "الأصول الثابتة", width: 25 }, { text: "2xxx", width: 15 }, { text: "معدات إنشائية، معدات تأجير، مركبات، أثاث - مطروحاً منها مجمع الإهلاك", width: 60 }],
            [{ text: "الالتزامات المتداولة", width: 25 }, { text: "3xxx", width: 15 }, { text: "ضريبة مخرجات، موردين، مقاولين فرعيين، مستحق رواتب، دفعات مقدمة", width: 60 }],
            [{ text: "الالتزامات طويلة الأجل", width: 25 }, { text: "3xxx", width: 15 }, { text: "مخصص نهاية خدمة، مستحق زكاة، مستحق تأمينات", width: 60 }],
            [{ text: "حقوق الملكية", width: 25 }, { text: "4xxx", width: 15 }, { text: "رأس المال، الأرباح المبقاة", width: 60 }],
          ]
        ),
        spacer(200),

        heading2("11.4 قائمة الدخل (Income Statement)"),
        para("تعرض نتيجة الأعمال لفترة محددة:", { indent: true }),
        makeTable(
          [
            { text: "القسم", width: 25 },
            { text: "المدى", width: 15 },
            { text: "التفصيل", width: 60 },
          ],
          [
            [{ text: "إيرادات المشاريع", width: 25 }, { text: "6110", width: 15 }, { text: "إيرادات المشاريع الإنشائية", width: 60 }],
            [{ text: "إيرادات التأجير", width: 25 }, { text: "6210-6230", width: 15 }, { text: "إيرادات تأجير المعدات + التوصيل + أخرى", width: 60 }],
            [{ text: "إيرادات أخرى", width: 25 }, { text: "6310/6340", width: 15 }, { text: "أرباح بيع أصول + إيرادات خدمات", width: 60 }],
            [{ text: "تكاليف مباشرة", width: 25 }, { text: "7xxx", width: 15 }, { text: "تكاليف مشاريع، مقاولين فرعيين، تأجير، صيانة، وقود، نقل", width: 60 }],
            [{ text: "مصروفات إدارية", width: 25 }, { text: "8xxx", width: 15 }, { text: "رواتب، إيجارات، مرافق، تأمينات، إهلاك، زكاة", width: 60 }],
            [{ text: "صافي الربح", width: 25 }, { text: "-", width: 15 }, { text: "الإيرادات - التكاليف والمصروفات", width: 60 }],
          ]
        ),
        spacer(200),

        heading2("11.5 كشوف الحسابات"),
        para("كشوف تفصيلية لكل طرف:", { indent: true }),
        bullet("كشف حساب عميل: الفواتير + التحصيلات + الرصيد الحالي"),
        bullet("كشف حساب مورد: الفواتير + المدفوعات + الرصيد الحالي"),
        bullet("كشف حساب مشروع: التكاليف + الإيرادات + هامش الربح"),
        bullet("جميع الكشوف مشتقة من القيود المحاسبية المرحّلة"),

        heading2("11.6 فحص الاتساق المالي"),
        para("يتضمن النظام أداة فحص اتساق مالي تقوم بـ 7 فحوص:", { indent: true }),
        bullet("فحص القيود المفقودة على الفواتير"),
        bullet("فحص القيود المفقودة على المصروفات"),
        bullet("فحص القيود المفقودة على المدفوعات"),
        bullet("فحص القيود غير المتوازنة"),
        bullet("فحذف المراجع المكسورة"),
        bullet("فحص إجمالي الأرصدة"),
        bullet("فحص التكامل بين العمليات والقيود"),

        // ═══════════════════════════════════════
        // CHAPTER 9: نموذج البيانات
        // ═══════════════════════════════════════
        pageBreak(),
        heading1("الفصل الثاني عشر: نموذج البيانات"),

        heading2("12.1 نظرة عامة"),
        para("يحتوي النظام على 37 نموذج بيانات (Models) مترابطة تشكل الهيكل العظمي لقاعدة البيانات. جميع العمليات المالية تستخدم معاملات ذرية (prisma.$transaction) لضمان الاتساق.", { indent: true }),

        heading2("12.2 النماذج الأساسية"),
        makeTable(
          [
            { text: "النموذج", width: 20 },
            { text: "الوظيفة", width: 35 },
            { text: "الارتباطات الرئيسية", width: 45 },
          ],
          [
            [{ text: "CompanySetting", width: 20 }, { text: "بيانات الشركة المركزية", width: 35 }, { text: "اسم، شعار، رقم ضريبي، بنك، نسبة ضريبة", width: 45 }],
            [{ text: "Branch", width: 20 }, { text: "فروع الشركة", width: 35 }, { text: "مشاريع، مستودعات، موظفين، صناديق طوارئ", width: 45 }],
            [{ text: "Account", width: 20 }, { text: "دليل الحسابات", width: 35 }, { text: "كود، نوع، دور وظيفي، مستوى، أب، نوع نشاط", width: 45 }],
            [{ text: "JournalEntry", width: 20 }, { text: "القيد المحاسبي", width: 35 }, { text: "بنود، مصدر، حالة، نشاط، مشروع، عميل، مورد", width: 45 }],
            [{ text: "JournalLine", width: 20 }, { text: "بند القيد", width: 35 }, { text: "حساب، مركز تكلفة، مدين، دائن", width: 45 }],
          ]
        ),
        spacer(200),

        heading2("12.3 النماذج التشغيلية - المشاريع"),
        makeTable(
          [
            { text: "النموذج", width: 20 },
            { text: "الوظيفة", width: 35 },
            { text: "ارتباط محاسبي", width: 45 },
          ],
          [
            [{ text: "Project", width: 20 }, { text: "المشروع الإنشائي", width: 35 }, { text: "29 علاقة فرعية", width: 45 }],
            [{ text: "Contract", width: 20 }, { text: "عقد المشروع", width: 35 }, { text: "مشروع، ضمانات، أوامر تغيير", width: 45 }],
            [{ text: "BOQItem", width: 20 }, { text: "بند جدول الكميات", width: 35 }, { text: "مشروع، عقد", width: 45 }],
            [{ text: "ProgressClaim", width: 20 }, { text: "مستخلص مشروع", width: 35 }, { text: "journalEntryId - قيد تلقائي", width: 45 }],
            [{ text: "ChangeOrder", width: 20 }, { text: "أمر تغيير", width: 35 }, { text: "عقد", width: 45 }],
            [{ text: "Warranty", width: 20 }, { text: "ضمان", width: 35 }, { text: "عقد", width: 45 }],
          ]
        ),
        spacer(200),

        heading2("12.4 النماذج التشغيلية - التأجير"),
        makeTable(
          [
            { text: "النموذج", width: 20 },
            { text: "الوظيفة", width: 35 },
            { text: "ارتباط محاسبي", width: 45 },
          ],
          [
            [{ text: "Equipment", width: 20 }, { text: "المعدة", width: 35 }, { text: "حساب الأصل، مصروف الإهلاك، مجمع الإهلاك", width: 45 }],
            [{ text: "EquipmentRental", width: 20 }, { text: "عقد التأجير", width: 35 }, { text: "معدة، عميل، فواتير", width: 45 }],
            [{ text: "Timesheet", width: 20 }, { text: "سجل ساعات", width: 35 }, { text: "عقد تأجير، فاتورة", width: 45 }],
            [{ text: "EquipmentDeliveryOrder", width: 20 }, { text: "أمر توصيل", width: 35 }, { text: "عقد تأجير", width: 45 }],
          ]
        ),
        spacer(200),

        heading2("12.5 النماذج المالية"),
        makeTable(
          [
            { text: "النموذج", width: 20 },
            { text: "الوظيفة", width: 35 },
            { text: "ارتباط محاسبي", width: 45 },
          ],
          [
            [{ text: "SalesInvoice", width: 20 }, { text: "فاتورة مبيعات", width: 35 }, { text: "journalEntryId - قيد تلقائي", width: 45 }],
            [{ text: "PurchaseInvoice", width: 20 }, { text: "فاتورة مشتريات", width: 35 }, { text: "مورد، بنود", width: 45 }],
            [{ text: "ClientPayment", width: 20 }, { text: "تحصيل عميل", width: 35 }, { text: "journalEntryId - قيد تلقائي", width: 45 }],
            [{ text: "SupplierPayment", width: 20 }, { text: "دفع مورد", width: 35 }, { text: "حساب الدفع الديناميكي", width: 45 }],
            [{ text: "Expense", width: 20 }, { text: "مصروف", width: 35 }, { text: "journalEntryId - قيد تلقائي", width: 45 }],
            [{ text: "Salary", width: 20 }, { text: "راتب", width: 35 }, { text: "journalEntryId - قيد تلقائي", width: 45 }],
            [{ text: "SalaryPayment", width: 20 }, { text: "دفع راتب", width: 35 }, { text: "journalEntryId - قيد تلقائي", width: 45 }],
            [{ text: "PayrollRun", width: 20 }, { text: "مسير رواتب", width: 35 }, { text: "بنود، مدفوعات", width: 45 }],
          ]
        ),

        // ═══════════════════════════════════════
        // CHAPTER 10: الامتثال والامتثال
        // ═══════════════════════════════════════
        pageBreak(),
        heading1("الفصل الثالث عشر: الامتثال والامتثال التنظيمي"),

        heading2("13.1 معايير المحاسبة السعودية SOCPA"),
        para("يتوافق النظام بالكامل مع معايير هيئة المحاسبين القانونيين السعوديين:", { indent: true }),
        bullet("دليل الحسابات الموحّد SOCPA (تصنيف 1xxx إلى 8xxx)"),
        bullet("نظام القيد المزدوج الكامل"),
        bullet("الميزانية العمومية وقائمة الدخل وفق المعايير السعودية"),
        bullet("معالجة ضريبة القيمة المضافة (15%)"),
        bullet("حساب الزكاة الشرعية"),
        bullet("مخصص نهاية الخدمة للموظفين"),
        bullet("التأمينات الاجتماعية (GOSI)"),

        heading2("13.2 الفوترة الإلكترونية ZATCA"),
        para("يتوافق النظام مع متطلبات هيئة الزكاة والدخل للفوترة الإلكترونية:", { indent: true }),
        bullet("رمز QR بتقنية TLV على كل فاتورة"),
        bullet("بيانات QR: اسم البائع، الرقم الضريبي، التاريخ، المبلغ مع الضريبة"),
        bullet("المبلغ بالحروف عربياً وإنجليزياً"),
        bullet("رقم الفاتورة التسلسلي"),

        heading2("13.3 الإقفال الدوري"),
        para("يدعم النظام إقفال الفترات المحاسبية:", { indent: true }),
        bullet("إقفال شهري وسنوي"),
        bullet("حالة الفترة: مفتوحة / مقفلة"),
        bullet("منع تسجيل قيود في فترات مقفلة"),
        bullet("التسوية البنكية الشهرية"),

        // ═══════════════════════════════════════
        // CHAPTER 11: نظام الطباعة
        // ═══════════════════════════════════════
        pageBreak(),
        heading1("الفصل الرابع عشر: نظام الطباعة والمخرجات"),

        heading2("14.1 محرك الطباعة الموحّد"),
        para("يحتوي النظام على محرك طباعة موحّد يدعم 20 قالب طباعة:", { indent: true }),

        makeTable(
          [
            { text: "التصنيف", width: 20 },
            { text: "القوالب", width: 80 },
          ],
          [
            [{ text: "المحاسبة", width: 20 }, { text: "ميزان المراجعة، الميزانية العمومية، قائمة الدخل، دفتر الأستاذ، قيد محاسبي", width: 80 }],
            [{ text: "المشتريات", width: 20 }, { text: "أمر شراء، إذن توصيل", width: 80 }],
            [{ text: "التشغيل", width: 20 }, { text: "سجل ساعات", width: 80 }],
            [{ text: "العقود", width: 20 }, { text: "عقد مشروع، عقد تأجير", width: 80 }],
            [{ text: "المالية", width: 20 }, { text: "إشعار راتب، سند صرف", width: 80 }],
            [{ text: "الفواتير", width: 20 }, { text: "فاتورة تأجير، فاتورة مورد، فاتورة خدمية", width: 80 }],
            [{ text: "المشاريع", width: 20 }, { text: "مستخلص مشروع", width: 80 }],
            [{ text: "الضريبة", width: 20 }, { text: "إقرار ضريبي", width: 80 }],
            [{ text: "التقارير", width: 20 }, { text: "تقرير مشروع، جدول عام", width: 80 }],
          ]
        ),
        spacer(200),

        heading2("14.2 التصدير"),
        para("يدعم النظام تصدير البيانات بصيغة CSV للتقارير والبيانات التشغيلية.", { indent: true }),

        // ═══════════════════════════════════════
        // CHAPTER 12: الخلاصة
        // ═══════════════════════════════════════
        pageBreak(),
        heading1("الفصل الخامس عشر: الخلاصة"),

        para("نظام بِنَاء ERP هو نظام متكامل وشامل مصمم خصيصاً لاحتياجات شركات المقاولات الإنشائية وتأجير المعدات في المملكة العربية السعودية. يتميز النظام بالعديد من الخصائص الجوهرية:", { indent: true }),
        spacer(100),

        bullet("دليل الحسابات هو المحرك: كل حساب جديد يظهر فوراً في جميع الشاشات ذات الصلة"),
        bullet("نمط ثلاثي الطبقات: الدور ← مجموعة الحساب ← الحساب (يحاكي SAP وOracle NetSuite)"),
        bullet("محرك الربط المالي: 24 نوع عملية معرفة بالكامل بطبقة منطق محاسبي مستقلة"),
        bullet("فحص السلامة المحاسبية: 7 فحوصات يومية مع مؤشر لوني على لوحة القيادة (🟢🟡🔴)"),
        bullet("شاشة أثر الحسابات: تحليل شامل لاستخدام كل حساب قبل أي تعديل"),
        bullet("الحذف الناعم: لا يمكن حذف حساب مستخدم - التعطيل فقط مع حظر ذكي"),
        bullet("كشف حساب لكل حساب: متاح لأي حساب في دليل الحسابات وليس فقط الأطراف"),
        bullet("كل شاشة تعرف حساباتها: استعلام ديناميكي حسب الدور الوظيفي مع اختيار الحسابات الفرعية"),
        bullet("عرض القيد قبل الحفظ: المستخدم يرى الأثر المحاسبي قبل التأكيد على جميع الشاشات المالية"),
        bullet("القيد هو المصدر الوحيد: جميع التقارير المالية مشتقة من القيود المحاسبية"),
        bullet("لا حذف مباشر: نظام عكس القيود يحافظ على سجل المراجعة الكامل"),
        bullet("معاملات ذرية: كل عملية مالية تُنفذ كوحدة واحدة لا تنفصل (prisma.$transaction)"),
        bullet("سير عمل إلزامي: لا يمكن تجاوز الخطوات في أي مسار"),
        bullet("توجيه تكاليف تلقائي: التصنيف بين إنشائي/تأجيري/عام تلقائياً"),
        bullet("متوافق مع SOCPA و ZATCA: معايير محاسبية وتنظيمية سعودية"),
        bullet("44 شاشة متكاملة: تغطي جميع العمليات التشغيلية والمالية"),
        bullet("+100 نقطة API: بنية تحتية قوية للتوسع والتكامل"),
        bullet("20 قالب طباعة: مخرجات احترافية لجميع العمليات"),
        spacer(200),

        para("هذا النظام يمثل حلاً شاملاً يضمن السلامة المالية الكاملة من أول عملية تشغيلية وحتى القوائم المالية النهائية، مع الالتزام الكامل بالمعايير المحاسبية والتنظيمية في المملكة العربية السعودية.", { indent: true, bold: true, color: C.primary }),
      ],
    },
  ],
});

// ── Generate ──
async function main() {
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync("/home/z/my-project/docs/Binaa-ERP-System-Documentation.docx", buffer);
  console.log("✅ Document generated: /home/z/my-project/docs/Binaa-ERP-System-Documentation.docx");
}

main().catch(console.error);
