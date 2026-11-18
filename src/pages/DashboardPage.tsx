import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, Camera, Upload } from 'lucide-react';
import { fetchDashboardStats } from '../services/api';
import { DashboardStatistics, InspectionResult } from '../types/inspection';
import { ClassificationBadge, ReviewStatusBadge } from '../components/StatusBadge';
import { InspectionDetailModal } from '../components/InspectionDetailModal';

export function DashboardPage({
  onNavigate,
}: {
  onNavigate: (tab: string) => void;
}) {
  const [stats, setStats] = useState<DashboardStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<InspectionResult | null>(null);

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDashboardStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStats();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((k) => (
            <div
              key={k}
              className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white p-4"
            />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error || 'Unable to load inspection dashboard.'}
      </div>
    );
  }

  const distributionData = [
    { name: 'Normal', value: stats.normalCount, color: '#16A34A' },
    { name: 'Suspected Crack', value: stats.defectiveCount, color: '#DC2626' },
    { name: 'Manual Review', value: stats.manualReviewRequiredCount, color: '#D97706' },
  ];

  return (
    <div className="space-y-6">
      {/* Primary Action Strip */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-sky-200 bg-sky-50/70 p-5 md:flex-row md:items-center">
        <div>
          <h2 className="text-base font-bold text-[#0F294A]">
            Industrial Glass Bottle Optical Quality Inspection
          </h2>
          <p className="mt-1 text-sm text-slate-700">
            Controlled diffuse LED backlighting (18 cm bottle-to-diffuser, 25–40 cm camera distance)
            with classical OpenCV contour &amp; Canny edge analysis.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('live-camera')}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0F294A] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#173B69] whitespace-nowrap transition-colors"
          >
            <Camera className="h-4 w-4" aria-hidden="true" />
            Open Live Camera
          </button>
          <button
            type="button"
            onClick={() => onNavigate('image-upload')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap transition-colors"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            Upload Bottle Image
          </button>
        </div>
      </div>

      {/* 5 Live KPIs from SQLite */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Total Bottles Inspected</p>
          <p
            data-testid="kpi-total"
            className="mt-2 text-2xl font-bold text-[#0F294A] font-mono tabular-nums"
          >
            {stats.totalInspected}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            Avg latency {stats.avgProcessingTimeMs} ms
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Normal Bottles</p>
          <p
            data-testid="kpi-normal"
            className="mt-2 text-2xl font-bold text-emerald-700 font-mono tabular-nums"
          >
            {stats.normalCount}
          </p>
          <p className="mt-1 text-xs text-emerald-700">Passed optical check</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Suspected Defective</p>
          <p
            data-testid="kpi-defective"
            className="mt-2 text-2xl font-bold text-red-700 font-mono tabular-nums"
          >
            {stats.defectiveCount}
          </p>
          <p className="mt-1 text-xs text-red-700">Crack-like regions flagged</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Detection Rate</p>
          <p
            data-testid="kpi-rate"
            className="mt-2 text-2xl font-bold text-[#0F294A] font-mono tabular-nums"
          >
            {stats.detectionRate}%
          </p>
          <p className="mt-1 text-xs text-slate-500">Defective share of inspected batch</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Pending Manual Reviews</p>
          <p
            data-testid="kpi-pending"
            className="mt-2 text-2xl font-bold text-amber-700 font-mono tabular-nums"
          >
            {stats.pendingManualReviews}
          </p>
          <p className="mt-1 text-xs text-amber-700">Awaiting inspector verification</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Normal vs Defective */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-[#0F294A]">Classification Breakdown</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Live SQLite counts across inspected samples
          </p>
          <div className="mt-4 h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={distributionData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {distributionData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={32} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Daily Inspection Statistics */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-[#0F294A]">Daily Inspection Statistics</h3>
          <p className="mt-0.5 text-xs text-slate-500">Normal vs suspected defective by date</p>
          <div className="mt-4 h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.dailyStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend verticalAlign="bottom" height={32} />
                <Bar dataKey="normal" name="Normal" fill="#16A34A" maxBarSize={40} radius={[3, 3, 0, 0]} />
                <Bar dataKey="defective" name="Defective" fill="#DC2626" maxBarSize={40} radius={[3, 3, 0, 0]} />
                <Bar dataKey="manual" name="Manual Req" fill="#D97706" maxBarSize={40} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Defect Detection Trend & Latency */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-[#0F294A]">Defect Rate &amp; Processing Trend</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Cumulative detection rate (%) &amp; CV latency (ms)
          </p>
          <div className="mt-4 h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.defectTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend verticalAlign="bottom" height={32} />
                <Line
                  type="monotone"
                  dataKey="defectRate"
                  name="Cumulative Defect %"
                  stroke="#DC2626"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="avgLatencyMs"
                  name="Latency (ms)"
                  stroke="#0284C7"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Inspection History */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold text-[#0F294A]">Recent Inspection History</h3>
            <p className="text-xs text-slate-500">
              Click any record to inspect bounding boxes or submit a manual review
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('history')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-900 whitespace-nowrap"
          >
            View All Records
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        {stats.recentInspections.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No inspections recorded yet. Start the Live Camera or upload a bottle image to begin.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Inspection ID</th>
                  <th className="px-4 py-3 font-semibold">Date &amp; Time</th>
                  <th className="px-4 py-3 font-semibold">Preview</th>
                  <th className="px-4 py-3 font-semibold">Classification</th>
                  <th className="px-4 py-3 font-semibold text-right">Defects</th>
                  <th className="px-4 py-3 font-semibold text-right">Time (ms)</th>
                  <th className="px-4 py-3 font-semibold">Review Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {stats.recentInspections.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-sky-50/40 transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => setSelected(item)}
                        className="font-mono font-semibold text-sky-700 hover:underline"
                      >
                        {item.id}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 font-mono tabular-nums text-slate-600">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => setSelected(item)}
                        aria-label={`Inspect ${item.id} processed image`}
                        className="block rounded border border-slate-200 overflow-hidden"
                      >
                        <img
                          src={item.processedImageUrl}
                          alt={`Processed ${item.id}`}
                          className="h-10 w-14 object-cover"
                        />
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <ClassificationBadge classification={item.classification} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {item.defectCount}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700">
                      {item.processingTimeMs} ms
                    </td>
                    <td className="px-4 py-2.5">
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
          onUpdated={() => {
            setSelected(null);
            void loadStats();
          }}
        />
      )}
    </div>
  );
}
