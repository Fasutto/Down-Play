import React from 'react';
import { Gauge, Minus, Square, X } from 'lucide-react';
import { PlatformType } from '../types';
import { PlatformService } from '../services/platform';

interface TopNavbarProps {
  platform: PlatformType;
  globalSpeed?: string;
  connections?: number;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  globalSpeed = '0.0 MB/s',
}) => {

  return (
    <div 
      data-tauri-drag-region
      className="w-full flex-shrink-0 border-b border-[var(--border-subtle)] bg-[var(--bg-sidebar)] backdrop-blur-md select-none"
      style={{
        WebkitAppRegion: 'drag',
        transition: 'background-color 1.6s ease-in-out, color 1.6s ease-in-out, border-color 1.6s ease-in-out'
      } as React.CSSProperties}
    >
      {/* Top Application Bar */}
      <div className="h-11 px-3 flex items-center justify-between">
        {/* Left: Brand Title, Platform Badge & Speed Monitor */}
        <div className="flex items-center gap-3">
          {/* Logo & Brand */}
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="Down-Play"
              className="w-6 h-6 rounded-lg object-contain bg-white p-0.5 shadow-sm"
            />
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-bold tracking-tight">Down-Play</span>
              <span className="text-[11px] text-slate-400 font-mono">v0.9.0</span>
            </div>
          </div>

          {/* Speed Indicator (Moved to left, no slot indicator) */}
          <div 
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#131929] border border-cyan-500/20 text-xs text-cyan-400 font-mono shadow-sm"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <Gauge className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-medium tracking-tight">{globalSpeed}</span>
          </div>
        </div>

        {/* Right: Custom Windows-Style Window Controls */}
        <div 
          className="flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {/* Minimize */}
          <button
            onClick={() => PlatformService.minimizeWindow()}
            title="Minimizar"
            className="w-8 h-7 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 active:bg-white/15 transition-colors focus:outline-none"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          {/* Maximize / Restore */}
          <button
            onClick={() => PlatformService.maximizeWindow()}
            title="Maximizar"
            className="w-8 h-7 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 active:bg-white/15 transition-colors focus:outline-none"
          >
            <Square className="w-3 h-3 stroke-[2]" />
          </button>

          {/* Close */}
          <button
            onClick={() => PlatformService.closeWindow()}
            title="Cerrar"
            className="w-8 h-7 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-rose-600 active:bg-rose-700 transition-colors focus:outline-none"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
export default TopNavbar;
