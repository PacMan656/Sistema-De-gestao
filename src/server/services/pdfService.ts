import PDFDocument from 'pdfkit';
import type { getMovementForTermPdf } from '../../db/queries.ts';
import { encodeCode128B } from '../../shared/barcode.ts';

type TermRecord = NonNullable<Awaited<ReturnType<typeof getMovementForTermPdf>>>;

function formatDatePtBr(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function buildResponsibilityTermPdf(record: TermRecord): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 48, bottom: 48, left: 48, right: 48 },
      info: {
        Title: `Termo de Responsabilidade ${record.movement.termNumber || record.movement.id}`,
        Author: 'Departamento de Tecnologia da Informação',
        Subject: `Guarda de Equipamento - Patrimônio ${record.equipment.assetTag}`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));

    const { movement, equipment } = record;
    const pageWidth = doc.page.width - 96;

    // Header band
    doc
      .rect(48, 42, pageWidth, 62)
      .fill('#0F172A');

    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(14)
      .text('TERMO DE RESPONSABILIDADE E GUARDA DE EQUIPAMENTO DE TI', 64, 56, {
        width: pageWidth - 32,
      });

    doc
      .fillColor('#CBD5E1')
      .font('Helvetica')
      .fontSize(9.5)
      .text(
        `Documento Nº: ${movement.termNumber || `TRM-${movement.id}`}   |   Emissão: ${formatDatePtBr(new Date(movement.occurredAt))}`,
        64,
        80
      );

    let y = 122;

    const drawSectionHeader = (title: string) => {
      doc
        .rect(48, y, pageWidth, 22)
        .fill('#F1F5F9');
      doc
        .fillColor('#0F172A')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(title, 56, y + 6);
      y += 30;
    };

    const drawKeyValueRow = (label: string, value: string) => {
      doc
        .fillColor('#475569')
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(label, 52, y, { width: 155 });
      doc
        .fillColor('#0F172A')
        .font('Helvetica')
        .fontSize(9.5)
        .text(value || '—', 210, y, { width: pageWidth - 166 });
      const textHeight = doc.heightOfString(value || '—', { width: pageWidth - 166 });
      y += Math.max(17, textHeight + 5);
    };

    // Section 1: Collaborator
    drawSectionHeader('1. IDENTIFICAÇÃO DO COLABORADOR RECEBEDOR');
    drawKeyValueRow('Nome Completo:', movement.collaboratorName);
    drawKeyValueRow('CPF / Matrícula:', movement.collaboratorDocument);
    drawKeyValueRow('Cargo / Função:', movement.collaboratorRole);
    drawKeyValueRow('Setor / Departamento:', movement.collaboratorDepartment);
    drawKeyValueRow('Motivo da Alocação:', movement.reason);
    y += 8;

    // Section 2: Equipment specs
    drawSectionHeader('2. ESPECIFICAÇÕES DO EQUIPAMENTO E PROPRIEDADE');
    drawKeyValueRow('Nº de Patrimônio:', equipment.assetTag);
    drawKeyValueRow('Nº de Série:', equipment.serialNumber);
    drawKeyValueRow(
      'Tipo / Marca / Modelo:',
      `${equipment.equipmentType} — ${equipment.brand} ${equipment.model} (Ano ${equipment.manufactureYear})`
    );
    drawKeyValueRow('Empresa Responsável:', equipment.responsibleCompany);

    const ownershipText =
      equipment.ownershipType === 'Próprio'
        ? 'Próprio (Ativo Imobilizado da Empresa)'
        : `${equipment.ownershipType} — Contrato Nº ${equipment.contractNumber || 'N/I'} | Fornecedor: ${equipment.supplierName || 'N/I'}${equipment.contractEndDate ? ` | Vigência: ${equipment.contractEndDate}` : ''}`;
    drawKeyValueRow('Regime de Propriedade:', ownershipText);
    drawKeyValueRow(
      'Acessórios Entregues:',
      movement.accessoriesIncluded || equipment.accessories || 'Nenhum acessório adicional'
    );
    drawKeyValueRow(
      'Estado de Conservação:',
      `${movement.conditionState}${movement.notes ? ` — ${movement.notes}` : ''}`
    );
    y += 10;

    // Section 3: Legal clauses
    drawSectionHeader('3. CLÁUSULAS DE GUARDA, USO E DEVOLUÇÃO');
    const clauses = [
      '1. OBJETO E FINALIDADE: O colaborador acima identificado declara ter recebido o equipamento descrito neste termo em perfeito funcionamento, comprometendo-se a utilizá-lo exclusivamente para o desempenho de suas atividades profissionais junto à organização.',
      '2. ZELO E CONSERVAÇÃO: O portador obriga-se a zelar pela integridade física e lógica do equipamento e seus acessórios, não realizando reparos por conta própria, instalações de softwares não homologados ou remoção de lacres e etiquetas de patrimônio.',
      '3. EXTRAVIO, FURTO OU AVARIAS: Em caso de dano, defeito técnico, perda, furto ou roubo, o colaborador deverá comunicar imediatamente o Departamento de TI via canal oficial de Helpdesk e, nos casos de sinistro externo, apresentar Boletim de Ocorrência em até 24 horas.',
      '4. DEVOLUÇÃO E AUDITORIA: O equipamento poderá ser requisitado pela equipe de TI para vistorias periódicas ou manutenções preventivas, devendo ser devolvido integralmente nas mesmas condições de recebimento (salvo desgaste natural de uso) no ato de desligamento, transferência de setor ou solicitação formal.',
    ];

    doc.fillColor('#1E293B').font('Helvetica').fontSize(8.8);
    for (const clause of clauses) {
      doc.text(clause, 52, y, {
        width: pageWidth - 8,
        align: 'justify',
        lineGap: 2,
      });
      y = doc.y + 7;
    }

    y += 12;

    // Section 4: Signatures
    if (y > 680) {
      doc.addPage();
      y = 64;
    }

    doc
      .fillColor('#0F172A')
      .font('Helvetica')
      .fontSize(9.5)
      .text(
        `Local e Data: ____________________________, ${new Intl.DateTimeFormat('pt-BR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        }).format(new Date(movement.occurredAt))}.`,
        52,
        y
      );

    y += 52;
    const sigWidth = (pageWidth - 40) / 2;

    doc
      .moveTo(52, y)
      .lineTo(52 + sigWidth, y)
      .stroke('#334155');
    doc
      .moveTo(52 + sigWidth + 40, y)
      .lineTo(52 + sigWidth * 2 + 40, y)
      .stroke('#334155');

    y += 6;
    doc
      .fillColor('#0F172A')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(movement.collaboratorName, 52, y, { width: sigWidth, align: 'center' });
    doc.text(record.technicianName, 52 + sigWidth + 40, y, {
      width: sigWidth,
      align: 'center',
    });

    y += 12;
    doc
      .fillColor('#475569')
      .font('Helvetica')
      .fontSize(8)
      .text(
        `Colaborador Recebedor (${movement.collaboratorDocument})`,
        52,
        y,
        { width: sigWidth, align: 'center' }
      );
    doc.text(
      `Técnico de TI Responsável${record.technicianMatricula ? ` (${record.technicianMatricula})` : ''}`,
      52 + sigWidth + 40,
      y,
      { width: sigWidth, align: 'center' }
    );

    // Footer
    doc
      .fillColor('#94A3B8')
      .fontSize(7.5)
      .text(
        `Registro imutável gerado automaticamente pelo Sistema PatriTI · Movimentação #${movement.id} · Patrimônio ${equipment.assetTag}`,
        48,
        doc.page.height - 42,
        { width: pageWidth, align: 'center' }
      );

    doc.end();
  });
}

export interface InventoryExportRow {
  assetTag: string;
  serialNumber: string;
  equipmentType: string;
  brand: string;
  model: string;
  departmentCode: string | null;
  departmentName: string | null;
  ownershipType: string;
  contractNumber: string | null;
  operationalStatus: string;
  currentHolderName: string | null;
  manufactureYear: number;
  nextInspectionDate: string | null;
}

export function buildInventoryReportPdf(
  items: InventoryExportRow[],
  filterSummary: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: { top: 36, bottom: 36, left: 36, right: 36 },
      info: {
        Title: 'Relatório de Inventário de Equipamentos de TI',
        Author: 'Departamento de Tecnologia da Informação',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));

    const pageWidth = doc.page.width - 72;
    const nowFormatted = formatDatePtBr(new Date());

    const drawHeader = () => {
      doc.rect(36, 32, pageWidth, 48).fill('#0F172A');
      doc
        .fillColor('#FFFFFF')
        .font('Helvetica-Bold')
        .fontSize(13)
        .text('RELATÓRIO DE INVENTÁRIO DE EQUIPAMENTOS DE TI', 48, 42);
      doc
        .fillColor('#CBD5E1')
        .font('Helvetica')
        .fontSize(8.5)
        .text(
          `Emitido em: ${nowFormatted}   |   Total de Ativos: ${items.length}   |   Filtros: ${filterSummary}`,
          48,
          60,
          { width: pageWidth - 24 }
        );
    };

    const cols = [
      { label: 'Patrimônio', x: 36, w: 78 },
      { label: 'Série', x: 114, w: 88 },
      { label: 'Tipo', x: 202, w: 66 },
      { label: 'Marca / Modelo', x: 268, w: 145 },
      { label: 'Setor', x: 413, w: 62 },
      { label: 'Propriedade', x: 475, w: 78 },
      { label: 'Status', x: 553, w: 80 },
      { label: 'Portador Atual', x: 633, w: 110 },
      { label: 'Próx. Vist.', x: 743, w: 63 },
    ];

    const drawTableHeader = (yPos: number) => {
      doc.rect(36, yPos, pageWidth, 20).fill('#F1F5F9');
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(8);
      for (const col of cols) {
        doc.text(col.label, col.x + 4, yPos + 6, {
          width: col.w - 6,
          ellipsis: true,
        });
      }
      return yPos + 22;
    };

    drawHeader();
    let y = drawTableHeader(92);

    items.forEach((item, index) => {
      if (y > doc.page.height - 54) {
        doc.addPage({ size: 'A4', layout: 'landscape', margins: { top: 36, bottom: 36, left: 36, right: 36 } });
        drawHeader();
        y = drawTableHeader(92);
      }

      if (index % 2 === 1) {
        doc.rect(36, y - 2, pageWidth, 18).fill('#F8FAFC');
      }

      doc.fillColor('#0F172A').font('Helvetica').fontSize(7.8);
      const values = [
        item.assetTag,
        item.serialNumber,
        item.equipmentType,
        `${item.brand} ${item.model}`,
        item.departmentCode || '—',
        item.contractNumber ? `${item.ownershipType} (${item.contractNumber})` : item.ownershipType,
        item.operationalStatus,
        item.currentHolderName || 'Em estoque',
        item.nextInspectionDate || '—',
      ];

      cols.forEach((col, cIdx) => {
        doc.text(values[cIdx], col.x + 4, y + 2, {
          width: col.w - 6,
          height: 14,
          ellipsis: true,
        });
      });

      y += 18;
    });

    doc.end();
  });
}

export interface AssetLabelData {
  assetTag: string;
  serialNumber: string;
  equipmentType: string;
  brand: string;
  model: string;
  departmentCode: string | null;
  departmentName: string | null;
  ownershipType: string;
  contractNumber: string | null;
  responsibleCompany: string;
  nextInspectionDate: string | null;
  connectionInterface: string;
  networkAddress: string | null;
}

function drawCode128Vector(
  doc: PDFKit.PDFDocument,
  text: string,
  startX: number,
  startY: number,
  barHeight: number,
  moduleWidth: number
) {
  const encoded = encodeCode128B(text);
  doc.fillColor('#000000');
  for (const bar of encoded.bars) {
    doc.rect(
      startX + bar.x * moduleWidth,
      startY,
      bar.width * moduleWidth,
      barHeight
    ).fill('#000000');
  }
  return encoded.totalWidth * moduleWidth;
}

export function buildBarcodeLabelPdf(asset: AssetLabelData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A5',
      layout: 'landscape',
      margins: { top: 28, bottom: 28, left: 28, right: 28 },
      info: {
        Title: `Etiqueta Patrimonial ${asset.assetTag}`,
        Author: 'Departamento de TI - PatriTI',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));

    const w = doc.page.width - 56;

    // Outer label frame
    doc.lineWidth(1.5).rect(28, 28, w, doc.page.height - 56).stroke('#0F172A');
    doc.rect(28, 28, w, 40).fill('#0F172A');

    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('ETIQUETA DE IDENTIFICAÇÃO PATRIMONIAL — TI', 42, 41);

    doc
      .fillColor('#CBD5E1')
      .font('Helvetica')
      .fontSize(9)
      .text(`${asset.departmentCode || 'TI'} · ${asset.departmentName || 'Corporativo'}`, 42, 42, {
        width: w - 28,
        align: 'right',
      });

    // Asset info block
    let y = 84;
    doc
      .fillColor('#0F172A')
      .font('Helvetica-Bold')
      .fontSize(15)
      .text(`${asset.brand} ${asset.model}`, 42, y);

    y += 22;
    doc
      .fillColor('#334155')
      .font('Helvetica')
      .fontSize(9.5)
      .text(
        `Tipo: ${asset.equipmentType}   |   Empresa: ${asset.responsibleCompany}   |   Regime: ${asset.ownershipType}${asset.contractNumber ? ` (${asset.contractNumber})` : ''}`,
        42,
        y
      );

    y += 16;
    doc.text(
      `Interface: ${asset.connectionInterface}${asset.networkAddress ? ` (${asset.networkAddress})` : ''}   |   Próx. Vistoria: ${asset.nextInspectionDate || 'A definir'}`,
      42,
      y
    );

    // Barcode 1: Número de Patrimônio
    y += 30;
    doc.rect(42, y, w - 28, 92).fill('#F8FAFC').stroke('#CBD5E1');
    doc
      .fillColor('#475569')
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .text('NÚMERO DE PATRIMÔNIO (CODE 128)', 54, y + 10);

    drawCode128Vector(doc, asset.assetTag, 54, y + 25, 42, 1.8);

    doc
      .fillColor('#0F172A')
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(asset.assetTag, 54, y + 72);

    // Barcode 2: Número de Série
    y += 104;
    doc.rect(42, y, w - 28, 92).fill('#F8FAFC').stroke('#CBD5E1');
    doc
      .fillColor('#475569')
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .text('NÚMERO DE SÉRIE DO FABRICANTE (CODE 128)', 54, y + 10);

    drawCode128Vector(doc, asset.serialNumber, 54, y + 25, 42, 1.5);

    doc
      .fillColor('#0F172A')
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(asset.serialNumber, 54, y + 72);

    doc.end();
  });
}

export function buildPrinterTestPagePdf(
  asset: AssetLabelData,
  technicianName: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 48, bottom: 48, left: 48, right: 48 },
      info: {
        Title: `Página de Teste de Impressão - ${asset.assetTag}`,
        Author: 'PatriTI - Helpdesk & Infraestrutura',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));

    const w = doc.page.width - 96;

    doc.rect(48, 44, w, 58).fill('#0F172A');
    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(15)
      .text('PÁGINA DE TESTE DE IMPRESSÃO E DIAGNÓSTICO DE TI', 64, 58);
    doc
      .fillColor('#CBD5E1')
      .font('Helvetica')
      .fontSize(9)
      .text(
        `Emitido por: ${technicianName}   |   Data/Hora: ${formatDatePtBr(new Date())}`,
        64,
        80
      );

    let y = 124;
    const rows: [string, string][] = [
      ['Patrimônio / Ativo:', asset.assetTag],
      ['Número de Série:', asset.serialNumber],
      ['Equipamento:', `${asset.equipmentType} — ${asset.brand} ${asset.model}`],
      ['Setor Vinculado:', `${asset.departmentCode || '—'} · ${asset.departmentName || '—'}`],
      ['Interface de Conexão:', asset.connectionInterface],
      ['Endereço / Porta Cabo ou USB:', asset.networkAddress || 'Porta local do equipamento'],
    ];

    for (const [k, v] of rows) {
      doc.fillColor('#475569').font('Helvetica-Bold').fontSize(9.5).text(k, 52, y, { width: 170 });
      doc.fillColor('#0F172A').font('Helvetica').fontSize(9.5).text(v, 225, y);
      y += 20;
    }

    y += 14;
    doc
      .fillColor('#0F172A')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('ESCALA DE CONTRASTE E ALINHAMENTO DE CABEÇA / TONER', 48, y);
    y += 16;

    const shades = ['#0F172A', '#334155', '#64748B', '#94A3B8', '#CBD5E1', '#2563EB', '#16A34A', '#DC2626'];
    const boxW = w / shades.length;
    shades.forEach((hex, idx) => {
      doc.rect(48 + idx * boxW, y, boxW - 4, 28).fill(hex);
    });

    y += 46;
    doc
      .fillColor('#0F172A')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('TESTE DE NITIDEZ DE CÓDIGO DE BARRAS (PATRIMÔNIO)', 48, y);
    y += 14;
    drawCode128Vector(doc, asset.assetTag, 48, y, 48, 1.9);
    doc.fillColor('#0F172A').font('Helvetica').fontSize(9.5).text(asset.assetTag, 48, y + 54);

    doc.end();
  });
}
