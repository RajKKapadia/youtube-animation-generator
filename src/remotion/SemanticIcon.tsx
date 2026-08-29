import {createContext, useContext, type CSSProperties, type ReactNode} from 'react';
import {Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {
  Activity,
  Archive,
  AudioLines,
  BadgeCheck,
  Bot,
  Braces,
  BrainCircuit,
  CalendarClock,
  ChartNoAxesCombined,
  CircleEllipsis,
  Cloud,
  Code2,
  Cpu,
  Database,
  Download,
  FileText,
  Gauge,
  Globe2,
  HardDrive,
  KeyRound,
  ListOrdered,
  Mail,
  MemoryStick,
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
  Workflow,
  Zap,
  CircuitBoard,
  Cog,
  type LucideIcon,
} from 'lucide-react';
import type {LocalIconAsset, NarratedMotion} from '../types.js';
import {
  semanticIconDefinitionFor,
  type SemanticIconId,
} from '../icon-catalog.js';

const ICON_COMPONENTS: Record<SemanticIconId, LucideIcon> = {
  'standard-protocol': Braces,
  'standard-compatible': BadgeCheck,
  'hardware-cpu': Cpu,
  'hardware-accelerator': Gauge,
  'hardware-memory': MemoryStick,
  'hardware-circuit': CircuitBoard,
  'ai-model': BrainCircuit,
  'ai-agent': Bot,
  'automation-workflow': Workflow,
  'analytics-chart': ChartNoAxesCombined,
  'api-endpoint': Webhook,
  'audio-wave': AudioLines,
  'auth-key': KeyRound,
  'cache-archive': Archive,
  cloud: Cloud,
  code: Code2,
  'data-database': Database,
  document: FileText,
  download: Download,
  email: Mail,
  'error-warning': TriangleAlert,
  'event-trigger': Zap,
  'message-chat': MessageCircle,
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
  worker: Cog,
};

const LocalIconAssetsContext = createContext<Record<string, LocalIconAsset>>({});

export const LocalIconAssetsProvider = ({
  assets,
  children,
}: {
  assets: Record<string, LocalIconAsset>;
  children: ReactNode;
}) => (
  <LocalIconAssetsContext.Provider value={assets}>
    {children}
  </LocalIconAssetsContext.Provider>
);

export const VisualIcon = ({
  color = '#0F172A',
  id,
  size,
  strokeWidth = 2.1,
  style,
}: {
  color?: string;
  id?: string | null | undefined;
  size: number | string;
  strokeWidth?: number;
  style?: CSSProperties;
}) => {
  const localAssets = useContext(LocalIconAssetsContext);
  const semantic = id && semanticIconDefinitionFor(id) ? id as SemanticIconId : undefined;
  const Icon = semantic ? ICON_COMPONENTS[semantic] : CircleEllipsis;
  const local = id ? localAssets[id] : undefined;
  if (local) {
    return (
      <Img
        alt=""
        src={staticFile(local.file)}
        style={{height: size, objectFit: 'contain', width: size, ...style}}
      />
    );
  }
  return (
    <Icon
      aria-hidden="true"
      color={color}
      height={size}
      strokeWidth={strokeWidth}
      style={style}
      width={size}
    />
  );
};

const clamp = {
  extrapolateLeft: 'clamp' as const,
  extrapolateRight: 'clamp' as const,
};

export const AnimatedVisualIcon = ({
  color,
  id,
  motion,
  secondaryColor,
  size,
}: {
  color: string;
  id?: string | null;
  motion: NarratedMotion;
  secondaryColor: string;
  size: number;
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const reveal = interpolate(frame, [0, Math.round(fps * 0.55)], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const wave = Math.sin((frame / fps) * Math.PI * 1.2);
  const drift = motion === 'drift' ? wave * 8 : 0;
  const pulse = motion === 'pulse' ? 1 + wave * 0.025 : 1;
  const turn = motion === 'scan' ? wave * 1.2 : 0;
  return (
    <div
      style={{
        alignItems: 'center',
        background: `radial-gradient(circle at 34% 28%, ${secondaryColor}33, transparent 58%)`,
        borderRadius: '38%',
        display: 'flex',
        height: size,
        justifyContent: 'center',
        opacity: reveal,
        transform: `translateY(${(1 - reveal) * 24 + drift}px) rotate(${turn}deg) scale(${(0.82 + reveal * 0.18) * pulse})`,
        width: size,
      }}
    >
      <VisualIcon
        color={color}
        id={id}
        size="74%"
        strokeWidth={1.75}
        style={{filter: `drop-shadow(0 0 22px ${secondaryColor}66)`}}
      />
    </div>
  );
};
