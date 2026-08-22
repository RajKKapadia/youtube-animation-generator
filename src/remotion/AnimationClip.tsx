import type {CSSProperties, ReactNode} from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type {AnimationClip as AnimationClipSpec, RenderInput} from '../types.js';

const COLORS = {
  ink: '#F8FAFC',
  muted: '#CBD5E1',
  panel: 'rgba(15, 23, 42, 0.94)',
  panelLight: 'rgba(30, 41, 59, 0.94)',
  blue: '#38BDF8',
  violet: '#A78BFA',
  green: '#34D399',
  border: 'rgba(148, 163, 184, 0.32)',
};

const clamp = {
  extrapolateLeft: 'clamp' as const,
  extrapolateRight: 'clamp' as const,
};

const useClipOpacity = (): number => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  if (durationInFrames <= 2) {
    return 1;
  }

  const fadeFrames = Math.min(
    15,
    Math.max(1, Math.floor((durationInFrames - 1) / 4)),
  );
  const fadeIn = interpolate(frame, [0, fadeFrames], [0, 1], clamp);
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 1 - fadeFrames, durationInFrames - 1],
    [1, 0],
    clamp,
  );

  return Math.min(fadeIn, fadeOut);
};

const useEntrance = (delay: number): number => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return spring({
    frame: frame - delay,
    fps,
    config: {damping: 18, stiffness: 150, mass: 0.8},
  });
};

const titleStyle: CSSProperties = {
  color: COLORS.ink,
  fontSize: 66,
  fontWeight: 800,
  letterSpacing: -2,
  lineHeight: 1.05,
  margin: 0,
  maxWidth: 1500,
  textAlign: 'center',
  textShadow: '0 12px 34px rgba(0,0,0,0.34)',
};

const ClipCanvas = ({children}: {children: ReactNode}) => {
  const opacity = useClipOpacity();
  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        display: 'flex',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        justifyContent: 'center',
        opacity,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

const Header = ({title}: {title: string}) => {
  const entrance = useEntrance(2);
  return (
    <h1
      style={{
        ...titleStyle,
        opacity: entrance,
        transform: `translateY(${(1 - entrance) * 28}px)`,
      }}
    >
      {title}
    </h1>
  );
};

const NodeCard = ({label, index}: {label: string; index: number}) => {
  const entrance = useEntrance(12 + index * 18);
  return (
    <div
      style={{
        alignItems: 'center',
        background: COLORS.panel,
        border: `2px solid ${COLORS.border}`,
        borderRadius: 24,
        boxShadow: '0 24px 55px rgba(0,0,0,0.36)',
        color: COLORS.ink,
        display: 'flex',
        fontSize: 32,
        fontWeight: 750,
        height: 150,
        justifyContent: 'center',
        lineHeight: 1.15,
        opacity: entrance,
        padding: '0 24px',
        textAlign: 'center',
        transform: `scale(${0.84 + entrance * 0.16})`,
        width: 230,
      }}
    >
      {label}
    </div>
  );
};

const FlowArrow = ({index}: {index: number}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [24 + index * 18, 40 + index * 18], [0, 1], clamp);
  return (
    <div style={{height: 44, position: 'relative', width: 86}}>
      <div
        style={{
          background: `linear-gradient(90deg, ${COLORS.blue}, ${COLORS.violet})`,
          borderRadius: 999,
          height: 6,
          left: 0,
          position: 'absolute',
          top: 19,
          transform: `scaleX(${progress})`,
          transformOrigin: 'left center',
          width: 69,
        }}
      />
      <div
        style={{
          borderBottom: '13px solid transparent',
          borderLeft: `18px solid ${COLORS.violet}`,
          borderTop: '13px solid transparent',
          opacity: progress,
          position: 'absolute',
          right: 0,
          top: 9,
          transform: `translateX(${(1 - progress) * -16}px)`,
        }}
      />
    </div>
  );
};

const ProcessFlow = ({clip}: {clip: AnimationClipSpec}) => (
  <ClipCanvas>
    <div
      style={{
        alignItems: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: 115,
        width: 1740,
      }}
    >
      <Header title={clip.title} />
      <div style={{alignItems: 'center', display: 'flex', justifyContent: 'center'}}>
        {clip.primaryItems.map((item, index) => (
          <div key={`${item}-${index}`} style={{alignItems: 'center', display: 'flex'}}>
            <NodeCard index={index} label={item} />
            {index < clip.primaryItems.length - 1 ? <FlowArrow index={index} /> : null}
          </div>
        ))}
      </div>
    </div>
  </ClipCanvas>
);

const ComparisonColumn = ({
  accent,
  items,
  label,
  side,
}: {
  accent: string;
  items: string[];
  label: string;
  side: number;
}) => {
  const entrance = useEntrance(12 + side * 8);
  return (
    <div
      style={{
        background: COLORS.panel,
        border: `2px solid ${COLORS.border}`,
        borderRadius: 30,
        boxShadow: '0 28px 70px rgba(0,0,0,0.38)',
        minHeight: 500,
        opacity: entrance,
        overflow: 'hidden',
        transform: `translateX(${(1 - entrance) * (side === 0 ? -60 : 60)}px)`,
        width: 720,
      }}
    >
      <div
        style={{
          background: accent,
          color: '#07111F',
          fontSize: 42,
          fontWeight: 850,
          padding: '30px 42px',
          textAlign: 'center',
        }}
      >
        {label}
      </div>
      <div style={{display: 'flex', flexDirection: 'column', gap: 25, padding: '42px 52px'}}>
        {items.map((item, index) => (
          <ComparisonItem
            accent={accent}
            delay={30 + side * 7 + index * 10}
            item={item}
            key={`${item}-${index}`}
          />
        ))}
      </div>
    </div>
  );
};

const ComparisonItem = ({
  accent,
  delay,
  item,
}: {
  accent: string;
  delay: number;
  item: string;
}) => {
  const entrance = useEntrance(delay);
  return (
    <div
      style={{
        alignItems: 'flex-start',
        color: COLORS.ink,
        display: 'flex',
        fontSize: 34,
        fontWeight: 600,
        gap: 20,
        lineHeight: 1.25,
        opacity: entrance,
        transform: `translateY(${(1 - entrance) * 18}px)`,
      }}
    >
      <span style={{color: accent, fontWeight: 900}}>●</span>
      <span>{item}</span>
    </div>
  );
};

const Comparison = ({clip}: {clip: AnimationClipSpec}) => (
  <ClipCanvas>
    <div style={{display: 'flex', flexDirection: 'column', gap: 60, width: 1580}}>
      <Header title={clip.title} />
      <div style={{display: 'flex', gap: 60, justifyContent: 'center'}}>
        <ComparisonColumn
          accent={COLORS.blue}
          items={clip.primaryItems}
          label={clip.leftLabel}
          side={0}
        />
        <ComparisonColumn
          accent={COLORS.violet}
          items={clip.secondaryItems}
          label={clip.rightLabel}
          side={1}
        />
      </div>
    </div>
  </ClipCanvas>
);

const Timeline = ({clip}: {clip: AnimationClipSpec}) => {
  const frame = useCurrentFrame();
  const lineProgress = interpolate(
    frame,
    [18, 18 + clip.primaryItems.length * 15],
    [0, 1],
    clamp,
  );

  return (
    <ClipCanvas>
      <div style={{display: 'flex', flexDirection: 'column', gap: 120, width: 1680}}>
        <Header title={clip.title} />
        <div style={{position: 'relative'}}>
          <div
            style={{
              background: COLORS.border,
              height: 7,
              left: 100,
              position: 'absolute',
              right: 100,
              top: 48,
            }}
          />
          <div
            style={{
              background: `linear-gradient(90deg, ${COLORS.blue}, ${COLORS.violet})`,
              borderRadius: 999,
              height: 7,
              left: 100,
              position: 'absolute',
              top: 48,
              transform: `scaleX(${lineProgress})`,
              transformOrigin: 'left center',
              width: 1480,
            }}
          />
          <div style={{display: 'flex', justifyContent: 'space-between', position: 'relative'}}>
            {clip.primaryItems.map((item, index) => (
              <TimelineItem index={index} item={item} key={`${item}-${index}`} />
            ))}
          </div>
        </div>
      </div>
    </ClipCanvas>
  );
};

const TimelineItem = ({index, item}: {index: number; item: string}) => {
  const entrance = useEntrance(18 + index * 15);
  return (
    <div
      style={{
        alignItems: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
        opacity: entrance,
        transform: `translateY(${(1 - entrance) * 24}px)`,
        width: 260,
      }}
    >
      <div
        style={{
          alignItems: 'center',
          background: index % 2 === 0 ? COLORS.blue : COLORS.violet,
          border: '8px solid rgba(15, 23, 42, 0.95)',
          borderRadius: 999,
          color: '#07111F',
          display: 'flex',
          fontSize: 34,
          fontWeight: 900,
          height: 100,
          justifyContent: 'center',
          width: 100,
        }}
      >
        {index + 1}
      </div>
      <div
        style={{
          background: COLORS.panel,
          border: `2px solid ${COLORS.border}`,
          borderRadius: 22,
          color: COLORS.ink,
          fontSize: 29,
          fontWeight: 700,
          lineHeight: 1.2,
          minHeight: 126,
          padding: '27px 22px',
          textAlign: 'center',
          width: 250,
        }}
      >
        {item}
      </div>
    </div>
  );
};

const Callout = ({clip}: {clip: AnimationClipSpec}) => {
  const entrance = useEntrance(8);
  return (
    <ClipCanvas>
      <div
        style={{
          background: COLORS.panel,
          border: `3px solid ${COLORS.blue}`,
          borderRadius: 38,
          boxShadow: '0 30px 90px rgba(0,0,0,0.42)',
          maxWidth: 1380,
          opacity: entrance,
          overflow: 'hidden',
          transform: `scale(${0.82 + entrance * 0.18})`,
        }}
      >
        <div
          style={{
            background: `linear-gradient(90deg, ${COLORS.blue}, ${COLORS.violet})`,
            height: 12,
          }}
        />
        <div style={{padding: '70px 90px 78px', textAlign: 'center'}}>
          <Header title={clip.title} />
          <div
            style={{
              color: COLORS.muted,
              display: 'flex',
              flexDirection: 'column',
              fontSize: 40,
              fontWeight: 600,
              gap: 20,
              lineHeight: 1.28,
              marginTop: 42,
            }}
          >
            {clip.primaryItems.map((item, index) => (
              <CalloutItem delay={24 + index * 10} item={item} key={`${item}-${index}`} />
            ))}
          </div>
        </div>
      </div>
    </ClipCanvas>
  );
};

const CalloutItem = ({delay, item}: {delay: number; item: string}) => {
  const entrance = useEntrance(delay);
  return (
    <div
      style={{
        opacity: entrance,
        transform: `translateY(${(1 - entrance) * 20}px)`,
      }}
    >
      {item}
    </div>
  );
};

export const AnimationClip = ({background, clip}: RenderInput) => {
  const content = (() => {
    switch (clip.template) {
      case 'process-flow':
        return <ProcessFlow clip={clip} />;
      case 'comparison':
        return <Comparison clip={clip} />;
      case 'timeline':
        return <Timeline clip={clip} />;
      case 'callout':
        return <Callout clip={clip} />;
    }
  })();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: background === 'green' ? '#00FF00' : 'transparent',
      }}
    >
      {content}
    </AbsoluteFill>
  );
};
