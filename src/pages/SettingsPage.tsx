import { FormEvent, useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { fetchSettings, saveSettings } from '../services/api';
import {
  AppSettings,
  LIGHTING_CONDITIONS,
  LightingCondition,
} from '../types/inspection';
import { OpticalSetupDiagram } from '../components/OpticalSetupDiagram';

export function SettingsPage({
  onSettingsUpdated,
}: {
  onSettingsUpdated?: (s: AppSettings) => void;
}) {
  const [settings, setSettings] = useState<AppSettings>({
    audioAlertEnabled: true,
    cameraDistanceCm: 25,
    diffuserDistanceCm: 18,
    defaultLightingCondition: 'High-intensity normal lighting',
    frameIntervalMs: 280,
    pythonBackendUrl: '',
  });
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    void fetchSettings().then(setSettings).catch(() => {});
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg(null);
    try {
      const updated = await saveSettings(settings);
      setSettings(updated);
      setSavedMsg('System & optical bench defaults saved.');
      onSettingsUpdated?.(updated);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Experimental Setup Guide (Section 3) */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div>
          <h2 className="text-base font-bold text-[#0F294A]">
            Optical Experimental Setup &amp; Camera Positioning Guide
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Follow the reference optical geometry for controlled diffuse backlighting to maximize
            contrast on hairline glass cracks while minimizing background glare.
          </p>
        </div>

        <OpticalSetupDiagram
          cameraDistanceCm={settings.cameraDistanceCm}
          diffuserDistanceCm={settings.diffuserDistanceCm}
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 text-xs">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <p className="font-semibold text-[#0F294A]">1. Diffuse LED Backlight</p>
            <p className="mt-1 text-slate-600">
              Place an acrylic diffuser sheet directly over the LED panel so illumination is uniform
              across the entire bottle height without raw LED hotspots.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <p className="font-semibold text-[#0F294A]">2. Bottle-to-Diffuser (~18 cm)</p>
            <p className="mt-1 text-slate-600">
              Position the clear glass jar or bottle approximately 18 cm in front of the diffuser
              against a controlled neutral surface.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <p className="font-semibold text-[#0F294A]">3. Fixed Camera (~25 cm / 40 cm)</p>
            <p className="mt-1 text-slate-600">
              Mount the USB webcam or smartphone camera stably on a tripod at 25 cm (close-up jar)
              or 40 cm (full bottle) perpendicular to the bottle axis.
            </p>
          </div>
        </div>
      </div>

      {/* System Settings Form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"
      >
        <h3 className="text-sm font-semibold text-[#0F294A]">
          Inspection Defaults &amp; Alert Preferences
        </h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="set-cam-dist" className="block text-xs font-medium text-slate-700">
              Default Camera Distance (cm)
            </label>
            <input
              id="set-cam-dist"
              type="number"
              min={10}
              max={120}
              value={settings.cameraDistanceCm}
              onChange={(e) =>
                setSettings({ ...settings, cameraDistanceCm: Number(e.target.value) })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono tabular-nums"
            />
          </div>

          <div>
            <label htmlFor="set-diff-dist" className="block text-xs font-medium text-slate-700">
              Default Bottle-to-Diffuser Distance (cm)
            </label>
            <input
              id="set-diff-dist"
              type="number"
              min={5}
              max={80}
              value={settings.diffuserDistanceCm}
              onChange={(e) =>
                setSettings({ ...settings, diffuserDistanceCm: Number(e.target.value) })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono tabular-nums"
            />
          </div>

          <div>
            <label htmlFor="set-lighting" className="block text-xs font-medium text-slate-700">
              Default Illumination Condition
            </label>
            <select
              id="set-lighting"
              value={settings.defaultLightingCondition}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  defaultLightingCondition: e.target.value as LightingCondition,
                })
              }
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
            <label htmlFor="set-interval" className="block text-xs font-medium text-slate-700">
              Live Camera Frame Interval (ms)
            </label>
            <input
              id="set-interval"
              type="number"
              min={120}
              max={2000}
              step={20}
              value={settings.frameIntervalMs}
              onChange={(e) =>
                setSettings({ ...settings, frameIntervalMs: Number(e.target.value) })
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono tabular-nums"
            />
          </div>

          <div className="sm:col-span-2 flex items-end">
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-800">
              <input
                type="checkbox"
                checked={settings.audioAlertEnabled}
                onChange={(e) =>
                  setSettings({ ...settings, audioAlertEnabled: e.target.checked })
                }
              />
              Enable audible warning tone when a suspected crack is detected
            </label>
          </div>
        </div>

        {savedMsg && (
          <p className="text-xs font-medium text-emerald-700" role="status">
            {savedMsg}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#173B69] disabled:opacity-50"
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          Save Settings
        </button>
      </form>
    </div>
  );
}
