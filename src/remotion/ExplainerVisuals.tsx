import {directedTitleStyle} from './DirectedScene.js';
import type {CSSProperties, ReactNode} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import type {RenderableVisualScene, RenderProfile, VideoPalette} from '../types.js';
import {hexToRgba, videoPaletteFor} from '../visual-palettes.js';
import {formatChartDatum} from '../data-visualization.js';
import {FittedText} from './FittedText.js';
import {keySafeShadow} from './chroma-key.js';
import {activeItemIndex, chartDomain, itemAnimationWindow, windowProgress} from './explainer-timing.js';

export interface ExplainerProps {scene: RenderableVisualScene; profile: RenderProfile; palette: VideoPalette}
const useExplainer = ({scene, profile, palette}: ExplainerProps) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const starts = scene.primaryItemTimings.map(({startMs}) => startMs);
  return {
    frame, fps, vertical: profile.aspectRatio === '9:16',
    width: profile.width - profile.safeArea.left - profile.safeArea.right,
    theme: videoPaletteFor(palette), active: activeItemIndex(starts.map((_, index) => itemAnimationWindow(starts, index, scene.durationMs).startMs), frame * 1000 / fps),
    progress: (index: number, secondary = false) => {
      const timings = secondary ? scene.secondaryItemTimings : scene.primaryItemTimings;
      return windowProgress(frame, fps, itemAnimationWindow(timings.map(({startMs}) => startMs), index, scene.durationMs));
    },
  };
};
const text = (value: string, width: number, size = 42, height = 110, align: 'left' | 'center' = 'left') =>
  <FittedText align={align} fontWeight={760} lineHeight={1.12} maxFontSize={size} maxHeight={height} maxLines={3} maxWidth={width} text={value} />;
const panel = (accent: string): CSSProperties => ({background: '#101b2d', border: `2px solid ${hexToRgba(accent, 0.48)}`, borderRadius: 24, boxShadow: keySafeShadow('0 16px 40px rgba(0,0,0,.25)'), boxSizing: 'border-box'});
const Shell = ({scene, profile, children}: ExplainerProps & {children: ReactNode}) => (
  <div style={{display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 28}}>
    <div style={{height: profile.aspectRatio === '9:16' ? 156 : 110, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', ...(scene.presentation ? directedTitleStyle(profile.aspectRatio === '9:16') : {})}}>
      {text(scene.title, profile.width - profile.safeArea.left - profile.safeArea.right - 32, scene.presentation ? 38 : 60, scene.presentation ? 90 : profile.aspectRatio === '9:16' ? 156 : 110, scene.presentation ? 'left' : 'center')}
    </div>
    {children}
  </div>
);

export const KineticText = (props: ExplainerProps) => {
  const {scene} = props;
  const {theme, width, vertical, progress, active} = useExplainer(props);
  return <Shell {...props}><div style={{display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: vertical ? 38 : 22}}>
    {scene.primaryItems.map((item, index) => {
      const p = progress(index);
      const pulse = scene.visual.motion === 'pulse' && active === index ? 1 + Math.sin(p * Math.PI) * 0.015 : 1;
      return <div key={index} style={{display: 'flex', gap: 26, alignItems: 'center', opacity: p, transform: `translateY(${(1 - p) * 18}px) scale(${pulse})`, padding: '10px 24px', borderLeft: `6px solid ${active === index ? theme.accents.primary : '#53657e'}`}}>
        <span style={{color: theme.accents.secondary, fontSize: vertical ? 34 : 30, fontWeight: 800, width: 50, flexShrink: 0}}>{String(index + 1).padStart(2, '0')}</span>
        {text(item, width - 180, vertical ? 64 : 76, vertical ? 220 : 116)}
      </div>;
    })}
  </div></Shell>;
};

export const BeforeAfter = (props: ExplainerProps) => {
  const {scene} = props;
  const {width, vertical, theme, progress} = useExplainer(props);
  if (scene.visual.kind !== 'before-after') return null;
  const cardWidth = vertical ? width : (width - 60) / 2;
  return <Shell {...props}><div style={{display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: 24}}>
    {scene.visual.pairs.map((pair, index) => <div key={index} style={{display: 'grid', gridTemplateColumns: vertical ? '1fr' : '1fr 36px 1fr', gap: 12}}>
      <div style={{...panel('#718198'), padding: vertical ? '18px 26px' : '24px 30px', opacity: progress(pair.primaryItemIndex)}}>
        <div style={{color: '#b5c4d8', fontSize: 22, fontWeight: 700, marginBottom: 10}}>{scene.leftLabel}</div>
        {text(scene.primaryItems[pair.primaryItemIndex]!, cardWidth - 76, vertical ? 40 : 44, vertical ? 100 : 110)}
      </div>
      {!vertical ? <div style={{alignSelf: 'center', color: theme.accents.primary, fontSize: 32, opacity: progress(pair.secondaryItemIndex, true)}}>→</div> : null}
      <div style={{...panel(theme.accents.primary), padding: vertical ? '18px 26px' : '24px 30px', clipPath: `inset(0 ${(1 - progress(pair.secondaryItemIndex, true)) * 100}% 0 0 round 24px)`}}>
        <div style={{color: theme.accents.primary, fontSize: 22, fontWeight: 700, marginBottom: 10}}>{scene.rightLabel}</div>
        {text(scene.secondaryItems[pair.secondaryItemIndex]!, cardWidth - 76, vertical ? 40 : 44, vertical ? 100 : 110)}
      </div>
    </div>)}
  </div></Shell>;
};

export const CodeWalkthrough = (props: ExplainerProps & {contentTopInset: number}) => {
  const {scene} = props;
  const {width, vertical, theme, progress, active} = useExplainer(props);
  if (scene.visual.kind !== 'code-walkthrough') return null;
  const visual = scene.visual;
  const highlighted = active < 0 ? undefined : visual.highlights[active];
  const codeWidth = vertical ? width : Math.min(1120, width * 0.67);
  const lines = visual.excerpt.text.split('\n');
  const longestLine = Math.max(1, ...lines.map((line) => [...line.replaceAll('\t', '    ')].length));
  const bodyHeight = props.profile.height - props.profile.safeArea.top - props.profile.safeArea.bottom - props.contentTopInset - (vertical ? 156 : 110) - 28;
  // Reserve the full filename header, code padding, and stacked step panel.
  const codeTextHeight = bodyHeight - 142 - (vertical ? 308 : 0);
  const codeSize = Math.min(36, Math.floor((codeWidth - 122) / (longestLine * 0.61)), Math.floor(codeTextHeight / (lines.length * 1.6)));
  return <Shell {...props}><div style={{display: 'flex', flexDirection: vertical ? 'column' : 'row', flex: 1, gap: 28, alignItems: 'center', justifyContent: 'center', minHeight: 0}}>
    <div style={{...panel(theme.accents.primary), width: codeWidth, flexShrink: 0, overflow: 'hidden', opacity: progress(0)}}>
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', background: '#18283f', gap: 20}}>
        {text(visual.excerpt.originalName, codeWidth - 210, 24, 58)}<span style={{color: theme.accents.secondary, fontSize: 20}}>{visual.excerpt.language}</span>
      </div>
      <pre style={{margin: 0, padding: '20px 0', fontFamily: 'monospace', fontSize: codeSize, lineHeight: 1.6, tabSize: 4}}>
        {lines.map((line, index) => {
          const number = visual.startLine + index;
          const selected = highlighted && number >= highlighted.startLine && number <= highlighted.endLine;
          return <div key={number} style={{display: 'flex', borderLeft: `4px solid ${selected ? theme.accents.primary : 'transparent'}`, background: selected ? hexToRgba(theme.accents.primary, .15) : 'transparent', padding: '0 18px'}}>
            <span style={{color: '#899bb5', width: 56, flexShrink: 0, userSelect: 'none'}}>{number}</span><span>{line || ' '}</span>
          </div>;
        })}
      </pre>
    </div>
    <div style={{...panel(theme.accents.secondary), minHeight: vertical ? 180 : 250, padding: 28, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20, width: vertical ? width : width - codeWidth - 28, opacity: active >= 0 ? 1 : 0}}>
      <div style={{color: theme.accents.secondary, fontSize: 22, fontWeight: 800}}>STEP {Math.max(1, active + 1)} / {scene.primaryItems.length}</div>
      {text(scene.primaryItems[Math.max(0, active)] ?? '', vertical ? width - 60 : width - codeWidth - 90, vertical ? 46 : 40, 170)}
    </div>
  </div></Shell>;
};

export const SequenceDiagram = (props: ExplainerProps) => {
  const {scene} = props;
  const {width, vertical, theme, progress} = useExplainer(props);
  if (scene.visual.kind !== 'sequence-diagram') return null;
  const visual = scene.visual;
  const height = vertical ? 1020 : 560;
  const lane = width / visual.participants.length;
  const participantX = (id: string) => (visual.participants.findIndex((participant) => participant.id === id) + .5) * lane;
  return <Shell {...props}><svg viewBox={`0 0 ${width} ${height}`} style={{flex: 1, width: '100%', minHeight: 0}}>
    {visual.participants.map((participant, index) => {
      const firstMessage = visual.messages.find((message) => message.from === participant.id || message.to === participant.id)!;
      const x = participantX(participant.id);
      return <g key={participant.id} opacity={progress(firstMessage.primaryItemIndex)}>
        <line x1={x} x2={x} y1={92} y2={height - 18} stroke="#60728b" strokeWidth={2} strokeDasharray="7 10" />
        <rect x={index * lane + 8} y={0} width={lane - 16} height={84} rx={16} fill="#101b2d" stroke={theme.accents.primary} strokeWidth={2} />
        <foreignObject x={index * lane + 16} y={8} width={lane - 32} height={68}><div style={{height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>{text(participant.label, lane - 36, vertical ? 32 : 36, 64, 'center')}</div></foreignObject>
      </g>;
    })}
    {visual.messages.map((message, index) => {
      const p = progress(message.primaryItemIndex);
      const from = participantX(message.from), to = participantX(message.to);
      const y = 170 + index * (height - 215) / Math.max(1, visual.messages.length - 1);
      const end = from + (to - from) * p;
      const direction = Math.sign(to - from);
      const labelWidth = Math.min(width - 48, vertical ? 620 : 700, Math.max(Math.abs(to - from) - 24, scene.primaryItems[message.primaryItemIndex]!.length * 16));
      const labelCenter = Math.max(labelWidth / 2 + 8, Math.min(width - labelWidth / 2 - 8, (from + to) / 2));
      return <g key={index} opacity={p > 0 ? 1 : 0}>
        <line x1={from} y1={y} x2={end} y2={y} stroke={index % 2 ? theme.accents.secondary : theme.accents.primary} strokeWidth={4} />
        <path d={`M${end - direction * 14} ${y - 9} L${end} ${y} L${end - direction * 14} ${y + 9}`} fill="none" stroke={theme.accents.primary} strokeWidth={4} />
        <foreignObject x={labelCenter - labelWidth / 2} y={y - 70} width={labelWidth} height={64}><div style={{background: '#101b2d', borderRadius: 8, padding: '4px 8px', opacity: p}}>{text(scene.primaryItems[message.primaryItemIndex]!, labelWidth - 16, vertical ? 28 : 30, 56, 'center')}</div></foreignObject>
      </g>;
    })}
  </svg></Shell>;
};

export const LayeredArchitecture = (props: ExplainerProps) => {
  const {scene} = props;
  const {width, vertical, theme, progress, active} = useExplainer(props);
  if (scene.visual.kind !== 'layered-architecture') return null;
  return <Shell {...props}><div style={{display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, gap: vertical ? 24 : 12}}>
    {scene.visual.layerOrder.map((itemIndex, depth) => {
      const p = progress(itemIndex);
      const inset = (scene.primaryItems.length - depth - 1) * (vertical ? 10 : 28);
      return <div key={itemIndex} style={{...panel(active === itemIndex ? theme.accents.secondary : theme.accents.primary), margin: `0 ${inset}px`, padding: vertical ? '30px 28px' : '16px 28px', display: 'flex', alignItems: 'center', gap: 24, opacity: p, transform: `translateY(${(1 - p) * 16}px)`, borderLeftWidth: 8}}>
        <span style={{fontSize: 28, fontWeight: 800, color: theme.accents.primary, width: 50, flexShrink: 0}}>{String(depth + 1).padStart(2, '0')}</span>
        {text(scene.primaryItems[itemIndex]!, width - inset * 2 - 150, vertical ? 46 : 42, vertical ? 106 : 60)}
      </div>;
    })}
  </div></Shell>;
};

export const LineChart = (props: ExplainerProps) => {
  const {scene} = props;
  const {width, vertical, theme, progress, active} = useExplainer(props);
  if (scene.visual.kind !== 'data-visualization' || scene.visual.chart.type !== 'line-chart') return null;
  const chart = scene.visual.chart;
  const byId = new Map(chart.data.map((datum) => [datum.id, datum]));
  const points = chart.points.map((point) => ({...point, x: byId.get(point.xDatumId)!, y: byId.get(point.yDatumId)!}));
  const [minX, maxX] = chartDomain(points.map(({x}) => x.value));
  const [minY, maxY] = chartDomain(points.map(({y}) => y.value));
  const height = vertical ? 900 : 500;
  const left = 120, right = width - 100, top = 65, bottom = height - 100;
  const xAt = (value: number) => left + (value - minX) / (maxX - minX) * (right - left);
  const yAt = (value: number) => bottom - (value - minY) / (maxY - minY) * (bottom - top);
  const shown = points[Math.max(0, active)];
  return <Shell {...props}><div style={{...panel(theme.accents.primary), flex: 1, display: 'flex', flexDirection: 'column', padding: 16, minHeight: 0}}>
    <svg viewBox={`0 0 ${width} ${height}`} style={{width: '100%', flex: 1, minHeight: 0}}>
      {Array.from({length: 5}, (_, index) => {
        const value = minY + (maxY - minY) * index / 4;
        return <g key={index}><line x1={left} x2={right} y1={yAt(value)} y2={yAt(value)} stroke="#40506a" strokeWidth={1} /><text x={left - 16} y={yAt(value) + 7} textAnchor="end" fill="#bbc9dc" fontSize={23}>{Number(value.toPrecision(4))}</text></g>;
      })}
      <text x={left} y={30} fill={theme.accents.secondary} fontSize={24}>{points[0]!.y.unit}</text>
      <text x={right} y={height - 16} textAnchor="end" fill={theme.accents.secondary} fontSize={24}>{points[0]!.x.unit}</text>
      {Array.from({length: 5}, (_, index) => {
        const value = minX + (maxX - minX) * index / 4;
        return <text key={index} x={xAt(value)} y={bottom + 40} textAnchor="middle" fill="#d8e3f2" fontSize={24}>{Number(value.toPrecision(4))}</text>;
      })}
      {points.map((point, index) => {
        const x = xAt(point.x.value), y = yAt(point.y.value), p = progress(point.primaryItemIndex);
        const previous = points[index - 1];
        return <g key={point.yDatumId}>
          {previous ? <line x1={xAt(previous.x.value)} y1={yAt(previous.y.value)} x2={xAt(previous.x.value) + (x - xAt(previous.x.value)) * p} y2={yAt(previous.y.value) + (y - yAt(previous.y.value)) * p} stroke={theme.accents.primary} strokeWidth={5} opacity={p > 0 ? 1 : 0} /> : null}
          <circle cx={x} cy={y} r={8} fill={theme.accents.secondary} opacity={p} />
        </g>;
      })}
    </svg>
    <div style={{display: 'flex', flexDirection: vertical ? 'column' : 'row', gap: 18, justifyContent: 'center', alignItems: 'center', minHeight: vertical ? 180 : 105, padding: 12, opacity: active >= 0 ? 1 : 0}}>
      {text(scene.primaryItems[Math.max(0, active)] ?? '', vertical ? width - 70 : width * .5, 36, 90, 'center')}
      {shown ? text(`${formatChartDatum(shown.x)} · ${formatChartDatum(shown.y)}`, vertical ? width - 70 : width * .4, 36, 90, 'center') : null}
    </div>
  </div></Shell>;
};
