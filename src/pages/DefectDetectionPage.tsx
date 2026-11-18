import { useEffect, useState } from 'react';
import { CheckCircle2, Info, Play, ShieldAlert, Sliders } from 'lucide-react';
import {
  fetchConfig,
  fetchDataset,
  PipelinePreviewResponse,
  previewPipeline,
  runValidationBenchmark,
  saveConfig,
} from '../services/api';
import {
  CVCalibrationConfig,
  DatasetItem,
  DEFAULT_CV_CONFIG,
  ValidationMetrics,
} from '../types/inspection';
import { ClassificationBadge } from '../components/StatusBadge';

export function DefectDetectionPage({
  initialSubTab = 'rules',
}: {
  initialSubTab?: 'rules' | 'testing';
}) {
  const [subTab, setSubTab] = useState<'rules' | 'testing'>(initialSubTab);
  const [samples, setSamples] = useState<DatasetItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [cfg, setCfg] = useState<CVCalibrationConfig>(DEFAULT_CV_CONFIG);
  const [preview, setPreview] = useState<PipelinePreviewResponse | null>(null);
  const [savingCfg, setSavingCfg] = useState(false);
  const [cfgMsg, setCfgMsg] = useState<string | null>(null);

  const [validation, setValidation] = useState<ValidationMetrics | null>(null);
  const [runningVal, setRunningVal] = useState(false);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  useEffect(() => {
    void Promise.all([fetchConfig(), fetchDataset()]).then(([c, ds]) => {
      setCfg(c);
      setSamples(ds);
      if (ds.length > 0) {
        const crackSample = ds.find((d) => d.label === 'Crack') || ds[0];
        setSelectedId(crackSample.id);
        void previewPipeline({
          datasetId: crackSample.id,
          config: c,
          includeSteps: false,
        }).then(setPreview);
      }
    });
  }, []);

  const handleAnalyzeSample = async (id: string, nextCfg = cfg) => {
    setSelectedId(id);
    const res = await previewPipeline({ datasetId: id, config: nextCfg, includeSteps: false });
    setPreview(res);
  };

  const handleSaveRules = async () => {
    setSavingCfg(true);
    setCfgMsg(null);
    try {
      const saved = await saveConfig(cfg);
      setCfg(saved);
      setCfgMsg('Classification & false-positive rules saved to active configuration.');
      if (selectedId) await handleAnalyzeSample(selectedId, saved);
    } finally {
      setSavingCfg(false);
    }
  };

  const handleRunValidation = async () => {
    setRunningVal(true);
    try {
      const metrics = await runValidationBenchmark(cfg);
      setValidation(metrics);
    } finally {
      setRunningVal(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation between Module E and Section 10 Testing & Validation */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <h2 className="text-base font-bold text-[#0F294A]">
            Defect Detection Rules &amp; Experimental Validation
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Deterministic OpenCV feature classification, false-positive suppression, and confusion
            matrix benchmarking.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setSubTab('rules')}
            className={`flex-1 sm:flex-initial rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              subTab === 'rules'
                ? 'bg-white text-[#0F294A] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Detection Rules
          </button>
          <button
            type="button"
            onClick={() => setSubTab('testing')}
            className={`flex-1 sm:flex-initial rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              subTab === 'testing'
                ? 'bg-white text-[#0F294A] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Validation Benchmark
          </button>
        </div>
      </div>

      {/* Heuristic vs ML Disclaimer */}
      <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4 text-xs text-slate-700">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
        <div>
          <strong className="text-[#0F294A]">
            Heuristic Score Notice (Classical Computer Vision):
          </strong>{' '}
          The 0–100 defect score is a deterministic <strong>rule-based heuristic score</strong>{' '}
          derived from contour length, pixel area, aspect ratio, and Canny edge density —{' '}
          <strong>not a machine-learning probability</strong>. The system is scoped for controlled
          diffuse backlighting and transparent glass bottle/jar geometries.
        </div>
      </div>

      {subTab === 'rules' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Threshold Controls */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Sliders className="h-4 w-4 text-[#0F294A]" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-[#0F294A]">
                Classification &amp; Filter Rules
              </h3>
            </div>

            <div>
              <label
                htmlFor="rule-sample"
                className="block text-xs font-medium text-slate-700"
              >
                Inspection Test Bottle
              </label>
              <select
                id="rule-sample"
                value={selectedId}
                onChange={(e) => void handleAnalyzeSample(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
              >
                {samples.map((s) => (
                  <option key={s.id} value={s.id}>
                    [{s.label}] {s.filename}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex justify-between text-xs">
                <label htmlFor="rule-crack-thresh" className="font-medium text-slate-700">
                  Suspected Crack Score Threshold
                </label>
                <span className="font-mono tabular-nums font-semibold text-red-700">
                  ≥ {cfg.crackScoreThreshold}
                </span>
              </div>
              <input
                id="rule-crack-thresh"
                type="range"
                min={35}
                max={90}
                value={cfg.crackScoreThreshold}
                onChange={(e) => {
                  const next = { ...cfg, crackScoreThreshold: Number(e.target.value) };
                  setCfg(next);
                  if (selectedId) void handleAnalyzeSample(selectedId, next);
                }}
                className="mt-1 w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs">
                <label htmlFor="rule-manual-thresh" className="font-medium text-slate-700">
                  Manual Review Score Threshold
                </label>
                <span className="font-mono tabular-nums font-semibold text-amber-700">
                  ≥ {cfg.manualScoreThreshold}
                </span>
              </div>
              <input
                id="rule-manual-thresh"
                type="range"
                min={10}
                max={60}
                value={cfg.manualScoreThreshold}
                onChange={(e) => {
                  const next = { ...cfg, manualScoreThreshold: Number(e.target.value) };
                  setCfg(next);
                  if (selectedId) void handleAnalyzeSample(selectedId, next);
                }}
                className="mt-1 w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs">
                <label htmlFor="rule-edge-density" className="font-medium text-slate-700">
                  Min Canny Edge Density
                </label>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {cfg.edgeDensityThreshold}
                </span>
              </div>
              <input
                id="rule-edge-density"
                type="range"
                min={0.01}
                max={0.25}
                step={0.01}
                value={cfg.edgeDensityThreshold}
                onChange={(e) => {
                  const next = { ...cfg, edgeDensityThreshold: Number(e.target.value) };
                  setCfg(next);
                  if (selectedId) void handleAnalyzeSample(selectedId, next);
                }}
                className="mt-1 w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs">
                <label htmlFor="rule-aspect-ratio" className="font-medium text-slate-700">
                  Elongation Aspect Ratio Target
                </label>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {cfg.minAspectRatio}
                </span>
              </div>
              <input
                id="rule-aspect-ratio"
                type="range"
                min={1.1}
                max={4.0}
                step={0.1}
                value={cfg.minAspectRatio}
                onChange={(e) => {
                  const next = { ...cfg, minAspectRatio: Number(e.target.value) };
                  setCfg(next);
                  if (selectedId) void handleAnalyzeSample(selectedId, next);
                }}
                className="mt-1 w-full"
              />
            </div>

            {cfgMsg && (
              <p className="text-xs font-medium text-emerald-700" role="status">
                {cfgMsg}
              </p>
            )}

            <button
              type="button"
              disabled={savingCfg}
              onClick={() => void handleSaveRules()}
              className="w-full rounded-lg bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#173B69] disabled:opacity-50"
            >
              Save Classification Thresholds
            </button>
          </div>

          {/* Accepted vs Filtered Contour Breakdown */}
          <div className="lg:col-span-2 space-y-6">
            {preview && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <ClassificationBadge classification={preview.classification} />
                    <span className="font-mono text-xs font-semibold text-slate-800 tabular-nums">
                      Heuristic Score: {preview.heuristicScore}/100
                    </span>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-slate-500">
                    {preview.processingTimeMs} ms
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <img
                    src={preview.processedImageDataUrl}
                    alt="Annotated defect detection preview"
                    className="h-56 w-full rounded-lg border border-slate-200 bg-slate-900 object-contain"
                  />
                  <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                    <p className="font-semibold text-[#0F294A]">Active Classification Summary</p>
                    <p className="text-slate-700">
                      Bottle ROI detected at{' '}
                      <span className="font-mono">
                        ({preview.bottleRoi.x}, {preview.bottleRoi.y}) {preview.bottleRoi.width}×
                        {preview.bottleRoi.height}px
                      </span>
                      .
                    </p>
                    <p className="text-slate-700">
                      <strong className="text-red-700">{preview.regions.length}</strong> contour(s)
                      passed all crack geometry filters.
                    </p>
                    <p className="text-slate-700">
                      <strong className="text-sky-700">{preview.rejectedCandidates.length}</strong>{' '}
                      candidate region(s) were rejected as background/noise/wall refraction.
                    </p>
                  </div>
                </div>

                {/* Rejected False-Positive Candidates */}
                <div>
                  <h4 className="mb-2 text-xs font-semibold text-[#0F294A]">
                    False-Positive Suppression Log (Rejected Contours)
                  </h4>
                  {preview.rejectedCandidates.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No sub-threshold candidate contours logged inside the bottle ROI.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                          <tr>
                            <th className="px-3 py-2 font-semibold">Location</th>
                            <th className="px-3 py-2 font-semibold text-right">Area</th>
                            <th className="px-3 py-2 font-semibold text-right">Length</th>
                            <th className="px-3 py-2 font-semibold text-right">Edge Density</th>
                            <th className="px-3 py-2 font-semibold">Rejection Reason</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {preview.rejectedCandidates.map((c) => (
                            <tr key={c.id}>
                              <td className="px-3 py-2 text-slate-700">{c.regionLocation}</td>
                              <td className="px-3 py-2 text-right font-mono tabular-nums">
                                {c.area} px²
                              </td>
                              <td className="px-3 py-2 text-right font-mono tabular-nums">
                                {c.length} px
                              </td>
                              <td className="px-3 py-2 text-right font-mono tabular-nums">
                                {c.edgeDensity}
                              </td>
                              <td className="px-3 py-2 text-sky-800">{c.rejectionReason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Section 10: Testing and Validation Benchmark */
        <div className="space-y-6">
          <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-sm font-bold text-[#0F294A]">
                Labelled Dataset Benchmark Evaluation
              </h3>
              <p className="mt-1 text-xs text-slate-600">
                Executes the live classical CV pipeline across all {samples.length} labelled images in
                the dataset (<strong>Normal</strong> vs. <strong>Crack / Broken</strong> ground
                truth) and measures real TP, TN, FP, FN, Accuracy, Precision, Recall, F1 Score, and
                Throughput.
              </p>
            </div>
            <button
              type="button"
              disabled={runningVal}
              onClick={() => void handleRunValidation()}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0F294A] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#173B69] disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              {runningVal ? 'Evaluating Dataset...' : 'Run Validation Benchmark'}
            </button>
          </div>

          {validation && (
            <>
              {/* Metrics Cards */}
              <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs text-slate-500">Accuracy</p>
                  <p
                    data-testid="val-accuracy"
                    className="mt-1 text-2xl font-bold text-[#0F294A] font-mono tabular-nums"
                  >
                    {validation.accuracy}%
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                    {validation.totalSamples} test images
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs text-slate-500">Precision</p>
                  <p className="mt-1 text-2xl font-bold text-[#0F294A] font-mono tabular-nums">
                    {validation.precision}%
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs text-slate-500">Recall</p>
                  <p className="mt-1 text-2xl font-bold text-[#0F294A] font-mono tabular-nums">
                    {validation.recall}%
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs text-slate-500">F1 Score</p>
                  <p className="mt-1 text-2xl font-bold text-[#0F294A] font-mono tabular-nums">
                    {validation.f1Score}%
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs text-slate-500">Avg Latency / FPS</p>
                  <p className="mt-1 text-lg font-bold text-[#0F294A] font-mono tabular-nums">
                    {validation.avgProcessingTimeMs} ms
                  </p>
                  <p className="mt-0.5 text-xs font-mono tabular-nums text-slate-600">
                    ~{validation.estimatedFps} FPS
                  </p>
                </div>
              </div>

              {/* Confusion Matrix */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <h4 className="text-sm font-semibold text-[#0F294A]">Confusion Matrix</h4>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Positive = Crack / Broken · Negative = Normal
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                      <p className="text-xs font-medium text-emerald-800">True Positive (TP)</p>
                      <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-700">
                        {validation.tp}
                      </p>
                    </div>
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                      <p className="text-xs font-medium text-red-800">False Positive (FP)</p>
                      <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-red-700">
                        {validation.fp}
                      </p>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="text-xs font-medium text-amber-800">False Negative (FN)</p>
                      <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-amber-700">
                        {validation.fn}
                      </p>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                      <p className="text-xs font-medium text-emerald-800">True Negative (TN)</p>
                      <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-emerald-700">
                        {validation.tn}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <div className="border-b border-slate-200 px-5 py-3">
                    <h4 className="text-sm font-semibold text-[#0F294A]">
                      Per-Sample Validation Results
                    </h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Sample</th>
                          <th className="px-3 py-2 font-semibold">Ground Truth</th>
                          <th className="px-3 py-2 font-semibold">Predicted</th>
                          <th className="px-3 py-2 font-semibold text-right">Heuristic</th>
                          <th className="px-3 py-2 font-semibold text-right">Latency</th>
                          <th className="px-3 py-2 font-semibold">Outcome</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {validation.rows.map((r) => (
                          <tr key={r.datasetId}>
                            <td className="px-3 py-2 font-mono text-slate-800">{r.filename}</td>
                            <td className="px-3 py-2 font-medium text-slate-900">
                              {r.groundTruth}
                            </td>
                            <td className="px-3 py-2">
                              <ClassificationBadge classification={r.predictedClassification} />
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums">
                              {r.heuristicScore}/100
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums">
                              {r.processingTimeMs} ms
                            </td>
                            <td className="px-3 py-2 font-mono font-bold">
                              {r.outcome === 'TP' || r.outcome === 'TN' ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700">
                                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                  {r.outcome}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-red-700">
                                  <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                                  {r.outcome}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
