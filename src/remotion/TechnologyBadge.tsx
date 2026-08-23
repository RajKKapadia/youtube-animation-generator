import {createContext, useContext, type ReactNode} from 'react';
import type {TechnologyBrandIcon} from '../types.js';
import {
  technologyIconKindFor,
  type TechnologyIconKind,
} from './technology.js';

const TechnologyIconsContext = createContext<Record<string, TechnologyBrandIcon>>({});

const usesDarkBadgeBackground = (icon: TechnologyBrandIcon | undefined): boolean => {
  if (!icon) {
    return false;
  }
  const red = Number.parseInt(icon.hex.slice(0, 2), 16);
  const green = Number.parseInt(icon.hex.slice(2, 4), 16);
  const blue = Number.parseInt(icon.hex.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1_000 >= 200;
};

export const TechnologyIconsProvider = ({
  children,
  icons,
}: {
  children: ReactNode;
  icons: Record<string, TechnologyBrandIcon>;
}) => (
  <TechnologyIconsContext.Provider value={icons}>
    {children}
  </TechnologyIconsContext.Provider>
);

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
      case 'cloud':
        return <path d="M6 18h12a4 4 0 0 0 .4-8A6.5 6.5 0 0 0 6 8.5 4.8 4.8 0 0 0 6 18Z" />;
      case 'code':
        return (
          <>
            <path d="m8 7-5 5 5 5" />
            <path d="m16 7 5 5-5 5" />
            <path d="m14 4-4 16" />
          </>
        );
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
      case 'server':
        return (
          <>
            <rect height="7" rx="2" width="18" x="3" y="3" />
            <rect height="7" rx="2" width="18" x="3" y="14" />
            <path d="M7 6.5h.01M7 17.5h.01M11 6.5h7M11 17.5h7" />
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
      case 'web':
        return (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9S14.5 18.5 12 21M12 3C9.5 5.5 8.2 8.5 8.2 12S9.5 18.5 12 21" />
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
  const icons = useContext(TechnologyIconsContext);
  const kind = technologyIconKindFor(label);
  const icon = icons[label];
  const darkBackground = usesDarkBadgeBackground(icon);

  return (
    <div
      style={{
        alignItems: 'center',
        background: darkBackground
          ? 'rgba(15, 23, 42, 0.98)'
          : 'rgba(248, 250, 252, 0.98)',
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
