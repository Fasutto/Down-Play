import React from 'react';
import {
  Code2,
  Users,
  ExternalLink,
  Cpu,
  Layers,
  Atom,
  FileCode2,
  Palette
} from 'lucide-react';
import { PlatformService } from '../services/platform';

const DEVELOPERS = [
  {
    name: 'luischang07',
    role: 'Creador y desarrollador principal del proyecto, encargado de la arquitectura y funciones clave.',
    github: 'https://github.com/luischang07',
    avatar: 'https://github.com/luischang07.png?size=80'
  },
  {
    name: 'Fasutto',
    role: 'Co-desarrollador y diseño de experiencia, enfocado en la interfaz visual y usabilidad.',
    github: 'https://github.com/Fasutto',
    avatar: 'https://github.com/Fasutto.png?size=80'
  }
];

const TECHNOLOGIES = [
  {
    name: 'Rust',
    description: 'Motor interno para descargas rápidas, seguras y eficientes.',
    icon: Cpu,
    color: 'text-orange-400',
    url: 'https://www.rust-lang.org/'
  },
  {
    name: 'Tauri',
    description: 'Empaquetado ligero de la aplicación de escritorio sin consumir mucha memoria.',
    icon: Layers,
    color: 'text-amber-400',
    url: 'https://v2.tauri.app/'
  },
  {
    name: 'React',
    description: 'Construcción de toda la interfaz interactiva y sus vistas.',
    icon: Atom,
    color: 'text-sky-400',
    url: 'https://react.dev/'
  },
  {
    name: 'TypeScript',
    description: 'Lógica ordenada y segura para evitar errores en la interfaz.',
    icon: FileCode2,
    color: 'text-blue-400',
    url: 'https://www.typescriptlang.org/'
  },
  {
    name: 'Tailwind CSS',
    description: 'Estilos visuales, temas claro/oscuro y acentos modernos.',
    icon: Palette,
    color: 'text-emerald-400',
    url: 'https://tailwindcss.com/'
  }
];

export const AboutView: React.FC = () => {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div className="ws-panel p-8 text-center space-y-4">
        <div className="w-20 h-20 mx-auto rounded-2xl bg-white p-2 shadow-md flex items-center justify-center">
          <img src="/logo.png" alt="Down-Play" className="w-full h-full object-contain" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Down-Play</h1>
          <p className="text-xs font-mono text-slate-400 mt-1">Versión 0.9.0</p>
        </div>
        <p className="text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
          Aplicación de escritorio sencilla y rápida para descargar videos y música desde{' '}
          <span className="text-slate-200 font-medium">
            YouTube, TikTok, Instagram, Facebook, X (Twitter), Twitch
          </span>{' '}
          y cientos de sitios más, organizarlos en tu biblioteca y reproducirlos sin complicaciones.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="ws-panel p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Users className="w-4 h-4 text-rose-400" />
            <span>Desarrollado por</span>
          </div>
          <div className="space-y-2.5">
            {DEVELOPERS.map((dev) => (
              <div key={dev.name} className="relative group">
                <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 px-3 py-2 rounded-lg bg-[#161925] border border-white/15 shadow-xl text-xs text-slate-200 leading-relaxed opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-150 z-30">
                  {dev.role}
                </div>
                <button
                  type="button"
                  onClick={() => PlatformService.openExternalUrl(dev.github)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={dev.avatar}
                      alt={dev.name}
                      className="w-8 h-8 rounded-full object-cover bg-white/10 flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{dev.name}</div>
                      <div className="text-[11px] text-slate-400 truncate">{dev.role}</div>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 ml-2" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="ws-panel p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Code2 className="w-4 h-4 text-violet-400" />
            <span>Tecnologías</span>
          </div>
          <div className="space-y-2">
            {TECHNOLOGIES.map((tech) => {
              const Icon = tech.icon;
              return (
                <div key={tech.name} className="relative group">
                  <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 px-3 py-2 rounded-lg bg-[#161925] border border-white/15 shadow-xl text-xs text-slate-200 leading-relaxed opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-150 z-30">
                    {tech.description}
                  </div>
                  <button
                    type="button"
                    onClick={() => PlatformService.openExternalUrl(tech.url)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.05] text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className={`w-4 h-4 flex-shrink-0 ${tech.color}`} />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold">{tech.name}</div>
                        <div className="text-[11px] text-slate-400 truncate">{tech.description}</div>
                      </div>
                    </div>
                    <ExternalLink className="w-3 h-3 text-slate-500 flex-shrink-0" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
