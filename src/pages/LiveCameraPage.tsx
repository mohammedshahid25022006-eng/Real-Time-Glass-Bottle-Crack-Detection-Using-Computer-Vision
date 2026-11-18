import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  Save,
  ShieldAlert,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  fetchDataset,
  inspectLiveFrame,
  LiveFrameResponse,
} from '../services/api';
import { DatasetItem, LIGHTING_CONDITIONS, LightingCondition } from '../types/inspection';
import { playDefectAlertSound } from '../utils/audioAlert';
import { ClassificationBadge } from '../components/StatusBadge';

export function LiveCameraPage({
  audioEnabled,
  onToggleAudio,
  onInspectionSaved,
}: {
  audioEnabled: boolean;
  onToggleAudio: (enabled: boolean) => void;
  onInspectionSaved?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const benchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inFlightRef = useRef(false);
  const lastAlertTsRef = useRef(0);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>('auto-webcam');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<string>('Disconnected');
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [datasetSamples, setDatasetSamples] = useState<DatasetItem[]>([]);
  const [benchSampleIdx, setBenchSampleIdx] = useState<number>(0);

  const [lightingCondition, setLightingCondition] = useState<LightingCondition>(
    'High-intensity normal lighting'
  );
  const [cameraDistanceCm, setCameraDistanceCm] = useState<number>(25);
  const [diffuserDistanceCm, setDiffuserDistanceCm] = useState<number>(18);
  const [autoRecordDefects, setAutoRecordDefects] = useState<boolean>(false);

  const [liveResult, setLiveResult] = useState<LiveFrameResponse | null>(null);
  const [liveFps, setLiveFps] = useState<number>(0);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [savingSnapshot, setSavingSnapshot] = useState(false);

  const frameTimesRef = useRef<number[]>([]);

  useEffect(() => {
    void fetchDataset().then((items) => setDatasetSamples(items)).catch(() => {});

    if (navigator.mediaDevices?.enumerateDevices) {
      void navigator.mediaDevices
        .enumerateDevices()
        .then((list) => {
          const cams = list.filter((d) => d.kind === 'videoinput');
          setDevices(cams);
        })
        .catch(() => {});
    }

    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCameraStatus('Disconnected');
    setLiveFps(0);
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    setSavedMessage(null);

    if (selectedSource === 'test-bench') {
      setCameraActive(true);
      setCameraStatus('Connected (Lab Test Bench Feed)');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'Browser webcam API (getUserMedia) is unavailable here. Switch source to "Lab Test Bench Feed" to test live frame processing.'
      );
      return;
    }

    try {
      setCameraStatus('Requesting camera permission...');
      const constraints: MediaStreamConstraints = {
        video:
          selectedSource !== 'auto-webcam'
            ? { deviceId: { exact: selectedSource }, width: { ideal: 640 }, height: { ideal: 480 } }
            : { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Refresh device labels after permission granted
      const updatedDevices = await navigator.mediaDevices.enumerateDevices();
      setDevices(updatedDevices.filter((d) => d.kind === 'videoinput'));

      setCameraActive(true);
      setCameraStatus('Connected (Live Webcam Stream)');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Camera access denied or no webcam found';
      setCameraError(
        `${msg}. You can select "Lab Test Bench Feed" to stream real backlit bottle samples through the live OpenCV frame pipeline.`
      );
      setCameraStatus('Permission Denied / Unavailable');
    }
  };

  // Draw active Test Bench sample onto bench canvas whenever index changes
  useEffect(() => {
    if (!cameraActive || selectedSource !== 'test-bench') return;
    const canvas = benchCanvasRef.current;
    const sample = datasetSamples[benchSampleIdx];
    if (!canvas || !sample) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      canvas.width = img.width || 480;
      canvas.height = img.height || 360;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }
    };
    img.src = sample.imageUrl;
  }, [cameraActive, selectedSource, benchSampleIdx, datasetSamples]);

  const captureCurrentDataUrl = useCallback((): string | null => {
    if (selectedSource === 'test-bench') {
      const bench = benchCanvasRef.current;
      if (!bench || bench.width === 0) return null;
      return bench.toDataURL('image/jpeg', 0.88);
    }
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) return null;
    canvas.width = Math.min(640, video.videoWidth);
    canvas.height = Math.round((canvas.width / video.videoWidth) * video.videoHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  }, [selectedSource]);

  const processOneFrame = useCallback(
    async (forceSave = false) => {
      if (inFlightRef.current && !forceSave) return;
      const dataUrl = captureCurrentDataUrl();
      if (!dataUrl) return;

      inFlightRef.current = true;
      try {
        const res = await inspectLiveFrame({
          frameDataUrl: dataUrl,
          save: forceSave,
          lightingCondition,
          cameraDistanceCm,
          diffuserDistanceCm,
        });
        setLiveResult(res);

        // Update FPS window
        const now = performance.now();
        frameTimesRef.current.push(now);
        frameTimesRef.current = frameTimesRef.current.filter((t) => now - t <= 2500);
        if (frameTimesRef.current.length >= 2) {
          const spanSec =
            (frameTimesRef.current[frameTimesRef.current.length - 1] - frameTimesRef.current[0]) /
            1000;
          if (spanSec > 0) {
            setLiveFps(Number(((frameTimesRef.current.length - 1) / spanSec).toFixed(1)));
          }
        }

        // Alert sound & auto-record cooldown (4s)
        if (res.classification === 'SUSPECTED CRACK') {
          if (audioEnabled && now - lastAlertTsRef.current > 2800) {
            playDefectAlertSound();
            lastAlertTsRef.current = now;
          }
          if (autoRecordDefects && !forceSave && now - lastAlertTsRef.current > 5000) {
            lastAlertTsRef.current = now;
            const saved = await inspectLiveFrame({
              frameDataUrl: dataUrl,
              save: true,
              lightingCondition,
              cameraDistanceCm,
              diffuserDistanceCm,
            });
            if (saved.savedInspection) {
              setSavedMessage(`Auto-logged defect event ${saved.savedInspection.id}`);
              onInspectionSaved?.();
            }
          }
        }

        if (forceSave && res.savedInspection) {
          setSavedMessage(
            `Saved ${res.savedInspection.id} (${res.savedInspection.classification}) to inspection history.`
          );
          onInspectionSaved?.();
        }
      } catch (err) {
        setCameraError(err instanceof Error ? err.message : 'Frame processing error');
      } finally {
        inFlightRef.current = false;
      }
    },
    [
      audioEnabled,
      autoRecordDefects,
      cameraDistanceCm,
      captureCurrentDataUrl,
      diffuserDistanceCm,
      lightingCondition,
      onInspectionSaved,
    ]
  );

  // Throttled frame processing loop (280ms interval, skips if prior request in-flight)
  useEffect(() => {
    if (!cameraActive) return;
    const timer = window.setInterval(() => {
      void processOneFrame(false);
    }, 300);
    return () => window.clearInterval(timer);
  }, [cameraActive, processOneFrame]);

  const handleCaptureAndSave = async () => {
    setSavingSnapshot(true);
    try {
      await processOneFrame(true);
    } finally {
      setSavingSnapshot(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Control Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="camera-source" className="block text-xs font-semibold text-[#0F294A]">
              Camera Source
            </label>
            <select
              id="camera-source"
              value={selectedSource}
              onChange={(e) => {
                if (cameraActive) stopCamera();
                setSelectedSource(e.target.value);
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-600 focus:outline-none"
            >
              <option value="auto-webcam">Default Webcam / USB / Phone Camera</option>
              {devices.map((d, idx) => (
                <option key={d.deviceId || idx} value={d.deviceId}>
                  {d.label || `Camera Device #${idx + 1}`}
                </option>
              ))}
              <option value="test-bench">Lab Test Bench Feed (Sample Bottle Stream)</option>
            </select>
          </div>

          <div>
            <label htmlFor="live-lighting" className="block text-xs font-semibold text-[#0F294A]">
              Lighting Setup
            </label>
            <select
              id="live-lighting"
              value={lightingCondition}
              onChange={(e) => setLightingCondition(e.target.value as LightingCondition)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-600 focus:outline-none"
            >
              {LIGHTING_CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="live-cam-dist" className="block text-xs font-semibold text-[#0F294A]">
              Camera Distance (cm)
            </label>
            <input
              id="live-cam-dist"
              type="number"
              min={10}
              max={120}
              value={cameraDistanceCm}
              onChange={(e) => setCameraDistanceCm(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono tabular-nums text-slate-900 focus:border-sky-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="live-diff-dist" className="block text-xs font-semibold text-[#0F294A]">
              Bottle-to-Diffuser (cm)
            </label>
            <input
              id="live-diff-dist"
              type="number"
              min={5}
              max={80}
              value={diffuserDistanceCm}
              onChange={(e) => setDiffuserDistanceCm(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono tabular-nums text-slate-900 focus:border-sky-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            {!cameraActive ? (
              <button
                type="button"
                onClick={() => void startCamera()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#173B69] whitespace-nowrap transition-colors"
              >
                <Camera className="h-4 w-4" aria-hidden="true" />
                Start Camera
              </button>
            ) : (
              <button
                type="button"
                onClick={stopCamera}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-900 whitespace-nowrap transition-colors"
              >
                <CameraOff className="h-4 w-4" aria-hidden="true" />
                Stop Camera
              </button>
            )}

            <button
              type="button"
              disabled={!cameraActive || savingSnapshot}
              onClick={() => void handleCaptureAndSave()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-4 py-2 text-xs font-semibold text-[#0F294A] hover:bg-sky-100 disabled:opacity-50 whitespace-nowrap transition-colors"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              Capture &amp; Save Result
            </button>

            <button
              type="button"
              onClick={() => onToggleAudio(!audioEnabled)}
              aria-pressed={audioEnabled}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${
                audioEnabled
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-slate-300 bg-white text-slate-600'
              }`}
            >
              {audioEnabled ? (
                <Volume2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <VolumeX className="h-4 w-4" aria-hidden="true" />
              )}
              {audioEnabled ? 'Audio Alert On' : 'Audio Alert Off'}
            </button>
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={autoRecordDefects}
              onChange={(e) => setAutoRecordDefects(e.target.checked)}
              className="rounded border-slate-300"
            />
            Auto-record defect alerts to DB
          </label>
        </div>

        {/* Bench sample switcher if in test-bench mode */}
        {selectedSource === 'test-bench' && datasetSamples.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-[#0F294A]">
                Test Bench Bottle Sample:
              </span>
              {datasetSamples.slice(0, 6).map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setBenchSampleIdx(idx)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                    benchSampleIdx === idx
                      ? 'bg-[#0F294A] text-white'
                      : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {s.label}: {s.filename.replace('.png', '')}
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedSource !== 'test-bench' && (
          <div className="border-t border-slate-200 pt-3 text-xs text-slate-600">
            Position the glass bottle ~18 cm in front of the diffuse LED backlight and ~25–40 cm
            from the fixed camera lens.
          </div>
        )}
      </div>

      {/* Live Telemetry Strip */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <p className="text-xs text-slate-500">Camera Connection</p>
          <p
            data-testid="live-camera-status"
            className="mt-1 flex items-center gap-2 text-xs font-semibold text-slate-900"
          >
            {cameraActive && (
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
            )}
            {cameraStatus}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <p className="text-xs text-slate-500">Live Processing FPS</p>
          <p
            data-testid="live-fps"
            className="mt-1 text-lg font-bold text-[#0F294A] font-mono tabular-nums"
          >
            {liveFps} FPS
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <p className="text-xs text-slate-500">OpenCV Frame Latency</p>
          <p
            data-testid="live-latency"
            className="mt-1 text-lg font-bold text-[#0F294A] font-mono tabular-nums"
          >
            {liveResult ? `${liveResult.processingTimeMs} ms` : '—'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
          <p className="text-xs text-slate-500">Current Inspection Status</p>
          <div className="mt-1" data-testid="live-classification">
            {liveResult ? (
              <ClassificationBadge classification={liveResult.classification} />
            ) : (
              <span className="text-xs font-medium text-slate-500">Awaiting frames</span>
            )}
          </div>
        </div>
      </div>

      {cameraError && (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900"
          role="alert"
        >
          {cameraError}
        </div>
      )}

      {savedMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800">
          {savedMessage}
        </div>
      )}

      {/* Real-Time Alert Banner (Module F) */}
      {liveResult && (
        <div
          data-testid="live-alert-banner"
          className={`flex flex-col justify-between gap-3 rounded-xl border p-4 sm:flex-row sm:items-center ${
            liveResult.classification === 'SUSPECTED CRACK'
              ? 'border-red-300 bg-red-50 text-red-900'
              : liveResult.classification === 'MANUAL INSPECTION REQUIRED'
              ? 'border-amber-300 bg-amber-50 text-amber-900'
              : 'border-emerald-300 bg-emerald-50 text-emerald-900'
          }`}
          role="status"
        >
          <div className="flex items-start gap-3">
            {liveResult.classification === 'SUSPECTED CRACK' ? (
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
            ) : liveResult.classification === 'MANUAL INSPECTION REQUIRED' ? (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
            )}
            <div>
              <p className="text-sm font-bold">
                {liveResult.classification === 'SUSPECTED CRACK'
                  ? 'Suspected crack-like defect detected.'
                  : liveResult.classification === 'MANUAL INSPECTION REQUIRED'
                  ? 'Ambiguous discontinuity detected — manual inspection required.'
                  : 'No crack-like defect detected.'}
              </p>
              <p className="mt-0.5 text-xs">
                {liveResult.defectCount > 0
                  ? `${liveResult.defectCount} bounding region(s) flagged · Heuristic Score ${liveResult.heuristicScore}/100 (rule-based)`
                  : `Bottle ROI verified clear · Heuristic Score ${liveResult.heuristicScore}/100`}
              </p>
            </div>
          </div>

          {liveResult.regions.length > 0 && (
            <div className="text-xs font-mono tabular-nums">
              Primary Region: {liveResult.regions[0].regionLocation} ({liveResult.regions[0].width}×
              {liveResult.regions[0].height}px)
            </div>
          )}
        </div>
      )}

      {/* Dual Video / Processed Output Viewports */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#0F294A]">Raw Optical Input Feed</h3>
            <span className="text-xs text-slate-500">
              {selectedSource === 'test-bench' ? 'Lab Test Bench Source' : 'getUserMedia Video'}
            </span>
          </div>
          <div className="relative flex min-h-[280px] items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
            <video
              ref={videoRef}
              playsInline
              muted
              className={`max-h-[360px] w-full object-contain ${
                cameraActive && selectedSource !== 'test-bench' ? 'block' : 'hidden'
              }`}
            />
            <canvas
              ref={benchCanvasRef}
              className={`max-h-[360px] w-full object-contain ${
                cameraActive && selectedSource === 'test-bench' ? 'block' : 'hidden'
              }`}
            />
            {!cameraActive && (
              <div className="p-8 text-center text-xs text-slate-400">
                Click <strong className="text-white">Start Camera</strong> to begin capturing live
                glass bottle frames.
              </div>
            )}
          </div>
          <canvas ref={captureCanvasRef} className="hidden" />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#0F294A]">
              Processed Detection Output (Red Bounding Boxes)
            </h3>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {liveResult ? `${liveResult.imageWidth}×${liveResult.imageHeight}px` : 'Idle'}
            </span>
          </div>
          <div className="relative flex min-h-[280px] items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-900">
            {liveResult ? (
              <img
                data-testid="live-processed-image"
                src={liveResult.processedImageDataUrl}
                alt="Processed live bottle detection frame with bounding boxes"
                className="max-h-[360px] w-full object-contain"
              />
            ) : (
              <div className="p-8 text-center text-xs text-slate-400">
                Processed frames with bottle ROI and detected crack bounding boxes will render here
                in real time.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detected Region Details */}
      {liveResult && liveResult.regions.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-[#0F294A]">
            Live Detected Defect Regions ({liveResult.regions.length})
          </h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-sky-50 text-[#0F294A]">
                <tr>
                  <th className="px-3 py-2 font-semibold">Box ID</th>
                  <th className="px-3 py-2 font-semibold">Region Location</th>
                  <th className="px-3 py-2 font-semibold">Characteristics</th>
                  <th className="px-3 py-2 font-semibold text-right">BBox Coordinates</th>
                  <th className="px-3 py-2 font-semibold text-right">Area (px²)</th>
                  <th className="px-3 py-2 font-semibold text-right">Length (px)</th>
                  <th className="px-3 py-2 font-semibold text-right">Aspect Ratio</th>
                  <th className="px-3 py-2 font-semibold text-right">Heuristic Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {liveResult.regions.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 font-mono font-semibold text-red-700">#{r.id}</td>
                    <td className="px-3 py-2 text-slate-800">{r.regionLocation}</td>
                    <td className="px-3 py-2 text-slate-700">{r.shapeCharacteristics}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      ({r.x}, {r.y}) {r.width}×{r.height}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{r.area}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{r.length}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {r.aspectRatio}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-red-700">
                      {r.heuristicScore}/100
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
