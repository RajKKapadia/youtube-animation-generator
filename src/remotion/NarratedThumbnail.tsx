import type {CSSProperties, ReactNode} from 'react';
import {AbsoluteFill, Img, staticFile} from 'remotion';
import type {
  PublishAccent,
  PublishCoverInput,
  PublishScene,
} from '../types.js';
import {FittedText} from './FittedText.js';
import {
  SemanticIconsProvider,
  TechnologyBadge,
  TechnologyIconsProvider,
} from './TechnologyBadge.js';
import {hexToRgba, videoPaletteFor} from '../visual-palettes.js';
import {iconRecordForItems} from '../icon-catalog.js';
import {LocalIconAssetsProvider} from './SemanticIcon.js';
import {
  COMPARISON_PADDING,
  COVER_BORDER,
  COVER_PANEL_PADDING,
  publishCardLayout,
  publishCoverLayout,
  publishTextTokens,
} from './publish-layout.js';

const ItemCard = ({
  accent,
  compact,
  label,
  width,
}: {
  accent: ReturnType<typeof accentFor>;
  compact?: boolean;
  label: string;
  width: number;
}) => {
  const layout = publishCardLayout(width, compact ?? false);
  return (
    <div
      style={{
        alignItems: 'center',
        background: 'linear-gradient(135deg, rgba(15,23,42,0.96), rgba(15,23,42,0.76))',
        border: `2px solid ${accent.soft}`,
        borderRadius: compact ? 20 : 24,
        boxSizing: 'border-box',
        boxShadow: '0 18px 38px rgba(2,6,23,0.34)',
        display: 'flex',
        flexDirection: layout.stacked ? 'column' : 'row',
        gap: layout.gap,
        minHeight: layout.height,
        padding: `${layout.paddingY}px ${layout.paddingX}px`,
        width,
      }}
    >
      <TechnologyBadge label={label} size={layout.iconSize} />
      <FittedText
        align={layout.stacked ? 'center' : 'left'}
        fontWeight={800}
        letterSpacing={0}
        lineHeight={1.16}
        maxFontSize={layout.fontSize}
        maxHeight={layout.textHeight}
        maxLines={layout.maxLines}
        maxWidth={layout.textWidth}
        style={{color: '#F8FAFC', minWidth: 0, width: layout.textWidth}}
        text={label}
        wrapTokens={publishTextTokens(label)}
      />
    </div>
  );
};

const accentFor = (accent: PublishAccent) => {
  const palette = videoPaletteFor(accent);
  return {
    background: palette.background,
    bright: palette.accents.primary,
    glow: hexToRgba(palette.accents.primary, 0.46),
    secondaryGlow: hexToRgba(palette.accents.secondary, 0.36),
    soft: hexToRgba(palette.accents.primary, 0.14),
  };
};

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
      boxSizing: 'border-box',
      boxShadow: `0 28px 90px rgba(2,6,23,0.5), 0 0 60px ${accent.soft}`,
      padding: COVER_PANEL_PADDING,
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
  width,
}: {
  accent: ReturnType<typeof accentFor>;
  scene: PublishScene;
  vertical: boolean;
  width: number;
}) => {
  const gap = vertical ? 24 : 18;
  const sideWidth = vertical ? width : (width - gap) / 2;
  const innerWidth = sideWidth - 2 * (COMPARISON_PADDING + COVER_BORDER);
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
        gap,
        gridTemplateColumns: vertical ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))',
        width,
      }}
    >
      {sides.map((side) => (
        <div
          key={side.label}
          style={{
            background: 'rgba(15,23,42,0.72)',
            border: `2px solid ${accent.soft}`,
            borderRadius: 24,
            boxSizing: 'border-box',
            padding: COMPARISON_PADDING,
            minWidth: 0,
          }}
        >
          <FittedText
            align="left"
            fontWeight={900}
            letterSpacing={1}
            lineHeight={1.15}
            maxFontSize={vertical ? 27 : 20}
            maxHeight={vertical ? 64 : 48}
            maxLines={2}
            maxWidth={innerWidth}
            style={{
              color: accent.bright,
              marginBottom: 14,
              textTransform: 'uppercase',
            }}
            text={side.label}
            wrapTokens={publishTextTokens(side.label)}
          />
          <div style={{display: 'grid', gap: 12}}>
            {side.items.map((item) => (
              <ItemCard accent={accent} compact label={item} key={item} width={innerWidth} />
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
  width,
}: {
  accent: ReturnType<typeof accentFor>;
  scene: PublishScene;
  vertical: boolean;
  width: number;
}) => {
  const items = [...scene.primaryItems, ...scene.secondaryItems].slice(0, 4);
  return (
    <div style={{display: 'grid', gap: vertical ? 24 : 16, width: '100%'}}>
      {items.map((item, index) => (
        <div key={item} style={{position: 'relative'}}>
          <ItemCard accent={accent} compact={!vertical} label={item} width={width} />
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
  width,
}: {
  accent: ReturnType<typeof accentFor>;
  scene: PublishScene;
  vertical: boolean;
  width: number;
}) => {
  const innerWidth = width - 2 * (COVER_PANEL_PADDING + COVER_BORDER);
  return (
    <Panel accent={accent} style={{width}}>
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
            flex: '0 0 10px',
          }}
        />
        <FittedText
          align="left"
          fontWeight={900}
          letterSpacing={1}
          lineHeight={1.15}
          maxFontSize={vertical ? 30 : 22}
          maxHeight={vertical ? 70 : 52}
          maxLines={2}
          maxWidth={innerWidth - 22}
          style={{
            color: '#CBD5E1',
            flex: 1,
            minWidth: 0,
            textTransform: 'uppercase',
          }}
          text={scene.title}
          wrapTokens={publishTextTokens(scene.title)}
        />
      </div>
      {scene.template === 'comparison' ? (
        <ComparisonMotif accent={accent} scene={scene} vertical={vertical} width={innerWidth} />
      ) : (
        <FlowMotif accent={accent} scene={scene} vertical={vertical} width={innerWidth} />
      )}
    </Panel>
  );
};

const StaticBackdrop = ({accent}: {accent: ReturnType<typeof accentFor>}) => (
  <AbsoluteFill style={{backgroundColor: accent.background.start}}>
    <AbsoluteFill
      style={{
        background:
          `radial-gradient(circle at 18% 14%, ${accent.glow}, transparent 42%), linear-gradient(145deg, ${accent.background.start} 4%, ${accent.background.middle} 52%, ${accent.background.end} 100%)`,
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
        background: accent.secondaryGlow,
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
        background: `radial-gradient(circle at center, transparent 28%, ${hexToRgba(accent.background.start, 0.7)} 100%)`,
      }}
    />
  </AbsoluteFill>
);

export const NarratedThumbnail = ({
  backgroundImageAsset,
  localIconAssets,
  profile,
  publish,
  scene,
  technologyIcons,
}: PublishCoverInput) => {
  const layout = publishCoverLayout(profile);
  const {vertical} = layout;
  const accent = accentFor(publish.thumbnail.accent);
  const semanticIcons = iconRecordForItems({
    primaryItems: scene.primaryItems,
    secondaryItems: scene.secondaryItems,
    icons: scene.icons,
  });
  return (
    <LocalIconAssetsProvider assets={localIconAssets}>
      <TechnologyIconsProvider icons={technologyIcons}>
        <SemanticIconsProvider icons={semanticIcons}>
          <AbsoluteFill
            style={{backgroundColor: accent.background.start, overflow: 'hidden'}}
          >
            {backgroundImageAsset ? (
              <AbsoluteFill style={{backgroundColor: '#000000'}}>
                <Img
                  src={staticFile(backgroundImageAsset)}
                  style={{width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center'}}
                />
              </AbsoluteFill>
            ) : <StaticBackdrop accent={accent} />}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: vertical ? 'minmax(0, 1fr)' : `${layout.titleWidth}px ${layout.panelWidth}px`,
                gridTemplateRows: vertical ? 'auto minmax(0, 1fr)' : 'minmax(0, 1fr)',
                gap: layout.gap,
                inset: `${profile.safeArea.top}px ${profile.safeArea.right}px ${profile.safeArea.bottom}px ${profile.safeArea.left}px`,
                position: 'absolute',
              }}
            >
              <div
                style={{
                  display: 'flex',
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
                    boxSizing: 'border-box',
                    maxWidth: layout.titleWidth,
                    marginBottom: vertical ? 44 : 28,
                    padding: vertical ? '16px 26px' : '10px 18px',
                    textTransform: 'uppercase',
                  }}
                >
                  <FittedText
                    align={vertical ? 'center' : 'left'}
                    fontWeight={900}
                    letterSpacing={vertical ? 2.4 : 1.6}
                    lineHeight={1.15}
                    maxFontSize={vertical ? 32 : 20}
                    maxHeight={vertical ? 38 : 24}
                    maxLines={1}
                    maxWidth={layout.titleWidth - (vertical ? 56 : 40)}
                    style={{textTransform: 'uppercase'}}
                    text={publish.thumbnail.eyebrow}
                    wrapTokens={publishTextTokens(publish.thumbnail.eyebrow)}
                  />
                </div>
                <FittedText
                  align={vertical ? 'center' : 'left'}
                  fontWeight={950}
                  letterSpacing={vertical ? -1.2 : -0.8}
                  lineHeight={1.08}
                  maxFontSize={vertical ? 118 : 90}
                  maxHeight={vertical ? 500 : 310}
                  maxLines={vertical ? 4 : 3}
                  maxWidth={layout.titleWidth}
                  style={{
                    color: '#F8FAFC',
                    filter: 'drop-shadow(0 18px 34px rgba(2,6,23,0.52))',
                  }}
                  text={publish.thumbnail.headline}
                  wrapTokens={publishTextTokens(publish.thumbnail.headline)}
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
                  justifyContent: 'center',
                  minHeight: 0,
                  minWidth: 0,
                }}
              >
                <SceneMotif accent={accent} scene={scene} vertical={vertical} width={layout.panelWidth} />
              </div>
            </div>
          </AbsoluteFill>
        </SemanticIconsProvider>
      </TechnologyIconsProvider>
    </LocalIconAssetsProvider>
  );
};
