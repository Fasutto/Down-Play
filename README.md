# Down-Play v0.9.0

**Down-Play** es una aplicación de escritorio moderna y ligera para la descarga, gestión y reproducción de contenido multimedia (video y audio) desde YouTube y cientos de plataformas compatibles, construida con **React + TypeScript** en el frontend y **Rust + Tauri v2** en el backend nativo.

---

## 1. ¿Qué es Down-Play?

**Down-Play** es un centro multimedia todo-en-uno de escritorio que combina:
- Un **gestor de descargas de alto rendimiento** impulsado por `yt-dlp` y `FFmpeg`.
- Una **biblioteca local inteligente** que detecta, organiza y muestra las portadas incrustadas de tus videos y canciones descargadas.
- Un **reproductor multimedia integrado** con soporte para **Picture-in-Picture (PiP)** persistente, controles de velocidad, salto rápido y visualización de audio.

A diferencia de las aplicaciones tradicionales basadas en Electron (que empaquetan un navegador Chromium completo y Node.js), **Down-Play** utiliza **Tauri v2** y **Rust**, logrando un consumo mínimo de memoria RAM, arranque instantáneo y binarios nativos optimizados para Windows.

---

## 2. ¿Para qué es?

El objetivo principal de **Down-Play** es ofrecer una experiencia limpia, rápida y sin publicidad ni ventanas emergentes de consola para:

1. **Descargar videos y audio en la máxima calidad disponible:**
   - Resoluciones desde **360p hasta 4K UHD (2160p)** en formato `.mp4` y audio en `.mp3` de alta calidad.
   - Búsqueda automática de metadatos (título, canal, duración, miniatura y formatos disponibles) al pegar cualquier enlace compatible.
2. **Acelerar y automatizar tus descargas:**
   - Descarga paralela por fragmentos (`--concurrent-fragments 4`) y cola de descargas simultáneas configurable (1, 3 o 5 descargas a la vez).
   - Límite de velocidad configurable para no saturar tu red.
   - Incrustación automática de metadatos y carátula (`--embed-thumbnail`, `--embed-metadata`) directamente dentro del archivo `.mp4` o `.mp3`.
   - Organización opcional en subcarpetas por nombre del canal/creador.
3. **Gestionar y reproducir tu colección sin salir de la aplicación:**
   - Escaneo automático de tu carpeta de descargas en la pestaña **Biblioteca**, extrayendo las carátulas incrustadas de los archivos locales mediante `FFmpeg`.
   - Reproductor propio con modo **Picture-in-Picture (PiP)** inteligente: puedes cerrar la ventana del reproductor dentro de la app mientras sigues viendo el video flotante, regresar a la ventana del video con un clic o detener todo al cerrar el PiP.
4. **Mantener el motor siempre al día:**
   - Auto-actualización silenciosa de `yt-dlp` al iniciar la aplicación y botón manual de actualización desde **Ajustes**.

---

## 3. ¿Qué se utilizó? (Stack Tecnológico)

### Frontend (Interfaz de Usuario)
| Tecnología | Versión | Propósito |
| :--- | :--- | :--- |
| **React** | 18.3 | Construcción de la interfaz reactiva basada en componentes. |
| **TypeScript** | 5.7 | Tipado estático para contratos seguros entre UI y Rust. |
| **Vite** | 6.x | Empaquetador ultrarrápido y servidor de desarrollo con HMR. |
| **Tailwind CSS** | 3.4 | Sistema de estilos utilitarios y variables CSS para temas Claro/Oscuro. |
| **Lucide React** | 0.475 | Iconografía vectorial consistente y ligera. |

### Backend Nativo y Escritorio
| Tecnología | Versión | Propósito |
| :--- | :--- | :--- |
| **Rust** | Edition 2024 | Lenguaje de sistemas para el backend nativo, concurrencia y manejo de procesos. |
| **Tauri** | 2.12 | Framework de escritorio que conecta WebView2 nativo con comandos en Rust. |
| **Tokio** | 1.x | Runtime asíncrono para ejecutar procesos de descarga, lectura de streams y tareas en segundo plano sin bloquear la UI. |
| **Axum** | 0.8 | Servidor HTTP embebido (`bin/server.rs`) para modo web/híbrido con Server-Sent Events (SSE). |
| **Serde / Serde JSON** | 1.0 | Serialización y deserialización de datos entre Rust, `yt-dlp` y React. |

### Motor Multimedia y Empaquetado
| Herramienta | Propósito |
| :--- | :--- |
| **yt-dlp** | Extracción de metadatos JSON y descarga multifragmento de streams de video/audio. |
| **FFmpeg / FFprobe** | Fusión (muxing) de pistas de video + audio en alta definición, conversión a MP3, incrustación de carátulas y extracción de miniaturas en la biblioteca. |
| **NSIS (makensis)** | Generación del instalador ejecutable para Windows (`Down-Play_0.9.0_x64-setup.exe`). |
| **WiX Toolset** | Generación del paquete instalador empresarial de Windows (`Down-Play_0.9.0_x64_en-US.msi`). |

---

## 4. ¿Cómo se utilizó? (Arquitectura y Funcionamiento)

### 4.1 Comunicación Frontend ↔ Backend (Tauri IPC)
El frontend se comunica con Rust mediante la capa de abstracción [`src/services/platform.ts`](./src/services/platform.ts):
- **`invoke('get_video_info', { url })`**: Llama a `downloader::fetch_info` en Rust, el cual ejecuta `yt-dlp --dump-single-json --no-playlist`, filtra y normaliza las resoluciones disponibles y devuelve un objeto tipado `VideoMetadata`.
- **`invoke('start_download', { options })`**: Inicia una tarea asíncrona en Rust que ejecuta `yt-dlp` con bandera `CREATE_NO_WINDOW` (`0x08000000`) para evitar ventanas de consola en Windows.
- **Eventos en tiempo real (`listen`)**: Mientras `yt-dlp` descarga, Rust lee la salida estándar línea por línea con expresiones regulares (`regex`) y emite eventos `download-progress`, `download-complete` y `download-error` hacia React para actualizar el porcentaje, la velocidad (`MB/s`), el ETA y la barra de progreso en vivo.

### 4.2 Protocolo Personalizado `local-media://`
Los navegadores y WebViews bloquean por seguridad el acceso directo a rutas `file:///C:/...` desde contextos web. Para solucionarlo sin levantar servidores externos:
- En [`src-tauri/src/media_protocol.rs`](./src-tauri/src/media_protocol.rs) se registró el esquema nativo **`local-media://localhost/<ruta-codificada>`**.
- Soporta peticiones **HTTP Range (`206 Partial Content`)**, lo que permite adelantar o retrasar cualquier punto de un video grande de forma instantánea en el reproductor integrado, además de servir las carátulas extraídas en caché para la **Biblioteca**.

### 4.3 Escaneo de Biblioteca y Extracción de Carátulas
Cuando el usuario abre la pestaña **Biblioteca** (`scan_library_folder`):
1. Rust recorre de forma recursiva la carpeta de descargas buscando archivos `.mp4`, `.mkv`, `.webm`, `.mp3`, `.m4a`, `.flac` y `.wav`.
2. Para cada archivo, verifica si ya existe una miniatura en la caché local (`AppData/Local/com.downplay.app/cache/thumbs`).
3. Si no existe, ejecuta `ffmpeg` en silencio para extraer la carátula incrustada (`-map 0:v:0`) o capturar un fotograma del video, devolviendo la ruta lista para renderizar con `local-media://`.

### 4.4 Transición Gradual de Tema (Claro / Oscuro)
El cambio entre modo **Oscuro** y **Claro** está sincronizado mediante variables CSS globales (`--bg-app`, `--bg-sidebar`, `--bg-card`, `--text-primary`, `--border-subtle`) con una transición suave (`cubic-bezier`) aplicada de forma simultánea al barra superior, menú lateral, paneles y tarjetas.

### 4.5 Flujo Inteligente de Picture-in-Picture (PiP)
En [`src/components/MediaModal.tsx`](./src/components/MediaModal.tsx) y [`src/components/CustomVideoPlayer.tsx`](./src/components/CustomVideoPlayer.tsx):
- Si activas **Picture-in-Picture** y cierras el modal del video en la aplicación, el componente pasa a estado minimizado (`isMinimizedToPip`) sin desmontar el elemento `<video>`, permitiendo seguir viendo el PiP mientras navegas por la app.
- Si pulsas **"Regresar a la pestaña"** en la ventana PiP, el modal se vuelve a abrir automáticamente con el video en reproducción.
- Si cierras la ventana PiP (`X`) o abres un video distinto, se detiene el audio/video anterior de forma limpia.

---

## 5. Estructura del Proyecto

```text
Yt Downloader/
├── bin/                                # Binarios externos empaquetados con la aplicación
│   ├── yt-dlp.exe                      # Motor de extracción y descarga
│   ├── ffmpeg.exe                      # Procesamiento, conversión y muxing de audio/video
│   └── ffprobe.exe                     # Inspector de streams multimedia
├── build/                              # Iconos y recursos gráficos de compilación
├── src/                                # Código fuente del Frontend (React + TypeScript)
│   ├── components/
│   │   ├── TopNavbar.tsx               # Barra de título personalizada y controles de ventana
│   │   ├── Sidebar.tsx                 # Menú de navegación lateral e indicador del motor
│   │   ├── DownloadView.tsx            # Vista principal de pegado automático, búsqueda y formatos
│   │   ├── QueueView.tsx               # Cola de descargas activas, pausadas y completadas
│   │   ├── LibraryView.tsx             # Biblioteca multimedia local con buscador y filtros
│   │   ├── MediaModal.tsx              # Modal de reproducción y gestión de estado PiP
│   │   ├── CustomVideoPlayer.tsx       # Reproductor de video personalizado con controles propios
│   │   ├── SettingsView.tsx            # Ajustes de tema, carpeta, concurrencia y actualización de yt-dlp
│   │   └── AboutView.tsx               # Información de la versión, tecnologías y autores
│   ├── services/
│   │   ├── platform.ts                 # Capa de integración con Tauri (IPC, diálogos, protocolo local)
│   │   └── api.ts                      # Cliente HTTP de respaldo para modo servidor web
│   ├── App.tsx                         # Estado global, cola de concurrencia y enrutamiento de vistas
│   ├── types.ts                        # Interfaces TypeScript (DownloadTask, VideoInfo, AppSettings)
│   ├── index.css                       # Variables de tema, animaciones y utilidades Tailwind
│   └── main.tsx                        # Punto de entrada de React
├── src-tauri/                          # Código fuente del Backend Nativo (Rust + Tauri v2)
│   ├── capabilities/
│   │   └── default.json                # Permisos de Tauri v2 (ventana, shell, dialog, opener, deep-link)
│   ├── src/
│   │   ├── main.rs                     # Punto de entrada del ejecutable de escritorio
│   │   ├── lib.rs                      # Registro de comandos Tauri, plugins y auto-update al inicio
│   │   ├── downloader.rs               # Lógica de yt-dlp, FFmpeg, progreso en vivo y escaneo de biblioteca
│   │   ├── media_protocol.rs           # Servidor del protocolo nativo local-media:// con soporte Range
│   │   └── bin/
│   │       └── server.rs               # Servidor HTTP Axum opcional (API REST + SSE)
│   ├── Cargo.toml                      # Dependencias y configuración del crate de Rust
│   └── tauri.conf.json                 # Configuración de ventana, recursos (../bin/*) e instaladores
├── package.json                        # Scripts y dependencias de Node/pnpm
├── tailwind.config.js                  # Configuración de Tailwind CSS
├── tsconfig.json                       # Configuración del compilador TypeScript
└── vite.config.ts                      # Configuración de Vite
```

---

## 6. Requisitos Previos e Instalación (Desarrollo)

### Requisitos del Sistema
1. **Node.js** (v18 o superior) y **pnpm**.
2. **Rust y Cargo** instalados mediante [rustup](https://rustup.rs/).
3. **Microsoft Visual Studio C++ Build Tools** (Desktop development with C++) y **WebView2 Runtime** (incluido por defecto en Windows 10/11).
4. Los binarios `yt-dlp.exe`, `ffmpeg.exe` y `ffprobe.exe` ubicados dentro de la carpeta `bin/` en la raíz del proyecto.

### Pasos para ejecutar en modo desarrollo

1. **Instalar dependencias del frontend:**
   ```powershell
   pnpm install
   ```

2. **Asegurar que `cargo` esté en el `PATH` (en PowerShell):**
   ```powershell
   $env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
   ```

3. **Iniciar la aplicación en modo desarrollo (con recarga en caliente):**
   ```powershell
   pnpm tauri:dev
   ```

---

## 7. Compilación y Generación de Instaladores (Producción)

Para compilar el frontend optimizado, el binario de Rust en modo `release` y empaquetar los instaladores de Windows:

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
pnpm tauri:build
```

Una vez finalizado el proceso, encontrarás los artefactos generados en:
- **Instalador NSIS (`.exe`):** `src-tauri/target/release/bundle/nsis/Down-Play_0.9.0_x64-setup.exe`
- **Instalador MSI (`.msi`):** `src-tauri/target/release/bundle/msi/Down-Play_0.9.0_x64_en-US.msi`
- **Ejecutable directo:** `src-tauri/target/release/app.exe`

---

## 8. Autores y Créditos

Desarrollado por **luischang07 & Fasutto**.
