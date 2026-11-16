import React from 'react';
import { SlidersHorizontal, ListFilter, Library, Settings, Info } from 'lucide-react';
import { ActiveTab } from '../types';

interface SidebarProps {
  currentTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  queueCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  queueCount
}) => {
  return (
    <aside
      className="w-52 flex-shrink-0 bg-[var(--bg-sidebar)] backdrop-blur-xl border-r border-[var(--border-subtle)] flex flex-col justify-between p-3 select-none"
      style={{ transition: 'background-color 1.6s ease-in-out, color 1.6s ease-in-out, border-color 1.6s ease-in-out' }}
    >
      <div>
        <div className="px-2.5 pt-2 pb-2.5">
          <span className="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
            Navegación
          </span>
        </div>

        <nav className="space-y-1">
          {/* Analizador */}
          <button
            onClick={() => onSelectTab('analyzer')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              currentTab === 'analyzer'
                ? 'bg-white/[0.08] text-white border border-white/[0.08] shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'
            }`}
          >
            <SlidersHorizontal className={`w-4 h-4 flex-shrink-0 ${currentTab === 'analyzer' ? 'text-rose-400' : ''}`} />
            <span>Descargar</span>
          </button>

          {/* Cola de Descargas */}
          <button
            onClick={() => onSelectTab('queue')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              currentTab === 'queue'
                ? 'bg-white/[0.08] text-white border border-white/[0.08] shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'
            }`}
          >
            <div className="flex items-center gap-3">
              <ListFilter className={`w-4 h-4 flex-shrink-0 ${currentTab === 'queue' ? 'text-rose-400' : ''}`} />
              <span>Cola</span>
            </div>
            {queueCount > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${
                  currentTab === 'queue'
                    ? 'bg-rose-500/20 text-rose-300'
                    : 'bg-white/[0.06] text-slate-300'
                }`}
              >
                {queueCount}
              </span>
            )}
          </button>

          {/* Biblioteca */}
          <button
            onClick={() => onSelectTab('library')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              currentTab === 'library'
                ? 'bg-white/[0.08] text-white border border-white/[0.08] shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'
            }`}
          >
            <Library className={`w-4 h-4 flex-shrink-0 ${currentTab === 'library' ? 'text-rose-400' : ''}`} />
            <span>Biblioteca</span>
          </button>

          {/* Configuración */}
          <button
            onClick={() => onSelectTab('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              currentTab === 'settings'
                ? 'bg-white/[0.08] text-white border border-white/[0.08] shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'
            }`}
          >
            <Settings className={`w-4 h-4 flex-shrink-0 ${currentTab === 'settings' ? 'text-rose-400' : ''}`} />
            <span>Ajustes</span>
          </button>

          {/* Acerca de */}
          <button
            onClick={() => onSelectTab('about')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              currentTab === 'about'
                ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-500/25'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Info className="w-4 h-4 flex-shrink-0" />
            <span>Acerca de</span>
          </button>
        </nav>
      </div>

      {/* Tarjeta de Estado del Sistema */}
      <div className="ws-panel p-3 border border-white/5 space-y-2 bg-[#0e1322] rounded-xl">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-300 font-medium">Motor de descarga</span>
          <span className="flex items-center gap-1.5 text-emerald-400 font-semibold text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Listo
          </span>
        </div>

        <div className="flex items-center justify-between p-2 rounded-lg bg-black/30 border border-white/5 text-[11px] text-slate-300">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
            <span className="font-semibold text-white">yt-dlp Engine</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400">v2.0</span>
        </div>

        <div className="pt-1.5 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-400">
          <span>Hasta 4K UHD</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400">
            FFmpeg listo
          </span>
        </div>
      </div>
    </aside>
  );
};
export default Sidebar;
