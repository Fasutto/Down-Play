export type PlatformType = 'electron' | 'tauri' | 'capacitor' | 'web';
export type ActiveTab = 'analyzer' | 'queue' | 'library' | 'settings' | 'about';

export interface VideoMetadata {
  id: string;
  title: string;
  thumbnail: string;
  duration: number;
  uploader: string;
  channelAvatar?: string;
  subscribers?: string;
  uploadDate?: string;
  maxResolution?: string;
  bitrate?: string;
  audioInfo?: string;
  contentId?: string;
  tags?: string[];
  formats?: {
    formatId: string;
    resolution: string;
    ext: string;
    hasVideo: boolean;
    hasAudio: boolean;
  }[];
}

export type DownloadFormat = 'video' | 'audio';
export type VideoQuality = 'best' | '1080' | '720' | '480' | '360';
export type VideoCodec = 'AV1' | 'VP9' | 'H264';

export interface DownloadTask {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  format: DownloadFormat;
  quality: VideoQuality;
  codec?: VideoCodec;
  status: 'pending' | 'downloading' | 'completed' | 'error';
  progress: number;
  totalSize?: string;
  downloadedSize?: string;
  speed?: string;
  eta?: string;
  filePath?: string;
  error?: string;
  channel?: string;
  details?: string;
  createdAt: number;
}

export interface LibraryItem {
  id: string;
  title: string;
  thumbnail: string;
  duration: string;
  resolutionBadge: string;
  codecBadge: string;
  size: string;
  channel: string;
  date: string;
  format: string;
  filePath: string;
  url?: string;
}

export type ThemeMode = 'dark' | 'light' | 'custom';

export interface CustomThemeColors {
  bg: string;
  card: string;
  accent: string;
}

export interface AppSettings {
  theme?: ThemeMode;
  customTheme?: CustomThemeColors;
  downloadPath: string;
  serverUrl: string; // Used for Capacitor / mobile remote backend
  autoOpenFolder: boolean;
  defaultFormat: DownloadFormat;
  defaultQuality: VideoQuality;
  defaultCodec: VideoCodec;
  defaultProfile?: 'ask' | 'best' | 'audio';
  maxConcurrentDownloads: number;
  speedLimit: string;
  autoOrganizeByChannel: boolean;
  embedMetadata: boolean;
  embedThumbnails: boolean;
}
