import { ChangeEvent, useEffect, useState } from 'react';
import { RefreshCw, Upload } from 'lucide-react';
import { fetchDataset, PipelinePreviewResponse, previewPipeline } from '../services/api';
import { DatasetItem } from '../types/inspection';
import { ClassificationBadge } from '../components/StatusBadge';

export function ImageProcessingPage() {
  const [samples, setSamples] = useState<DatasetItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [customDataUrl, setCustomDataUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<PipelinePreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runPreview = async (opts: { datasetId?: string; imageDataUrl?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await previewPipeline({ ...opts, includeSteps: true });
      setPreview(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run preprocessing pipeline');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDataset()
      .then((items) => {
        setSamples(items);
        if (items.length > 0) {
          // Prefer a cracked bottle first so users immediately see rich edge/contour steps
          const crackFirst = items.find((i) => i.label === 'Crack') || items[0];
          setSelectedId(crackFirst.id);
          void runPreview({ datasetId: crackFirst.id });
        }
      })
      .catch(() => {});
  }, []);

  const handleSampleChange = (id: string) => {
    setSelectedId(id);
    setCustomDataUrl(null);
    void runPreview({ datasetId: id });
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      setCustomDataUrl(url);
      setSelectedId('');
      void runPreview({ imageDataUrl: url });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      {/* Control Header */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 md:flex-row md:items-center">
        <div>
          <h2 className="text-base font-bold text-[#0F294A]">
            10-Step Computer Vision Preprocessing Agent
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Inspect every intermediate transformation stage from raw backlit capture to Canny edges,
            morphological closing, contour filtering, and rule-based classification.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div>
            <label htmlFor="pipeline-sample-select" className="sr-only">
              Select Dataset Sample
            </label>
            <select
              id="pipeline-sample-select"
              value={selectedId}
              onChange={(e) => handleSampleChange(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            >
              {samples.map((s) => (
                <option key={s.id} value={s.id}>
                  [{s.label}] {s.filename}
                </option>
              ))}
            </select>
          </div>

          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap">
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            Upload Custom Image
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.bmp,image/jpeg,image/png,image/bmp"
              onChange={handleFileUpload}
              className="sr-only"
            />
          </label>

          <button
            type="button"
            disabled={loading}
            onClick={() =>
              void runPreview(
                customDataUrl ? { imageDataUrl: customDataUrl } : { datasetId: selectedId }
              )
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F294A] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#173B69] disabled:opacity-50 whitespace-nowrap"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Re-Run Pipeline
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
          {error}
        </div>
      )}

      {preview && (
        <>
          {/* Summary Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-sky-200 bg-sky-50/70 px-5 py-3.5">
            <div className="flex flex-wrap items-center gap-3">
              <ClassificationBadge classification={preview.classification} />
              <span className="text-xs font-mono tabular-nums text-slate-700">
                Heuristic Score: {preview.heuristicScore}/100 · {preview.defectCount} accepted
                region(s) · {preview.rejectedCandidates.length} filtered out
              </span>
            </div>
            <span className="text-xs font-mono tabular-nums text-[#0F294A]">
              Total Execution: {preview.processingTimeMs} ms
            </span>
          </div>

          {/* 10 Pipeline Stages Grid */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-2">
            {(preview.pipelineSteps || []).map((step) => (
              <div
                key={step.step}
                data-testid={`pipeline-step-${step.step}`}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-[#0F294A]">
                      {String(step.step).padStart(2, '0')}. {step.title}
                    </h3>
                    <span className="text-xs font-mono tabular-nums text-slate-500">
                      {step.stats}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{step.description}</p>
                </div>

                <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
                  <img
                    src={step.imageDataUrl}
                    alt={`Step ${step.step}: ${step.title}`}
                    className="h-56 w-full object-contain"
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
