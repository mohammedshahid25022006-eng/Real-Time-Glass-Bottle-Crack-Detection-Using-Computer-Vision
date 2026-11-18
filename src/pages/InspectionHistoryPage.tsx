import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { fetchHistory } from '../services/api';
import { InspectionResult } from '../types/inspection';
import { ClassificationBadge, ReviewStatusBadge } from '../components/StatusBadge';
import { InspectionDetailModal } from '../components/InspectionDetailModal';

export function InspectionHistoryPage() {
  const [items, setItems] = useState<InspectionResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [classification, setClassification] = useState<string>('ALL');
  const [reviewStatus, setReviewStatus] = useState<string>('ALL');
  const [date, setDate] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [selected, setSelected] = useState<InspectionResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchHistory({
        classification,
        reviewStatus,
        date: date || undefined,
        search: search || undefined,
      });
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, [classification, reviewStatus, date, search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-base font-bold text-[#0F294A]">
              Inspection History &amp; Manual Review Queue
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Click any inspection record to view original vs processed bounding-box evidence and
              record manual review decisions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
            {[
              { id: 'ALL', label: 'All' },
              { id: 'NORMAL', label: 'Normal' },
              { id: 'SUSPECTED CRACK', label: 'Suspected Defective' },
              { id: 'MANUAL INSPECTION REQUIRED', label: 'Manual Review' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setClassification(tab.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                  classification === tab.id
                    ? 'bg-white text-[#0F294A] shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 border-t border-slate-200 pt-3">
          <div className="relative">
            <label htmlFor="hist-search" className="sr-only">
              Search inspections
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400"
              aria-hidden="true"
            />
            <input
              id="hist-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ID or lighting..."
              className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs text-slate-900"
            />
          </div>

          <div>
            <label htmlFor="hist-review-filter" className="sr-only">
              Filter by review status
            </label>
            <select
              id="hist-review-filter"
              value={reviewStatus}
              onChange={(e) => setReviewStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            >
              <option value="ALL">All Review Statuses</option>
              <option value="PENDING">Pending Review</option>
              <option value="CONFIRMED DEFECT">Confirmed Defect</option>
              <option value="MARKED NORMAL">Marked Normal</option>
              <option value="REINSPECTION REQUESTED">Reinspection Requested</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="hist-date-filter" className="sr-only">
              Filter by date
            </label>
            <input
              id="hist-date-filter"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900"
            />
            {date && (
              <button
                type="button"
                onClick={() => setDate('')}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* History Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading inspection history...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No inspection records match the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-sky-50/70 text-[#0F294A]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Inspection ID</th>
                  <th className="px-4 py-3 font-semibold">Date &amp; Time</th>
                  <th className="px-4 py-3 font-semibold">Bottle Image</th>
                  <th className="px-4 py-3 font-semibold">Classification</th>
                  <th className="px-4 py-3 font-semibold text-right">Defect Count</th>
                  <th className="px-4 py-3 font-semibold text-right">Processing Time</th>
                  <th className="px-4 py-3 font-semibold">Inspection Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-sky-50/40 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelected(item)}
                        className="font-mono font-semibold text-sky-700 hover:underline"
                      >
                        {item.id}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-600">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelected(item)}
                        aria-label={`View inspection ${item.id}`}
                        className="block overflow-hidden rounded border border-slate-200"
                      >
                        <img
                          src={item.processedImageUrl}
                          alt={`Bottle ${item.id}`}
                          className="h-11 w-16 object-cover"
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <ClassificationBadge classification={item.classification} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {item.defectCount}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                      {item.processingTimeMs} ms
                    </td>
                    <td className="px-4 py-3">
                      <ReviewStatusBadge status={item.reviewStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <InspectionDetailModal
          inspection={selected}
          onClose={() => setSelected(null)}
          onUpdated={(updated) => {
            setSelected(updated);
            void load();
          }}
        />
      )}
    </div>
  );
}
