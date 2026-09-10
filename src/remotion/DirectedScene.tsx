import type {ReactNode} from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {RenderableVisualScene, RenderProfile, VideoPalette} from '../types.js';
import {visibleItemIndices} from '../presentation.js';
import {hexToRgba, videoPaletteFor} from '../visual-palettes.js';
import {FittedText} from './FittedText.js';
import {TechnologyBadge} from './TechnologyBadge.js';
import {VisualIcon} from './SemanticIcon.js';

export const directedTitleStyle = (vertical: boolean) => ({
  height: vertical ? 100 : 74,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  opacity: 0.8,
} as const);

export const hasDirectedLayout = (scene: RenderableVisualScene): boolean => Boolean(scene.presentation) && (
  scene.visual.kind === 'diagram' || scene.visual.kind === 'kinetic-text' ||
  scene.visual.kind === 'icon-spotlight' || scene.visual.kind === 'brand-showcase' ||
  scene.visual.kind === 'metric-focus' || scene.visual.kind === 'before-after'
);

/** A question can precede the first item cue. Keep an immediate visual hook
 * without revealing data before its speech anchor. */
export const PresentationLeadIn = ({scene, profile, children}: {
  scene: RenderableVisualScene; profile: RenderProfile; children: ReactNode;
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const starts = [...scene.primaryItemTimings, ...scene.secondaryItemTimings].map(({startMs}) => startMs);
  if (!scene.presentation || frame * 1000 / fps >= Math.min(...starts, scene.durationMs)) return <>{children}</>;
  const vertical = profile.aspectRatio === '9:16';
  return <div style={{height: '100%', display: 'flex', alignItems: 'center'}}>
    <FittedText align="left" fontWeight={850} lineHeight={1.08} maxFontSize={vertical ? 108 : 128} maxHeight={vertical ? 850 : 530} maxLines={5} maxWidth={profile.width - profile.safeArea.left - profile.safeArea.right} text={scene.title} />
  </div>;
};

export const DirectedScene = ({scene, profile, palette, contentTopInset}: {
  scene: RenderableVisualScene; profile: RenderProfile; palette: VideoPalette; contentTopInset: number;
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const ms = frame * 1000 / fps;
  const theme = videoPaletteFor(palette);
  const vertical = profile.aspectRatio === '9:16';
  const width = profile.width - profile.safeArea.left - profile.safeArea.right;
  const bodyHeight = profile.height - profile.safeArea.top - profile.safeArea.bottom - contentTopInset - (vertical ? 100 : 74) - 28;
  const presentation = scene.presentation!;
  const primaryStarts = scene.primaryItemTimings.map(({startMs}) => startMs);
  const secondaryStarts = scene.secondaryItemTimings.map(({startMs}) => startMs);
  const shown = visibleItemIndices(primaryStarts, ms, presentation.reveal);
  const entry = (start: number) => interpolate(ms, [start, start + 280], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const label = (text: string, w: number, size: number, height: number, lines = 3, color = '#F8FAFC') => (
    <FittedText align="left" fontWeight={820} lineHeight={1.12} maxFontSize={size} maxHeight={height} maxLines={lines} maxWidth={w} text={text} style={{color}} />
  );
  const title = <div style={directedTitleStyle(vertical)}>{label(scene.title, width, vertical ? 38 : 36, vertical ? 94 : 70, 2, '#CBD5E1')}</div>;
  let content: ReactNode;

  if (presentation.composition === 'comparison' && scene.secondaryItems.length) {
    // Paired changes advance only once the next pair has started. Unpaired
    // comparisons preserve each lane's independent speech timing.
    const pairs = scene.visual.kind === 'before-after' ? scene.visual.pairs : undefined;
    const pairStarts = pairs?.map((pair) => Math.min(primaryStarts[pair.primaryItemIndex]!, secondaryStarts[pair.secondaryItemIndex]!));
    const activePairs = pairStarts ? visibleItemIndices(pairStarts, ms, presentation.reveal) : [];
    const left = pairs ? activePairs.map((i) => pairs[i]!.primaryItemIndex).filter((i) => primaryStarts[i]! <= ms) : shown;
    const right = pairs ? activePairs.map((i) => pairs[i]!.secondaryItemIndex).filter((i) => secondaryStarts[i]! <= ms) : visibleItemIndices(secondaryStarts, ms, presentation.reveal);
    const sideWidth = (width - 48) / 2;
    content = <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, flex: 1, alignContent: 'center'}}>
      {[{items: left, labels: scene.primaryItems, starts: primaryStarts, heading: scene.leftLabel, color: theme.accents.primary}, {items: right, labels: scene.secondaryItems, starts: secondaryStarts, heading: scene.rightLabel, color: theme.accents.secondary}].map((side, sideIndex) => (
        <div key={sideIndex} style={{borderTop: `8px solid ${side.color}`, paddingTop: 28, minWidth: 0}}>
          {label(side.heading, sideWidth, vertical ? 42 : 46, 116, 2, side.color)}
          <div style={{display: 'flex', flexDirection: 'column', gap: 28, marginTop: 44}}>
            {side.items.map((i) => <div key={i} style={{opacity: entry(side.starts[i]!)}}>
              {label(side.labels[i]!, sideWidth, side.items.length > 2 ? 38 : vertical ? 64 : 78, Math.min(400, Math.max(40, (bodyHeight - 160 - Math.max(0, side.items.length - 1) * 28) / Math.max(1, side.items.length))), 5)}
            </div>)}
          </div>
        </div>
      ))}
    </div>;
  } else if (presentation.composition === 'process') {
    const columns = vertical ? 1 : Math.min(3, scene.primaryItems.length);
    const cellWidth = (width - (columns - 1) * 36) / columns;
    content = <div style={{display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, alignContent: 'center', gap: vertical ? 26 : 52, flex: 1}}>
      {scene.primaryItems.map((item, i) => {
        const p = shown.includes(i) ? entry(primaryStarts[i]!) : 0;
        return <div key={i} style={{display: 'flex', alignItems: 'center', gap: 28, opacity: p, transform: `translateY(${(1 - p) * 14}px)`, minHeight: vertical ? 134 : 180, borderLeft: `4px solid ${theme.accents.primary}`, paddingLeft: 24}}>
          <span style={{fontSize: vertical ? 42 : 38, fontWeight: 850, color: theme.accents.secondary, flexShrink: 0}}>{String(i + 1).padStart(2, '0')}</span>
          {label(item, cellWidth - 126, vertical ? 54 : 50, vertical ? 134 : 180, 3)}
        </div>;
      })}
    </div>;
  } else {
    const focal = presentation.composition === 'focal';
    const evidence = presentation.composition === 'evidence';
    const multiple = shown.length > 1;
    const columns = multiple && !vertical ? 2 : 1;
    const cellWidth = (width - (columns - 1) * 48) / columns;
    const rows = Math.max(1, Math.ceil(shown.length / columns));
    const rowHeight = (bodyHeight - (rows - 1) * 32) / rows;
    const iconSize = vertical ? 230 : 280;
    content = <div style={{display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, flex: 1, alignContent: 'center', gap: multiple ? 32 : 48}}>
      {shown.map((i) => {
        const p = entry(primaryStarts[i]!);
        const inline = focal && !vertical && !multiple;
        const icon = scene.icons.focal;
        return <div key={i} style={{display: 'flex', flexDirection: inline ? 'row' : 'column', alignItems: 'flex-start', gap: multiple ? 24 : 48, opacity: p, transform: `translateY(${(1 - p) * 16}px)`, minWidth: 0}}>
          {focal && !multiple ? <div style={{flexShrink: 0, color: theme.accents.primary}}>
            {icon ? <VisualIcon id={icon} color={theme.accents.primary} size={iconSize} /> : <TechnologyBadge label={scene.primaryItems[i]!} size={iconSize} />}
          </div> : null}
          <div style={{minWidth: 0, borderLeft: multiple ? `5px solid ${theme.accents.primary}` : undefined, paddingLeft: multiple ? 24 : 0}}>
            {!multiple ? <div style={{width: 96, height: 9, background: theme.accents.primary, marginBottom: 36}} /> : null}
            {label(scene.primaryItems[i]!, cellWidth - (inline ? iconSize + 48 : multiple ? 30 : 0), multiple ? (shown.length > 3 ? 46 : 64) : evidence ? 124 : vertical ? 110 : 138, multiple ? Math.min(rowHeight, shown.length > 3 ? 132 : 240) : vertical ? 640 : 430, multiple ? 3 : 5, evidence ? theme.accents.primary : '#F8FAFC')}
          </div>
        </div>;
      })}
    </div>;
  }
  return <div data-composition={presentation.composition} style={{display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 24}}>
    {title}{content}
    <div style={{height: 4, flexShrink: 0, background: hexToRgba(theme.accents.primary, 0.12)}}>
      <div style={{height: '100%', width: `${Math.min(100, ms / scene.durationMs * 100)}%`, background: theme.accents.primary}} />
    </div>
  </div>;
};
