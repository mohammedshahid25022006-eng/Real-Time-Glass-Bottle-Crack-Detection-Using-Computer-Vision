import { useState } from 'react';
import { Check, RotateCcw, ShieldAlert, X } from 'lucide-react';
import { submitManualReview } from '../services/api';
import { InspectionResult, ReviewStatus } from '../types/inspection';
import { ClassificationBadge, ReviewStatusBadge } from './StatusBadge';

export function InspectionDetailModal({
  inspection,
  onClose,
  onUpdated,
}: {
  inspection: InspectionResult;
  onClose: () => void;
  onUpdated: (updated: InspectionResult) => void;
}) {
  const [notes, setNotes] = useState(inspection.reviewNotes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDecision = async (status: ReviewStatus) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await submitManualReview(inspection.id, status, notes);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save manual review');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inspection-modal-title"
    >
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2
              id="inspection-modal-title"
              className="text-lg font-bold text-[#0F294A] font-mono tabular-nums"
            >
              {inspection.id}
            </h2>
            <ClassificationBadge classification={inspection.classification} />
            <ReviewStatusBadge status={inspection.reviewStatus} />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close inspection detail"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {/* Metadata strip */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
            <span>
              Timestamp:{' '}
              <strong className="font-mono tabular-nums text-slate-900">
                {new Date(inspection.createdAt).toLocaleString()}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Source: <strong className="text-slate-900 capitalize">{inspection.source}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Latency:{' '}
              <strong className="font-mono tabular-nums text-slate-900">
                {inspection.processingTimeMs} ms
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Heuristic Score:{' '}
              <strong className="font-mono tabular-nums text-slate-900">
                {inspection.heuristicScore}/100
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Lighting: <strong className="text-slate-900">{inspection.lightingCondition}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Distance:{' '}
              <strong className="font-mono tabular-nums text-slate-900">
                Cam {inspection.cameraDistanceCm} cm / Diffuser {inspection.diffuserDistanceCm} cm
              </strong>
            </span>
          </div>

          {/* Side-by-side images */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-semibold text-[#0F294A]">Original Captured Image</p>
              <img
                src={inspection.originalImageUrl}
                alt={`Original bottle capture ${inspection.id}`}
                className="w-full rounded border border-slate-200 bg-white object-contain max-h-64"
              />
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-semibold text-[#0F294A]">
                Processed Output (ROI &amp; Defect Bounding Boxes)
              </p>
              <img
                src={inspection.processedImageUrl}
                alt={`Processed detection output ${inspection.id}`}
                className="w-full rounded border border-slate-200 bg-white object-contain max-h-64"
              />
            </div>
          </div>

          {/* Detected Defect Regions Table */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#0F294A]">
                Detected Crack-Like Regions ({inspection.regions.length})
              </h3>
              <span className="text-xs text-slate-500">
                Rule-based heuristic score (not an ML probability)
              </span>
            </div>
            {inspection.regions.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                No suspected crack regions exceeded false-positive filtering thresholds.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-sky-50/70 text-[#0F294A]">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Region</th>
                      <th className="px-3 py-2 font-semibold">Location</th>
                      <th className="px-3 py-2 font-semibold">Shape</th>
                      <th className="px-3 py-2 font-semibold text-right">BBox (x,y,w×h)</th>
                      <th className="px-3 py-2 font-semibold text-right">Area (px²)</th>
                      <th className="px-3 py-2 font-semibold text-right">Length (px)</th>
                      <th className="px-3 py-2 font-semibold text-right">Aspect Ratio</th>
                      <th className="px-3 py-2 font-semibold text-right">Edge Density</th>
                      <th className="px-3 py-2 font-semibold text-right">Heuristic</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {inspection.regions.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2 font-mono font-semibold text-slate-900">#{r.id}</td>
                        <td className="px-3 py-2 text-slate-700">{r.regionLocation}</td>
                        <td className="px-3 py-2 text-slate-700">{r.shapeCharacteristics}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">
                          {r.x},{r.y} ({r.width}×{r.height})
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900">
                          {r.area}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900">
                          {r.length}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900">
                          {r.aspectRatio}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900">
                          {r.edgeDensity}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-red-700">
                          {r.heuristicScore}/100
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Module H: Manual Review Decision */}
          <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-4">
            <h3 className="text-sm font-semibold text-[#0F294A]">
              Manual Inspector Verification (Human-in-the-Loop)
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              Review the processed bounding boxes and record a manual verification decision. Decisions
              are persisted to the inspection database without automatically discarding samples.
            </p>
            <div className="mt-3">
              <label
                htmlFor="manual-review-notes"
                className="block text-xs font-medium text-slate-700"
              >
                Inspector Notes
              </label>
              <input
                id="manual-review-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional note (e.g., Confirmed diagonal wall fracture or water glare)"
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none focus:ring-1 focus:ring-sky-600"
              />
            </div>

            {error && (
              <p className="mt-2 text-xs font-medium text-red-700" role="alert">
                {error}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleDecision('CONFIRMED DEFECT')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 whitespace-nowrap transition-colors"
              >
                <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                Confirm Defect
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleDecision('MARKED NORMAL')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap transition-colors"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                Mark as Normal
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleDecision('REINSPECTION REQUESTED')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50 whitespace-nowrap transition-colors"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Send for Reinspection
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
