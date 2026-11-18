import * as pdf from '../../shared/pdf.ts';
export async function buildResponsibilityTermPdf(...args: Parameters<typeof pdf.buildResponsibilityTermPdf>) { return Buffer.from(await pdf.buildResponsibilityTermPdf(...args)); }
export async function buildInventoryReportPdf(...args: Parameters<typeof pdf.buildInventoryReportPdf>) { return Buffer.from(await pdf.buildInventoryReportPdf(...args)); }
export async function buildBarcodeLabelPdf(...args: Parameters<typeof pdf.buildBarcodeLabelPdf>) { return Buffer.from(await pdf.buildBarcodeLabelPdf(...args)); }
export async function buildPrinterTestPagePdf(...args: Parameters<typeof pdf.buildPrinterTestPagePdf>) { return Buffer.from(await pdf.buildPrinterTestPagePdf(...args)); }
