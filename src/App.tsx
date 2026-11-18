import { useEffect, useState } from 'react';
import {
  Activity,
  Camera,
  Database,
  FileBarChart2,
  FlaskConical,
  History,
  Layers,
  LayoutDashboard,
  Menu,
  Settings,
  ShieldAlert,
  Sliders,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { fetchSettings, saveSettings } from './services/api';
import { AppSettings } from './types/inspection';
import { DashboardPage } from './pages/DashboardPage';
import { LiveCameraPage } from './pages/LiveCameraPage';
import { ImageUploadPage } from './pages/ImageUploadPage';
import { ImageProcessingPage } from './pages/ImageProcessingPage';
import { DefectDetectionPage } from './pages/DefectDetectionPage';
import { DatasetManagementPage } from './pages/DatasetManagementPage';
import { CalibrationPage } from './pages/CalibrationPage';
import { InspectionHistoryPage } from './pages/InspectionHistoryPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';

type NavId =
  | 'dashboard'
  | 'live-camera'
  | 'image-upload'
  | 'image-processing'
  | 'defect-detection'
  | 'testing-validation'
  | 'dataset'
  | 'calibration'
  | 'history'
  | 'reports'
  | 'settings';

const NAV_ITEMS: Array<{ id: NavId; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'live-camera', label: 'Live Camera', icon: Camera },
  { id: 'image-upload', label: 'Image Upload', icon: Upload },
  { id: 'image-processing', label: 'Image Processing', icon: Layers },
  { id: 'defect-detection', label: 'Defect Detection', icon: ShieldAlert },
  { id: 'testing-validation', label: 'Testing & Validation', icon: FlaskConical },
  { id: 'dataset', label: 'Dataset Management', icon: Database },
  { id: 'calibration', label: 'Calibration', icon: Sliders },
  { id: 'history', label: 'Inspection History', icon: History },
  { id: 'reports', label: 'Reports', icon: FileBarChart2 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<NavId>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [settingsState, setSettingsState] = useState<AppSettings | null>(null);

  useEffect(() => {
    void fetchSettings()
      .then((s) => {
        setSettingsState(s);
        setAudioEnabled(s.audioAlertEnabled);
      })
      .catch(() => {});
  }, []);

  const handleToggleAudio = (enabled: boolean) => {
    setAudioEnabled(enabled);
    if (settingsState) {
      const next = { ...settingsState, audioAlertEnabled: enabled };
      setSettingsState(next);
      void saveSettings(next).catch(() => {});
    }
  };

  const activeNavItem = NAV_ITEMS.find((n) => n.id === activeTab) || NAV_ITEMS[0];

  const handleSelectNav = (id: NavId) => {
    setActiveTab(id);
    setMobileMenuOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-slate-200 lg:bg-white">
        <div className="flex items-center gap-2.5 border-b border-slate-200 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0F294A] text-white shrink-0">
            <Activity className="h-4 w-4" aria-hidden="true" />
          </div>
          <span className="text-base font-bold tracking-tight text-[#0F294A] whitespace-nowrap">
            GlassGuard CV
          </span>
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label="Primary Sidebar Navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectNav(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-sky-50 text-[#0F294A] border border-sky-200'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${isActive ? 'text-sky-700' : 'text-slate-400'}`}
                  aria-hidden="true"
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4 text-xs text-slate-500">
          Classical OpenCV Pipeline · Diffuse Backlighting Setup
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-50 flex w-64 flex-col bg-white border-r border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5">
              <span className="text-sm font-bold text-[#0F294A]">GlassGuard CV</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 p-3" aria-label="Mobile Navigation">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectNav(item.id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold whitespace-nowrap ${
                      isActive
                        ? 'bg-sky-50 text-[#0F294A] border border-sky-200'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50 lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <h1 className="truncate text-base font-bold text-[#0F294A] sm:text-lg">
              {activeNavItem.label}
            </h1>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => handleToggleAudio(!audioEnabled)}
              aria-label={audioEnabled ? 'Mute defect alert audio' : 'Unmute defect alert audio'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              {audioEnabled ? (
                <Volume2 className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
              ) : (
                <VolumeX className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">
                {audioEnabled ? 'Alerts On' : 'Alerts Off'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectNav('live-camera')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F294A] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#173B69] whitespace-nowrap"
            >
              <Camera className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Live Inspection</span>
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
          {activeTab === 'dashboard' && (
            <DashboardPage onNavigate={(tab) => handleSelectNav(tab as NavId)} />
          )}
          {activeTab === 'live-camera' && (
            <LiveCameraPage
              audioEnabled={audioEnabled}
              onToggleAudio={handleToggleAudio}
            />
          )}
          {activeTab === 'image-upload' && <ImageUploadPage />}
          {activeTab === 'image-processing' && <ImageProcessingPage />}
          {activeTab === 'defect-detection' && (
            <DefectDetectionPage initialSubTab="rules" />
          )}
          {activeTab === 'testing-validation' && (
            <DefectDetectionPage initialSubTab="testing" />
          )}
          {activeTab === 'dataset' && <DatasetManagementPage />}
          {activeTab === 'calibration' && <CalibrationPage />}
          {activeTab === 'history' && <InspectionHistoryPage />}
          {activeTab === 'reports' && <ReportsPage />}
          {activeTab === 'settings' && (
            <SettingsPage
              onSettingsUpdated={(s) => {
                setSettingsState(s);
                setAudioEnabled(s.audioAlertEnabled);
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
