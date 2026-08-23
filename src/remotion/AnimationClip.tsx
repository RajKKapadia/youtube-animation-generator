import type {CSSProperties, ReactNode} from 'react';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type {AnimationClip as AnimationClipSpec, RenderInput} from '../types.js';
import {FittedText, RENDER_FONT_FAMILY} from './FittedText.js';
import {
  TechnologyBadge,
  TechnologyIconsProvider,
} from './TechnologyBadge.js';
import {
  createConnectionWindow,
  createRevealSchedule,
  createSteppedProgress,
  getBeatTransitionFrames,
} from './timing.js';

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
  return interpolate(
    frame,
    [delay, delay + getBeatTransitionFrames(fps)],
    [0, 1],
    {...clamp, easing: Easing.out(Easing.cubic)},
  );
};

const titleStyle: CSSProperties = {
  color: COLORS.ink,
  display: 'flex',
  justifyContent: 'center',
  margin: 0,
  maxWidth: 1500,
  textAlign: 'center',
  textShadow: '0 3px 0 rgba(2,6,23,0.96), 0 14px 38px rgba(0,0,0,0.48)',
  WebkitTextStroke: '2px rgba(2, 6, 23, 0.96)',
};

const floatingTitleStyle: CSSProperties = {
  background: 'rgba(2, 6, 23, 0.78)',
  border: '2px solid rgba(255, 255, 255, 0.24)',
  borderRadius: 26,
  boxShadow: '0 18px 50px rgba(2, 6, 23, 0.4)',
  padding: '18px 34px 22px',
};

const ClipCanvas = ({children}: {children: ReactNode}) => {
  const opacity = useClipOpacity();
  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        display: 'flex',
        fontFamily: RENDER_FONT_FAMILY,
        justifyContent: 'center',
        opacity,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

const Header = ({
  floating = true,
  title,
}: {
  floating?: boolean;
  title: string;
}) => {
  const entrance = useEntrance(2);
  return (
    <h1
      style={{
        ...titleStyle,
        ...(floating ? floatingTitleStyle : {}),
        opacity: entrance,
        transform: `translateY(${(1 - entrance) * 28}px)`,
      }}
    >
      <FittedText
        fontWeight={800}
        letterSpacing={-2}
        lineHeight={1.05}
        maxFontSize={66}
        maxHeight={150}
        maxLines={2}
        maxWidth={1400}
        text={title}
      />
    </h1>
  );
};

const NodeCard = ({delay, label}: {delay: number; label: string}) => {
  const entrance = useEntrance(delay);
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
        height: 204,
        justifyContent: 'center',
        opacity: entrance,
        padding: '34px 18px 14px',
        position: 'relative',
        textAlign: 'center',
        transform: `scale(${0.84 + entrance * 0.16})`,
        width: 230,
      }}
    >
      <div
        style={{
          left: '50%',
          position: 'absolute',
          top: -27,
          transform: 'translateX(-50%)',
        }}
      >
        <TechnologyBadge label={label} size={54} />
      </div>
      <FittedText
        fontWeight={750}
        lineHeight={1.15}
        maxFontSize={29}
        maxHeight={145}
        maxLines={5}
        maxWidth={194}
        text={label}
      />
    </div>
  );
};

const FlowArrow = ({endFrame, startFrame}: {endFrame: number; startFrame: number}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [startFrame, endFrame], [0, 1], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
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

const ProcessFlow = ({clip}: {clip: AnimationClipSpec}) => {
  const {durationInFrames, fps} = useVideoConfig();
  const revealFrames = createRevealSchedule({
    durationInFrames,
    fps,
    total: clip.primaryItems.length,
  });

  return (
    <ClipCanvas>
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: 92,
          width: 1740,
        }}
      >
        <Header title={clip.title} />
        <div style={{alignItems: 'center', display: 'flex', justifyContent: 'center'}}>
          {clip.primaryItems.map((item, index) => {
            const nextFrame = revealFrames[index + 1];
            const connection =
              nextFrame === undefined
                ? null
                : createConnectionWindow(revealFrames[index] ?? 0, nextFrame, fps);
            return (
              <div key={`${item}-${index}`} style={{alignItems: 'center', display: 'flex'}}>
                <NodeCard delay={revealFrames[index] ?? 0} label={item} />
                {connection ? (
                  <FlowArrow endFrame={connection.end} startFrame={connection.start} />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </ClipCanvas>
  );
};

const ComparisonColumn = ({
  accent,
  columnDelay,
  itemDelays,
  items,
  label,
  side,
}: {
  accent: string;
  columnDelay: number;
  itemDelays: number[];
  items: string[];
  label: string;
  side: number;
}) => {
  const entrance = useEntrance(columnDelay);
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
          alignItems: 'center',
          background: accent,
          color: '#07111F',
          display: 'flex',
          justifyContent: 'center',
          minHeight: 104,
          padding: '22px 42px',
          textAlign: 'center',
        }}
      >
        <FittedText
          fontWeight={850}
          lineHeight={1.08}
          maxFontSize={42}
          maxHeight={84}
          maxLines={2}
          maxWidth={620}
          text={label}
        />
      </div>
      <div style={{display: 'flex', flexDirection: 'column', gap: 25, padding: '42px 52px'}}>
        {items.map((item, index) => (
          <ComparisonItem
            accent={accent}
            delay={itemDelays[index] ?? columnDelay}
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
        alignItems: 'center',
        borderLeft: `5px solid ${accent}`,
        color: COLORS.ink,
        display: 'flex',
        gap: 20,
        opacity: entrance,
        paddingLeft: 18,
        transform: `translateY(${(1 - entrance) * 18}px)`,
      }}
    >
      <TechnologyBadge label={item} size={42} />
      <FittedText
        align="left"
        fontWeight={600}
        lineHeight={1.2}
        maxFontSize={34}
        maxHeight={88}
        maxLines={3}
        maxWidth={500}
        text={item}
      />
    </div>
  );
};

const Comparison = ({clip}: {clip: AnimationClipSpec}) => {
  const {durationInFrames, fps} = useVideoConfig();
  const rowCount = Math.max(clip.primaryItems.length, clip.secondaryItems.length);
  const revealFrames = createRevealSchedule({
    durationInFrames,
    fps,
    total: rowCount + 1,
  });
  const columnDelay = revealFrames[0] ?? 0;
  const itemDelays = revealFrames.slice(1);

  return (
    <ClipCanvas>
      <div style={{display: 'flex', flexDirection: 'column', gap: 60, width: 1580}}>
        <Header title={clip.title} />
        <div style={{display: 'flex', gap: 60, justifyContent: 'center'}}>
          <ComparisonColumn
            accent={COLORS.blue}
            columnDelay={columnDelay}
            itemDelays={itemDelays}
            items={clip.primaryItems}
            label={clip.leftLabel}
            side={0}
          />
          <ComparisonColumn
            accent={COLORS.violet}
            columnDelay={columnDelay}
            itemDelays={itemDelays}
            items={clip.secondaryItems}
            label={clip.rightLabel}
            side={1}
          />
        </div>
      </div>
    </ClipCanvas>
  );
};

const Timeline = ({clip}: {clip: AnimationClipSpec}) => {
  const frame = useCurrentFrame();
  const {durationInFrames, fps} = useVideoConfig();
  const revealFrames = createRevealSchedule({
    durationInFrames,
    fps,
    total: clip.primaryItems.length,
  });
  const lineProgress = createSteppedProgress({
    frame,
    revealFrames,
    transitionFrames: getBeatTransitionFrames(fps),
  });

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
              <TimelineItem
                delay={revealFrames[index] ?? 0}
                index={index}
                item={item}
                key={`${item}-${index}`}
              />
            ))}
          </div>
        </div>
      </div>
    </ClipCanvas>
  );
};

const TimelineItem = ({
  delay,
  index,
  item,
}: {
  delay: number;
  index: number;
  item: string;
}) => {
  const entrance = useEntrance(delay);
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
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          alignItems: 'center',
          justifyContent: 'center',
          height: 204,
          padding: '18px 22px',
          textAlign: 'center',
          width: 250,
        }}
      >
        <TechnologyBadge label={item} size={46} />
        <FittedText
          fontWeight={700}
          lineHeight={1.18}
          maxFontSize={29}
          maxHeight={104}
          maxLines={5}
          maxWidth={206}
          text={item}
        />
      </div>
    </div>
  );
};

const Callout = ({clip}: {clip: AnimationClipSpec}) => {
  const {durationInFrames, fps} = useVideoConfig();
  const revealFrames = createRevealSchedule({
    durationInFrames,
    fps,
    total: clip.primaryItems.length + 1,
  });
  const entrance = useEntrance(revealFrames[0] ?? 0);
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
          <Header floating={false} title={clip.title} />
          <div
            style={{
              color: COLORS.muted,
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
              marginTop: 42,
            }}
          >
            {clip.primaryItems.map((item, index) => (
              <CalloutItem
                delay={revealFrames[index + 1] ?? revealFrames[0] ?? 0}
                item={item}
                key={`${item}-${index}`}
              />
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
        alignItems: 'center',
        display: 'flex',
        gap: 18,
        justifyContent: 'center',
        opacity: entrance,
        transform: `translateY(${(1 - entrance) * 20}px)`,
      }}
    >
      <TechnologyBadge label={item} size={44} />
      <FittedText
        fontWeight={600}
        lineHeight={1.2}
        maxFontSize={40}
        maxHeight={92}
        maxLines={3}
        maxWidth={1060}
        style={{color: COLORS.muted}}
        text={item}
      />
    </div>
  );
};

export const AnimationClip = ({background, clip, technologyIcons}: RenderInput) => {
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
      <TechnologyIconsProvider icons={technologyIcons}>
        {content}
      </TechnologyIconsProvider>
    </AbsoluteFill>
  );
};
