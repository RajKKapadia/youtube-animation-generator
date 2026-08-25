import type {CSSProperties, ReactNode} from 'react';
import {AbsoluteFill} from 'remotion';
import type {
  PublishAccent,
  PublishCoverInput,
  PublishScene,
} from '../types.js';
import {FittedText, RENDER_FONT_FAMILY} from './FittedText.js';
import {
  TechnologyBadge,
  TechnologyIconsProvider,
} from './TechnologyBadge.js';

const ACCENTS: Record<PublishAccent, {bright: string; glow: string; soft: string}> = {
  cyan: {
    bright: '#22D3EE',
    glow: 'rgba(34, 211, 238, 0.46)',
    soft: 'rgba(34, 211, 238, 0.14)',
  },
  violet: {
    bright: '#A78BFA',
    glow: 'rgba(167, 139, 250, 0.46)',
    soft: 'rgba(167, 139, 250, 0.14)',
  },
  amber: {
    bright: '#FBBF24',
    glow: 'rgba(251, 191, 36, 0.44)',
    soft: 'rgba(251, 191, 36, 0.14)',
  },
  emerald: {
    bright: '#34D399',
    glow: 'rgba(52, 211, 153, 0.44)',
    soft: 'rgba(52, 211, 153, 0.14)',
  },
  rose: {
    bright: '#FB7185',
    glow: 'rgba(251, 113, 133, 0.44)',
    soft: 'rgba(251, 113, 133, 0.14)',
  },
};

const ItemCard = ({
  accent,
  compact,
  label,
}: {
  accent: ReturnType<typeof accentFor>;
  compact?: boolean;
  label: string;
}) => (
  <div
    style={{
      alignItems: 'center',
      background: 'linear-gradient(135deg, rgba(15,23,42,0.96), rgba(15,23,42,0.76))',
      border: `2px solid ${accent.soft}`,
      borderRadius: compact ? 20 : 24,
      boxShadow: '0 18px 38px rgba(2,6,23,0.34)',
      display: 'flex',
      gap: compact ? 14 : 18,
      minHeight: compact ? 92 : 116,
      padding: compact ? '14px 16px' : '17px 20px',
      width: '100%',
    }}
  >
    <TechnologyBadge label={label} size={compact ? 56 : 68} />
    <FittedText
      align="left"
      fontWeight={800}
      letterSpacing={-0.4}
      lineHeight={1.04}
      maxFontSize={compact ? 30 : 38}
      maxHeight={compact ? 60 : 78}
      maxLines={2}
      maxWidth={compact ? 220 : 330}
      style={{color: '#F8FAFC'}}
      text={label}
    />
  </div>
);

const accentFor = (accent: PublishAccent) => ACCENTS[accent];

const Panel = ({
  accent,
  children,
  style,
}: {
  accent: ReturnType<typeof accentFor>;
  children: ReactNode;
  style?: CSSProperties;
}) => (
  <div
    style={{
      background: 'rgba(2, 6, 23, 0.58)',
      border: '2px solid rgba(148,163,184,0.18)',
      borderRadius: 32,
      boxShadow: `0 28px 90px rgba(2,6,23,0.5), 0 0 60px ${accent.soft}`,
      padding: 24,
      ...style,
    }}
  >
    {children}
  </div>
);

const ComparisonMotif = ({
  accent,
  scene,
  vertical,
}: {
  accent: ReturnType<typeof accentFor>;
  scene: PublishScene;
  vertical: boolean;
}) => {
  const sides = [
    {
      label: scene.leftLabel || 'SIDE A',
      items: scene.primaryItems.slice(0, 2),
    },
    {
      label: scene.rightLabel || 'SIDE B',
      items: scene.secondaryItems.slice(0, 2),
    },
  ];
  return (
    <div
      style={{
        display: 'grid',
        gap: vertical ? 24 : 18,
        gridTemplateColumns: vertical ? '1fr' : '1fr 1fr',
        width: '100%',
      }}
    >
      {sides.map((side) => (
        <div
          key={side.label}
          style={{
            background: 'rgba(15,23,42,0.72)',
            border: `2px solid ${accent.soft}`,
            borderRadius: 24,
            padding: 18,
          }}
        >
          <div
            style={{
              color: accent.bright,
              fontFamily: RENDER_FONT_FAMILY,
              fontSize: vertical ? 27 : 20,
              fontWeight: 900,
              letterSpacing: 2.4,
              marginBottom: 14,
            }}
          >
            {side.label.toLocaleUpperCase()}
          </div>
          <div style={{display: 'grid', gap: 12}}>
            {side.items.map((item) => (
              <ItemCard accent={accent} compact label={item} key={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const FlowMotif = ({
  accent,
  scene,
  vertical,
}: {
  accent: ReturnType<typeof accentFor>;
  scene: PublishScene;
  vertical: boolean;
}) => {
  const items = [...scene.primaryItems, ...scene.secondaryItems].slice(0, 4);
  return (
    <div style={{display: 'grid', gap: vertical ? 24 : 16, width: '100%'}}>
      {items.map((item, index) => (
        <div key={item} style={{position: 'relative'}}>
          <ItemCard accent={accent} compact={!vertical} label={item} />
          {index < items.length - 1 ? (
            <div
              style={{
                background: `linear-gradient(180deg, ${accent.bright}, transparent)`,
                bottom: vertical ? -24 : -16,
                height: vertical ? 24 : 16,
                left: vertical ? 48 : 37,
                opacity: 0.74,
                position: 'absolute',
                width: 3,
                zIndex: 2,
              }}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
};

const SceneMotif = ({
  accent,
  scene,
  vertical,
}: {
  accent: ReturnType<typeof accentFor>;
  scene: PublishScene;
  vertical: boolean;
}) => (
  <Panel accent={accent} style={{width: '100%'}}>
    <div
      style={{
        alignItems: 'center',
        display: 'flex',
        gap: 12,
        marginBottom: vertical ? 24 : 18,
      }}
    >
      <div
        style={{
          background: accent.bright,
          borderRadius: 99,
          boxShadow: `0 0 24px ${accent.glow}`,
          height: 10,
          width: 10,
        }}
      />
      <FittedText
        align="left"
        fontWeight={900}
        letterSpacing={1.4}
        lineHeight={1}
        maxFontSize={vertical ? 30 : 22}
        maxHeight={vertical ? 36 : 28}
        maxLines={1}
        maxWidth={vertical ? 720 : 390}
        style={{color: '#CBD5E1', textTransform: 'uppercase'}}
        text={scene.title}
      />
    </div>
    {scene.template === 'comparison' ? (
      <ComparisonMotif accent={accent} scene={scene} vertical={vertical} />
    ) : (
      <FlowMotif accent={accent} scene={scene} vertical={vertical} />
    )}
  </Panel>
);

const StaticBackdrop = ({accent}: {accent: ReturnType<typeof accentFor>}) => (
  <AbsoluteFill style={{backgroundColor: '#020617'}}>
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(circle at 18% 14%, rgba(30,64,175,0.36), transparent 42%), linear-gradient(145deg, #020617 4%, #07142B 52%, #0A1023 100%)',
      }}
    />
    <div
      style={{
        background: accent.glow,
        borderRadius: '50%',
        filter: 'blur(110px)',
        height: '58%',
        left: '-14%',
        opacity: 0.7,
        position: 'absolute',
        top: '-18%',
        width: '58%',
      }}
    />
    <div
      style={{
        background: 'rgba(124,58,237,0.32)',
        borderRadius: '50%',
        bottom: '-20%',
        filter: 'blur(120px)',
        height: '64%',
        opacity: 0.72,
        position: 'absolute',
        right: '-18%',
        width: '64%',
      }}
    />
    <AbsoluteFill
      style={{
        backgroundImage:
          'linear-gradient(rgba(148,163,184,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.055) 1px, transparent 1px)',
        backgroundSize: '64px 64px',
        maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent 96%)',
      }}
    />
    <AbsoluteFill
      style={{
        background: 'radial-gradient(circle at center, transparent 28%, rgba(2,6,23,0.7) 100%)',
      }}
    />
  </AbsoluteFill>
);

export const NarratedThumbnail = ({
  profile,
  publish,
  scene,
  technologyIcons,
}: PublishCoverInput) => {
  const vertical = profile.aspectRatio === '9:16';
  const accent = accentFor(publish.thumbnail.accent);
  return (
    <TechnologyIconsProvider icons={technologyIcons}>
      <AbsoluteFill style={{backgroundColor: '#020617', overflow: 'hidden'}}>
        <StaticBackdrop accent={accent} />
        <div
          style={{
            display: 'flex',
            flexDirection: vertical ? 'column' : 'row',
            gap: vertical ? 84 : 56,
            inset: `${profile.safeArea.top}px ${profile.safeArea.right}px ${profile.safeArea.bottom}px ${profile.safeArea.left}px`,
            position: 'absolute',
          }}
        >
          <div
            style={{
              display: 'flex',
              flex: vertical ? '0 0 auto' : '1 1 58%',
              flexDirection: 'column',
              justifyContent: 'center',
              minWidth: 0,
            }}
          >
            <div
              style={{
                alignSelf: vertical ? 'center' : 'flex-start',
                background: accent.soft,
                border: `2px solid ${accent.bright}`,
                borderRadius: 999,
                color: accent.bright,
                fontFamily: RENDER_FONT_FAMILY,
                fontSize: vertical ? 32 : 20,
                fontWeight: 900,
                letterSpacing: vertical ? 3.4 : 2.6,
                marginBottom: vertical ? 44 : 28,
                padding: vertical ? '16px 26px' : '10px 18px',
                textTransform: 'uppercase',
              }}
            >
              {publish.thumbnail.eyebrow}
            </div>
            <FittedText
              align={vertical ? 'center' : 'left'}
              fontWeight={950}
              letterSpacing={vertical ? -3.2 : -2.8}
              lineHeight={0.96}
              maxFontSize={vertical ? 118 : 90}
              maxHeight={vertical ? 500 : 310}
              maxLines={vertical ? 4 : 3}
              maxWidth={vertical ? 900 : 690}
              style={{
                color: '#F8FAFC',
                filter: 'drop-shadow(0 18px 34px rgba(2,6,23,0.52))',
              }}
              text={publish.thumbnail.headline}
            />
            <div
              style={{
                background: `linear-gradient(90deg, ${accent.bright}, transparent)`,
                borderRadius: 999,
                height: vertical ? 10 : 8,
                margin: vertical ? '42px auto 0' : '34px 0 0',
                width: vertical ? 250 : 190,
              }}
            />
          </div>
          <div
            style={{
              alignItems: 'center',
              display: 'flex',
              flex: vertical ? '1 1 auto' : '0 0 39%',
              justifyContent: 'center',
              minHeight: 0,
              minWidth: 0,
            }}
          >
            <SceneMotif accent={accent} scene={scene} vertical={vertical} />
          </div>
        </div>
      </AbsoluteFill>
    </TechnologyIconsProvider>
  );
};
