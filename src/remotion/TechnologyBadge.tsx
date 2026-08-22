import type {ReactNode} from 'react';
import type {SimpleIcon} from 'simple-icons';
import {
  siCelery,
  siDocker,
  siFastapi,
  siFfmpeg,
  siLangchain,
  siLanggraph,
  siPostgresql,
  siPython,
  siQdrant,
  siRedis,
  siYoutube,
} from 'simple-icons';
import {
  technologyIconKindFor,
  type TechnologyIconKind,
} from './technology.js';

const BRAND_ICONS: Partial<Record<TechnologyIconKind, SimpleIcon>> = {
  celery: siCelery,
  docker: siDocker,
  fastapi: siFastapi,
  ffmpeg: siFfmpeg,
  langchain: siLangchain,
  langgraph: siLanggraph,
  postgresql: siPostgresql,
  python: siPython,
  qdrant: siQdrant,
  redis: siRedis,
  youtube: siYoutube,
};

const GenericGlyph = ({kind}: {kind: TechnologyIconKind}) => {
  const glyph = (() => {
    switch (kind) {
      case 'ai':
        return (
          <>
            <path d="M12 2l1.7 5.1L19 9l-5.3 1.9L12 16l-1.7-5.1L5 9l5.3-1.9L12 2Z" />
            <path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
          </>
        );
      case 'api':
        return (
          <>
            <path d="m8 7-5 5 5 5" />
            <path d="m16 7 5 5-5 5" />
            <path d="m14 4-4 16" />
          </>
        );
      case 'audio':
        return <path d="M3 13h3l2-6 3 11 3-14 3 9h4" />;
      case 'database':
        return (
          <>
            <ellipse cx="12" cy="5" rx="8" ry="3" />
            <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
            <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
          </>
        );
      case 'queue':
        return (
          <>
            <rect height="4" rx="2" width="16" x="4" y="4" />
            <rect height="4" rx="2" width="12" x="8" y="10" />
            <rect height="4" rx="2" width="8" x="12" y="16" />
          </>
        );
      case 'search':
        return (
          <>
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m15.5 15.5 5 5" />
          </>
        );
      case 'video':
        return (
          <>
            <rect height="14" rx="3" width="19" x="2.5" y="5" />
            <path d="m10 9 5 3-5 3V9Z" />
          </>
        );
      case 'worker':
        return (
          <>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2" />
          </>
        );
      default:
        return (
          <>
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="18" cy="18" r="3" />
            <path d="m8.7 10.6 6.6-3.2m-6.6 6 6.6 3.2" />
          </>
        );
    }
  })();

  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="62%"
      stroke="#0F172A"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
      width="62%"
    >
      {glyph as ReactNode}
    </svg>
  );
};

export const TechnologyBadge = ({label, size = 52}: {label: string; size?: number}) => {
  const kind = technologyIconKindFor(label);
  const icon = BRAND_ICONS[kind];

  return (
    <div
      style={{
        alignItems: 'center',
        background: 'rgba(248, 250, 252, 0.98)',
        border: '2px solid rgba(255, 255, 255, 0.72)',
        borderRadius: Math.round(size * 0.28),
        boxShadow: '0 8px 20px rgba(2, 6, 23, 0.32)',
        display: 'flex',
        flex: `0 0 ${size}px`,
        height: size,
        justifyContent: 'center',
        width: size,
      }}
    >
      {icon ? (
        <svg aria-hidden="true" height="62%" viewBox="0 0 24 24" width="62%">
          <path d={icon.path} fill={`#${icon.hex}`} />
        </svg>
      ) : (
        <GenericGlyph kind={kind} />
      )}
    </div>
  );
};
