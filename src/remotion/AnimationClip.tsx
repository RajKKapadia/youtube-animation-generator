import {createContext, useContext, type CSSProperties, type ReactNode} from 'react';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type {RenderInput, VisualClip as AnimationClipSpec} from '../types.js';
import {isVerticalDimensions, RENDER_PROFILES} from '../render-profile.js';
import type {RenderProfile} from '../types.js';
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

const RenderProfileContext = createContext<RenderProfile>(
  RENDER_PROFILES['16:9'],
);

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
  const {height, width} = useVideoConfig();
  const vertical = isVerticalDimensions(width, height);
  const profile = useContext(RenderProfileContext);
  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        display: 'flex',
        fontFamily: RENDER_FONT_FAMILY,
        justifyContent: 'center',
        opacity,
        boxSizing: 'border-box',
        padding: vertical
          ? `${profile.safeArea.top}px ${profile.safeArea.right}px ${profile.safeArea.bottom}px ${profile.safeArea.left}px`
          : 0,
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
  const {height, width} = useVideoConfig();
  const vertical = isVerticalDimensions(width, height);
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
        letterSpacing={vertical ? -1 : -2}
        lineHeight={1.05}
        maxFontSize={vertical ? 62 : 66}
        maxHeight={vertical ? 176 : 150}
        maxLines={vertical ? 3 : 2}
        maxWidth={vertical ? 850 : 1400}
        text={title}
      />
    </h1>
  );
};

const NodeCard = ({
  delay,
  label,
  vertical = false,
}: {
  delay: number;
  label: string;
  vertical?: boolean;
}) => {
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
        height: vertical ? 142 : 204,
        justifyContent: 'center',
        opacity: entrance,
        padding: vertical ? '24px 32px 16px 96px' : '34px 18px 14px',
        position: 'relative',
        textAlign: vertical ? 'left' : 'center',
        transform: `scale(${0.84 + entrance * 0.16})`,
        width: vertical ? 720 : 230,
      }}
    >
      <div
        style={{
          left: vertical ? 34 : '50%',
          position: 'absolute',
          top: vertical ? '50%' : -27,
          transform: vertical ? 'translateY(-50%)' : 'translateX(-50%)',
        }}
      >
        <TechnologyBadge label={label} size={54} />
      </div>
      <FittedText
        fontWeight={750}
        lineHeight={1.15}
        align={vertical ? 'left' : 'center'}
        maxFontSize={vertical ? 36 : 29}
        maxHeight={vertical ? 106 : 145}
        maxLines={vertical ? 3 : 5}
        maxWidth={vertical ? 580 : 194}
        text={label}
      />
    </div>
  );
};

const VerticalFlowArrow = ({
  endFrame,
  startFrame,
}: {
  endFrame: number;
  startFrame: number;
}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [startFrame, endFrame], [0, 1], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  return (
    <div style={{height: 52, position: 'relative', width: 44}}>
      <div
        style={{
          background: `linear-gradient(180deg, ${COLORS.blue}, ${COLORS.violet})`,
          borderRadius: 999,
          height: 35,
          left: 19,
          position: 'absolute',
          top: 0,
          transform: `scaleY(${progress})`,
          transformOrigin: 'top center',
          width: 6,
        }}
      />
      <div
        style={{
          borderLeft: '13px solid transparent',
          borderRight: '13px solid transparent',
          borderTop: `18px solid ${COLORS.violet}`,
          bottom: 0,
          left: 9,
          opacity: progress,
          position: 'absolute',
          transform: `translateY(${(1 - progress) * -12}px)`,
        }}
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
  const {durationInFrames, fps, height, width} = useVideoConfig();
  const vertical = isVerticalDimensions(width, height);
  const revealFrames = createRevealSchedule({
    durationInFrames,
    fps,
    itemStartMs: clip.primaryItemTimings?.map((timing) => timing.startMs),
    total: clip.primaryItems.length,
  });

  return (
    <ClipCanvas>
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: vertical ? 54 : 92,
          width: vertical ? 936 : 1740,
        }}
      >
        <Header title={clip.title} />
        <div
          style={{
            alignItems: 'center',
            display: 'flex',
            flexDirection: vertical ? 'column' : 'row',
            justifyContent: 'center',
          }}
        >
          {clip.primaryItems.map((item, index) => {
            const nextFrame = revealFrames[index + 1];
            const connection =
              nextFrame === undefined
                ? null
                : createConnectionWindow(revealFrames[index] ?? 0, nextFrame, fps);
            return (
              <div
                key={`${item}-${index}`}
                style={{
                  alignItems: 'center',
                  display: 'flex',
                  flexDirection: vertical ? 'column' : 'row',
                }}
              >
                <NodeCard
                  delay={revealFrames[index] ?? 0}
                  label={item}
                  vertical={vertical}
                />
                {connection ? (
                  vertical ? (
                    <VerticalFlowArrow
                      endFrame={connection.end}
                      startFrame={connection.start}
                    />
                  ) : (
                    <FlowArrow endFrame={connection.end} startFrame={connection.start} />
                  )
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
  vertical,
}: {
  accent: string;
  columnDelay: number;
  itemDelays: number[];
  items: string[];
  label: string;
  side: number;
  vertical: boolean;
}) => {
  const entrance = useEntrance(columnDelay);
  return (
    <div
      style={{
        background: COLORS.panel,
        border: `2px solid ${COLORS.border}`,
        borderRadius: 30,
        boxShadow: '0 28px 70px rgba(0,0,0,0.38)',
        minHeight: vertical ? 420 : 500,
        opacity: entrance,
        overflow: 'hidden',
        transform: vertical
          ? `translateY(${(1 - entrance) * 36}px)`
          : `translateX(${(1 - entrance) * (side === 0 ? -60 : 60)}px)`,
        width: vertical ? 936 : 720,
      }}
    >
      <div
        style={{
          alignItems: 'center',
          background: accent,
          color: '#07111F',
          display: 'flex',
          justifyContent: 'center',
          minHeight: vertical ? 88 : 104,
          padding: vertical ? '14px 36px' : '22px 42px',
          textAlign: 'center',
        }}
      >
        <FittedText
          fontWeight={850}
          lineHeight={1.08}
          maxFontSize={vertical ? 38 : 42}
          maxHeight={vertical ? 70 : 84}
          maxLines={2}
          maxWidth={vertical ? 820 : 620}
          text={label}
        />
      </div>
      <div
        style={{
          display: vertical ? 'grid' : 'flex',
          flexDirection: 'column',
          gap: vertical ? 18 : 25,
          gridTemplateColumns: vertical && items.length > 3 ? '1fr 1fr' : '1fr',
          padding: vertical ? '28px 36px 32px' : '42px 52px',
        }}
      >
        {items.map((item, index) => (
          <ComparisonItem
            accent={accent}
            compact={vertical && items.length > 3}
            delay={itemDelays[index] ?? columnDelay}
            item={item}
            key={`${item}-${index}`}
            vertical={vertical}
          />
        ))}
      </div>
    </div>
  );
};

const ComparisonItem = ({
  accent,
  compact,
  delay,
  item,
  vertical,
}: {
  accent: string;
  compact: boolean;
  delay: number;
  item: string;
  vertical: boolean;
}) => {
  const entrance = useEntrance(delay);
  return (
    <div
      style={{
        alignItems: 'center',
        borderLeft: `5px solid ${accent}`,
        color: COLORS.ink,
        display: 'flex',
        gap: vertical ? 14 : 20,
        opacity: entrance,
        minHeight: vertical ? 80 : undefined,
        paddingLeft: vertical ? 14 : 18,
        transform: `translateY(${(1 - entrance) * 18}px)`,
      }}
    >
      <TechnologyBadge label={item} size={vertical ? 36 : 42} />
      <FittedText
        align="left"
        fontWeight={600}
        lineHeight={1.2}
        maxFontSize={vertical ? 29 : 34}
        maxHeight={vertical ? 76 : 88}
        maxLines={3}
        maxWidth={compact ? 340 : vertical ? 760 : 500}
        text={item}
      />
    </div>
  );
};

const Comparison = ({clip}: {clip: AnimationClipSpec}) => {
  const {durationInFrames, fps, height, width} = useVideoConfig();
  const vertical = isVerticalDimensions(width, height);
  const rowCount = Math.max(clip.primaryItems.length, clip.secondaryItems.length);
  const fallbackFrames = createRevealSchedule({
    durationInFrames,
    fps,
    total: rowCount + 1,
  });
  const fallbackItemDelays = fallbackFrames.slice(1);
  const primaryItemDelays = clip.primaryItemTimings
    ? createRevealSchedule({
        durationInFrames,
        fps,
        itemStartMs: clip.primaryItemTimings.map((timing) => timing.startMs),
        total: clip.primaryItems.length,
      })
    : fallbackItemDelays;
  const secondaryItemDelays = clip.secondaryItemTimings
    ? createRevealSchedule({
        durationInFrames,
        fps,
        itemStartMs: clip.secondaryItemTimings.map((timing) => timing.startMs),
        total: clip.secondaryItems.length,
      })
    : fallbackItemDelays;
  const hasSpeechTiming =
    clip.primaryItemTimings !== undefined ||
    clip.secondaryItemTimings !== undefined;
  const firstItemDelay = Math.min(
    ...[...primaryItemDelays, ...secondaryItemDelays],
  );
  const columnDelay = hasSpeechTiming && Number.isFinite(firstItemDelay)
    ? Math.max(0, firstItemDelay - getBeatTransitionFrames(fps))
    : (fallbackFrames[0] ?? 0);

  return (
    <ClipCanvas>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: vertical ? 48 : 60,
          width: vertical ? 936 : 1580,
        }}
      >
        <Header title={clip.title} />
        <div
          style={{
            display: 'flex',
            flexDirection: vertical ? 'column' : 'row',
            gap: vertical ? 34 : 60,
            justifyContent: 'center',
          }}
        >
          <ComparisonColumn
            accent={COLORS.blue}
            columnDelay={columnDelay}
            itemDelays={primaryItemDelays}
            items={clip.primaryItems}
            label={clip.leftLabel}
            side={0}
            vertical={vertical}
          />
          <ComparisonColumn
            accent={COLORS.violet}
            columnDelay={columnDelay}
            itemDelays={secondaryItemDelays}
            items={clip.secondaryItems}
            label={clip.rightLabel}
            side={1}
            vertical={vertical}
          />
        </div>
      </div>
    </ClipCanvas>
  );
};

const Timeline = ({clip}: {clip: AnimationClipSpec}) => {
  const frame = useCurrentFrame();
  const {durationInFrames, fps, height, width} = useVideoConfig();
  const vertical = isVerticalDimensions(width, height);
  const revealFrames = createRevealSchedule({
    durationInFrames,
    fps,
    itemStartMs: clip.primaryItemTimings?.map((timing) => timing.startMs),
    total: clip.primaryItems.length,
  });
  const lineProgress = createSteppedProgress({
    frame,
    revealFrames,
    transitionFrames: getBeatTransitionFrames(fps),
  });

  if (vertical) {
    const rowHeight = 188;
    const lineHeight = Math.max(rowHeight, rowHeight * clip.primaryItems.length - 70);
    return (
      <ClipCanvas>
        <div style={{display: 'flex', flexDirection: 'column', gap: 48, width: 936}}>
          <Header title={clip.title} />
          <div style={{position: 'relative'}}>
            <div
              style={{
                background: COLORS.border,
                height: lineHeight,
                left: 465,
                position: 'absolute',
                top: 34,
                width: 7,
              }}
            />
            <div
              style={{
                background: `linear-gradient(180deg, ${COLORS.blue}, ${COLORS.violet})`,
                borderRadius: 999,
                height: lineHeight,
                left: 465,
                position: 'absolute',
                top: 34,
                transform: `scaleY(${lineProgress})`,
                transformOrigin: 'top center',
                width: 7,
              }}
            />
            <div style={{display: 'flex', flexDirection: 'column', position: 'relative'}}>
              {clip.primaryItems.map((item, index) => (
                <TimelineItem
                  delay={revealFrames[index] ?? 0}
                  index={index}
                  item={item}
                  key={`${item}-${index}`}
                  vertical
                />
              ))}
            </div>
          </div>
        </div>
      </ClipCanvas>
    );
  }

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
                vertical={false}
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
  vertical,
}: {
  delay: number;
  index: number;
  item: string;
  vertical: boolean;
}) => {
  const entrance = useEntrance(delay);
  if (vertical) {
    const onLeft = index % 2 === 0;
    return (
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          height: 188,
          justifyContent: onLeft ? 'flex-start' : 'flex-end',
          opacity: entrance,
          position: 'relative',
          transform: `translateY(${(1 - entrance) * 20}px)`,
          width: 936,
        }}
      >
        <div
          style={{
            alignItems: 'center',
            background: index % 2 === 0 ? COLORS.blue : COLORS.violet,
            border: '7px solid rgba(15, 23, 42, 0.98)',
            borderRadius: 999,
            color: '#07111F',
            display: 'flex',
            fontSize: 27,
            fontWeight: 900,
            height: 78,
            justifyContent: 'center',
            left: 429,
            position: 'absolute',
            width: 78,
            zIndex: 2,
          }}
        >
          {index + 1}
        </div>
        <div
          style={{
            alignItems: 'center',
            background: COLORS.panel,
            border: `2px solid ${COLORS.border}`,
            borderRadius: 22,
            color: COLORS.ink,
            display: 'flex',
            gap: 14,
            height: 146,
            justifyContent: 'center',
            padding: '18px 22px',
            textAlign: 'center',
            width: 382,
          }}
        >
          <TechnologyBadge label={item} size={40} />
          <FittedText
            align="left"
            fontWeight={700}
            lineHeight={1.15}
            maxFontSize={27}
            maxHeight={104}
            maxLines={4}
            maxWidth={276}
            text={item}
          />
        </div>
      </div>
    );
  }

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
  const {durationInFrames, fps, height, width} = useVideoConfig();
  const vertical = isVerticalDimensions(width, height);
  const fallbackFrames = createRevealSchedule({
    durationInFrames,
    fps,
    total: clip.primaryItems.length + 1,
  });
  const itemDelays = clip.primaryItemTimings
    ? createRevealSchedule({
        durationInFrames,
        fps,
        itemStartMs: clip.primaryItemTimings.map((timing) => timing.startMs),
        total: clip.primaryItems.length,
      })
    : fallbackFrames.slice(1);
  const firstItemDelay = itemDelays[0];
  const containerDelay = clip.primaryItemTimings && firstItemDelay !== undefined
    ? Math.max(0, firstItemDelay - getBeatTransitionFrames(fps))
    : (fallbackFrames[0] ?? 0);
  const entrance = useEntrance(containerDelay);
  return (
    <ClipCanvas>
      <div
        style={{
          background: COLORS.panel,
          border: `3px solid ${COLORS.blue}`,
          borderRadius: 38,
          boxShadow: '0 30px 90px rgba(0,0,0,0.42)',
          maxWidth: vertical ? 936 : 1380,
          width: vertical ? 936 : undefined,
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
        <div
          style={{
            padding: vertical ? '92px 64px 108px' : '70px 90px 78px',
            textAlign: 'center',
          }}
        >
          <Header floating={false} title={clip.title} />
          <div
            style={{
              color: COLORS.muted,
              display: 'flex',
              flexDirection: 'column',
              gap: vertical ? 34 : 20,
              marginTop: vertical ? 74 : 42,
            }}
          >
            {clip.primaryItems.map((item, index) => (
              <CalloutItem
                delay={itemDelays[index] ?? containerDelay}
                item={item}
                key={`${item}-${index}`}
                vertical={vertical}
              />
            ))}
          </div>
        </div>
      </div>
    </ClipCanvas>
  );
};

const CalloutItem = ({
  delay,
  item,
  vertical,
}: {
  delay: number;
  item: string;
  vertical: boolean;
}) => {
  const entrance = useEntrance(delay);
  return (
    <div
      style={{
        alignItems: 'center',
        display: 'flex',
        gap: vertical ? 22 : 18,
        justifyContent: 'center',
        opacity: entrance,
        transform: `translateY(${(1 - entrance) * 20}px)`,
      }}
    >
      <TechnologyBadge label={item} size={vertical ? 50 : 44} />
      <FittedText
        fontWeight={600}
        lineHeight={1.2}
        align={vertical ? 'left' : 'center'}
        maxFontSize={vertical ? 38 : 40}
        maxHeight={vertical ? 112 : 92}
        maxLines={vertical ? 4 : 3}
        maxWidth={vertical ? 700 : 1060}
        style={{color: COLORS.muted}}
        text={item}
      />
    </div>
  );
};

export const AnimationClip = ({
  background,
  clip,
  profile,
  technologyIcons,
}: RenderInput) => {
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
        backgroundColor:
          background === 'green'
            ? '#00FF00'
            : background === 'dark'
              ? '#020617'
              : 'transparent',
      }}
    >
      <RenderProfileContext.Provider value={profile}>
        <TechnologyIconsProvider icons={technologyIcons}>
          {content}
        </TechnologyIconsProvider>
      </RenderProfileContext.Provider>
    </AbsoluteFill>
  );
};
