import React, { useEffect, useState } from 'react';
import { X, Play, FolderOpen, Film, Music, ExternalLink } from 'lucide-react';
import { DownloadTask } from '../types';
import { CustomVideoPlayer } from './CustomVideoPlayer';
import { PlatformService } from '../services/platform';

interface MediaModalProps {
  task: DownloadTask | null;
  onClose: () => void;
  onPlayInSystem: (filePath?: string) => void;
  onOpenLocation: (filePath?: string) => void;
}

export const MediaModal: React.FC<MediaModalProps> = ({
  task,
  onClose,
  onPlayInSystem,
  onOpenLocation
}) => {
  const [isMinimizedToPip, setIsMinimizedToPip] = useState(false);

  const stopAllMedia = () => {
    if (document.pictureInPictureElement) {
      const pipEl = document.pictureInPictureElement as HTMLMediaElement;
      if (typeof pipEl.pause === 'function' && !pipEl.paused) {
        pipEl.pause();
      }
      document.exitPictureInPicture().catch(() => {});
    }
    document.querySelectorAll('video, audio').forEach((el) => {
      const media = el as HTMLMediaElement;
      if (!media.paused) media.pause();
    });
  };

  const handleClose = () => {
    if (document.pictureInPictureElement) {
      setIsMinimizedToPip(true);
      return;
    }
    stopAllMedia();
    onClose();
  };

  useEffect(() => {
    stopAllMedia();
    setIsMinimizedToPip(false);
  }, [task?.id]);

  useEffect(() => {
    if (!task) {
      stopAllMedia();
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isMinimizedToPip) handleClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [task, isMinimizedToPip]);

  useEffect(() => {
    if (!isMinimizedToPip) return;

    const onLeavePip = (e: Event) => {
      const video = e.target as HTMLVideoElement | null;
      setTimeout(() => {
        if (video && !video.paused) {
          // User clicked "Back to tab" in PiP
          setIsMinimizedToPip(false);
        } else {
          // User closed the PiP window
          stopAllMedia();
          setIsMinimizedToPip(false);
          onClose();
        }
      }, 0);
    };

    document.addEventListener('leavepictureinpicture', onLeavePip, true);
    return () => {
      document.removeEventListener('leavepictureinpicture', onLeavePip, true);
    };
  }, [isMinimizedToPip, onClose]);

  if (!task) return null;

  const extractVideoId = (url?: string): string | null => {
    if (!url) return null;
    const match = url.match(/(?:youtube\.com\/(?:watch\?.*v=|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
    return match ? match[1] : null;
  };

  const videoId = extractVideoId(task.url);

  return (
    <div
      onClick={handleClose}
      className={
        isMinimizedToPip
          ? 'hidden'
          : 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in'
      }
    >
      <div
        className="w-full max-w-4xl bg-[var(--bg-sidebar)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {task.format === 'video' ? (
              <Film className="w-4 h-4 text-rose-400 flex-shrink-0" />
            ) : (
              <Music className="w-4 h-4 text-sky-400 flex-shrink-0" />
            )}
            <h3 className="text-sm font-semibold truncate">{task.title}</h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            title="Cerrar (Esc)"
            className="w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Reproductor */}
        <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
          {task.filePath ? (
            task.format === 'video' ? (
              <CustomVideoPlayer
                key={task.filePath}
                src={PlatformService.getStreamUrl(task.filePath)}
                title={task.title}
                poster={task.thumbnail}
                autoPlay
                onOpenExternal={() => onPlayInSystem(task.filePath)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-8 gap-4 w-full h-full bg-[#0f111a]">
                <div className="w-20 h-20 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shadow-lg">
                  <Music className="w-9 h-9 text-sky-400" />
                </div>
                <div className="text-center max-w-md px-4">
                  <p className="text-sm font-semibold text-white truncate">{task.title}</p>
                  <p className="text-xs text-slate-400 mt-1">Reproducción de audio local</p>
                </div>
                <audio
                  key={task.filePath}
                  controls
                  autoPlay
                  src={PlatformService.getStreamUrl(task.filePath)}
                  className="w-full max-w-md mt-2"
                />
              </div>
            )
          ) : videoId ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
              title={task.title}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : task.thumbnail ? (
            <div className="relative w-full h-full">
              <img src={task.thumbnail} alt={task.title} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => onPlayInSystem(task.filePath)}
                  className="btn-action-primary px-5 py-2.5 text-xs gap-2"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Abrir en Reproductor</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center p-8 text-slate-500">
              <Film className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-xs">No hay previsualización disponible</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400 min-w-0">
            {task.filePath && (
              <span className="truncate max-w-sm font-mono text-[11px]" title={task.filePath}>
                {task.filePath}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {task.filePath && (
              <>
                <button
                  type="button"
                  onClick={() => onPlayInSystem(task.filePath)}
                  className="btn-action-primary px-3.5 py-1.5 text-xs gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Abrir con Reproductor</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenLocation(task.filePath)}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-[var(--border-subtle)] text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                  <span>Abrir Carpeta</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-xs font-medium transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MediaModal;
