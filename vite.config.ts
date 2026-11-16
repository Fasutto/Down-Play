import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

function getBinaryPaths() {
  const localBin = path.join(__dirname, 'bin');
  const parentDir = path.resolve(__dirname, '..');
  
  const localYtDlp = path.join(localBin, 'yt-dlp.exe');
  const venvYtDlp = path.join(parentDir, 'download-from-yt', '.venv', 'Scripts', 'yt-dlp.exe');
  const directYtDlp = path.join(parentDir, 'download-from-yt', 'yt-dlp.exe');
  const ytDlpPath = fs.existsSync(localYtDlp) 
    ? localYtDlp 
    : (fs.existsSync(venvYtDlp) ? venvYtDlp : (fs.existsSync(directYtDlp) ? directYtDlp : 'yt-dlp'));

  const localFfmpeg = path.join(localBin, 'ffmpeg.exe');
  const directFfmpeg = path.join(parentDir, 'download-from-yt', 'ffmpeg.exe');
  const ffmpegPath = fs.existsSync(localFfmpeg) 
    ? localFfmpeg 
    : (fs.existsSync(directFfmpeg) ? directFfmpeg : 'ffmpeg');

  return { ytDlpPath, ffmpegPath };
}

function ytDownloaderApiPlugin(): Plugin {
  return {
    name: 'yt-downloader-api',
    configureServer(server) {
      const { ytDlpPath, ffmpegPath } = getBinaryPaths();
      const defaultDownloads = path.join(os.homedir(), 'Downloads');

      // Middleware for /api/info
      server.middlewares.use('/api/info', (req, res) => {
        const urlObj = new URL(req.url || '', `http://${req.headers.host}`);
        const videoUrl = urlObj.searchParams.get('url');

        if (!videoUrl) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'URL es requerida' }));
          return;
        }

        console.log(`[YT-INFO] Analizando URL: ${videoUrl}`);
        const args = ['--dump-single-json', '--no-warnings', '--no-playlist', videoUrl];
        const proc = spawn(ytDlpPath, args);

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (d) => (stdout += d.toString()));
        proc.stderr.on('data', (d) => (stderr += d.toString()));

        proc.on('close', (code) => {
          res.setHeader('Content-Type', 'application/json');
          if (code === 0) {
            try {
              const data = JSON.parse(stdout);
              res.statusCode = 200;
              res.end(JSON.stringify({
                id: data.id,
                title: data.title,
                thumbnail: data.thumbnail,
                duration: data.duration,
                uploader: data.uploader || 'YouTube',
                formats: (data.formats || []).map((f: any) => ({
                  formatId: f.format_id,
                  resolution: f.resolution || (f.height ? `${f.height}p` : 'audio'),
                  ext: f.ext,
                  hasVideo: f.vcodec !== 'none',
                  hasAudio: f.acodec !== 'none',
                  filesizeApprox: f.filesize || f.filesize_approx
                }))
              }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Error procesando metadatos del video' }));
            }
          } else {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: stderr || 'yt-dlp no pudo procesar el enlace' }));
          }
        });
      });

      // Middleware for /api/stream (Local video/audio range streaming)
      server.middlewares.use('/api/stream', (req, res) => {
        try {
          const urlObj = new URL(req.url || '', `http://${req.headers.host}`);
          let filePath = urlObj.searchParams.get('path');
          if (!filePath) {
            res.statusCode = 400;
            res.end('Missing file path');
            return;
          }

          filePath = decodeURIComponent(filePath);
          if (!fs.existsSync(filePath)) {
            res.statusCode = 404;
            res.end('File not found');
            return;
          }

          const stat = fs.statSync(filePath);
          if (!stat.isFile()) {
            res.statusCode = 400;
            res.end('Path is not a file');
            return;
          }

          const fileSize = stat.size;
          const range = req.headers.range;
          const ext = path.extname(filePath).toLowerCase();

          const mimeMap: Record<string, string> = {
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
            '.mkv': 'video/mp4',
            '.avi': 'video/x-msvideo',
            '.mov': 'video/quicktime',
            '.mp3': 'audio/mpeg',
            '.m4a': 'audio/mp4',
            '.wav': 'audio/wav',
            '.flac': 'audio/flac',
            '.ogg': 'audio/ogg'
          };
          const contentType = mimeMap[ext] || 'video/mp4';

          if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = (end - start) + 1;
            const fileStream = fs.createReadStream(filePath, { start, end });

            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': chunkSize,
              'Content-Type': contentType,
              'Access-Control-Allow-Origin': '*'
            });
            fileStream.pipe(res);
          } else {
            res.writeHead(200, {
              'Content-Length': fileSize,
              'Content-Type': contentType,
              'Accept-Ranges': 'bytes',
              'Access-Control-Allow-Origin': '*'
            });
            fs.createReadStream(filePath).pipe(res);
          }
        } catch (err: any) {
          res.statusCode = 500;
          res.end(err.message || 'Stream error');
        }
      });

      // Middleware for /api/library (Scan local folder for video/audio)
      server.middlewares.use('/api/library', (req, res) => {
        try {
          const urlObj = new URL(req.url || '', `http://${req.headers.host}`);
          let dirPath = urlObj.searchParams.get('dir') || defaultDownloads;
          dirPath = decodeURIComponent(dirPath);

          if (!fs.existsSync(dirPath)) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify([]));
            return;
          }

          const videoExts = ['.mp4', '.mkv', '.webm', '.avi', '.mov'];
          const audioExts = ['.mp3', '.m4a', '.wav', '.flac', '.aac', '.ogg'];
          const entries = fs.readdirSync(dirPath, { withFileTypes: true });
          const items = [];

          for (const entry of entries) {
            if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase();
              const isVideo = videoExts.includes(ext);
              const isAudio = audioExts.includes(ext);

              if (isVideo || isAudio) {
                const fullPath = path.join(dirPath, entry.name);
                const stat = fs.statSync(fullPath);
                const cleanTitle = path.basename(entry.name, ext);

                // Check if companion thumbnail image exists
                let thumbUrl = '';
                const imageExts = ['.jpg', '.jpeg', '.png', '.webp'];
                for (const imgExt of imageExts) {
                  const possibleImgPath = path.join(dirPath, `${cleanTitle}${imgExt}`);
                  if (fs.existsSync(possibleImgPath)) {
                    thumbUrl = `/api/stream?path=${encodeURIComponent(possibleImgPath)}`;
                    break;
                  }
                }

                items.push({
                  id: `local_${stat.ino || Math.random().toString(36).substr(2, 9)}_${stat.mtimeMs}`,
                  title: cleanTitle,
                  fileName: entry.name,
                  filePath: fullPath,
                  thumbnail: thumbUrl,
                  format: isVideo ? 'video' : 'audio',
                  quality: isVideo ? ext.replace('.', '').toUpperCase() : 'Audio',
                  ext: ext.replace('.', '').toUpperCase(),
                  sizeBytes: stat.size,
                  createdAt: stat.mtimeMs
                });
              }
            }
          }

          items.sort((a, b) => b.createdAt - a.createdAt);

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(items));
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      server.middlewares.use('/api/download', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }

        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const { 
              url, 
              format = 'video', 
              quality = 'best', 
              codec = 'H264', 
              outputDir,
              speedLimit,
              autoOrganize,
              embedMetadata
            } = JSON.parse(body);

            const targetDir = outputDir && fs.existsSync(outputDir) ? outputDir : defaultDownloads;
            const outputTemplate = autoOrganize
              ? path.join(targetDir, '%(uploader)s', '%(title)s.%(ext)s')
              : path.join(targetDir, '%(title)s.%(ext)s');

            console.log(`[YT-DOWNLOAD] Solicitud: ${url}`);
            console.log(`[YT-DOWNLOAD] Formato: ${format}, Calidad: ${quality}, Códec: ${codec}, Destino: ${targetDir}, Límite: ${speedLimit || 'unlimited'}`);

            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            });

            const sendEvent = (data: any) => {
              res.write(`data: ${JSON.stringify(data)}\n\n`);
            };

            const args = [
              '--no-warnings',
              '--newline',
              '--progress',
              '--no-playlist',
              '--windows-filenames',
              '--trim-filenames', '150',
              '--output', outputTemplate,
              '--ffmpeg-location', ffmpegPath
            ];

            // Apply speed limit
            if (speedLimit && speedLimit !== 'unlimited') {
              let limitArg = speedLimit.trim();
              if (/^\d+mb$/i.test(limitArg)) {
                limitArg = limitArg.toLowerCase().replace('mb', 'M');
              } else if (/^\d+kb$/i.test(limitArg)) {
                limitArg = limitArg.toLowerCase().replace('kb', 'K');
              }
              args.push('--limit-rate', limitArg);
            }

            // Embed metadata
            if (embedMetadata) {
              args.push('--embed-metadata', '--embed-thumbnail');
            }

            if (format === 'audio') {
              args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
            } else {
              let formatFilter = 'bestvideo+bestaudio/best';
              if (quality === 'best') {
                if (codec === 'H264') {
                  formatFilter = 'bestvideo[vcodec^=avc1]+bestaudio/bestvideo+bestaudio/best';
                } else if (codec === 'VP9') {
                  formatFilter = 'bestvideo[vcodec^=vp9]+bestaudio/bestvideo+bestaudio/best';
                } else if (codec === 'AV1') {
                  formatFilter = 'bestvideo[vcodec^=av01]+bestaudio/bestvideo+bestaudio/best';
                } else {
                  formatFilter = 'bestvideo+bestaudio/best';
                }
              } else {
                const h = parseInt(quality) || 720;
                if (codec === 'H264') {
                  formatFilter = `bestvideo[vcodec^=avc1][height<=${h}]+bestaudio/bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`;
                } else if (codec === 'VP9') {
                  formatFilter = `bestvideo[vcodec^=vp9][height<=${h}]+bestaudio/bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`;
                } else if (codec === 'AV1') {
                  formatFilter = `bestvideo[vcodec^=av01][height<=${h}]+bestaudio/bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`;
                } else {
                  formatFilter = `bestvideo[height<=${h}]+bestaudio/bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`;
                }
              }

              args.push('-f', formatFilter, '--merge-output-format', 'mp4');
            }

            args.push(url);

            const proc = spawn(ytDlpPath, args);
            let stderr = '';
            let savedPath = '';

            proc.stdout.on('data', (d) => {
              const text = d.toString();
              const lines = text.split('\n');

              for (const line of lines) {
                // Parse progress: [download]  45.2% of 25.00MiB at 3.12MiB/s ETA 00:04
                const progressMatch = line.match(/\[download\]\s+([\d.]+)%\s+of\s+~?([\d.]+\w+)\s+at\s+([\d.]+\w+\/s)\s+ETA\s+([\d:]+)/);
                if (progressMatch) {
                  const percent = parseFloat(progressMatch[1]);
                  const speed = progressMatch[3];
                  const eta = progressMatch[4];
                  sendEvent({ type: 'progress', progress: percent, speed, eta });
                }

                // Parse destination file
                const destMatch = line.match(/\[download\] Destination: (.+)/) || 
                                  line.match(/\[Merger\] Merging formats into "(.+)"/) ||
                                  line.match(/\[ExtractAudio\] Destination: (.+)/);
                if (destMatch) {
                  savedPath = destMatch[1];
                  sendEvent({ type: 'status', message: 'Finalizando archivo...' });
                }
              }
            });

            proc.stderr.on('data', (d) => {
              const str = d.toString();
              // Only record non-warning errors
              if (!str.includes('WARNING:')) {
                stderr += str;
              }
            });

            proc.on('close', (code) => {
              if (code === 0) {
                console.log(`[YT-DOWNLOAD] Éxito: ${savedPath || targetDir}`);
                sendEvent({
                  type: 'complete',
                  filePath: savedPath || path.join(targetDir, 'descarga_completada')
                });
              } else {
                console.error(`[YT-DOWNLOAD] Fallo (código ${code}): ${stderr}`);
                sendEvent({
                  type: 'error',
                  error: stderr.trim() || `Error en yt-dlp (código ${code})`
                });
              }
              res.end();
            });

            res.on('close', () => {
              if (!res.writableEnded) {
                try {
                  proc.kill();
                } catch (e) {}
              }
            });

          } catch (e: any) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'JSON inválido' }));
          }
        });
      });
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    ytDownloaderApiPlugin()
  ],
  css: {
    postcss: {
      plugins: [
        tailwindcss(),
        autoprefixer(),
      ],
    },
  },
  base: './',
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/bin/**', '**/electron/dist/**', '**/.venv/**', '**/release/**', '**/src-tauri/**']
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
