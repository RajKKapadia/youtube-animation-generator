import {createContext, useContext, type ReactNode} from 'react';
import {
  Activity,
  Archive,
  AudioLines,
  Bot,
  BrainCircuit,
  CalendarClock,
  ChartNoAxesCombined,
  CircleEllipsis,
  Cloud,
  Code2,
  Database,
  Download,
  FileText,
  Globe2,
  HardDrive,
  KeyRound,
  ListOrdered,
  Mail,
  MessageCircle,
  Network,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Shuffle,
  Smartphone,
  TriangleAlert,
  Upload,
  UserRound,
  UsersRound,
  Video,
  WalletCards,
  Webhook,
  Zap,
  type LucideIcon,
} from 'lucide-react';
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

const SEMANTIC_ICONS: Record<TechnologyIconKind, LucideIcon> = {
  ai: BrainCircuit,
  analytics: ChartNoAxesCombined,
  api: Webhook,
  audio: AudioLines,
  auth: KeyRound,
  cache: Archive,
  cloud: Cloud,
  code: Code2,
  database: Database,
  document: FileText,
  download: Download,
  email: Mail,
  error: TriangleAlert,
  event: Zap,
  generic: CircleEllipsis,
  message: MessageCircle,
  mobile: Smartphone,
  monitoring: Activity,
  network: Network,
  payment: WalletCards,
  queue: ListOrdered,
  retry: RefreshCw,
  schedule: CalendarClock,
  search: Search,
  security: ShieldCheck,
  server: Server,
  storage: HardDrive,
  transform: Shuffle,
  upload: Upload,
  user: UserRound,
  users: UsersRound,
  video: Video,
  web: Globe2,
  webhook: Webhook,
  worker: Bot,
};

const GenericGlyph = ({kind}: {kind: TechnologyIconKind}) => {
  const Icon = SEMANTIC_ICONS[kind];
  return (
    <Icon
      aria-hidden="true"
      color="#0F172A"
      height="66%"
      strokeWidth={2.2}
      width="66%"
    />
  );
};

export const technologyBadgeSourceFor = (
  label: string,
  icons: Record<string, TechnologyBrandIcon>,
): 'brand' | 'semantic' => icons[label] ? 'brand' : 'semantic';

export const TechnologyBadge = ({label, size = 60}: {label: string; size?: number}) => {
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
