import { FormEvent, useEffect, useState } from 'react';
import { Download, Trash2, Upload } from 'lucide-react';
import { deleteDatasetItem, fetchDataset, uploadDatasetItem } from '../services/api';
import {
  DatasetClass,
  DatasetItem,
  LIGHTING_CONDITIONS,
  LightingCondition,
} from '../types/inspection';

export function DatasetManagementPage() {
  const [items, setItems] = useState<DatasetItem[]>([]);
  const [filterClass, setFilterClass] = useState<string>('ALL');
  const [filterLighting, setFilterLighting] = useState<string>('ALL');

  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState<DatasetClass>('Normal');
  const [lighting, setLighting] = useState<LightingCondition>('High-intensity normal lighting');
  const [camDist, setCamDist] = useState<number>(25);
  const [diffDist, setDiffDist] = useState<number>(18);
  const [glassType, setGlassType] = useState<string>('Clear Glass Jar');
  const [notes, setNotes] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const data = await fetchDataset();
    setItems(data);
  };

  useEffect(() => {
    void load();
  }, []);

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Select an image file (JPG, PNG, BMP) to add to the dataset.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const updated = await uploadDatasetItem({
        file,
        label,
        lightingCondition: lighting,
        cameraDistanceCm: camDist,
        diffuserDistanceCm: diffDist,
        glassType,
        notes,
      });
      setItems(updated);
      setFile(null);
      setNotes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const updated = await deleteDatasetItem(id);
    setItems(updated);
  };

  const filtered = items.filter((item) => {
    if (filterClass !== 'ALL' && item.label !== filterClass) return false;
    if (filterLighting !== 'ALL' && item.lightingCondition !== filterLighting) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header & Honest Dataset Scope Notice */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 md:flex-row md:items-center">
        <div>
          <h2 className="text-base font-bold text-[#0F294A]">
            Experimental Dataset Management
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Organize collected images of Normal, Marked/Cracked, and Broken glass jars across
            controlled lighting setups and fixed camera positions. No ML model is trained on this
            dataset; it serves for classical CV calibration and validation.
          </p>
        </div>
        <a
          href="/api/dataset/export"
          download="glass_dataset_metadata.json"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Export Dataset Metadata
        </a>
      </div>

      {/* Upload Form */}
      <form
        onSubmit={handleUpload}
        className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"
      >
        <h3 className="text-sm font-semibold text-[#0F294A]">Add Labelled Image to Dataset</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="ds-file" className="block text-xs font-medium text-slate-700">
              Bottle Image File
            </label>
            <input
              id="ds-file"
              type="file"
              accept=".jpg,.jpeg,.png,.bmp,image/jpeg,image/png,image/bmp"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="mt-1 block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-slate-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700"
            />
          </div>

          <div>
            <label htmlFor="ds-label" className="block text-xs font-medium text-slate-700">
              Ground Truth Class
            </label>
            <select
              id="ds-label"
              value={label}
              onChange={(e) => setLabel(e.target.value as DatasetClass)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
            >
              <option value="Normal">Normal</option>
              <option value="Crack">Crack</option>
              <option value="Broken">Broken</option>
            </select>
          </div>

          <div>
            <label htmlFor="ds-lighting" className="block text-xs font-medium text-slate-700">
              Illumination Condition
            </label>
            <select
              id="ds-lighting"
              value={lighting}
              onChange={(e) => setLighting(e.target.value as LightingCondition)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
            >
              {LIGHTING_CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="ds-glass" className="block text-xs font-medium text-slate-700">
              Glass Specimen Type
            </label>
            <input
              id="ds-glass"
              type="text"
              value={glassType}
              onChange={(e) => setGlassType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <label htmlFor="ds-cam" className="block text-xs font-medium text-slate-700">
              Camera Distance (cm)
            </label>
            <input
              id="ds-cam"
              type="number"
              value={camDist}
              onChange={(e) => setCamDist(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="ds-diff" className="block text-xs font-medium text-slate-700">
              Bottle-to-Diffuser (cm)
            </label>
            <input
              id="ds-diff"
              type="number"
              value={diffDist}
              onChange={(e) => setDiffDist(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono tabular-nums"
            />
          </div>
          <div className="sm:col-span-2 flex items-end gap-3">
            <div className="flex-1">
              <label htmlFor="ds-notes" className="block text-xs font-medium text-slate-700">
                Experimental Notes
              </label>
              <input
                id="ds-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Marked jar at 25cm distance"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
              />
            </div>
            <button
              type="submit"
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#173B69] disabled:opacity-50 whitespace-nowrap"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              Add Sample
            </button>
          </div>
        </div>

        {error && (
          <p className="text-xs font-medium text-red-700" role="alert">
            {error}
          </p>
        )}
      </form>

      {/* Filter Bar + Image Grid */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {['ALL', 'Normal', 'Crack', 'Broken'].map((cls) => (
              <button
                key={cls}
                type="button"
                onClick={() => setFilterClass(cls)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                  filterClass === cls
                    ? 'bg-white text-[#0F294A] shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cls === 'ALL' ? `All (${items.length})` : cls}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="ds-filter-light" className="text-xs font-medium text-slate-600">
              Lighting:
            </label>
            <select
              id="ds-filter-light"
              value={filterLighting}
              onChange={(e) => setFilterLighting(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
            >
              <option value="ALL">All Conditions</option>
              {LIGHTING_CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="flex flex-col justify-between rounded-lg border border-slate-200 bg-slate-50/50 overflow-hidden"
            >
              <div className="bg-slate-900">
                <img
                  src={item.imageUrl}
                  alt={`${item.label} glass sample ${item.filename}`}
                  className="h-44 w-full object-contain"
                />
              </div>
              <div className="p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-bold ${
                      item.label === 'Normal'
                        ? 'text-emerald-700'
                        : item.label === 'Crack'
                        ? 'text-amber-700'
                        : 'text-red-700'
                    }`}
                  >
                    {item.label}
                  </span>
                  {!item.isReferenceSample && (
                    <button
                      type="button"
                      onClick={() => void handleDelete(item.id)}
                      aria-label={`Delete ${item.filename}`}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <p className="truncate font-mono text-xs font-medium text-slate-900">
                  {item.filename}
                </p>
                <p className="text-xs text-slate-600">{item.lightingCondition}</p>
                <p className="text-xs font-mono tabular-nums text-slate-500">
                  Cam {item.cameraDistanceCm} cm · Diffuser {item.diffuserDistanceCm} cm
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
