import { useEffect, useState } from 'react';
import { FileSpreadsheet, FileText, Table } from 'lucide-react';
import { fetchDashboardStats, fetchHistory } from '../services/api';
import { DashboardStatistics, InspectionResult } from '../types/inspection';
import { ClassificationBadge, ReviewStatusBadge } from '../components/StatusBadge';

export function ReportsPage() {
  const [stats, setStats] = useState<DashboardStatistics | null>(null);
  const [items, setItems] = useState<InspectionResult[]>([]);

  useEffect(() => {
    void Promise.all([fetchDashboardStats(), fetchHistory()]).then(([s, h]) => {
      setStats(s);
      setItems(h);
    });
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-bold text-[#0F294A]">
          Quality Inspection Report Generation
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          Export full inspection summaries, processed detection evidence, defect bounding box
          coordinates, and manual inspector review decisions in PDF, CSV, or Excel format.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          <a
            href="/api/reports/pdf"
            download="glass_inspection_report.pdf"
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-sky-50/60 p-4 hover:border-sky-300 hover:bg-sky-50 transition-colors"
          >
            <div>
              <p className="text-sm font-bold text-[#0F294A]">Download PDF Report</p>
              <p className="mt-1 text-xs text-slate-600">
                Includes summary stats, processed images, coordinates &amp; review notes
              </p>
            </div>
            <FileText className="h-6 w-6 shrink-0 text-red-700" aria-hidden="true" />
          </a>

          <a
            href="/api/reports/csv"
            download="glass_inspection_report.csv"
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-sky-50/60 p-4 hover:border-sky-300 hover:bg-sky-50 transition-colors"
          >
            <div>
              <p className="text-sm font-bold text-[#0F294A]">Download CSV Export</p>
              <p className="mt-1 text-xs text-slate-600">
                Machine-readable inspection log with defect locations &amp; latency
              </p>
            </div>
            <Table className="h-6 w-6 shrink-0 text-sky-700" aria-hidden="true" />
          </a>

          <a
            href="/api/reports/excel"
            download="glass_inspection_report.xlsx"
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-sky-50/60 p-4 hover:border-sky-300 hover:bg-sky-50 transition-colors"
          >
            <div>
              <p className="text-sm font-bold text-[#0F294A]">Download Excel (.xlsx)</p>
              <p className="mt-1 text-xs text-slate-600">
                Multi-sheet workbook: Summary, Inspections, and Defect_Regions
              </p>
            </div>
            <FileSpreadsheet className="h-6 w-6 shrink-0 text-emerald-700" aria-hidden="true" />
          </a>
        </div>
      </div>

      {stats && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <h3 className="text-sm font-semibold text-[#0F294A]">Report Batch Preview</h3>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {stats.totalInspected} total · {stats.normalCount} normal · {stats.defectiveCount}{' '}
              defective
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-semibold">ID</th>
                  <th className="px-3 py-2 font-semibold">Date &amp; Time</th>
                  <th className="px-3 py-2 font-semibold">Classification</th>
                  <th className="px-3 py-2 font-semibold">Defect Locations</th>
                  <th className="px-3 py-2 font-semibold">Manual Review Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 font-mono font-semibold text-[#0F294A]">{item.id}</td>
                    <td className="px-3 py-2 font-mono tabular-nums text-slate-600">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <ClassificationBadge classification={item.classification} />
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {item.regions.length > 0
                        ? item.regions
                            .map(
                              (r) =>
                                `${r.regionLocation} [${r.x},${r.y},${r.width}×${r.height}]`
                            )
                            .join('; ')
                        : 'None'}
                    </td>
                    <td className="px-3 py-2">
                      <ReviewStatusBadge status={item.reviewStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
