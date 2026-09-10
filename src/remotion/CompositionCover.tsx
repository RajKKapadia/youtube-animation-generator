import {Img, staticFile} from 'remotion';
import type {PublishCoverInput} from '../types.js';
import {videoPaletteFor} from '../visual-palettes.js';
import {formatChartDatum} from '../data-visualization.js';
import {FittedText, RENDER_FONT_FAMILY} from './FittedText.js';
import {TechnologyBadge} from './TechnologyBadge.js';
import {VisualIcon} from './SemanticIcon.js';
import {publishTextTokens} from './publish-layout.js';

export const CompositionCover = ({publish, scene, profile, foregroundAssets}: PublishCoverInput) => {
  const direction = publish.thumbnail;
  const vertical = profile.aspectRatio === '9:16';
  const width = profile.width - profile.safeArea.left - profile.safeArea.right;
  const height = profile.height - profile.safeArea.top - profile.safeArea.bottom;
  const theme = videoPaletteFor(direction.accent);
  const firstPair = scene.visual?.kind === 'before-after' ? scene.visual.pairs[0] : undefined;
  const primary = (direction.primaryItemIndices ?? [firstPair?.primaryItemIndex ?? 0]).map((i) => scene.primaryItems[i]!);
  const secondary = (direction.secondaryItemIndices ?? [firstPair?.secondaryItemIndex ?? 0]).map((i) => scene.secondaryItems[i]!).filter(Boolean);
  const ordinal = (index: number) => {
    const itemIndex = direction.primaryItemIndices?.[index] ?? index;
    return scene.visual?.kind === 'layered-architecture' ? scene.visual.layerOrder.indexOf(itemIndex) + 1 : itemIndex + 1;
  };
  const text = (value: string, w: number, size: number, h: number, lines = 3, color = '#F8FAFC') => <FittedText align="left" fontWeight={900} lineHeight={1.06} maxFontSize={size} maxHeight={h} maxLines={lines} maxWidth={w} text={value} wrapTokens={publishTextTokens(value)} style={{color}} />;
  const headline = (w = width, size = vertical ? 132 : 90, h = vertical ? 420 : 250) => text(direction.headline, w, size, h, 4);
  const marker = <div style={{width: 108, height: 10, background: theme.accents.primary}} />;
  let content;
  if (direction.composition === 'comparison') {
    const w = (width - 48) / 2;
    content = <>{headline()}<div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, marginTop: vertical ? 90 : 24}}>
      {[{name: scene.leftLabel, items: primary, accent: theme.accents.primary}, {name: scene.rightLabel, items: secondary, accent: theme.accents.secondary}].map((side, i) => <div key={i} style={{borderTop: `10px solid ${side.accent}`, paddingTop: 28, minWidth: 0}}>
        {text(side.name, w, vertical ? 58 : 38, 140, 3, side.accent)}
        <div style={{marginTop: 32}}>{text(side.items.join(' · '), w, vertical ? 70 : 44, vertical ? 500 : 210, 5)}</div>
      </div>)}
    </div></>;
  } else if (direction.composition === 'process') {
    // Numbers are used only for genuinely ordered templates. Network and agent
    // relationships keep their labels without implying a new sequence.
    const ordered = scene.visual?.kind === 'diagram' || !scene.visual || scene.visual.kind === 'layered-architecture';
    content = <>{headline()}<div style={{display: 'grid', gridTemplateColumns: vertical ? '1fr' : `repeat(${primary.length}, minmax(0, 1fr))`, gap: vertical ? 44 : 32, marginTop: vertical ? 90 : 38}}>
      {primary.map((item, i) => <div key={i} style={{display: 'flex', flexDirection: vertical ? 'row' : 'column', alignItems: 'flex-start', gap: 28, borderLeft: `5px solid ${theme.accents.primary}`, paddingLeft: 24}}>
        {ordered ? <span style={{fontSize: vertical ? 56 : 40, color: theme.accents.secondary, fontWeight: 900}}>{String(ordinal(i)).padStart(2, '0')}</span> : <TechnologyBadge label={item} size={vertical ? 76 : 64} />}
        {text(item, vertical ? width - 146 : (width - 64) / primary.length - 32, vertical ? 68 : 42, vertical ? 170 : 220, 4)}
      </div>)}
    </div></>;
  } else if (direction.composition === 'evidence') {
    const visual = scene.visual;
    let evidence;
    if (visual?.kind === 'data-visualization') {
      const chart = visual.chart;
      const lastPoint = chart.type === 'line-chart' ? (direction.datumId ? chart.points.find(({yDatumId}) => yDatumId === direction.datumId) : chart.points.at(-1)) : undefined;
      const datum = (direction.datumId ? chart.data.find(({id}) => id === direction.datumId) : lastPoint ? chart.data.find(({id}) => id === lastPoint.yDatumId) : chart.data[0])!;
      const x = lastPoint ? chart.data.find(({id}) => id === lastPoint.xDatumId) : undefined;
      const category = chart.categories.find(({values}) => values.some(({datumId}) => datumId === datum.id));
      const reference = category?.values.find(({datumId}) => datumId === datum.id);
      const series = chart.series.find(({id}) => id === reference?.seriesId);
      const card = chart.cards.find(({datumId}) => datumId === datum.id);
      const context = [...new Set([card?.label ?? datum.label, category?.label, series?.label, x ? formatChartDatum(x) : undefined].filter(Boolean))].join(' · ');
      evidence = <div>{text(formatChartDatum(datum), width, vertical ? 166 : 116, vertical ? 500 : 200, 3, theme.accents.primary)}<div style={{marginTop: 24}}>{text(context, width, vertical ? 52 : 36, 140, 3)}</div></div>;
    } else if (visual?.kind === 'code-walkthrough') {
      const lines = visual.excerpt.text.split('\n').slice(0, 6);
      const longest = Math.max(...lines.map((line) => [...line].length), 1);
      const size = Math.min(vertical ? 44 : 28, (width - 64) / (longest * .62));
      evidence = <div style={{borderLeft: `6px solid ${theme.accents.primary}`, paddingLeft: 28}}>{text(visual.excerpt.originalName, width - 40, vertical ? 34 : 24, 80, 2, theme.accents.primary)}<pre style={{fontSize: size, lineHeight: 1.55, color: '#F8FAFC', whiteSpace: 'pre', margin: '20px 0 0', tabSize: 4}}>{lines.join('\n')}</pre></div>;
    } else if (visual?.kind === 'image-focus' && foregroundAssets?.[visual.mediaId]) {
      evidence = <Img src={staticFile(foregroundAssets[visual.mediaId]!)} style={{width, height: vertical ? 780 : 300, objectFit: 'contain'}} />;
    } else {
      evidence = text(primary.join(' · '), width, vertical ? 166 : 116, vertical ? 680 : 290, 5, theme.accents.primary);
    }
    content = <>{headline(width, vertical ? 112 : 72, vertical ? 380 : 200)}<div style={{marginTop: vertical ? 76 : 36}}>{evidence}</div></>;
  } else if (direction.composition === 'focal') {
    const size = vertical ? 350 : 290;
    const icon = scene.icons.focal;
    content = <div style={{display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: 'center', gap: vertical ? 90 : 68}}>
      <div style={{flexShrink: 0}}>{icon ? <VisualIcon id={icon} color={theme.accents.primary} size={size} /> : <TechnologyBadge label={primary[0]!} size={size} />}</div>
      <div style={{minWidth: 0}}>{headline(vertical ? width : width - size - 68, vertical ? 142 : 86, vertical ? 590 : 470)}</div>
    </div>;
  } else {
    content = <div>{marker}<div style={{marginTop: 56}}>{headline(width, vertical ? 172 : 132, vertical ? 1000 : 520)}</div></div>;
  }
  return <div data-cover-composition={direction.composition} style={{position: 'absolute', top: profile.safeArea.top, left: profile.safeArea.left, width, height, fontFamily: RENDER_FONT_FAMILY, display: 'flex', flexDirection: 'column', justifyContent: 'center', color: '#F8FAFC'}}>{content}</div>;
};
