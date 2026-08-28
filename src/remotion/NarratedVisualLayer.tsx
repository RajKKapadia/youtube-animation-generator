import type {CSSProperties, ReactNode} from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type {
  RenderProfile,
  SelectedMotionAsset,
  TechnologyBrandIcon,
  TimedNarrationScene,
  VideoPalette,
  VisualClip,
} from '../types.js';
import {isVerticalDimensions} from '../render-profile.js';
import {hexToRgba, videoPaletteFor} from '../visual-palettes.js';
import {AnimationClip} from './AnimationClip.js';
import {FittedText, RENDER_FONT_FAMILY} from './FittedText.js';
import {NarratedMotionAsset} from './NarratedMotionAsset.js';
import {TechnologyBadge, TechnologyIconsProvider} from './TechnologyBadge.js';
import {calculateChartAnnotation, formatChartDatum} from '../data-visualization.js';
import {
  CINEMATIC_MOTION,
  ambientWave,
  beatEntrance,
  sceneEntranceExit,
  timedProgress,
} from './cinematic-motion.js';

const clamp = {
  extrapolateLeft: 'clamp' as const,
  extrapolateRight: 'clamp' as const,
};

const itemEntrance = (frame: number, fps: number, startMs: number): number => {
  return beatEntrance(frame, fps, startMs);
};

const SceneCanvas = ({
  children,
  contentTopInset,
  profile,
}: {
  children: ReactNode;
  contentTopInset: number;
  profile: RenderProfile;
}) => (
  <AbsoluteFill
    style={{
      boxSizing: 'border-box',
      color: '#F8FAFC',
      fontFamily: RENDER_FONT_FAMILY,
      padding: `${profile.safeArea.top + contentTopInset}px ${profile.safeArea.right}px ${profile.safeArea.bottom}px ${profile.safeArea.left}px`,
    }}
  >
    {children}
  </AbsoluteFill>
);

const SceneTitle = ({profile, title}: {profile: RenderProfile; title: string}) => {
  const vertical = profile.aspectRatio === '9:16';
  return (
    <div
      style={{
        alignItems: 'center',
        display: 'flex',
        height: vertical ? 176 : 128,
        justifyContent: 'center',
        margin: '0 auto',
        maxWidth: vertical ? 850 : 1460,
        textAlign: 'center',
        textShadow: '0 4px 18px rgba(2,6,23,0.92)',
      }}
    >
      <FittedText
        fontWeight={820}
        letterSpacing={vertical ? -1 : -2}
        lineHeight={1.05}
        maxFontSize={vertical ? 64 : 68}
        maxHeight={vertical ? 176 : 128}
        maxLines={vertical ? 3 : 2}
        maxWidth={vertical ? 850 : 1460}
        text={title}
      />
    </div>
  );
};

const panelStyle = (accent: string): CSSProperties => ({
  background: 'linear-gradient(145deg, rgba(15,23,42,0.94), rgba(30,41,59,0.88))',
  border: `2px solid ${hexToRgba(accent, 0.42)}`,
  boxShadow: '0 28px 64px rgba(2,6,23,0.44)',
});

const ItemChip = ({
  entrance,
  label,
  size,
}: {
  entrance: number;
  label: string;
  size: number;
}) => (
  <div
    style={{
      alignItems: 'center',
      background: 'rgba(15,23,42,0.92)',
      border: '2px solid rgba(148,163,184,0.28)',
      borderRadius: 22,
      boxShadow: '0 18px 40px rgba(2,6,23,0.36)',
      display: 'flex',
      gap: 18,
      minHeight: size,
      opacity: entrance,
      padding: '14px 22px',
      transform: `translateY(${(1 - entrance) * 20}px) scale(${0.96 + entrance * 0.04})`,
    }}
  >
    <TechnologyBadge label={label} size={Math.round(size * 0.62)} />
    <FittedText
      align="left"
      fontWeight={720}
      lineHeight={1.08}
      maxFontSize={Math.round(size * 0.32)}
      maxHeight={Math.round(size * 0.72)}
      maxLines={2}
      maxWidth={size * 2.8}
      text={label}
    />
  </div>
);

const assetForScene = (
  scene: TimedNarrationScene,
  assets: Record<string, SelectedMotionAsset>,
): SelectedMotionAsset | undefined => scene.visual.assetId
  ? assets[scene.visual.assetId]
  : undefined;

const AgentWorkflow = ({
  motionAssets,
  palette,
  profile,
  scene,
}: {
  motionAssets: Record<string, SelectedMotionAsset>;
  palette: VideoPalette;
  profile: RenderProfile;
  scene: TimedNarrationScene;
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const vertical = profile.aspectRatio === '9:16';
  const theme = videoPaletteFor(palette);
  const asset = assetForScene(scene, motionAssets);
  const tools = [...scene.primaryItems, ...scene.secondaryItems].slice(0, 6);
  const toolStartMs = (index: number): number => index < scene.primaryItems.length
    ? scene.primaryItemTimings[index]?.startMs ?? 0
    : scene.secondaryItemTimings[index - scene.primaryItems.length]?.startMs ?? 0;
  const activeBeat = Math.max(
    0,
    scene.beats.findLastIndex(({startMs}) => frame >= Math.round((startMs / 1_000) * fps)),
  );
  const travel = interpolate(
    frame,
    [Math.round((scene.beats[activeBeat]?.startMs ?? 0) / 1_000 * fps), Math.round(((scene.beats[activeBeat]?.startMs ?? 0) / 1_000) * fps) + fps],
    [0, 1],
    clamp,
  );
  const coreScale = 1 + Math.sin(frame * 0.045) * 0.012;

  return (
    <div style={{display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0}}>
      <SceneTitle profile={profile} title={scene.title} />
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          flex: 1,
          flexDirection: vertical ? 'column' : 'row',
          gap: vertical ? 34 : 74,
          justifyContent: 'center',
          minHeight: 0,
        }}
      >
        <div
          style={{
            alignItems: 'center',
            display: 'grid',
            flex: vertical ? '0 0 auto' : '0 0 46%',
            height: vertical ? 540 : 560,
            justifyItems: 'center',
            position: 'relative',
            transform: `scale(${coreScale})`,
            width: vertical ? 780 : 660,
          }}
        >
          <div
            style={{
              ...panelStyle(theme.accents.primary),
              borderRadius: '50%',
              height: vertical ? 330 : 360,
              position: 'absolute',
              width: vertical ? 330 : 360,
            }}
          />
          {asset ? (
            <NarratedMotionAsset
              asset={asset}
              palette={palette}
              style={{height: vertical ? 310 : 340, position: 'relative', width: vertical ? 310 : 340}}
            />
          ) : (
            <TechnologyBadge label="AI agent" size={vertical ? 190 : 210} />
          )}
          {tools.map((tool, index, visibleTools) => {
            const angle = -Math.PI / 2 + (index / visibleTools.length) * Math.PI * 2;
            const radius = vertical ? 245 : 260;
            const entrance = itemEntrance(frame, fps, toolStartMs(index));
            return (
              <div
                key={`${tool}-${index}`}
                style={{
                  alignItems: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  left: '50%',
                  opacity: entrance,
                  position: 'absolute',
                  top: '50%',
                  transform: `translate(-50%, -50%) translate(${Math.cos(angle) * radius}px, ${Math.sin(angle) * radius}px) scale(${0.86 + entrance * 0.14})`,
                }}
              >
                <TechnologyBadge label={tool} size={vertical ? 76 : 82} />
                <div style={{fontSize: vertical ? 22 : 23, fontWeight: 720, maxWidth: 170, textAlign: 'center'}}>
                  {tool}
                </div>
              </div>
            );
          })}
          <div
            style={{
              background: theme.accents.secondary,
              borderRadius: '50%',
              boxShadow: `0 0 24px ${theme.accents.secondary}`,
              height: 16,
              left: `${18 + travel * 64}%`,
              opacity: travel < 1 ? 1 : 0,
              position: 'absolute',
              top: '50%',
              width: 16,
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            flex: vertical ? '0 0 auto' : '1 1 0',
            flexDirection: 'column',
            gap: 22,
            justifyContent: 'center',
            width: vertical ? '100%' : undefined,
          }}
        >
          <div style={{display: 'flex', gap: 18}}>
            {['Thinking', 'Working'].map((state, index) => {
              const active = activeBeat % 2 === index;
              return (
                <div
                  key={state}
                  style={{
                    ...panelStyle(active ? theme.accents.primary : theme.accents.secondary),
                    borderRadius: 24,
                    color: active ? '#F8FAFC' : '#94A3B8',
                    flex: 1,
                    fontSize: vertical ? 30 : 32,
                    fontWeight: 780,
                    padding: '24px 28px',
                    textAlign: 'center',
                  }}
                >
                  {state}
                </div>
              );
            })}
          </div>
          <div style={{...panelStyle(theme.accents.primary), borderRadius: 28, padding: vertical ? 28 : 34}}>
            <div style={{color: theme.accents.primary, fontSize: 20, fontWeight: 820, letterSpacing: 2, marginBottom: 12, textTransform: 'uppercase'}}>
              Request
            </div>
            <FittedText
              align="left"
              fontWeight={720}
              lineHeight={1.14}
              maxFontSize={vertical ? 34 : 38}
              maxHeight={vertical ? 115 : 155}
              maxLines={3}
              maxWidth={vertical ? 760 : 560}
              text={scene.beats[activeBeat]?.phrases.map(({text}) => text).join(' ') ?? scene.reason}
            />
          </div>
          <div style={{...panelStyle(theme.accents.secondary), borderRadius: 28, padding: vertical ? 26 : 30}}>
            <div style={{color: theme.accents.secondary, fontSize: 20, fontWeight: 820, letterSpacing: 2, marginBottom: 12, textTransform: 'uppercase'}}>
              Result
            </div>
            <FittedText
              align="left"
              fontWeight={680}
              lineHeight={1.12}
              maxFontSize={vertical ? 30 : 34}
              maxHeight={vertical ? 90 : 120}
              maxLines={3}
              maxWidth={vertical ? 760 : 560}
              text={tools.join(' · ')}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

const BrandShowcase = ({
  palette,
  profile,
  scene,
}: {
  palette: VideoPalette;
  profile: RenderProfile;
  scene: TimedNarrationScene;
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const vertical = profile.aspectRatio === '9:16';
  const theme = videoPaletteFor(palette);
  const brands = [...scene.primaryItems, ...scene.secondaryItems].slice(0, 6);
  return (
    <div style={{display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0}}>
      <SceneTitle profile={profile} title={scene.title} />
      <div
        style={{
          alignContent: 'center',
          display: 'grid',
          flex: 1,
          gap: vertical ? 24 : 30,
          gridTemplateColumns: vertical ? 'repeat(2, minmax(0, 1fr))' : `repeat(${Math.min(3, brands.length)}, minmax(0, 1fr))`,
          justifyContent: 'center',
          minHeight: 0,
        }}
      >
        {brands.map((brand, index) => {
          const timing = scene.primaryItemTimings[index] ?? scene.secondaryItemTimings[index - scene.primaryItems.length];
          const entrance = itemEntrance(frame, fps, timing?.startMs ?? index * 120);
          const drift = scene.visual.motion === 'drift'
            ? ambientWave(frame, fps, index * 1.3) * CINEMATIC_MOTION.maxAmbientPixels
            : 0;
          return (
            <div
              key={`${brand}-${index}`}
              style={{
                ...panelStyle(theme.accents.primary),
                alignItems: 'center',
                borderRadius: 30,
                display: 'flex',
                flexDirection: 'column',
                gap: vertical ? 28 : 24,
                justifyContent: 'center',
                minHeight: vertical ? 250 : 255,
                opacity: entrance,
                padding: vertical ? 28 : 32,
                transform: `translateY(${(1 - entrance) * 26 + drift}px) scale(${0.95 + entrance * 0.05})`,
              }}
            >
              <TechnologyBadge label={brand} size={vertical ? 114 : 126} />
              <FittedText
                fontWeight={780}
                lineHeight={1.05}
                maxFontSize={vertical ? 36 : 38}
                maxHeight={vertical ? 88 : 80}
                maxLines={2}
                maxWidth={vertical ? 320 : 390}
                text={brand}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

const NetworkMap = ({
  palette,
  profile,
  scene,
}: {
  palette: VideoPalette;
  profile: RenderProfile;
  scene: TimedNarrationScene;
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const vertical = profile.aspectRatio === '9:16';
  const theme = videoPaletteFor(palette);
  const nodes = [...scene.primaryItems, ...scene.secondaryItems].slice(0, 6);
  const hub = nodes[0] ?? scene.title;
  const satellites = nodes.slice(1);
  const mapWidth = vertical ? 780 : 1320;
  const mapHeight = vertical ? 1050 : 590;
  const activeEdge = Math.floor(frame / Math.max(1, Math.round(fps * 1.5))) % Math.max(1, satellites.length);
  const edgeProgress = (frame % Math.max(1, Math.round(fps * 1.5))) / Math.max(1, Math.round(fps * 1.5));

  return (
    <div style={{display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0}}>
      <SceneTitle profile={profile} title={scene.title} />
      <div style={{flex: 1, margin: '0 auto', position: 'relative', width: mapWidth}}>
        <svg
          aria-hidden="true"
          height="100%"
          style={{inset: 0, overflow: 'visible', position: 'absolute'}}
          viewBox={`0 0 ${mapWidth} ${mapHeight}`}
          width="100%"
        >
          {satellites.map((_, index) => {
            const angle = -Math.PI / 2 + (index / Math.max(1, satellites.length)) * Math.PI * 2;
            const radiusX = vertical ? 300 : 520;
            const radiusY = vertical ? 390 : 220;
            const x = mapWidth / 2 + Math.cos(angle) * radiusX;
            const y = mapHeight / 2 + Math.sin(angle) * radiusY;
            const entrance = itemEntrance(frame, fps, scene.primaryItemTimings[index + 1]?.startMs ?? 0);
            const edgeStartFrame = Math.round(((scene.primaryItemTimings[index + 1]?.startMs ?? 0) / 1_000) * fps);
            const edgeDraw = timedProgress(
              frame - edgeStartFrame,
              fps,
              CINEMATIC_MOTION.connectorDrawSeconds,
            );
            const pulseX = mapWidth / 2 + (x - mapWidth / 2) * edgeProgress;
            const pulseY = mapHeight / 2 + (y - mapHeight / 2) * edgeProgress;
            return (
              <g key={`edge-${index}`} opacity={entrance}>
                <line
                  stroke={hexToRgba(theme.accents.primary, 0.54)}
                  pathLength="1"
                  strokeDasharray="1"
                  strokeDashoffset={1 - edgeDraw}
                  strokeWidth="5"
                  x1={mapWidth / 2}
                  x2={x}
                  y1={mapHeight / 2}
                  y2={y}
                />
                {activeEdge === index ? (
                  <circle cx={pulseX} cy={pulseY} fill={theme.accents.secondary} r="11" />
                ) : null}
              </g>
            );
          })}
        </svg>
        <div
          style={{
            ...panelStyle(theme.accents.secondary),
            alignItems: 'center',
            borderRadius: '50%',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            height: vertical ? 250 : 230,
            justifyContent: 'center',
            left: '50%',
            padding: 24,
            position: 'absolute',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: vertical ? 250 : 230,
          }}
        >
          <TechnologyBadge label={hub} size={vertical ? 92 : 88} />
          <FittedText fontWeight={780} lineHeight={1.05} maxFontSize={28} maxHeight={66} maxLines={2} maxWidth={190} text={hub} />
        </div>
        {satellites.map((node, index) => {
          const angle = -Math.PI / 2 + (index / Math.max(1, satellites.length)) * Math.PI * 2;
          const x = 50 + Math.cos(angle) * (vertical ? 38 : 40);
          const y = 50 + Math.sin(angle) * (vertical ? 38 : 34);
          const entrance = itemEntrance(frame, fps, scene.primaryItemTimings[index + 1]?.startMs ?? 0);
          return (
            <div
              key={`${node}-${index}`}
              style={{
                left: `${x}%`,
                opacity: entrance,
                position: 'absolute',
                top: `${y}%`,
                transform: `translate(-50%, -50%) scale(${0.86 + entrance * 0.14})`,
              }}
            >
              <ItemChip entrance={entrance} label={node} size={vertical ? 92 : 88} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

const METRIC_PATTERN = /([+-]?\d[\d,]*(?:\.\d+)?)(\s*%?)/u;

export const metricDisplayAtProgress = (value: string, progress: number): string => {
  const match = METRIC_PATTERN.exec(value);
  if (!match || !match[1] || progress >= 1) return value;
  const numeric = Number(match[1].replaceAll(',', ''));
  if (!Number.isFinite(numeric)) return value;
  const decimals = match[1].includes('.') ? (match[1].split('.')[1]?.length ?? 0) : 0;
  const animated = numeric * Math.max(0, Math.min(1, progress));
  const formatted = animated.toLocaleString('en-US', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
  return `${value.slice(0, match.index)}${formatted}${match[2]}${value.slice(match.index + match[0].length)}`;
};

const MetricFocus = ({
  palette,
  profile,
  scene,
}: {
  palette: VideoPalette;
  profile: RenderProfile;
  scene: TimedNarrationScene;
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const vertical = profile.aspectRatio === '9:16';
  const theme = videoPaletteFor(palette);
  const metric = scene.primaryItems[0] ?? scene.title;
  const startFrame = Math.round(((scene.primaryItemTimings[0]?.startMs ?? 0) / 1_000) * fps);
  const progress = scene.visual.motion === 'count-up'
    ? interpolate(frame, [startFrame, startFrame + Math.round(fps * 1.2)], [0, 1], {
      ...clamp,
      easing: Easing.out(Easing.cubic),
    })
    : 1;
  const support = [...scene.primaryItems.slice(1), ...scene.secondaryItems].slice(0, 5);
  const pulse = 1 + Math.sin(frame * 0.04) * 0.012;
  return (
    <div style={{display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0}}>
      <SceneTitle profile={profile} title={scene.title} />
      <div style={{alignItems: 'center', display: 'flex', flex: 1, flexDirection: 'column', gap: vertical ? 42 : 34, justifyContent: 'center'}}>
        <div
          style={{
            ...panelStyle(theme.accents.primary),
            alignItems: 'center',
            borderRadius: 38,
            display: 'flex',
            height: vertical ? 470 : 350,
            justifyContent: 'center',
            padding: vertical ? 50 : 40,
            transform: `scale(${pulse})`,
            width: vertical ? 800 : 1280,
          }}
        >
          <FittedText
            fontWeight={880}
            letterSpacing={-3}
            lineHeight={0.98}
            maxFontSize={vertical ? 112 : 128}
            maxHeight={vertical ? 350 : 260}
            maxLines={3}
            maxWidth={vertical ? 710 : 1160}
            text={metricDisplayAtProgress(metric, progress)}
          />
        </div>
        <div style={{display: 'flex', flexWrap: 'wrap', gap: 18, justifyContent: 'center', maxWidth: vertical ? 820 : 1420}}>
          {support.map((item, index) => (
            <ItemChip
              entrance={itemEntrance(frame, fps, scene.primaryItemTimings[index + 1]?.startMs ?? startFrame / fps * 1_000)}
              key={`${item}-${index}`}
              label={item}
              size={vertical ? 92 : 88}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const IconSpotlight = ({
  motionAssets,
  palette,
  profile,
  scene,
}: {
  motionAssets: Record<string, SelectedMotionAsset>;
  palette: VideoPalette;
  profile: RenderProfile;
  scene: TimedNarrationScene;
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const vertical = profile.aspectRatio === '9:16';
  const theme = videoPaletteFor(palette);
  const asset = assetForScene(scene, motionAssets);
  const focal = scene.primaryItems[0] ?? scene.visual.motif.replace('-', ' ');
  const supporting = [...scene.primaryItems.slice(1), ...scene.secondaryItems].slice(0, 5);
  const drift = scene.visual.motion === 'drift'
    ? ambientWave(frame, fps) * CINEMATIC_MOTION.maxAmbientPixels
    : 0;
  const pulse = scene.visual.motion === 'pulse'
    ? 1 + ambientWave(frame, fps, 0.8) * CINEMATIC_MOTION.maxAmbientScale
    : 1;
  const scanProgress = timedProgress(frame, fps, 0.8, 0.18);
  return (
    <div style={{display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0}}>
      <SceneTitle profile={profile} title={scene.title} />
      <div style={{alignItems: 'center', display: 'flex', flex: 1, flexDirection: vertical ? 'column' : 'row', gap: vertical ? 46 : 100, justifyContent: 'center'}}>
        <div
          style={{
            ...panelStyle(theme.accents.primary),
            alignItems: 'center',
            borderRadius: 46,
            display: 'flex',
            height: vertical ? 520 : 520,
            justifyContent: 'center',
            overflow: 'hidden',
            position: 'relative',
            transform: `translateY(${drift}px) scale(${pulse})`,
            width: vertical ? 760 : 660,
          }}
        >
          {asset ? (
            <NarratedMotionAsset asset={asset} palette={palette} style={{height: '78%', width: '78%'}} />
          ) : (
            <TechnologyBadge label={focal} size={vertical ? 260 : 250} />
          )}
          {scene.visual.motion === 'scan' ? (
            <div
              style={{
                background: `linear-gradient(90deg, transparent, ${hexToRgba(theme.accents.secondary, 0.44)}, transparent)`,
                height: 12,
                left: 0,
                position: 'absolute',
                opacity: scanProgress < 1 ? 1 : 0,
                top: `${16 + scanProgress * 68}%`,
                width: '100%',
              }}
            />
          ) : null}
        </div>
        <div style={{display: 'flex', flexDirection: 'column', gap: 20, width: vertical ? '100%' : 620}}>
          <FittedText
            align={vertical ? 'center' : 'left'}
            fontWeight={840}
            lineHeight={1.02}
            maxFontSize={vertical ? 60 : 62}
            maxHeight={vertical ? 150 : 160}
            maxLines={3}
            maxWidth={vertical ? 820 : 620}
            text={focal}
          />
          {supporting.map((item, index) => (
            <ItemChip
              entrance={itemEntrance(frame, fps, scene.primaryItemTimings[index + 1]?.startMs ?? 0)}
              key={`${item}-${index}`}
              label={item}
              size={vertical ? 92 : 90}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const focalObjectPosition = (position: 'center' | 'top' | 'right' | 'bottom' | 'left'): string => ({
  center: '50% 50%',
  top: '50% 18%',
  right: '82% 50%',
  bottom: '50% 82%',
  left: '18% 50%',
})[position];

const ImageFocus = ({
  foregroundAssets,
  palette,
  profile,
  scene,
}: {
  foregroundAssets: Record<string, string>;
  palette: VideoPalette;
  profile: RenderProfile;
  scene: TimedNarrationScene;
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (scene.visual.kind !== 'image-focus') return null;
  const vertical = profile.aspectRatio === '9:16';
  const theme = videoPaletteFor(palette);
  const asset = foregroundAssets[scene.visual.mediaId];
  const progress = interpolate(
    frame,
    [0, Math.max(1, Math.round((scene.durationMs / 1_000) * fps))],
    [0, 1],
    clamp,
  );
  const wave = ambientWave(frame, fps, 0.4);
  const scale = scene.visual.motion === 'push-in'
    ? CINEMATIC_MOTION.imageScaleStart +
      (CINEMATIC_MOTION.imageScaleEnd - CINEMATIC_MOTION.imageScaleStart) * progress
    : CINEMATIC_MOTION.imageScaleStart + wave * 0.005;
  const direction = scene.visual.focalPosition === 'right' || scene.visual.focalPosition === 'bottom' ? -1 : 1;
  const panX = scene.visual.motion === 'pan'
    ? (progress - 0.5) * CINEMATIC_MOTION.maxAmbientPixels * 2 * direction
    : scene.visual.motion === 'drift' ? wave * CINEMATIC_MOTION.maxAmbientPixels : 0;
  const panY = scene.visual.motion === 'drift'
    ? ambientWave(frame, fps, 2.1) * CINEMATIC_MOTION.maxAmbientPixels
    : 0;
  const imageStyle: CSSProperties = {
    height: '100%',
    objectFit: scene.visual.fit,
    objectPosition: focalObjectPosition(scene.visual.focalPosition),
    transform: `translate(${panX}px, ${panY}px) scale(${scale})`,
    width: '100%',
  };

  return (
    <div style={{display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0}}>
      <SceneTitle profile={profile} title={scene.title} />
      <div
        style={{
          ...panelStyle(theme.accents.primary),
          borderRadius: vertical ? 38 : 34,
          flex: 1,
          margin: vertical ? '18px 10px 26px' : '8px 80px 22px',
          minHeight: 0,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {asset && scene.visual.fit === 'contain' ? (
          <Img
            src={staticFile(asset)}
            style={{
              filter: 'blur(34px) saturate(0.72) brightness(0.48)',
              height: '112%',
              left: '-6%',
              objectFit: 'cover',
              opacity: 0.84,
              position: 'absolute',
              top: '-6%',
              width: '112%',
            }}
          />
        ) : null}
        {asset ? <Img src={staticFile(asset)} style={{...imageStyle, position: 'relative'}} /> : null}
        <AbsoluteFill
          style={{
            background: 'linear-gradient(180deg, rgba(2,6,23,0.02), rgba(2,6,23,0.2))',
            boxShadow: `inset 0 0 0 2px ${hexToRgba(theme.accents.primary, 0.28)}`,
          }}
        />
      </div>
    </div>
  );
};

const DataVisualizationView = ({
  palette,
  profile,
  scene,
}: {
  palette: VideoPalette;
  profile: RenderProfile;
  scene: TimedNarrationScene;
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (scene.visual.kind !== 'data-visualization') return null;
  const chart = scene.visual.chart;
  const vertical = profile.aspectRatio === '9:16';
  const theme = videoPaletteFor(palette);
  const axisProgress = timedProgress(frame, fps, 0.25);
  const valueProgress = timedProgress(
    frame,
    fps,
    CINEMATIC_MOTION.chartGrowthSeconds,
    0.12,
  );
  const badgeProgress = timedProgress(frame, fps, 0.3, 0.78);
  const datumById = new Map(chart.data.map((datum) => [datum.id, datum]));
  const annotationById = new Map(chart.derivedAnnotations.map((annotation) => [annotation.id, annotation]));

  if (chart.type === 'metric-cards') {
    return (
      <div style={{display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0}}>
        <SceneTitle profile={profile} title={chart.title} />
        <div
          style={{
            alignContent: 'center',
            display: 'grid',
            flex: 1,
            gap: vertical ? 26 : 28,
            gridTemplateColumns: vertical ? 'repeat(2, minmax(0, 1fr))' : `repeat(${chart.cards.length}, minmax(0, 1fr))`,
            minHeight: 0,
          }}
        >
          {chart.cards.map((card, index) => {
            const datum = datumById.get(card.datumId);
            if (!datum) return null;
            const entrance = beatEntrance(frame, fps, 120 + index * 95);
            const annotation = card.annotationId ? annotationById.get(card.annotationId) : undefined;
            return (
              <div
                key={card.id}
                style={{
                  ...panelStyle(index % 2 === 0 ? theme.accents.primary : theme.accents.secondary),
                  alignItems: 'flex-start',
                  borderRadius: 30,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  minHeight: vertical ? 300 : 350,
                  opacity: entrance,
                  padding: vertical ? 34 : 32,
                  transform: `translateY(${(1 - entrance) * (22 + index * 3)}px) scale(${0.96 + entrance * 0.04})`,
                }}
              >
                <FittedText align="left" fontWeight={760} lineHeight={1.08} maxFontSize={vertical ? 31 : 28} maxHeight={78} maxLines={2} maxWidth={vertical ? 350 : 310} text={card.label} />
                <div style={{fontSize: vertical ? 66 : 58, fontWeight: 880, letterSpacing: -2, marginTop: 28}}>
                  {formatChartDatum({...datum, value: datum.value * valueProgress})}
                </div>
                {annotation ? (
                  <div
                    style={{
                      background: hexToRgba(theme.accents.secondary, 0.2),
                      border: `1px solid ${hexToRgba(theme.accents.secondary, 0.64)}`,
                      borderRadius: 999,
                      color: theme.accents.secondary,
                      fontSize: vertical ? 27 : 24,
                      fontWeight: 820,
                      marginTop: 24,
                      opacity: badgeProgress,
                      padding: '9px 18px',
                      transform: `scale(${0.88 + badgeProgress * 0.12})`,
                    }}
                  >
                    {annotation.label} {calculateChartAnnotation(chart, annotation).display}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const values = chart.data.map(({value}) => value);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  const range = Math.max(1e-9, maximum - minimum);
  const zeroPercent = ((0 - minimum) / range) * 100;
  const seriesColors = [theme.accents.primary, theme.accents.secondary, '#F8FAFC'];
  return (
    <div style={{display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0}}>
      <SceneTitle profile={profile} title={chart.title} />
      <div style={{display: 'flex', flex: 1, flexDirection: 'column', gap: 18, minHeight: 0}}>
        <div style={{display: 'flex', gap: 22, justifyContent: 'center', opacity: axisProgress}}>
          {chart.series.map((series, index) => (
            <div key={series.id} style={{alignItems: 'center', display: 'flex', fontSize: vertical ? 23 : 21, fontWeight: 720, gap: 9}}>
              <span style={{background: seriesColors[index], borderRadius: 99, height: 13, width: 13}} />
              {series.label}
            </div>
          ))}
        </div>
        <div
          style={{
            ...panelStyle(theme.accents.primary),
            borderRadius: 30,
            display: 'flex',
            flex: 1,
            flexDirection: vertical ? 'column' : 'row',
            gap: vertical ? 22 : 26,
            minHeight: 0,
            opacity: axisProgress,
            padding: vertical ? '30px 34px' : '36px 46px 28px',
          }}
        >
          {chart.categories.map((category) => (
            <div key={category.id} style={{display: 'flex', flex: 1, flexDirection: 'column', gap: 12, margin: '0 auto', maxWidth: vertical ? '100%' : 460, minHeight: 0, width: '100%'}}>
              {vertical ? (
                <FittedText fontWeight={700} lineHeight={1.05} maxFontSize={25} maxHeight={58} maxLines={2} maxWidth={820} text={category.label} />
              ) : null}
              <div style={{alignSelf: 'stretch', display: 'flex', flex: 1, flexDirection: vertical ? 'column' : 'row', gap: vertical ? 16 : 13, margin: vertical ? 'auto 0' : undefined, maxHeight: vertical ? 260 : undefined, minHeight: 0, position: 'relative'}}>
                <div
                  style={vertical ? {
                    background: 'rgba(226,232,240,0.45)',
                    height: 2,
                    left: `${zeroPercent}%`,
                    position: 'absolute',
                    top: 0,
                    width: 2,
                  } : {
                    background: 'rgba(226,232,240,0.45)',
                    bottom: `${zeroPercent}%`,
                    height: 2,
                    left: 0,
                    position: 'absolute',
                    width: '100%',
                  }}
                />
                {category.values.map((reference, index) => {
                  const datum = datumById.get(reference.datumId);
                  if (!datum) return null;
                  const value = datum.value * valueProgress;
                  const magnitude = Math.abs(value) / range * 100;
                  const offset = ((Math.min(value, 0) - minimum) / range) * 100;
                  return vertical ? (
                    <div key={datum.id} style={{alignItems: 'center', display: 'flex', flex: 1, position: 'relative'}}>
                      <div style={{background: seriesColors[index], borderRadius: '0 10px 10px 0', height: 32, left: `${offset}%`, position: 'absolute', width: `${magnitude}%`}} />
                      <span style={{fontSize: 19, fontWeight: 780, left: magnitude < 65 ? `${offset + magnitude + 2}%` : undefined, maxWidth: '46%', position: 'absolute', right: magnitude >= 65 ? '2%' : undefined, textAlign: magnitude >= 65 ? 'right' : 'left'}}>{formatChartDatum(datum)}</span>
                    </div>
                  ) : (
                    <div key={datum.id} style={{display: 'flex', flex: 1, justifyContent: 'center', position: 'relative'}}>
                      <div style={{background: seriesColors[index], borderRadius: value >= 0 ? '10px 10px 0 0' : '0 0 10px 10px', bottom: `${value >= 0 ? zeroPercent : offset}%`, height: `${magnitude}%`, maxWidth: 90, position: 'absolute', width: '70%'}} />
                      <span style={{bottom: `${Math.min(94, (value >= 0 ? zeroPercent + magnitude : offset) + 1)}%`, fontSize: 18, fontWeight: 780, position: 'absolute'}}>{formatChartDatum(datum)}</span>
                    </div>
                  );
                })}
              </div>
              {!vertical ? (
                <FittedText fontWeight={700} lineHeight={1.05} maxFontSize={22} maxHeight={54} maxLines={2} maxWidth={250} text={category.label} />
              ) : null}
            </div>
          ))}
        </div>
        <div style={{display: 'flex', gap: 12, justifyContent: 'center', minHeight: 52}}>
          {chart.derivedAnnotations.map((annotation) => (
            <div key={annotation.id} style={{background: hexToRgba(theme.accents.secondary, 0.2), border: `1px solid ${hexToRgba(theme.accents.secondary, 0.7)}`, borderRadius: 999, color: theme.accents.secondary, fontSize: vertical ? 25 : 22, fontWeight: 820, opacity: badgeProgress, padding: '9px 18px', transform: `translateY(${(1 - badgeProgress) * 12}px)`}}>
              {annotation.label} {calculateChartAnnotation(chart, annotation).display}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const CinematicSceneFrame = ({
  children,
  scene,
}: {
  children: ReactNode;
  scene: TimedNarrationScene;
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const visibility = sceneEntranceExit(frame, fps, scene.durationMs);
  return (
    <AbsoluteFill
      style={{
        opacity: visibility,
        transform: `translateY(${(1 - visibility) * 10}px) scale(${0.992 + visibility * 0.008})`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

export const NarratedVisualLayer = ({
  contentTopInset,
  fps,
  foregroundAssets,
  motionAssets,
  palette,
  profile,
  scene,
  technologyIcons,
}: {
  contentTopInset: number;
  fps: number;
  foregroundAssets: Record<string, string>;
  motionAssets: Record<string, SelectedMotionAsset>;
  palette: VideoPalette;
  profile: RenderProfile;
  scene: TimedNarrationScene;
  technologyIcons: Record<string, TechnologyBrandIcon>;
}) => {
  if (scene.visual.kind === 'diagram') {
    const clip: VisualClip = {
      id: scene.id,
      durationMs: scene.durationMs,
      template: scene.template,
      title: scene.title,
      primaryItems: scene.primaryItems,
      secondaryItems: scene.secondaryItems,
      leftLabel: scene.leftLabel,
      rightLabel: scene.rightLabel,
      reason: scene.reason,
      primaryItemTimings: scene.primaryItemTimings.map(({startMs}) => ({startMs})),
      secondaryItemTimings: scene.secondaryItemTimings.map(({startMs}) => ({startMs})),
    };
    return (
      <CinematicSceneFrame scene={scene}>
        <AnimationClip
          background="transparent"
          clip={clip}
          contentTopInset={contentTopInset}
          fps={fps}
          palette={palette}
          profile={profile}
          technologyIcons={technologyIcons}
        />
      </CinematicSceneFrame>
    );
  }

  const content = (() => {
    switch (scene.visual.kind) {
      case 'agent-workflow':
        return <AgentWorkflow motionAssets={motionAssets} palette={palette} profile={profile} scene={scene} />;
      case 'brand-showcase':
        return <BrandShowcase palette={palette} profile={profile} scene={scene} />;
      case 'network-map':
        return <NetworkMap palette={palette} profile={profile} scene={scene} />;
      case 'metric-focus':
        return <MetricFocus palette={palette} profile={profile} scene={scene} />;
      case 'icon-spotlight':
        return <IconSpotlight motionAssets={motionAssets} palette={palette} profile={profile} scene={scene} />;
      case 'image-focus':
        return <ImageFocus foregroundAssets={foregroundAssets} palette={palette} profile={profile} scene={scene} />;
      case 'data-visualization':
        return <DataVisualizationView palette={palette} profile={profile} scene={scene} />;
    }
  })();

  return (
    <CinematicSceneFrame scene={scene}>
      <SceneCanvas contentTopInset={contentTopInset} profile={profile}>
        <TechnologyIconsProvider icons={technologyIcons}>
          {content}
        </TechnologyIconsProvider>
      </SceneCanvas>
    </CinematicSceneFrame>
  );
};
