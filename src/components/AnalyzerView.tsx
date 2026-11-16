import React, { useState, useEffect } from 'react';
import {
  Link2,
  Clipboard,
  X,
  Search,
  Loader2,
  Clock,
  Folder,
  Download,
  Video,
  Music,
  Play,
  AlertCircle,
  Check,
  RotateCcw
} from 'lucide-react';
import { VideoMetadata, DownloadFormat, VideoQuality, VideoCodec } from '../types';
import { PlatformService } from '../services/platform';

interface AnalyzerViewProps {
  metadata: VideoMetadata | null;
  currentUrl: string;
  isLoading: boolean;
  onSearch: (url: string) => void;
  onAddDownload: (options: {
    url: string;
    title: string;
    thumbnail: string;
    format: DownloadFormat;
    quality: VideoQuality;
    codec: VideoCodec;
  }) => void;
  downloadPath: string;
  onUpdatePath: (path: string) => void;
  format: DownloadFormat | null;
  onFormatChange: (f: DownloadFormat) => void;
  quality: VideoQuality | null;
  onQualityChange: (q: VideoQuality) => void;
  codec: VideoCodec;
  onCodecChange: (c: VideoCodec) => void;
  customTitle: string;
  onCustomTitleChange: (t: string) => void;
}

const QUALITY_OPTIONS: { value: VideoQuality; label: string }[] = [
  { value: 'best', label: 'Máxima' },
  { value: '1080', label: '1080p Full HD' },
  { value: '720', label: '720p HD' },
  { value: '480', label: '480p' },
  { value: '360', label: '360p' }
];

const CODEC_OPTIONS: { value: VideoCodec; label: string }[] = [
  { value: 'H264', label: 'Estándar (Compatible con todo)' },
  { value: 'VP9', label: 'Alta calidad' },
  { value: 'AV1', label: 'Máxima compresión' }
];

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const AnalyzerView: React.FC<AnalyzerViewProps> = ({
  metadata,
  currentUrl,
  isLoading,
  onSearch,
  onAddDownload,
  downloadPath,
  onUpdatePath,
  format,
  onFormatChange,
  quality,
  onQualityChange,
  codec,
  onCodecChange,
  customTitle,
  onCustomTitleChange
}) => {
  const [inputUrl, setInputUrl] = useState(currentUrl || '');
  const [copiedRecently, setCopiedRecently] = useState(false);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (currentUrl) setInputUrl(currentUrl);
  }, [currentUrl]);

  useEffect(() => {
    setIsPlayingPreview(false);
  }, [metadata?.id]);

  useEffect(() => {
    const checkClipboard = async () => {
      try {
        const text = await navigator.clipboard.readText();
        const trimmed = text?.trim();
        if (trimmed && /^https?:\/\//i.test(trimmed) && !inputUrl.trim()) {
          setInputUrl(trimmed);
          setValidationError(null);
          onSearch(trimmed);
        }
      } catch {
        // Clipboard permission not granted
      }
    };

    checkClipboard();
    window.addEventListener('focus', checkClipboard);
    return () => window.removeEventListener('focus', checkClipboard);
  }, [inputUrl]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputUrl.trim();
    if (!trimmed) {
      setValidationError('Pega un enlace para comenzar.');
      return;
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      setValidationError('El enlace debe empezar por http:// o https://');
      return;
    }
    setValidationError(null);
    onSearch(trimmed);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const trimmed = text?.trim();
      if (trimmed) {
        setInputUrl(trimmed);
        setValidationError(null);
        setCopiedRecently(true);
        setTimeout(() => setCopiedRecently(false), 1500);
        if (/^https?:\/\//i.test(trimmed)) {
          onSearch(trimmed);
        }
      }
    } catch {
      // Clipboard permission denied
    }
  };

  const handlePickFolder = async () => {
    const selected = await PlatformService.pickDownloadFolder();
    if (selected) onUpdatePath(selected);
  };

  const handleDownloadClick = () => {
    if (!metadata) return;
    onAddDownload({
      url: currentUrl || inputUrl.trim(),
      title: customTitle.trim() || metadata.title,
      thumbnail: metadata.thumbnail,
      format: format || 'video',
      quality: quality || 'best',
      codec: codec || 'H264'
    });
  };

  const activeFormat = format || 'video';
  const activeQuality = quality || 'best';

  return (
    <div className="max-w-4xl mx-auto py-4 px-2 space-y-5">
      {/* Barra de búsqueda */}
      <form onSubmit={handleSearchSubmit} className="ws-panel p-4 space-y-2">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1 flex items-center">
            <Link2 className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => {
                setInputUrl(e.target.value);
                if (validationError) setValidationError(null);
              }}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text')?.trim();
                if (pasted && /^https?:\/\//i.test(pasted)) {
                  e.preventDefault();
                  setInputUrl(pasted);
                  setValidationError(null);
                  onSearch(pasted);
                }
              }}
              placeholder="Pega aquí el enlace del video o música..."
              className="w-full pl-10 pr-20 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] focus:border-rose-500/60 focus:outline-none text-sm placeholder:text-slate-500 transition-colors"
            />
            <div className="absolute right-2 flex items-center gap-1">
              {inputUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setInputUrl('');
                    setValidationError(null);
                  }}
                  title="Limpiar"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={handlePaste}
                title="Pegar enlace"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                {copiedRecently ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Clipboard className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn-action-primary px-5 py-2.5 text-sm gap-2 disabled:opacity-60"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Buscando...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Buscar</span>
              </>
            )}
          </button>
        </div>

        {validationError && (
          <div className="flex items-center gap-1.5 text-xs text-rose-400 px-1">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{validationError}</span>
          </div>
        )}
      </form>

      {/* Estado vacío */}
      {!metadata && !isLoading && (
        <div className="ws-panel p-12 text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
            <Download className="w-6 h-6 text-rose-400" />
          </div>
          <h2 className="text-base font-semibold">Listo para descargar</h2>
          <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
            Pega el enlace de YouTube, TikTok, Instagram, Facebook o cualquier sitio compatible y presiona Buscar.
          </p>
        </div>
      )}

      {/* Cargando */}
      {isLoading && (
        <div className="ws-panel p-12 text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-rose-400 mx-auto" />
          <p className="text-sm text-slate-300 font-medium">Obteniendo información del video...</p>
        </div>
      )}

      {/* Resultado y opciones */}
      {metadata && !isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Vista previa + Título */}
          <div className="lg:col-span-5 ws-panel p-4 space-y-3.5">
            <div className="relative aspect-video rounded-xl overflow-hidden bg-black/40 border border-white/[0.06] group">
              {isPlayingPreview && metadata.id ? (
                <iframe
                  src={`https://www.youtube.com/embed/${metadata.id}?autoplay=1`}
                  title={metadata.title}
                  className="w-full h-full"
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                />
              ) : (
                <>
                  <img
                    src={metadata.thumbnail}
                    alt={metadata.title}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setIsPlayingPreview(true)}
                    className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    <div className="w-12 h-12 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg">
                      <Play className="w-5 h-5 ml-0.5" />
                    </div>
                  </button>
                  <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/75 text-[11px] font-mono text-white flex items-center gap-1">
                    <Clock className="w-3 h-3 text-rose-400" />
                    <span>{formatDuration(metadata.duration)}</span>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-slate-400">
                  Nombre del archivo
                </label>
                {customTitle !== metadata.title && (
                  <button
                    type="button"
                    onClick={() => onCustomTitleChange(metadata.title)}
                    className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Restaurar original</span>
                  </button>
                )}
              </div>
              <input
                type="text"
                value={customTitle}
                onChange={(e) => onCustomTitleChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] focus:border-rose-500/60 focus:outline-none text-xs font-medium"
              />
              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2 min-w-0">
                  {metadata.channelAvatar ? (
                    <img
                      src={metadata.channelAvatar}
                      alt={metadata.uploader}
                      className="w-7 h-7 rounded-full object-cover bg-white/10 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-xs font-bold text-rose-300 flex-shrink-0">
                      {(metadata.uploader || 'C').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-200 truncate">{metadata.uploader}</div>
                    {metadata.uploadDate && (
                      <div className="text-[11px] text-slate-400">Subido el {metadata.uploadDate}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Opciones de descarga */}
          <div className="lg:col-span-7 ws-panel p-5 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              {/* Tipo: Video o Audio */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">¿Qué deseas descargar?</label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => onFormatChange('video')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all ${
                      activeFormat === 'video'
                        ? 'bg-rose-500/15 border-rose-500/60 text-white'
                        : 'bg-white/[0.03] border-white/[0.07] text-slate-400 hover:text-white'
                    }`}
                  >
                    <Video className="w-4 h-4 text-rose-400" />
                    <span>Video (MP4)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onFormatChange('audio')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all ${
                      activeFormat === 'audio'
                        ? 'bg-rose-500/15 border-rose-500/60 text-white'
                        : 'bg-white/[0.03] border-white/[0.07] text-slate-400 hover:text-white'
                    }`}
                  >
                    <Music className="w-4 h-4 text-sky-400" />
                    <span>Solo Audio (MP3)</span>
                  </button>
                </div>
              </div>

              {/* Calidad (solo para video) */}
              {activeFormat === 'video' && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300">Calidad del video</label>
                  <div className="flex flex-wrap gap-2">
                    {QUALITY_OPTIONS.map((q) => (
                      <button
                        key={q.value}
                        type="button"
                        onClick={() => onQualityChange(q.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          activeQuality === q.value
                            ? 'bg-rose-500 text-white border-rose-500'
                            : 'bg-white/[0.03] border-white/[0.07] text-slate-300 hover:bg-white/[0.07]'
                        }`}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Compatibilidad (solo para video) */}
              {activeFormat === 'video' && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300">Compatibilidad</label>
                  <select
                    value={codec}
                    onChange={(e) => onCodecChange(e.target.value as VideoCodec)}
                    className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs focus:outline-none focus:border-rose-500/60"
                  >
                    {CODEC_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value} className="bg-[#12141c] text-white">
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Carpeta de destino */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Guardar en</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-slate-300 truncate font-mono">
                    {downloadPath || 'Carpeta de Descargas'}
                  </div>
                  <button
                    type="button"
                    onClick={handlePickFolder}
                    className="px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <Folder className="w-3.5 h-3.5 text-amber-400" />
                    <span>Cambiar</span>
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDownloadClick}
              className="btn-action-primary w-full py-3 text-sm gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Descargar ahora</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
