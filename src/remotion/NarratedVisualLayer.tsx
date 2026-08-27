import type {CSSProperties, ReactNode} from 'react';
import {
  AbsoluteFill,
  Easing,
  interpolate,
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

const clamp = {
  extrapolateLeft: 'clamp' as const,
  extrapolateRight: 'clamp' as const,
};

const itemEntrance = (frame: number, fps: number, startMs: number): number => {
  const start = Math.round((startMs / 1_000) * fps);
  return interpolate(frame, [start, start + Math.max(5, Math.round(fps * 0.34))], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
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
          const drift = scene.visual.motion === 'drift' ? Math.sin(frame * 0.025 + index * 1.3) * 7 : 0;
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
            const pulseX = mapWidth / 2 + (x - mapWidth / 2) * edgeProgress;
            const pulseY = mapHeight / 2 + (y - mapHeight / 2) * edgeProgress;
            return (
              <g key={`edge-${index}`} opacity={entrance}>
                <line
                  stroke={hexToRgba(theme.accents.primary, 0.54)}
                  strokeDasharray="12 14"
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
  const drift = scene.visual.motion === 'drift' ? Math.sin(frame * 0.028) * 8 : 0;
  const pulse = scene.visual.motion === 'pulse' ? 1 + Math.sin(frame * 0.045) * 0.018 : 1;
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
                top: `${20 + ((frame % (fps * 3)) / (fps * 3)) * 60}%`,
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

export const NarratedVisualLayer = ({
  contentTopInset,
  fps,
  motionAssets,
  palette,
  profile,
  scene,
  technologyIcons,
}: {
  contentTopInset: number;
  fps: number;
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
      <AnimationClip
        background="transparent"
        clip={clip}
        contentTopInset={contentTopInset}
        fps={fps}
        palette={palette}
        profile={profile}
        technologyIcons={technologyIcons}
      />
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
    }
  })();

  return (
    <SceneCanvas contentTopInset={contentTopInset} profile={profile}>
      <TechnologyIconsProvider icons={technologyIcons}>
        {content}
      </TechnologyIconsProvider>
    </SceneCanvas>
  );
};
