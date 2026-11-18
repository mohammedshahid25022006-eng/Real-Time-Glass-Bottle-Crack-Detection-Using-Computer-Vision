import { useEffect, useRef, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import {
  fetchConfig,
  fetchDataset,
  PipelinePreviewResponse,
  previewPipeline,
  saveConfig,
} from '../services/api';
import { CVCalibrationConfig, DatasetItem, DEFAULT_CV_CONFIG } from '../types/inspection';
import { ClassificationBadge } from '../components/StatusBadge';

export function CalibrationPage() {
  const [cfg, setCfg] = useState<CVCalibrationConfig>(DEFAULT_CV_CONFIG);
  const [samples, setSamples] = useState<DatasetItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [preview, setPreview] = useState<PipelinePreviewResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    void Promise.all([fetchConfig(), fetchDataset()]).then(([loadedCfg, ds]) => {
      setCfg(loadedCfg);
      setSamples(ds);
      if (ds.length > 0) {
        const initial = ds.find((d) => d.label === 'Crack') || ds[0];
        setSelectedId(initial.id);
        void previewPipeline({
          datasetId: initial.id,
          config: loadedCfg,
          includeSteps: true,
        }).then(setPreview);
      }
    });
  }, []);

  const triggerPreview = (nextCfg: CVCalibrationConfig, sampleId = selectedId) => {
    if (!sampleId) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void previewPipeline({
        datasetId: sampleId,
        config: nextCfg,
        includeSteps: true,
      }).then(setPreview);
    }, 120);
  };

  const updateParam = <K extends keyof CVCalibrationConfig>(
    key: K,
    value: CVCalibrationConfig[K]
  ) => {
    setStatusMsg(null);
    const next = { ...cfg, [key]: value };
    setCfg(next);
    triggerPreview(next);
  };

  const handleSave = async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      const saved = await saveConfig(cfg);
      setCfg(saved);
      setStatusMsg('Calibration parameters saved. Live Camera and Upload modules updated.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setCfg(DEFAULT_CV_CONFIG);
    setStatusMsg('Reset to baseline experimental defaults (click Save to persist).');
    triggerPreview(DEFAULT_CV_CONFIG);
  };

  const cannyStep = preview?.pipelineSteps?.find((s) => s.step === 7);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-base font-bold text-[#0F294A]">
            Computer Vision Parameter Calibration
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Adjust preprocessing kernels, edge thresholds, and contour area filters. The processed
            detection output and Canny edge map update immediately to show parameter impact.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset Defaults
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#173B69] disabled:opacity-50 whitespace-nowrap"
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800">
          {statusMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* 8 Calibration Sliders */}
        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div>
            <label htmlFor="cal-sample" className="block text-xs font-semibold text-[#0F294A]">
              Calibration Reference Bottle
            </label>
            <select
              id="cal-sample"
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value);
                triggerPreview(cfg, e.target.value);
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
            >
              {samples.map((s) => (
                <option key={s.id} value={s.id}>
                  [{s.label}] {s.filename} ({s.lightingCondition})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3 border-t border-slate-200 pt-3">
            <SliderRow
              id="cal-gaussian"
              label="Gaussian Blur Kernel"
              value={cfg.gaussianKernel}
              unit="×"
              min={3}
              max={11}
              step={2}
              onChange={(v) => updateParam('gaussianKernel', v)}
            />
            <SliderRow
              id="cal-thresh"
              label="Threshold Value"
              value={cfg.thresholdValue}
              unit=""
              min={60}
              max={220}
              step={1}
              onChange={(v) => updateParam('thresholdValue', v)}
            />
            <SliderRow
              id="cal-canny-low"
              label="Canny Lower Threshold"
              value={cfg.cannyLow}
              unit=""
              min={10}
              max={150}
              step={2}
              onChange={(v) => updateParam('cannyLow', v)}
            />
            <SliderRow
              id="cal-canny-high"
              label="Canny Upper Threshold"
              value={cfg.cannyHigh}
              unit=""
              min={40}
              max={260}
              step={2}
              onChange={(v) => updateParam('cannyHigh', v)}
            />
            <SliderRow
              id="cal-morph"
              label="Morphological Kernel"
              value={cfg.morphKernel}
              unit="×"
              min={3}
              max={9}
              step={2}
              onChange={(v) => updateParam('morphKernel', v)}
            />
            <SliderRow
              id="cal-area"
              label="Minimum Contour Area"
              value={cfg.minContourArea}
              unit=" px²"
              min={12}
              max={250}
              step={4}
              onChange={(v) => updateParam('minContourArea', v)}
            />
            <SliderRow
              id="cal-len"
              label="Minimum Crack Length"
              value={cfg.minCrackLength}
              unit=" px"
              min={10}
              max={100}
              step={2}
              onChange={(v) => updateParam('minCrackLength', v)}
            />
            <SliderRow
              id="cal-contrast"
              label="Contrast Adjustment"
              value={cfg.contrastAlpha}
              unit="×"
              min={0.6}
              max={2.8}
              step={0.05}
              onChange={(v) => updateParam('contrastAlpha', v)}
            />
          </div>
        </div>

        {/* Live Processed Preview */}
        <div className="lg:col-span-7 space-y-5">
          {preview && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50/70 px-5 py-3">
                <div className="flex items-center gap-3">
                  <ClassificationBadge classification={preview.classification} />
                  <span className="text-xs font-mono tabular-nums text-slate-700">
                    Heuristic Score: {preview.heuristicScore}/100 · {preview.defectCount} region(s)
                  </span>
                </div>
                <span className="text-xs font-mono tabular-nums text-[#0F294A]">
                  {preview.processingTimeMs} ms
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="mb-2 text-xs font-semibold text-[#0F294A]">
                    Processed Detection Output
                  </p>
                  <img
                    data-testid="calibration-processed-img"
                    src={preview.processedImageDataUrl}
                    alt="Live calibrated processed output"
                    className="h-64 w-full rounded-lg border border-slate-200 bg-slate-900 object-contain"
                  />
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="mb-2 text-xs font-semibold text-[#0F294A]">
                    Canny Edge Map (Thresholds {cfg.cannyLow}/{cfg.cannyHigh})
                  </p>
                  {cannyStep && (
                    <img
                      src={cannyStep.imageDataUrl}
                      alt="Live Canny edge preview"
                      className="h-64 w-full rounded-lg border border-slate-200 bg-slate-900 object-contain"
                    />
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SliderRow({
  id,
  label,
  value,
  unit,
  min,
  max,
  step,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (val: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <label htmlFor={id} className="font-medium text-slate-700">
          {label}
        </label>
        <span className="font-mono tabular-nums font-semibold text-[#0F294A]">
          {value}
          {unit}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[#0F294A]"
      />
    </div>
  );
}
