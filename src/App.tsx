import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TopNavbar } from './components/TopNavbar';
import { Sidebar } from './components/Sidebar';
import { AnalyzerView } from './components/AnalyzerView';
import { QueueView } from './components/QueueView';
import { LibraryView } from './components/LibraryView';
import { SettingsView } from './components/SettingsView';
import { AboutView } from './components/AboutView';
import { MediaModal } from './components/MediaModal';
import { PlatformService } from './services/platform';
import { 
  VideoMetadata, 
  DownloadTask, 
  AppSettings, 
  PlatformType, 
  ActiveTab,
  DownloadFormat,
  VideoQuality,
  VideoCodec
} from './types';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';

const SETTINGS_STORAGE_KEY = 'yt_studio_settings';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  customTheme: {
    bg: '#13111c',
    card: '#1d1a2b',
    accent: '#c4b5fd'
  },
  downloadPath: '',
  serverUrl: 'http://localhost:4000',
  autoOpenFolder: true,
  defaultFormat: 'video',
  defaultQuality: 'best',
  defaultCodec: 'H264',
  defaultProfile: 'best',
  maxConcurrentDownloads: 5,
  speedLimit: 'unlimited',
  autoOrganizeByChannel: false,
  embedMetadata: true,
  embedThumbnails: true
};

export const App: React.FC = () => {
  const [platform, setPlatform] = useState<PlatformType>('web');
  const [currentTab, setCurrentTab] = useState<ActiveTab>('analyzer');
  const [isLoading, setIsLoading] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);

  // Persistent selections across tabs & editable title
  const [persistedFormat, setPersistedFormat] = useState<DownloadFormat | null>('video');
  const [persistedQuality, setPersistedQuality] = useState<VideoQuality | null>('best');
  const [persistedCodec, setPersistedCodec] = useState<VideoCodec>('H264');
  const [customTitle, setCustomTitle] = useState<string>('');
  const [previewModalTask, setPreviewModalTask] = useState<DownloadTask | null>(null);

  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Error reading settings from localStorage:', e);
    }
    return DEFAULT_SETTINGS;
  });

  const runningTaskIdsRef = useRef<Set<string>>(new Set());
  const settingsRef = useRef<AppSettings>(settings);

  useEffect(() => {
    settingsRef.current = settings;
    const theme = settings.theme || 'dark';
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    if (theme === 'custom' && settings.customTheme) {
      root.style.setProperty('--bg-app', settings.customTheme.bg);
      root.style.setProperty('--bg-card', settings.customTheme.card);
      root.style.setProperty('--accent-pink', settings.customTheme.accent);
    } else {
      root.style.removeProperty('--bg-app');
      root.style.removeProperty('--bg-card');
      root.style.removeProperty('--accent-pink');
    }
  }, [settings]);

  const showToast = (message: string, type: 'error' | 'success' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(newSettings));
    } catch (e) {
      console.warn('Error saving settings to localStorage:', e);
    }
  };

  useEffect(() => {
    const currentPlat = PlatformService.getPlatform();
    setPlatform(currentPlat);

    // Initialize default folder if empty
    PlatformService.getDefaultPath().then((dir) => {
      if (dir) {
        setSettings((prev) => {
          if (!prev.downloadPath) {
            return { ...prev, downloadPath: dir };
          }
          return prev;
        });
      }
    });

    // Desktop (Electron / Tauri) background listeners
    return PlatformService.subscribeDownloadEvents({
      onProgress: ({ taskId, progress, speed, eta }) => {
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, progress, speed, eta, status: 'downloading' } : t))
        );
      },
      onComplete: ({ taskId, filePath }) => {
        runningTaskIdsRef.current.delete(taskId);
        const savedName = filePath
          ? filePath.split(/[/\\]/).pop()?.replace(/\.[^/.]+$/, '')
          : undefined;
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? { ...t, progress: 100, status: 'completed', filePath, title: savedName || t.title }
              : t
          )
        );
        showToast('¡Descarga completada y guardada con éxito!', 'success');
      },
      onError: ({ taskId, error }) => {
        runningTaskIdsRef.current.delete(taskId);
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, status: 'error', error } : t))
        );
        showToast(`Error en la descarga: ${error}`, 'error');
      }
    });
  }, []);

  const handleSearch = async (url: string) => {
    setIsLoading(true);
    setCurrentUrl(url);

    try {
      const data = await PlatformService.fetchVideoInfo(url, settings.serverUrl);
      setMetadata(data);
      setCustomTitle(data.title);

      // Apply default profile preference
      const profile = settings.defaultProfile || 'best';
      if (profile === 'audio') {
        setPersistedFormat('audio');
        setPersistedQuality('best');
      } else if (profile === 'best') {
        setPersistedFormat('video');
        setPersistedQuality('best');
      } else {
        // 'ask': user chooses manually
        setPersistedFormat(null);
        setPersistedQuality(null);
      }

      showToast('Video analizado y metadatos extraídos con éxito.', 'success');
    } catch (err: any) {
      showToast(err.message || 'No se pudo obtener información del enlace. Revisa la URL.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const runTask = useCallback(async (task: DownloadTask) => {
    try {
      await PlatformService.startDownload(
        task,
        settingsRef.current.downloadPath,
        settingsRef.current.serverUrl,
        (progress, speed, eta) => {
          setTasks((prev) =>
            prev.map((t) => (t.id === task.id ? { ...t, progress, speed, eta, status: 'downloading' } : t))
          );
        },
        (filePath) => {
          runningTaskIdsRef.current.delete(task.id);
          setTasks((prev) =>
            prev.map((t) => (t.id === task.id ? { ...t, progress: 100, status: 'completed', filePath } : t))
          );
          showToast(`¡Descarga completada con éxito: ${task.title}!`, 'success');
        },
        (error) => {
          runningTaskIdsRef.current.delete(task.id);
          setTasks((prev) =>
            prev.map((t) => (t.id === task.id ? { ...t, status: 'error', error } : t))
          );
          showToast(`Error en ${task.title}: ${error}`, 'error');
        },
        settingsRef.current
      );
    } catch (err: any) {
      runningTaskIdsRef.current.delete(task.id);
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: 'error', error: err.message } : t))
      );
      showToast(err.message || 'Error al iniciar la descarga', 'error');
    }
  }, []);

  // Queue Scheduler: Strictly enforces maxConcurrentDownloads limitation
  useEffect(() => {
    const maxConcurrent = settings.maxConcurrentDownloads || 3;
    const activeTasks = tasks.filter((t) => t.status === 'downloading');
    const availableSlots = maxConcurrent - activeTasks.length;

    if (availableSlots > 0) {
      // Find oldest pending tasks that are not yet running
      const pendingTasks = tasks
        .filter((t) => t.status === 'pending' && !runningTaskIdsRef.current.has(t.id))
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, availableSlots);

      for (const task of pendingTasks) {
        runningTaskIdsRef.current.add(task.id);
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, status: 'downloading' } : t))
        );
        runTask(task);
      }
    }
  }, [tasks, settings.maxConcurrentDownloads, runTask]);

  const handleAddDownload = (options: {
    url: string;
    title: string;
    thumbnail: string;
    format: DownloadFormat;
    quality: VideoQuality;
    codec: VideoCodec;
  }) => {
    const newTask: DownloadTask = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      url: options.url,
      title: options.title,
      thumbnail: options.thumbnail,
      format: options.format,
      quality: options.quality,
      codec: options.codec,
      status: 'pending',
      progress: 0,
      createdAt: Date.now()
    };

    setTasks((prev) => [newTask, ...prev]);
    showToast('Añadido a la cola de descargas.', 'success');
    setCurrentTab('queue'); // Switch to queue to watch progress
  };

  const handleClearCompleted = () => {
    setTasks((prev) => prev.filter((t) => t.status === 'downloading' || t.status === 'pending'));
    showToast('Descargas completadas eliminadas de la lista.', 'success');
  };

  const handleOpenLocation = (filePath?: string) => {
    const path = filePath || settings.downloadPath;
    PlatformService.shareOrOpenFile(path);
  };

  const handlePlayMedia = (task: DownloadTask) => {
    // Only open the in-app player so it plays directly inside the application offline
    setPreviewModalTask(task);
  };

  const activeDownloading = tasks.filter((t) => t.status === 'downloading');
  const globalSpeed = activeDownloading.find((t) => t.speed)?.speed || (activeDownloading.length > 0 ? 'Descargando...' : '0.0 MB/s');
  const pendingCount = tasks.filter((t) => t.status === 'downloading' || t.status === 'pending').length;
  const completedTasks = tasks.filter((t) => t.status === 'completed');

  return (
    <div
      className="h-screen w-screen bg-[var(--bg-app)] text-[var(--text-primary)] flex flex-col overflow-hidden select-none font-sans"
      style={{ transition: 'background-color 1.6s ease-in-out, color 1.6s ease-in-out' }}
    >
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-14 right-5 z-50 animate-slide-up">
          <div
            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-2xl border backdrop-blur-xl ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
                : 'bg-rose-950/90 border-rose-500/40 text-rose-200'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="text-xs font-semibold">{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="text-white/60 hover:text-white transition ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Modern Compact Custom Title Bar */}
      <TopNavbar
        platform={platform}
        globalSpeed={globalSpeed}
      />

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <Sidebar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          queueCount={pendingCount}
        />

        {/* Dynamic Viewport Container */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 relative">
          <div className="max-w-6xl mx-auto">
            {currentTab === 'analyzer' && (
              <AnalyzerView
                metadata={metadata}
                currentUrl={currentUrl}
                isLoading={isLoading}
                onSearch={handleSearch}
                onAddDownload={handleAddDownload}
                downloadPath={settings.downloadPath}
                onUpdatePath={(path) => handleSaveSettings({ ...settings, downloadPath: path })}
                format={persistedFormat}
                onFormatChange={setPersistedFormat}
                quality={persistedQuality}
                onQualityChange={setPersistedQuality}
                codec={persistedCodec}
                onCodecChange={setPersistedCodec}
                customTitle={customTitle}
                onCustomTitleChange={setCustomTitle}
              />
            )}

            {currentTab === 'queue' && (
              <QueueView
                tasks={tasks}
                maxConcurrentDownloads={settings.maxConcurrentDownloads}
                onClearCompleted={handleClearCompleted}
                onOpenLocation={handleOpenLocation}
                onPlayMedia={handlePlayMedia}
                onGoToAnalyzer={() => setCurrentTab('analyzer')}
              />
            )}

            {currentTab === 'library' && (
              <LibraryView
                completedTasks={completedTasks}
                downloadPath={settings.downloadPath}
                onOpenLocation={handleOpenLocation}
                onPlayMedia={handlePlayMedia}
                onGoToAnalyzer={() => setCurrentTab('analyzer')}
                onUpdatePath={(path) => handleSaveSettings({ ...settings, downloadPath: path })}
              />
            )}

            {currentTab === 'settings' && (
              <SettingsView
                settings={settings}
                onSave={handleSaveSettings}
                platform={platform}
                onShowToast={showToast}
              />
            )}

            {currentTab === 'about' && (
              <AboutView />
            )}
          </div>
        </main>
      </div>

      {/* In-App / System Media Playback Modal */}
      {previewModalTask && (
        <MediaModal
          task={previewModalTask}
          onClose={() => setPreviewModalTask(null)}
          onPlayInSystem={(path) => path && PlatformService.playFile(path)}
          onOpenLocation={(path) => path && PlatformService.shareOrOpenFile(path)}
        />
      )}
    </div>
  );
};

export default App;
