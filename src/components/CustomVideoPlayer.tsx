import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  Volume1,
  VolumeX,
  PictureInPicture2,
  Maximize,
  Minimize,
  Loader2,
  Gauge,
  AlertCircle,
  ExternalLink
} from 'lucide-react';

interface CustomVideoPlayerProps {
  src: string;
  title?: string;
  poster?: string;
  autoPlay?: boolean;
  onEnded?: () => void;
  onOpenExternal?: () => void;
  className?: string;
}



export const CustomVideoPlayer: React.FC<CustomVideoPlayerProps> = ({
  src,
  title,
  poster,
  autoPlay = true,
  onEnded,
  onOpenExternal,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const hideControlsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastVolumeRef = useRef<number>(1);

  // Estados de reproducción
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [bufferedEnd, setBufferedEnd] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  // Estados de interfaz y visualización
  const [showControls, setShowControls] = useState<boolean>(true);
  const [isDraggingTimeline, setIsDraggingTimeline] = useState<boolean>(false);
  const [hoverTimelineTime, setHoverTimelineTime] = useState<number | null>(null);
  const [hoverTimelinePos, setHoverTimelinePos] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isPipActive, setIsPipActive] = useState<boolean>(false);
  const [isPipSupported, setIsPipSupported] = useState<boolean>(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState<boolean>(false);

  // Feedback visual central (Flash action indicator para acciones secundarias: adelantar, atrasar, volumen, pip)
  const [actionFeedback, setActionFeedback] = useState<{
    id: number;
    type: 'rewind' | 'forward' | 'volume' | 'pip';
    label?: string;
  } | null>(null);
  const feedbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  const triggerFeedback = useCallback((type: 'rewind' | 'forward' | 'volume' | 'pip', label?: string) => {
    setActionFeedback({ id: Date.now(), type, label });
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => {
      setActionFeedback(null);
    }, 750);
  }, []);

  // Formateador de segundos a mm:ss o hh:mm:ss
  const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
      return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Comprobar soporte de Picture-in-Picture
  useEffect(() => {
    const supported = !!(
      document.pictureInPictureEnabled ||
      (HTMLVideoElement.prototype as any).requestPictureInPicture
    );
    setIsPipSupported(supported);
  }, []);

  // Control de ocultar controles tras inactividad
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideControlsTimerRef.current) {
      clearTimeout(hideControlsTimerRef.current);
    }
    if (isPlaying && !isDraggingTimeline && !showSpeedMenu) {
      hideControlsTimerRef.current = setTimeout(() => {
        setShowControls(false);
      }, 2500);
    }
  }, [isPlaying, isDraggingTimeline, showSpeedMenu]);

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    };
  }, [resetHideTimer]);

  // Manejadores de Play / Pause
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused || video.ended) {
      video.play().catch(() => {});
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  // Adelantar y atrasar tiempo
  const seekRelative = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;

    const newTime = Math.max(0, Math.min(video.currentTime + seconds, video.duration || 0));
    video.currentTime = newTime;
    setCurrentTime(newTime);

    if (seconds > 0) {
      triggerFeedback('forward', `+${seconds}s`);
    } else {
      triggerFeedback('rewind', `${seconds}s`);
    }
    resetHideTimer();
  }, [resetHideTimer, triggerFeedback]);

  // Manejo de volumen y mute
  const handleVolumeChange = (newVolume: number) => {
    const video = videoRef.current;
    if (!video) return;

    const clamped = Math.max(0, Math.min(newVolume, 1));
    video.volume = clamped;
    video.muted = clamped === 0;
    setVolume(clamped);
    setIsMuted(clamped === 0);
    if (clamped > 0) {
      lastVolumeRef.current = clamped;
    }
    triggerFeedback('volume', `${Math.round(clamped * 100)}%`);
    resetHideTimer();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isMuted || volume === 0) {
      const restored = lastVolumeRef.current || 0.8;
      video.muted = false;
      video.volume = restored;
      setVolume(restored);
      setIsMuted(false);
      triggerFeedback('volume', `${Math.round(restored * 100)}%`);
    } else {
      lastVolumeRef.current = volume;
      video.muted = true;
      video.volume = 0;
      setVolume(0);
      setIsMuted(true);
      triggerFeedback('volume', 'Silenciado');
    }
    resetHideTimer();
  };

  // Función Picture-in-Picture
  const togglePictureInPicture = async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (document.pictureInPictureElement) {
        if (document.exitPictureInPicture) {
          await document.exitPictureInPicture();
        }
        setIsPipActive(false);
      } else if (video.requestPictureInPicture) {
        await video.requestPictureInPicture();
        setIsPipActive(true);
        triggerFeedback('pip', 'Picture in Picture');
      }
    } catch (err) {
      console.warn('Picture-in-Picture error:', err);
    }
    resetHideTimer();
  };

  // Pantalla Completa
  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
    resetHideTimer();
  };

  // Cambio de velocidad
  const changeSpeed = (rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
    setShowSpeedMenu(false);
    resetHideTimer();
  };

  // Eventos del video element
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || isDraggingTimeline) return;
    setCurrentTime(video.currentTime);

    // Actualizar búfer
    if (video.buffered && video.buffered.length > 0) {
      for (let i = 0; i < video.buffered.length; i++) {
        if (video.buffered.start(i) <= video.currentTime && video.currentTime <= video.buffered.end(i)) {
          setBufferedEnd(video.buffered.end(i));
          break;
        }
      }
    }
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration || 0);
    setVolume(video.volume);
    setIsMuted(video.muted);
  };

  // Barra de progreso (Scrubber)
  const calculateTimelinePosition = (e: React.MouseEvent<HTMLDivElement> | MouseEvent): number => {
    if (!timelineRef.current || !duration) return 0;
    const rect = timelineRef.current.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(pos, 1));
  };

  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDraggingTimeline(true);
    const video = videoRef.current;
    const pos = calculateTimelinePosition(e);
    const newTime = pos * duration;
    setCurrentTime(newTime);
    if (video) {
      video.currentTime = newTime;
    }

    const onMouseMove = (moveEvent: MouseEvent) => {
      const movePos = calculateTimelinePosition(moveEvent);
      const dragTime = movePos * duration;
      setCurrentTime(dragTime);
      if (video) {
        video.currentTime = dragTime;
      }
    };

    const onMouseUp = () => {
      setIsDraggingTimeline(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleTimelineMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !duration) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const clampedPos = Math.max(0, Math.min(pos, 1));
    setHoverTimelinePos(clampedPos * 100);
    setHoverTimelineTime(clampedPos * duration);
  };

  const handleTimelineMouseLeave = () => {
    setHoverTimelineTime(null);
  };

  // Doble click para adelantar/atrasar y clic para reproducir/pausar
  const handleVideoClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Si se hizo click en los controles, no actuar
    if ((e.target as HTMLElement).closest('.player-controls-bar')) return;
    togglePlay();
  };

  const handleVideoDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    if (x < width * 0.35) {
      // Izquierda -> Atrasar 10s
      seekRelative(-10);
    } else if (x > width * 0.65) {
      // Derecha -> Adelantar 10s
      seekRelative(10);
    } else {
      toggleFullscreen();
    }
  };

  // Atajos de teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar si el usuario está escribiendo en un input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'arrowleft':
        case 'j':
          e.preventDefault();
          seekRelative(-10);
          break;
        case 'arrowright':
        case 'l':
          e.preventDefault();
          seekRelative(10);
          break;
        case 'arrowup':
          e.preventDefault();
          handleVolumeChange(volume + 0.05);
          break;
        case 'arrowdown':
          e.preventDefault();
          handleVolumeChange(volume - 0.05);
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'p':
          e.preventDefault();
          if (isPipSupported) togglePictureInPicture();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, seekRelative, volume, isMuted, isPipSupported]);

  // Sincronizar Picture-in-Picture events del elemento video
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onEnterPip = () => setIsPipActive(true);
    const onLeavePip = () => setIsPipActive(false);

    video.addEventListener('enterpictureinpicture', onEnterPip);
    video.addEventListener('leavepictureinpicture', onLeavePip);

    return () => {
      video.removeEventListener('enterpictureinpicture', onEnterPip);
      video.removeEventListener('leavepictureinpicture', onLeavePip);
    };
  }, []);

  // Porcentaje de progreso jugado y búfer
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (bufferedEnd / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      onMouseMove={resetHideTimer}
      onMouseEnter={resetHideTimer}
      onMouseLeave={() => {
        if (isPlaying && !showSpeedMenu) setShowControls(false);
      }}
      className={`relative w-full h-full bg-black flex items-center justify-center select-none overflow-hidden group ${
        !showControls && isPlaying ? 'cursor-none' : 'cursor-default'
      } ${className}`}
    >
      {/* Elemento Video */}
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        autoPlay={autoPlay}
        playsInline
        preload="auto"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => {
          setIsPlaying(false);
          if (onEnded) onEnded();
        }}
        onError={() => {
          setIsBuffering(false);
          setIsPlaying(false);
          setHasError(true);
        }}
        className="w-full h-full object-contain pointer-events-none"
      />

      {/* Capa de interacción directa con el video (click y doble click) */}
      {!hasError && (
        <div
          onClick={handleVideoClick}
          onDoubleClick={handleVideoDoubleClick}
          className="absolute inset-0 z-10"
        />
      )}

      {/* Mensaje de Error y Fallback al Reproductor Externo */}
      {hasError && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 bg-[#0a0e19]/95 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="max-w-md">
            <h4 className="text-sm font-bold text-white">No se pudo reproducir en el visor integrado</h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              El archivo tiene un códec o formato no decodificable por el motor interno. Puedes reproducirlo sin problemas con el reproductor multimedia de tu equipo (VLC, Windows Media Player, etc.).
            </p>
          </div>
          {onOpenExternal && (
            <button
              onClick={onOpenExternal}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg transition cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Abrir con Reproductor del Sistema</span>
            </button>
          )}
        </div>
      )}

      {/* Spinner de Buffering */}
      {isBuffering && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center shadow-2xl">
            <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
          </div>
        </div>
      )}

      {/* Indicador de Acción Flotante Central (Feedback visual solo para acciones secundarias: adelantar, atrasar, volumen, pip) */}
      {actionFeedback && (
        <div
          key={actionFeedback.id}
          className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none animate-action-feedback"
        >
          <div className="px-5 py-4 rounded-2xl bg-black/75 backdrop-blur-md border border-white/15 flex items-center gap-3 text-white shadow-2xl transition-all">
            {actionFeedback.type === 'forward' && (
              <>
                <RotateCw className="w-7 h-7 text-rose-400" />
                <span className="font-bold text-sm tracking-wide font-mono">{actionFeedback.label}</span>
              </>
            )}
            {actionFeedback.type === 'rewind' && (
              <>
                <RotateCcw className="w-7 h-7 text-rose-400" />
                <span className="font-bold text-sm tracking-wide font-mono">{actionFeedback.label}</span>
              </>
            )}
            {actionFeedback.type === 'volume' && (
              <>
                {volume === 0 || isMuted ? (
                  <VolumeX className="w-7 h-7 text-rose-400" />
                ) : (
                  <Volume2 className="w-7 h-7 text-rose-400" />
                )}
                <span className="font-bold text-sm tracking-wide font-mono">{actionFeedback.label}</span>
              </>
            )}
            {actionFeedback.type === 'pip' && (
              <>
                <PictureInPicture2 className="w-7 h-7 text-rose-400" />
                <span className="font-bold text-sm tracking-wide">{actionFeedback.label}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Contenedor Superior: Título & Estado PiP */}
      <div
        className={`player-controls-bar absolute top-0 inset-x-0 z-30 p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between pointer-events-auto transition-opacity duration-300 ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="min-w-0 pr-4">
          {title && (
            <p className="text-sm font-semibold text-white/90 truncate drop-shadow-md">
              {title}
            </p>
          )}
        </div>
        {isPipActive && (
          <div className="px-2.5 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-400 text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur-md animate-pulse">
            <PictureInPicture2 className="w-3.5 h-3.5" />
            <span>Ventana Flotante Activa</span>
          </div>
        )}
      </div>

      {/* Barra de Controles Inferior Completa */}
      <div
        className={`player-controls-bar absolute bottom-0 inset-x-0 z-30 p-3 sm:p-4 bg-gradient-to-t from-black/95 via-black/80 to-transparent flex flex-col gap-2.5 pointer-events-auto transition-opacity duration-300 ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra de Progreso Interactiva (Timeline Scrubber) */}
        <div
          ref={timelineRef}
          onMouseDown={handleTimelineMouseDown}
          onMouseMove={handleTimelineMouseMove}
          onMouseLeave={handleTimelineMouseLeave}
          className="relative group/timeline h-3 flex items-center cursor-pointer w-full py-2"
        >
          {/* Tooltip de tiempo al pasar el mouse por la barra */}
          {hoverTimelineTime !== null && (
            <div
              className="absolute -top-7 transform -translate-x-1/2 px-2 py-0.5 rounded bg-black/90 backdrop-blur-md text-[11px] font-mono text-white border border-white/10 pointer-events-none shadow-lg z-40"
              style={{ left: `${hoverTimelinePos}%` }}
            >
              {formatTime(hoverTimelineTime)}
            </div>
          )}

          {/* Línea base de la barra */}
          <div className="relative w-full h-1.5 group-hover/timeline:h-2 bg-white/20 rounded-full overflow-hidden transition-all duration-150">
            {/* Progreso del Búfer cargado */}
            <div
              className="absolute top-0 bottom-0 left-0 bg-white/30 rounded-full transition-all"
              style={{ width: `${bufferedPercent}%` }}
            />
            {/* Progreso reproducido con gradiente vibrante */}
            <div
              className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-rose-500 to-red-500 rounded-full shadow-[0_0_10px_rgba(244,63,94,0.6)]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Marcador deslizador (Scrubber Thumb) */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-md border border-rose-500 transform scale-0 group-hover/timeline:scale-100 transition-transform pointer-events-none"
            style={{ left: `${progressPercent}%` }}
          />
        </div>

        {/* Fila de Botones y Controles Principales */}
        <div className="flex items-center justify-between gap-2 text-white">
          {/* Grupo Izquierdo: Play/Pause, Atrasar, Adelantar, Volumen, Tiempo */}
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            {/* Botón Play / Pause */}
            <button
              type="button"
              onClick={togglePlay}
              className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center transition-all shadow-sm border border-white/5"
              title={isPlaying ? 'Pausar (Espacio)' : 'Reproducir (Espacio)'}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>

            {/* Botón Atrasar 10s */}
            <button
              type="button"
              onClick={() => seekRelative(-10)}
              className="px-2.5 h-9 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-slate-200 hover:text-white flex items-center gap-1 transition-all border border-white/5 group/rew"
              title="Atrasar 10 segundos (Flecha Izquierda / J)"
            >
              <RotateCcw className="w-4 h-4 transition-transform group-hover/rew:-rotate-45" />
              <span className="text-[11px] font-mono font-bold tracking-tight">10s</span>
            </button>

            {/* Botón Adelantar 10s */}
            <button
              type="button"
              onClick={() => seekRelative(10)}
              className="px-2.5 h-9 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-slate-200 hover:text-white flex items-center gap-1 transition-all border border-white/5 group/fwd"
              title="Adelantar 10 segundos (Flecha Derecha / L)"
            >
              <span className="text-[11px] font-mono font-bold tracking-tight">10s</span>
              <RotateCw className="w-4 h-4 transition-transform group-hover/fwd:rotate-45" />
            </button>

            {/* Control y Barra de Volumen */}
            <div className="flex items-center gap-1.5 ml-1 sm:ml-2 group/volume relative">
              <button
                type="button"
                onClick={toggleMute}
                className="w-8 h-8 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
                title={isMuted ? 'Activar sonido (M)' : 'Silenciar (M)'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : volume < 0.5 ? (
                  <Volume1 className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>

              {/* Slider de Volumen continuo */}
              <div className="w-16 sm:w-24 flex items-center">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.02"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-white/25 hover:bg-white/35 rounded-lg appearance-none cursor-pointer accent-rose-500 transition-all"
                  title={`Volumen: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
                />
              </div>
            </div>

            {/* Tiempo Transcurrido / Total */}
            <div className="hidden xs:flex items-center text-xs font-mono text-slate-300 ml-1.5 select-none">
              <span className="text-white font-semibold">{formatTime(currentTime)}</span>
              <span className="mx-1 text-slate-500">/</span>
              <span className="text-slate-400">{formatTime(duration)}</span>
            </div>
          </div>

          {/* Grupo Derecho: Selector de Velocidad, Picture-in-Picture, Pantalla Completa */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Selector de Velocidad */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className={`px-2.5 h-8 rounded-lg text-xs font-mono font-semibold flex items-center gap-1 transition-all border ${
                  playbackRate !== 1
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    : 'bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white border-white/5'
                }`}
                title="Velocidad de reproducción"
              >
                <Gauge className="w-3.5 h-3.5" />
                <span>{playbackRate}x</span>
              </button>

              {/* Menú de Opciones de Velocidad */}
              {showSpeedMenu && (
                <div className="absolute bottom-10 right-0 py-1.5 px-1 bg-[#101726]/95 border border-white/10 rounded-xl shadow-2xl backdrop-blur-xl z-50 flex flex-col gap-0.5 min-w-[90px]">
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => changeSpeed(rate)}
                      className={`px-3 py-1.5 text-xs text-left rounded-lg transition-colors font-mono ${
                        playbackRate === rate
                          ? 'bg-rose-600 text-white font-bold'
                          : 'text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {rate === 1 ? 'Normal (1x)' : `${rate}x`}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Botón Picture-in-Picture */}
            {isPipSupported && (
              <button
                type="button"
                onClick={togglePictureInPicture}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all border ${
                  isPipActive
                    ? 'bg-rose-600 text-white border-rose-400 shadow-md shadow-rose-600/30'
                    : 'bg-white/10 hover:bg-white/20 active:scale-95 text-slate-200 hover:text-white border-white/5'
                }`}
                title="Picture in Picture (P) - Ventana flotante"
              >
                <PictureInPicture2 className="w-4 h-4" />
              </button>
            )}

            {/* Botón Pantalla Completa */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-slate-200 hover:text-white flex items-center justify-center transition-all border border-white/5"
              title={isFullscreen ? 'Salir de pantalla completa (F)' : 'Pantalla completa (F)'}
            >
              {isFullscreen ? (
                <Minimize className="w-4 h-4" />
              ) : (
                <Maximize className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomVideoPlayer;
