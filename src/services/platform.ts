import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { openPath, openUrl, revealItemInDir } from '@tauri-apps/plugin-opener';
import { PlatformType, VideoMetadata, DownloadTask } from '../types';

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      minimizeWindow: () => void;
      maximizeWindow: () => void;
      closeWindow: () => void;
      getVideoInfo: (url: string) => Promise<VideoMetadata>;
      startDownload: (options: any) => Promise<{ success: boolean }>;
      selectDownloadDir: () => Promise<string | null>;
      getDefaultDownloadDir: () => Promise<string>;
      openFileLocation: (filePath: string) => Promise<void>;
      openFile: (filePath: string) => Promise<void>;
      openExternal: (url: string) => Promise<void>;
      scanLibraryFolder: (dirPath: string) => Promise<any[]>;
      onDownloadProgress: (cb: (data: any) => void) => () => void;
      onDownloadComplete: (cb: (data: any) => void) => () => void;
      onDownloadError: (cb: (data: any) => void) => () => void;
    };
  }
}

export class PlatformService {
  public static getPlatform(): PlatformType {
    if (isTauri()) {
      return 'tauri';
    }
    if (window.electronAPI?.isElectron) {
      return 'electron';
    }
    if (Capacitor.isNativePlatform()) {
      return 'capacitor';
    }
    return 'web';
  }

  public static subscribeDownloadEvents(handlers: {
    onProgress: (data: { taskId: string; progress: number; speed: string; eta: string }) => void;
    onComplete: (data: { taskId: string; filePath: string }) => void;
    onError: (data: { taskId: string; error: string }) => void;
  }): () => void {
    if (isTauri()) {
      const unlistenPromises = [
        listen<{ taskId: string; progress: number; speed: string; eta: string }>('download-progress', (e) =>
          handlers.onProgress(e.payload)
        ),
        listen<{ taskId: string; filePath: string }>('download-complete', (e) =>
          handlers.onComplete(e.payload)
        ),
        listen<{ taskId: string; error: string }>('download-error', (e) =>
          handlers.onError(e.payload)
        )
      ];
      return () => {
        unlistenPromises.forEach((p) => p.then((unlisten) => unlisten()).catch(() => {}));
      };
    }

    if (window.electronAPI) {
      const unsubProgress = window.electronAPI.onDownloadProgress(handlers.onProgress);
      const unsubComplete = window.electronAPI.onDownloadComplete(handlers.onComplete);
      const unsubError = window.electronAPI.onDownloadError(handlers.onError);
      return () => {
        unsubProgress();
        unsubComplete();
        unsubError();
      };
    }

    return () => {};
  }

  public static async openExternalUrl(url: string): Promise<void> {
    if (isTauri()) {
      await openUrl(url);
      return;
    }
    if (window.electronAPI?.openExternal) {
      await window.electronAPI.openExternal(url);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  public static minimizeWindow(): void {
    if (isTauri()) {
      getCurrentWindow().minimize().catch(() => {});
      return;
    }
    if (window.electronAPI?.minimizeWindow) {
      window.electronAPI.minimizeWindow();
    }
  }

  public static maximizeWindow(): void {
    if (isTauri()) {
      getCurrentWindow().toggleMaximize().catch(() => {});
      return;
    }
    if (window.electronAPI?.maximizeWindow) {
      window.electronAPI.maximizeWindow();
    }
  }

  public static closeWindow(): void {
    if (isTauri()) {
      getCurrentWindow().close().catch(() => {});
      return;
    }
    if (window.electronAPI?.closeWindow) {
      window.electronAPI.closeWindow();
    }
  }

  public static async fetchVideoInfo(url: string, serverUrl?: string): Promise<VideoMetadata> {
    const platform = this.getPlatform();

    if (platform === 'tauri') {
      return await invoke<VideoMetadata>('get_video_info', { url });
    }

    if (platform === 'electron' && window.electronAPI) {
      return await window.electronAPI.getVideoInfo(url);
    }

    const endpoint = (serverUrl && serverUrl !== 'http://localhost:4000') 
      ? `${serverUrl}/api/info?url=${encodeURIComponent(url)}`
      : `/api/info?url=${encodeURIComponent(url)}`;

    const response = await fetch(endpoint);
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Error del servidor de extracción' }));
      throw new Error(err.error || 'Error al obtener información del video');
    }
    return await response.json();
  }

  public static async startDownload(
    task: DownloadTask,
    outputDir: string,
    serverUrl?: string,
    onProgress?: (progress: number, speed: string, eta: string) => void,
    onComplete?: (filePath: string) => void,
    onError?: (error: string) => void,
    settings?: {
      speedLimit?: string;
      autoOrganizeByChannel?: boolean;
      embedMetadata?: boolean;
    }
  ): Promise<void> {
    const platform = this.getPlatform();

    if (platform === 'tauri') {
      await invoke('start_download', {
        options: {
          taskId: task.id,
          url: task.url,
          outputDir,
          format: task.format,
          quality: task.quality,
          codec: task.codec || 'H264',
          speedLimit: settings?.speedLimit,
          autoOrganize: settings?.autoOrganizeByChannel,
          embedMetadata: settings?.embedMetadata
        }
      });
      return;
    }

    if (platform === 'electron' && window.electronAPI) {
      await window.electronAPI.startDownload({
        taskId: task.id,
        url: task.url,
        outputDir,
        format: task.format,
        quality: task.quality,
        codec: task.codec || 'H264',
        speedLimit: settings?.speedLimit,
        autoOrganize: settings?.autoOrganizeByChannel,
        embedMetadata: settings?.embedMetadata
      });
      return;
    }

    const endpoint = (serverUrl && serverUrl !== 'http://localhost:4000')
      ? `${serverUrl}/api/download`
      : `/api/download`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: task.url,
        format: task.format,
        quality: task.quality,
        codec: task.codec || 'H264',
        outputDir,
        speedLimit: settings?.speedLimit,
        autoOrganize: settings?.autoOrganizeByChannel,
        embedMetadata: settings?.embedMetadata
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Error al contactar con el servidor de descarga' }));
      const msg = err.error || 'Error al iniciar descarga';
      if (onError) onError(msg);
      throw new Error(msg);
    }

    if (!response.body) {
      if (onComplete) onComplete(outputDir);
      return;
    }

    // Read live SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        const line = part.trim();
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'progress' && onProgress) {
              onProgress(data.progress, data.speed || '', data.eta || '');
            } else if (data.type === 'complete' && onComplete) {
              onComplete(data.filePath || outputDir);
            } else if (data.type === 'error' && onError) {
              onError(data.error);
            }
          } catch (e) {
            console.warn('Error parsing SSE event:', e);
          }
        }
      }
    }
  }

  public static async shareOrOpenFile(filePath: string): Promise<void> {
    const platform = this.getPlatform();

    if (platform === 'tauri') {
      await revealItemInDir(filePath);
      return;
    }

    if (platform === 'electron' && window.electronAPI) {
      await window.electronAPI.openFileLocation(filePath);
      return;
    }

    if (platform === 'capacitor') {
      try {
        await Share.share({
          title: 'Archivo descargado',
          url: filePath,
          dialogTitle: 'Compartir video/audio'
        });
      } catch (e) {
        console.warn('Share error:', e);
      }
    }
  }

  public static async playFile(filePath: string): Promise<void> {
    const platform = this.getPlatform();

    if (platform === 'tauri') {
      await openPath(filePath);
      return;
    }

    if (platform === 'electron' && window.electronAPI?.openFile) {
      await window.electronAPI.openFile(filePath);
      return;
    }

    await this.shareOrOpenFile(filePath);
  }

  public static async pickDownloadFolder(): Promise<string | null> {
    if (isTauri()) {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: 'Seleccionar carpeta de descargas'
      });
      return typeof selected === 'string' ? selected : null;
    }
    if (window.electronAPI) {
      return await window.electronAPI.selectDownloadDir();
    }
    return null;
  }

  public static async getDefaultPath(): Promise<string> {
    if (isTauri()) {
      try {
        return await invoke<string>('get_default_dir');
      } catch {
        return 'Descargas';
      }
    }
    if (window.electronAPI) {
      return await window.electronAPI.getDefaultDownloadDir();
    }
    return 'Descargas';
  }

  public static async getLocalLibrary(dirPath: string): Promise<any[]> {
    const platform = this.getPlatform();
    if (platform === 'tauri') {
      try {
        return await invoke<any[]>('scan_library_folder', { dirPath });
      } catch (e) {
        console.warn('Error reading tauri library:', e);
      }
    }
    if (platform === 'electron' && window.electronAPI?.scanLibraryFolder) {
      try {
        return await window.electronAPI.scanLibraryFolder(dirPath);
      } catch (e) {
        console.warn('Error reading electron library:', e);
      }
    }

    try {
      const res = await fetch(`/api/library?dir=${encodeURIComponent(dirPath)}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('Error fetching /api/library:', e);
    }

    return [];
  }

  public static getStreamUrl(filePath: string): string {
    if (!filePath) return '';
    const platform = this.getPlatform();
    if (platform === 'tauri') {
      const encoded = encodeURIComponent(filePath);
      return navigator.userAgent.includes('Windows')
        ? `http://local-media.localhost/file/${encoded}`
        : `local-media://file/${encoded}`;
    }
    if (platform === 'electron') {
      // Usar protocolo local-media:// registrado en Electron.
      // Al ser un esquema "standard", Chromium interpreta lo que sigue a "//" como host,
      // por eso la ruta completa (incluida la unidad "C:") va codificada en un único segmento.
      return `local-media://file/${encodeURIComponent(filePath)}`;
    }
    return `/api/stream?path=${encodeURIComponent(filePath)}`;
  }
}
