import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { DashboardStatistics, InspectionResult } from '../src/types/inspection.ts';
import { PROCESSED_DIR, REPORTS_DIR } from './database.ts';

function csvEscape(val: unknown): string {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateCsvReport(inspections: InspectionResult[]): string {
  const header = [
    'Inspection ID',
    'Date & Time (UTC)',
    'Source',
    'Classification',
    'Heuristic Score (0-100)',
    'Defect Count',
    'Processing Time (ms)',
    'Lighting Condition',
    'Camera Distance (cm)',
    'Diffuser Distance (cm)',
    'Review Status',
    'Review Notes',
    'Defect Locations',
  ].join(',');

  const rows = inspections.map((i) => {
    const locs = i.regions
      .map((r) => `${r.regionLocation} [${r.x},${r.y},${r.width}x${r.height}]`)
      .join(' | ');
    return [
      i.id,
      i.createdAt,
      i.source,
      i.classification,
      i.heuristicScore,
      i.defectCount,
      i.processingTimeMs,
      i.lightingCondition,
      i.cameraDistanceCm,
      i.diffuserDistanceCm,
      i.reviewStatus,
      i.reviewNotes,
      locs || 'None',
    ]
      .map(csvEscape)
      .join(',');
  });

  const csvContent = [header, ...rows].join('\n');
  fs.writeFileSync(path.join(REPORTS_DIR, 'latest_inspection_report.csv'), csvContent, 'utf-8');
  return csvContent;
}

export function generateExcelReportBuffer(
  inspections: InspectionResult[],
  stats: DashboardStatistics
): Buffer {
  const wb = XLSX.utils.book_new();

  const summaryData = [
    ['GlassGuard CV — Industrial Glass Bottle Inspection Report'],
    ['Generated At (UTC)', new Date().toISOString()],
    ['Total Bottles Inspected', stats.totalInspected],
    ['Normal Bottles', stats.normalCount],
    ['Suspected Defective Bottles', stats.defectiveCount],
    ['Manual Inspection Required', stats.manualReviewRequiredCount],
    ['Pending Manual Reviews', stats.pendingManualReviews],
    ['Detection Rate (%)', stats.detectionRate],
    ['Average Processing Time (ms)', stats.avgProcessingTimeMs],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  const inspectionRows = inspections.map((i) => ({
    Inspection_ID: i.id,
    Timestamp_UTC: i.createdAt,
    Source: i.source,
    Classification: i.classification,
    Heuristic_Score: i.heuristicScore,
    Defect_Count: i.defectCount,
    Processing_Time_ms: i.processingTimeMs,
    Lighting_Condition: i.lightingCondition,
    Camera_Distance_cm: i.cameraDistanceCm,
    Diffuser_Distance_cm: i.diffuserDistanceCm,
    Review_Status: i.reviewStatus,
    Review_Notes: i.reviewNotes,
  }));
  const wsInspections = XLSX.utils.json_to_sheet(inspectionRows);
  XLSX.utils.book_append_sheet(wb, wsInspections, 'Inspections');

  const featureRows = inspections.flatMap((i) =>
    i.regions.map((r) => ({
      Inspection_ID: i.id,
      Region_ID: r.id,
      Location: r.regionLocation,
      BBox_X: r.x,
      BBox_Y: r.y,
      BBox_Width: r.width,
      BBox_Height: r.height,
      Area_px2: r.area,
      Length_px: r.length,
      Thickness_px: r.widthPx,
      Aspect_Ratio: r.aspectRatio,
      Edge_Density: r.edgeDensity,
      Shape: r.shapeCharacteristics,
      Heuristic_Score: r.heuristicScore,
    }))
  );
  const wsRegions = XLSX.utils.json_to_sheet(
    featureRows.length > 0
      ? featureRows
      : [{ Info: 'No defect bounding boxes recorded in current inspection set.' }]
  );
  XLSX.utils.book_append_sheet(wb, wsRegions, 'Defect_Regions');

  const outBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  fs.writeFileSync(path.join(REPORTS_DIR, 'latest_inspection_report.xlsx'), outBuf);
  return outBuf;
}

export async function generatePdfReportBuffer(
  inspections: InspectionResult[],
  stats: DashboardStatistics
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 44, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => {
      const buf = Buffer.concat(chunks);
      fs.writeFileSync(path.join(REPORTS_DIR, 'latest_inspection_report.pdf'), buf);
      resolve(buf);
    });
    doc.on('error', reject);

    // Header
    doc
      .fillColor('#0F294A')
      .fontSize(18)
      .font('Helvetica-Bold')
      .text('Glass Bottle Crack Detection — Quality Inspection Report');
    doc
      .fillColor('#475569')
      .fontSize(9.5)
      .font('Helvetica')
      .text(
        `Generated: ${new Date().toISOString()}  |  Methodology: Controlled Diffuse Backlighting + Classical OpenCV Pipeline`
      );
    doc.moveDown(1);

    // Summary Box
    const boxY = doc.y;
    doc.rect(44, boxY, 507, 68).fillAndStroke('#EFF6FF', '#BFDBFE');
    doc.fillColor('#0F294A').fontSize(11).font('Helvetica-Bold').text('Batch Summary', 56, boxY + 10);
    doc.fontSize(9.5).font('Helvetica').fillColor('#1E293B');
    doc.text(
      `Total Inspected: ${stats.totalInspected}    |    Normal: ${stats.normalCount}    |    Suspected Defective: ${stats.defectiveCount}    |    Manual Review Req: ${stats.manualReviewRequiredCount}`,
      56,
      boxY + 28
    );
    doc.text(
      `Defect Detection Rate: ${stats.detectionRate}%    |    Pending Reviews: ${stats.pendingManualReviews}    |    Avg Latency: ${stats.avgProcessingTimeMs} ms`,
      56,
      boxY + 45
    );
    doc.y = boxY + 82;

    doc
      .fillColor('#64748B')
      .fontSize(8.5)
      .text(
        'Note: Heuristic scores (0-100) are derived deterministically from geometric contour features (area, length, aspect ratio, Canny edge density) and are not machine-learning probabilities.'
      );
    doc.moveDown(1);

    // Inspection Records
    doc.fillColor('#0F294A').fontSize(12).font('Helvetica-Bold').text('Inspection Records & Processed Evidence');
    doc.moveDown(0.5);

    const limited = inspections.slice(0, 20);
    for (const item of limited) {
      if (doc.y > 670) doc.addPage();
      const cardY = doc.y;
      doc.rect(44, cardY, 507, 102).stroke('#CBD5E1');

      const procFilename = item.processedImageUrl.split('/').pop() || '';
      const procPath = path.join(PROCESSED_DIR, procFilename);
      if (procFilename && fs.existsSync(procPath)) {
        try {
          doc.image(procPath, 52, cardY + 8, { width: 115, height: 86, fit: [115, 86] });
        } catch {
          // Skip thumbnail if unreadable
        }
      }

      const tx = 178;
      doc.fillColor('#0F294A').fontSize(10).font('Helvetica-Bold').text(`${item.id}  —  ${item.classification}`, tx, cardY + 10);
      doc.fillColor('#334155').fontSize(8.5).font('Helvetica');
      doc.text(
        `Timestamp: ${item.createdAt}  |  Source: ${item.source}  |  Latency: ${item.processingTimeMs} ms`,
        tx,
        cardY + 26
      );
      doc.text(
        `Heuristic Score: ${item.heuristicScore}/100  |  Defects: ${item.defectCount}  |  Review: ${item.reviewStatus}`,
        tx,
        cardY + 40
      );
      doc.text(
        `Setup: ${item.lightingCondition} | Cam ${item.cameraDistanceCm} cm | Diffuser ${item.diffuserDistanceCm} cm`,
        tx,
        cardY + 54
      );
      const locText =
        item.regions.length > 0
          ? item.regions
              .slice(0, 2)
              .map((r) => `${r.regionLocation} (${r.width}x${r.height}px @ ${r.x},${r.y})`)
              .join('; ')
          : 'No crack-like bounding boxes detected inside bottle ROI.';
      doc.text(`Regions: ${locText}`, tx, cardY + 68, { width: 362 });
      if (item.reviewNotes) {
        doc.fillColor('#475569').text(`Notes: ${item.reviewNotes}`, tx, cardY + 83, { width: 362 });
      }

      doc.y = cardY + 112;
    }

    doc.end();
  });
}
