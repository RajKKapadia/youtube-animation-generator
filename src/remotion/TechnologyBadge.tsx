import {createContext, useContext, type ReactNode} from 'react';
import {Img, staticFile} from 'remotion';
import type {LocalBrandAsset, TechnologyBrandIcon} from '../types.js';
import {semanticIconIdForText, type SemanticIconId} from '../icon-catalog.js';
import {
  technologyIconKindFor,
  type TechnologyIconKind,
} from './technology.js';
import {VisualIcon} from './SemanticIcon.js';

const TechnologyIconsContext = createContext<Record<string, TechnologyBrandIcon>>({});
const LocalBrandAssetsContext = createContext<Record<string, LocalBrandAsset>>({});
const SemanticIconsContext = createContext<Record<string, string>>({});

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

export const LocalBrandAssetsProvider = ({
  assets,
  children,
}: {
  assets: Record<string, LocalBrandAsset>;
  children: ReactNode;
}) => (
  <LocalBrandAssetsContext.Provider value={assets}>
    {children}
  </LocalBrandAssetsContext.Provider>
);

export const SemanticIconsProvider = ({
  children,
  icons,
}: {
  children: ReactNode;
  icons: Record<string, string>;
}) => (
  <SemanticIconsContext.Provider value={icons}>
    {children}
  </SemanticIconsContext.Provider>
);

const ICON_ID_FOR_LEGACY_KIND: Partial<Record<TechnologyIconKind, SemanticIconId>> = {
  ai: 'ai-model',
  analytics: 'analytics-chart',
  api: 'api-endpoint',
  audio: 'audio-wave',
  auth: 'auth-key',
  cache: 'cache-archive',
  cloud: 'cloud',
  code: 'code',
  database: 'data-database',
  document: 'document',
  download: 'download',
  email: 'email',
  error: 'error-warning',
  event: 'event-trigger',
  message: 'message-chat',
  mobile: 'mobile',
  monitoring: 'monitoring',
  network: 'network',
  payment: 'payment',
  queue: 'queue',
  retry: 'retry',
  schedule: 'schedule',
  search: 'search',
  security: 'security',
  server: 'server',
  storage: 'storage',
  transform: 'transform',
  upload: 'upload',
  user: 'user',
  users: 'users',
  video: 'video',
  web: 'web',
  webhook: 'webhook',
  worker: 'worker',
};

export const technologyBadgeSourceFor = (
  label: string,
  icons: Record<string, TechnologyBrandIcon>,
): 'brand' | 'semantic' => icons[label] ? 'brand' : 'semantic';

export const TechnologyBadge = ({
  iconId,
  label,
  size = 60,
}: {
  iconId?: string | null;
  label: string;
  size?: number;
}) => {
  const icons = useContext(TechnologyIconsContext);
  const localAssets = useContext(LocalBrandAssetsContext);
  const semanticIcons = useContext(SemanticIconsContext);
  const kind = technologyIconKindFor(label);
  const icon = icons[label];
  const localAsset = localAssets[label];
  const explicitIconId = iconId ?? semanticIcons[label];
  const fallbackIconId = semanticIconIdForText(label) ?? ICON_ID_FOR_LEGACY_KIND[kind];
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
      {explicitIconId ? (
        <VisualIcon color="#0F172A" id={explicitIconId} size="66%" strokeWidth={2.2} />
      ) : icon ? (
        <svg aria-hidden="true" height="62%" viewBox="0 0 24 24" width="62%">
          <path d={icon.path} fill={`#${icon.hex}`} />
        </svg>
      ) : localAsset ? (
        <Img
          alt=""
          src={staticFile(localAsset.file)}
          style={{height: '68%', objectFit: 'contain', width: '68%'}}
        />
      ) : (
        <VisualIcon color="#0F172A" id={fallbackIconId} size="66%" strokeWidth={2.2} />
      )}
    </div>
  );
};
