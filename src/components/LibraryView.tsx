import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  LayoutGrid,
  List,
  FolderOpen,
  Play,
  RotateCw,
  Film,
  Music,
  Plus
} from 'lucide-react';
import { DownloadTask } from '../types';
import { PlatformService } from '../services/platform';

interface LibraryViewProps {
  completedTasks: DownloadTask[];
  downloadPath: string;
  onOpenLocation: (filePath?: string) => void;
  onPlayMedia: (task: DownloadTask) => void;
  onGoToAnalyzer?: () => void;
  onUpdatePath?: (newPath: string) => void;
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  completedTasks,
  downloadPath,
  onOpenLocation,
  onPlayMedia,
  onGoToAnalyzer,
  onUpdatePath
}) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'video' | 'audio'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [localFiles, setLocalFiles] = useState<any[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  const scanFolder = async () => {
    if (!downloadPath) return;
    setIsScanning(true);
    try {
      const files = await PlatformService.getLocalLibrary(downloadPath);
      setLocalFiles(files || []);
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    scanFolder();
  }, [downloadPath, completedTasks.length]);

  const handlePickFolder = async () => {
    const picked = await PlatformService.pickDownloadFolder();
    if (picked && onUpdatePath) {
      onUpdatePath(picked);
    }
  };

  const items: DownloadTask[] = useMemo(() => {
    const fromDisk: DownloadTask[] = localFiles.map((f) => ({
      id: f.id,
      url: '',
      title: f.title,
      thumbnail: f.thumbnail || '',
      format: f.format === 'audio' ? 'audio' : 'video',
      quality: 'best',
      status: 'completed',
      progress: 100,
      filePath: f.filePath,
      totalSize: formatFileSize(f.sizeBytes),
      createdAt: f.createdAt || Date.now()
    }));

    const seenPaths = new Set(fromDisk.map((i) => i.filePath));
    const extras = completedTasks.filter((t) => t.filePath && !seenPaths.has(t.filePath));
    return [...extras, ...fromDisk];
  }, [localFiles, completedTasks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (typeFilter !== 'all' && item.format !== typeFilter) return false;
      if (q && !item.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, typeFilter, search]);

  return (
    <div className="max-w-5xl mx-auto py-4 px-2 space-y-5 pb-20">
      {/* Barra superior */}
      <div className="ws-panel p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar en tu biblioteca..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] focus:border-rose-500/60 focus:outline-none text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-white/[0.04] border border-white/[0.06] rounded-xl p-1">
            {(['all', 'video', 'audio'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  typeFilter === t ? 'bg-rose-500 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {t === 'all' ? 'Todos' : t === 'video' ? 'Videos' : 'Audio'}
              </button>
            ))}
          </div>

          <div className="flex items-center bg-white/[0.04] border border-white/[0.06] rounded-xl p-1">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              title="Vista de cuadrícula"
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === 'grid' ? 'bg-white/[0.1] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              title="Vista de lista"
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === 'list' ? 'bg-white/[0.1] text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={scanFolder}
            title="Actualizar"
            className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-300 transition-colors"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
          </button>

          {onUpdatePath && (
            <button
              type="button"
              onClick={handlePickFolder}
              className="px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>Carpeta</span>
            </button>
          )}
        </div>
      </div>

      {/* Contenido */}
      {filtered.length === 0 ? (
        <div className="ws-panel p-12 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
            <Film className="w-5 h-5 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-300">
            {search ? 'No se encontraron archivos con ese nombre' : 'Tu biblioteca está vacía'}
          </p>
          <p className="text-xs text-slate-400">
            Carpeta actual: <span className="font-mono text-slate-300">{downloadPath || 'Descargas'}</span>
          </p>
          {onGoToAnalyzer && !search && (
            <button
              type="button"
              onClick={onGoToAnalyzer}
              className="btn-action-primary px-4 py-2 text-xs gap-1.5 mx-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Descargar algo</span>
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <div key={item.id} className="ws-panel overflow-hidden flex flex-col group">
              <div
                onClick={() => onPlayMedia(item)}
                className="relative aspect-video bg-black/40 cursor-pointer overflow-hidden"
              >
                {item.thumbnail ? (
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : item.format === 'video' && item.filePath ? (
                  <video
                    src={`${PlatformService.getStreamUrl(item.filePath)}#t=0.5`}
                    preload="auto"
                    muted
                    playsInline
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {item.format === 'audio' ? (
                      <Music className="w-10 h-10 text-sky-400/70" />
                    ) : (
                      <Film className="w-10 h-10 text-rose-400/70" />
                    )}
                  </div>
                )}
                <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="w-11 h-11 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg">
                    <Play className="w-5 h-5 ml-0.5" />
                  </div>
                </div>
              </div>

              <div className="p-3.5 flex-1 flex flex-col justify-between gap-3">
                <div>
                  <h3 className="text-xs font-semibold line-clamp-2 leading-snug">{item.title}</h3>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {item.format === 'audio' ? 'Audio' : 'Video'}
                    {item.totalSize ? ` • ${item.totalSize}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onPlayMedia(item)}
                    className="flex-1 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Reproducir</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenLocation(item.filePath)}
                    title="Abrir carpeta"
                    className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-slate-300 transition-colors"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <div key={item.id} className="ws-panel p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-9 rounded-lg bg-black/40 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {item.thumbnail ? (
                    <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" />
                  ) : item.format === 'audio' ? (
                    <Music className="w-4 h-4 text-sky-400" />
                  ) : (
                    <Film className="w-4 h-4 text-rose-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">{item.title}</div>
                  <div className="text-[11px] text-slate-400">
                    {item.format === 'audio' ? 'Audio' : 'Video'}
                    {item.totalSize ? ` • ${item.totalSize}` : ''}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => onPlayMedia(item)}
                  className="px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Reproducir</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenLocation(item.filePath)}
                  title="Abrir carpeta"
                  className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-slate-300 transition-colors"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
