import { ChangeEvent, DragEvent, useEffect, useState } from 'react';
import { Download, FileImage, Play, UploadCloud } from 'lucide-react';
import { fetchDataset, inspectImageFile } from '../services/api';
import {
  DatasetItem,
  InspectionResult,
  LIGHTING_CONDITIONS,
  LightingCondition,
} from '../types/inspection';
import { ClassificationBadge } from '../components/StatusBadge';

export function ImageUploadPage({
  onInspectionCreated,
}: {
  onInspectionCreated?: (res: InspectionResult) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [samples, setSamples] = useState<DatasetItem[]>([]);

  const [lightingCondition, setLightingCondition] = useState<LightingCondition>(
    'High-intensity normal lighting'
  );
  const [cameraDistanceCm, setCameraDistanceCm] = useState<number>(25);
  const [diffuserDistanceCm, setDiffuserDistanceCm] = useState<number>(18);

  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InspectionResult | null>(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    void fetchDataset().then((items) => setSamples(items)).catch(() => {});
  }, []);

  const handleSelectFile = (f: File) => {
    setError(null);
    setFile(f);
    setSelectedSampleId(null);
    setResult(null);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleSelectFile(f);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleSelectFile(f);
  };

  const handleChooseSample = (item: DatasetItem) => {
    setError(null);
    setFile(null);
    setSelectedSampleId(item.id);
    setPreviewUrl(item.imageUrl);
    setLightingCondition(item.lightingCondition);
    setCameraDistanceCm(item.cameraDistanceCm);
    setDiffuserDistanceCm(item.diffuserDistanceCm);
    setResult(null);
  };

  const handleAnalyze = async () => {
    if (!file && !selectedSampleId) {
      setError('Please upload a glass bottle image (JPG, JPEG, PNG, BMP) or select a sample.');
      return;
    }
    setAnalyzing(true);
    setError(null);
    try {
      const res = await inspectImageFile({
        file: file || undefined,
        datasetId: selectedSampleId || undefined,
        lightingCondition,
        cameraDistanceCm,
        diffuserDistanceCm,
        includeSteps: false,
      });
      setResult(res);
      onInspectionCreated?.(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload & Setup Metadata Card */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-bold text-[#0F294A]">
            Upload Glass Bottle Image for Inspection
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Supports JPG, JPEG, PNG, and BMP formats. Uploaded images execute the identical classical
            OpenCV contour and Canny edge pipeline used in live camera inspection.
          </p>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`mt-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
              dragActive
                ? 'border-sky-500 bg-sky-50'
                : 'border-slate-300 bg-slate-50/60 hover:border-sky-400'
            }`}
          >
            <UploadCloud className="h-8 w-8 text-sky-700" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium text-slate-800">
              Drag and drop a glass bottle image here
            </p>
            <p className="mt-1 text-xs text-slate-500">JPG, JPEG, PNG, or BMP up to 15 MB</p>
            <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50">
              <FileImage className="h-4 w-4" aria-hidden="true" />
              Browse Image File
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.bmp,image/jpeg,image/png,image/bmp"
                onChange={handleFileInput}
                className="sr-only"
              />
            </label>
          </div>

          {/* Quick Reference Lab Samples */}
          {samples.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-[#0F294A]">
                Or Load a Controlled Backlight Lab Reference Sample:
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {samples.slice(0, 6).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleChooseSample(s)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                      selectedSampleId === s.id
                        ? 'bg-[#0F294A] text-white'
                        : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {s.label} · {s.lightingCondition.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Experimental Metadata + Analyze CTA */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[#0F294A]">Experimental Setup Metadata</h3>
            <div>
              <label
                htmlFor="upload-lighting"
                className="block text-xs font-medium text-slate-700"
              >
                Illumination Condition
              </label>
              <select
                id="upload-lighting"
                value={lightingCondition}
                onChange={(e) => setLightingCondition(e.target.value as LightingCondition)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              >
                {LIGHTING_CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="upload-cam-dist"
                  className="block text-xs font-medium text-slate-700"
                >
                  Camera Dist. (cm)
                </label>
                <input
                  id="upload-cam-dist"
                  type="number"
                  value={cameraDistanceCm}
                  onChange={(e) => setCameraDistanceCm(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono tabular-nums"
                />
              </div>
              <div>
                <label
                  htmlFor="upload-diff-dist"
                  className="block text-xs font-medium text-slate-700"
                >
                  Diffuser Dist. (cm)
                </label>
                <input
                  id="upload-diff-dist"
                  type="number"
                  value={diffuserDistanceCm}
                  onChange={(e) => setDiffuserDistanceCm(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono tabular-nums"
                />
              </div>
            </div>

            {previewUrl && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <p className="mb-1 text-xs font-medium text-slate-600">Selected Image Preview</p>
                <img
                  src={previewUrl}
                  alt="Selected bottle preview"
                  className="h-32 w-full rounded object-contain bg-white"
                />
              </div>
            )}
          </div>

          <div className="mt-4 space-y-2">
            {error && (
              <p className="text-xs font-medium text-red-700" role="alert">
                {error}
              </p>
            )}
            <button
              type="button"
              disabled={analyzing || !previewUrl}
              onClick={() => void handleAnalyze()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0F294A] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#173B69] disabled:opacity-50 whitespace-nowrap transition-colors"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              {analyzing ? 'Analyzing with OpenCV Pipeline...' : 'Analyze Image'}
            </button>
          </div>
        </div>
      </div>

      {/* Inspection Result Display */}
      {result && (
        <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-center">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-sm font-bold text-[#0F294A]">{result.id}</span>
              <ClassificationBadge classification={result.classification} />
              <span className="text-xs text-slate-600 font-mono tabular-nums">
                Heuristic Score: {result.heuristicScore}/100 · {result.processingTimeMs} ms ·{' '}
                {result.defectCount} region(s)
              </span>
            </div>
            <a
              href={result.processedImageUrl}
              download={`${result.id}_processed.png`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Download Processed Image
            </a>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-semibold text-[#0F294A]">Original Image</p>
              <img
                src={result.originalImageUrl}
                alt={`Original ${result.id}`}
                className="max-h-80 w-full rounded border border-slate-200 bg-white object-contain"
              />
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-semibold text-[#0F294A]">
                Processed Output (Red Bounding Boxes)
              </p>
              <img
                src={result.processedImageUrl}
                alt={`Processed ${result.id}`}
                className="max-h-80 w-full rounded border border-slate-200 bg-white object-contain"
              />
            </div>
          </div>

          {result.regions.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-sky-50 text-[#0F294A]">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Region</th>
                    <th className="px-3 py-2 font-semibold">Location</th>
                    <th className="px-3 py-2 font-semibold">Shape</th>
                    <th className="px-3 py-2 font-semibold text-right">BBox</th>
                    <th className="px-3 py-2 font-semibold text-right">Area (px²)</th>
                    <th className="px-3 py-2 font-semibold text-right">Length (px)</th>
                    <th className="px-3 py-2 font-semibold text-right">Aspect Ratio</th>
                    <th className="px-3 py-2 font-semibold text-right">Edge Density</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {result.regions.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 font-mono font-semibold text-red-700">#{r.id}</td>
                      <td className="px-3 py-2">{r.regionLocation}</td>
                      <td className="px-3 py-2">{r.shapeCharacteristics}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {r.x},{r.y} ({r.width}×{r.height})
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{r.area}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{r.length}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {r.aspectRatio}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {r.edgeDensity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
