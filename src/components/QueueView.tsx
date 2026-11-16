import React, { useState } from 'react';
import { DownloadTask } from '../types';
import {
  Zap,
  Clock,
  Download,
  CheckCircle2,
  AlertCircle,
  Trash2,
  FolderOpen,
  Play,
  Plus
} from 'lucide-react';

interface QueueViewProps {
  tasks: DownloadTask[];
  maxConcurrentDownloads?: number;
  onClearCompleted: () => void;
  onOpenLocation: (filePath?: string) => void;
  onPlayMedia: (task: DownloadTask) => void;
  onGoToAnalyzer?: () => void;
}

export const QueueView: React.FC<QueueViewProps> = ({
  tasks,
  maxConcurrentDownloads = 3,
  onClearCompleted,
  onOpenLocation,
  onPlayMedia,
  onGoToAnalyzer
}) => {
  const [filter, setFilter] = useState<'all' | 'active' | 'pending' | 'completed' | 'error'>('all');

  const activeTasks = tasks.filter((t) => t.status === 'downloading');
  const countActive = activeTasks.length;
  const countPending = tasks.filter((t) => t.status === 'pending').length;
  const countCompleted = tasks.filter((t) => t.status === 'completed').length;
  const countError = tasks.filter((t) => t.status === 'error').length;

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'active') return t.status === 'downloading';
    if (filter === 'pending') return t.status === 'pending';
    if (filter === 'completed') return t.status === 'completed';
    if (filter === 'error') return t.status === 'error';
    return true;
  });

  const currentSpeed = activeTasks.find((t) => t.speed)?.speed || (countActive > 0 ? 'Descargando...' : '0.0 MB/s');
  const currentEta = activeTasks.find((t) => t.eta)?.eta || (countActive > 0 ? 'Calculando...' : '--:--');

  const filters: { id: typeof filter; label: string; count: number }[] = [
    { id: 'all', label: 'Todas', count: tasks.length },
    { id: 'active', label: 'Descargando', count: countActive },
    { id: 'pending', label: 'En espera', count: countPending },
    { id: 'completed', label: 'Listas', count: countCompleted },
    { id: 'error', label: 'Con error', count: countError }
  ];

  return (
    <div className="max-w-5xl mx-auto py-4 px-2 space-y-5 pb-20">
      {/* Resumen superior */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="ws-panel p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-400 block mb-1">Velocidad</span>
            <div className="text-lg font-bold font-mono">{currentSpeed}</div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
            <Zap className="w-4 h-4" />
          </div>
        </div>

        <div className="ws-panel p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-400 block mb-1">Tiempo restante</span>
            <div className="text-lg font-bold font-mono">{currentEta}</div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        <div className="ws-panel p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-400 block mb-1">En curso</span>
            <div className="text-lg font-bold font-mono">
              {countActive} <span className="text-xs text-slate-400 font-normal">/ {maxConcurrentDownloads}</span>
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <Download className="w-4 h-4" />
          </div>
        </div>

        <div className="ws-panel p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-slate-400 block mb-1">Completadas</span>
            <div className="text-lg font-bold font-mono">{countCompleted}</div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Filtros y acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                filter === f.id
                  ? 'bg-rose-500 text-white'
                  : 'bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08]'
              }`}
            >
              <span>{f.label}</span>
              <span className="text-[10px] opacity-75">({f.count})</span>
            </button>
          ))}
        </div>

        {countCompleted > 0 && (
          <button
            type="button"
            onClick={onClearCompleted}
            className="px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-medium text-slate-300 flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>Limpiar completadas</span>
          </button>
        )}
      </div>

      {/* Lista de descargas */}
      {filteredTasks.length === 0 ? (
        <div className="ws-panel p-12 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
            <Download className="w-5 h-5 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-300">No hay descargas en esta vista</p>
          {onGoToAnalyzer && (
            <button
              type="button"
              onClick={onGoToAnalyzer}
              className="btn-action-primary px-4 py-2 text-xs gap-1.5 mx-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nueva descarga</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredTasks.map((task) => (
            <div key={task.id} className="ws-panel p-3.5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-3.5 flex-1 min-w-0">
                <img
                  src={task.thumbnail}
                  alt={task.title}
                  className="w-20 h-12 rounded-lg object-cover bg-black/40 flex-shrink-0"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="text-sm font-semibold truncate">{task.title}</div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                    <span className="uppercase font-medium text-slate-300">
                      {task.format === 'audio' ? 'Audio MP3' : `Video ${task.quality === 'best' ? 'Máxima' : `${task.quality}p`}`}
                    </span>
                    {task.status === 'downloading' && (
                      <>
                        <span>•</span>
                        <span className="text-sky-400 font-mono">{task.speed || 'Descargando...'}</span>
                        {task.eta && (
                          <>
                            <span>•</span>
                            <span className="font-mono">Falta {task.eta}</span>
                          </>
                        )}
                      </>
                    )}
                    {task.status === 'pending' && <span>• En espera...</span>}
                    {task.status === 'completed' && (
                      <span className="text-emerald-400 font-medium">• Completado</span>
                    )}
                    {task.status === 'error' && (
                      <span className="text-rose-400 flex items-center gap-1 truncate">
                        <AlertCircle className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{task.error || 'Error al descargar'}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Progreso o acciones */}
              <div className="flex items-center gap-3 sm:w-56 justify-end flex-shrink-0">
                {(task.status === 'downloading' || task.status === 'pending') && (
                  <div className="w-full space-y-1">
                    <div className="flex justify-between text-[11px] font-mono text-slate-300">
                      <span>{task.status === 'pending' ? 'En cola' : 'Descargando'}</span>
                      <span>{Math.round(task.progress)}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
                      <div
                        className="h-full bg-rose-500 transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(0, task.progress))}%` }}
                      />
                    </div>
                  </div>
                )}

                {task.status === 'completed' && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onPlayMedia(task)}
                      className="px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Reproducir</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenLocation(task.filePath)}
                      title="Abrir carpeta"
                      className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-slate-300 transition-colors"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
