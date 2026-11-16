import React, { useState } from 'react';
import { Folder, Save, Moon, Sun, Sliders, RefreshCw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { AppSettings, PlatformType, ThemeMode } from '../types';
import { PlatformService } from '../services/platform';

interface SettingsViewProps {
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
  platform: PlatformType;
  onShowToast: (message: string, type: 'success' | 'error') => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onSave,
  onShowToast
}) => {
  const [theme, setTheme] = useState<ThemeMode>(settings.theme || 'dark');
  const [customBg] = useState(settings.customTheme?.bg || '#13111c');
  const [customCard] = useState(settings.customTheme?.card || '#1d1a2b');
  const [customAccent] = useState(settings.customTheme?.accent || '#f43f5e');

  const [downloadPath, setDownloadPath] = useState(settings.downloadPath || '');
  const [concurrent, setConcurrent] = useState(settings.maxConcurrentDownloads || 3);
  const [speedLimit, setSpeedLimit] = useState(settings.speedLimit || 'unlimited');
  const [autoOrganize, setAutoOrganize] = useState(settings.autoOrganizeByChannel ?? false);
  const [isUpdatingEngine, setIsUpdatingEngine] = useState(false);

  const handleUpdateEngine = async () => {
    if (isUpdatingEngine) return;
    setIsUpdatingEngine(true);
    try {
      const msg = await invoke<string>('update_yt_dlp');
      onShowToast(msg || 'Motor actualizado.', 'success');
    } catch (err) {
      onShowToast(typeof err === 'string' ? err : 'No se pudo actualizar yt-dlp.', 'error');
    } finally {
      setIsUpdatingEngine(false);
    }
  };
  const [embedMetadata, setEmbedMetadata] = useState(settings.embedMetadata ?? true);

  const handlePickFolder = async () => {
    const selected = await PlatformService.pickDownloadFolder();
    if (selected) setDownloadPath(selected);
  };

  const applyThemeImmediate = (nextTheme: ThemeMode, bg = customBg, card = customCard, accent = customAccent) => {
    setTheme(nextTheme);
    onSave({
      ...settings,
      theme: nextTheme,
      customTheme: { bg, card, accent }
    });
  };

  const handleSaveAll = () => {
    onSave({
      ...settings,
      theme,
      customTheme: { bg: customBg, card: customCard, accent: customAccent },
      downloadPath,
      maxConcurrentDownloads: concurrent,
      speedLimit,
      autoOrganizeByChannel: autoOrganize,
      embedMetadata
    });
    onShowToast('Ajustes guardados correctamente', 'success');
  };

  return (
    <div className="max-w-3xl mx-auto py-4 px-2 space-y-5 pb-20">
      {/* Apariencia y Tema */}
      <div className="ws-panel p-5 flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold">Apariencia</div>
          <div className="text-xs text-slate-400">
            Modo {theme === 'light' ? 'Claro' : 'Oscuro'} activo
          </div>
        </div>

        <button
          type="button"
          onClick={() => applyThemeImmediate(theme === 'light' ? 'dark' : 'light')}
          aria-label="Cambiar entre modo oscuro y claro"
          className={`relative w-32 h-10 rounded-full p-1 border transition-colors duration-300 cursor-pointer flex items-center ${
            theme === 'light'
              ? 'bg-amber-400/20 border-amber-400/40'
              : 'bg-sky-500/15 border-sky-400/30'
          }`}
        >
          <div
            className={`absolute top-1 left-1 w-14 h-8 rounded-full shadow-md transition-transform duration-300 ease-out flex items-center justify-center ${
              theme === 'light'
                ? 'translate-x-16 bg-amber-400 text-slate-950'
                : 'translate-x-0 bg-slate-800 text-sky-300 border border-white/10'
            }`}
          >
            {theme === 'light' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </div>
          <span
            className={`w-1/2 text-center text-[11px] font-semibold z-10 transition-opacity duration-200 ${
              theme === 'light' ? 'opacity-60' : 'opacity-0'
            }`}
          >
            Oscuro
          </span>
          <span
            className={`w-1/2 text-center text-[11px] font-semibold z-10 transition-opacity duration-200 ${
              theme === 'light' ? 'opacity-0' : 'opacity-60'
            }`}
          >
            Claro
          </span>
        </button>
      </div>

      {/* Carpeta de descargas */}
      <div className="ws-panel p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Folder className="w-4 h-4 text-amber-400" />
          <span>Carpeta donde se guardan tus descargas</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs font-mono truncate">
            {downloadPath || 'Carpeta de Descargas del sistema'}
          </div>
          <button
            type="button"
            onClick={handlePickFolder}
            className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium transition-colors"
          >
            Cambiar carpeta
          </button>
        </div>
      </div>

      {/* Preferencias de descarga */}
      <div className="ws-panel p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sliders className="w-4 h-4 text-sky-400" />
          <span>Preferencias de descarga</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400">Descargas al mismo tiempo</label>
            <select
              value={concurrent}
              onChange={(e) => setConcurrent(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs focus:outline-none"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n} className="bg-[#12141c] text-white">
                  {n} {n === 1 ? 'descarga a la vez' : 'descargas a la vez'}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-slate-400">Límite de velocidad</label>
            <select
              value={speedLimit}
              onChange={(e) => setSpeedLimit(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs focus:outline-none"
            >
              <option value="unlimited" className="bg-[#12141c] text-white">Sin límite (Máxima velocidad)</option>
              <option value="5mb" className="bg-[#12141c] text-white">5 MB/s</option>
              <option value="10mb" className="bg-[#12141c] text-white">10 MB/s</option>
              <option value="25mb" className="bg-[#12141c] text-white">25 MB/s</option>
            </select>
          </div>
        </div>

        <div className="space-y-2.5 pt-1">
          <label className="ws-panel-subtle p-3 flex items-center justify-between cursor-pointer">
            <div>
              <div className="text-xs font-medium">Organizar en carpetas por canal</div>
              <div className="text-[11px] text-slate-400">Crea una carpeta con el nombre del canal para cada descarga</div>
            </div>
            <input
              type="checkbox"
              checked={autoOrganize}
              onChange={(e) => setAutoOrganize(e.target.checked)}
              className="w-4 h-4 accent-rose-500"
            />
          </label>

          <label className="ws-panel-subtle p-3 flex items-center justify-between cursor-pointer">
            <div>
              <div className="text-xs font-medium">Guardar portada e información en el archivo</div>
              <div className="text-[11px] text-slate-400">Incluye la miniatura y título dentro del video o canción</div>
            </div>
            <input
              type="checkbox"
              checked={embedMetadata}
              onChange={(e) => setEmbedMetadata(e.target.checked)}
              className="w-4 h-4 accent-rose-500"
            />
          </label>
        </div>
      </div>

      {/* Motor de descarga */}
      <div className="ws-panel p-5 flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold">Motor de descarga (yt-dlp)</div>
          <div className="text-xs text-slate-400">
            Se actualiza automáticamente al iniciar, o puedes buscar actualizaciones manualmente.
          </div>
        </div>
        <button
          type="button"
          onClick={handleUpdateEngine}
          disabled={isUpdatingEngine}
          className="px-4 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-[var(--border-subtle)] text-xs font-medium flex items-center gap-2 transition-colors disabled:opacity-50 flex-shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isUpdatingEngine ? 'animate-spin' : ''}`} />
          <span>{isUpdatingEngine ? 'Actualizando...' : 'Actualizar motor'}</span>
        </button>
      </div>

      <button
        type="button"
        onClick={handleSaveAll}
        className="btn-action-primary w-full py-3 text-sm gap-2"
      >
        <Save className="w-4 h-4" />
        <span>Guardar cambios</span>
      </button>
    </div>
  );
};
