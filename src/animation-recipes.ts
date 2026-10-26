import type {AnimationRecipe, AnimationTool} from './animation-contract.js';
import type {TimedNarrationScene, VideoPalette} from './types.js';
import {videoPaletteFor} from './visual-palettes.js';

export interface AnimationCue {id: string; startMs: number; durationMs: number}
export const sceneCues = (scene: TimedNarrationScene): AnimationCue[] => scene.beats.map(({id, startMs, durationMs}) => ({id, startMs, durationMs}));
export const sceneSpeakerIds = (scene: TimedNarrationScene): string[] => {
  const visual = scene.visual;
  if (visual.kind !== 'character-scene') return [];
  const turns = [...visual.speakers].sort((a, b) => a.primaryItemIndex - b.primaryItemIndex);
  let current = turns[0]!.castId;
  return scene.beats.map(beat => {for (const turn of turns) if (beat.primaryItemIndices.includes(turn.primaryItemIndex)) current = turn.castId; return current;});
};
export const suggestedAnimationTool = (scene: Pick<TimedNarrationScene, 'visual'>): AnimationTool | null => {
  if (scene.visual.kind === 'character-scene') return 'stykanimate';
  if (['icon-spotlight', 'icon-grid'].includes(scene.visual.kind)) return 'lottie';
  if (['kinetic-text', 'before-after', 'sequence-diagram', 'layered-architecture', 'data-visualization'].includes(scene.visual.kind)) return 'hyperframes';
  return null;
};
export const defaultAnimationRecipe = (scene: Pick<TimedNarrationScene, 'visual'>, tool: AnimationTool): AnimationRecipe => ({
  treatment: tool === 'stykanimate' ? 'character-exchange' : tool === 'lottie' ? 'icon-reveal' : scene.visual.kind === 'before-after' ? 'comparison' : scene.visual.kind === 'data-visualization' ? 'chart' : scene.visual.kind === 'kinetic-text' ? 'kinetic-text' : 'diagram',
  emphasis: 'reveal', accent: 'primary', gestures: [],
});
export const recipeSupportsTool = (recipe: AnimationRecipe, tool: AnimationTool) => tool === 'stykanimate'
  ? recipe.treatment === 'character-exchange'
  : tool === 'lottie' ? ['icon-reveal', 'pulse'].includes(recipe.treatment)
    : ['kinetic-text', 'comparison', 'diagram', 'chart'].includes(recipe.treatment);

// Sampling each interval separately preserves beat anchors when a recording pauses.
export const sourceTimeAt = (targetMs: number, source: AnimationCue[], target: AnimationCue[], sourceDuration: number, targetDuration: number): number => {
  const from = [{id: '__start', startMs: 0}, ...source, {id: '__end', startMs: sourceDuration}];
  const to = [{id: '__start', startMs: 0}, ...target, {id: '__end', startMs: targetDuration}];
  if (from.length !== to.length || from.some((cue, i) => cue.id !== to[i]!.id)) throw new Error('Animation cue ids changed; prepare the project again.');
  let index = 0;
  while (index + 1 < to.length - 1 && to[index + 1]!.startMs <= targetMs) index++;
  const a = to[index]!.startMs, b = to[index + 1]!.startMs;
  const ratio = Math.max(0, Math.min(1, (targetMs - a) / Math.max(1, b - a)));
  return Math.max(0, Math.min(sourceDuration - .001, from[index]!.startMs + ratio * (from[index + 1]!.startMs - from[index]!.startMs)));
};
const htmlEscape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export const hyperframesSource = (scene: TimedNarrationScene, width: number, height: number, palette: VideoPalette, recipe: AnimationRecipe): string => {
  const color = videoPaletteFor(palette).accents[recipe.accent], vertical = height > width;
  const items = scene.primaryItems.map((label, index) => ({label, timing: scene.primaryItemTimings[index]!}));
  if (recipe.treatment === 'comparison') {
    if (!scene.secondaryItems.length) throw new Error('A comparison recipe requires both source-backed sides.');
    items.splice(0, items.length, ...scene.primaryItems.flatMap((label, index) => [{label: `${scene.leftLabel}: ${label}`, timing: scene.primaryItemTimings[index]!}, ...scene.secondaryItems[index] ? [{label: `${scene.rightLabel}: ${scene.secondaryItems[index]}`, timing: scene.secondaryItemTimings[index]!}] : []]));
  }
  if (scene.visual.kind === 'sequence-diagram') {
    const visual = scene.visual;
    for (const message of visual.messages) {
      const from = visual.participants.find(p => p.id === message.from)?.label, to = visual.participants.find(p => p.id === message.to)?.label;
      items[message.primaryItemIndex]!.label = `${from} → ${to}: ${scene.primaryItems[message.primaryItemIndex]}`;
    }
  }
  let body = items.map((item, index) => `<div id="item-${index}" class="item"><span class="number">${String(index + 1).padStart(2, '0')}</span><span>${htmlEscape(item.label)}</span></div>`).join('');
  const fontSize = Math.min(vertical ? 52 : 50, items.length > 4 ? 36 : 54);
  if (recipe.treatment === 'chart') {
    if (scene.visual.kind !== 'data-visualization') throw new Error('Chart recipes require grounded chart data.');
    const chart = scene.visual.chart, plotWidth = width - (vertical ? 180 : 220), plotHeight = vertical ? 950 : 560;
    const rows = chart.type === 'line-chart' ? chart.points.map(point => ({datum: chart.data.find(d => d.id === point.yDatumId)!, x: chart.data.find(d => d.id === point.xDatumId)!, primary: point.primaryItemIndex}))
      : chart.data.map((datum, index) => ({datum, x: null, primary: Math.min(index, scene.primaryItems.length - 1)}));
    const minY = Math.min(0, ...rows.map(row => row.datum.value)), maxY = Math.max(1, ...rows.map(row => row.datum.value));
    const minX = Math.min(...rows.map((row, index) => row.x?.value ?? index)), maxX = Math.max(minX + 1, ...rows.map((row, index) => row.x?.value ?? index));
    items.splice(0, items.length, ...rows.map(row => ({label: row.datum.label, timing: scene.primaryItemTimings[row.primary]!})));
    const point = (row: typeof rows[number], index: number) => ({x: 60 + ((row.x?.value ?? index) - minX) / (maxX - minX) * (plotWidth - 130), y: plotHeight - 80 - (row.datum.value - minY) / (maxY - minY) * (plotHeight - 180)});
    body = `<svg viewBox="0 0 ${plotWidth} ${plotHeight}" style="width:100%;overflow:visible"><path d="M50 40 V${plotHeight - 70} H${plotWidth - 20}" stroke="#94a3b8" fill="none" stroke-width="3"/>` + rows.map((row, index) => {
      if (chart.type === 'line-chart') {
        const p = point(row, index), previous = index ? point(rows[index - 1]!, index - 1) : p;
        return `<g id="item-${index}"><line x1="${previous.x}" y1="${previous.y}" x2="${p.x}" y2="${p.y}" stroke="${color}" stroke-width="5"/><circle cx="${p.x}" cy="${p.y}" r="10" fill="${color}"/><text x="${p.x}" y="${p.y - 24}" text-anchor="${index === 0 ? 'start' : index === rows.length - 1 ? 'end' : 'middle'}" fill="white" font-size="28">${htmlEscape(row.datum.sourceToken)} ${htmlEscape(row.datum.unit)}</text><text x="${p.x}" y="${plotHeight - 25}" text-anchor="middle" fill="white" font-size="24">${htmlEscape(row.x?.sourceToken ?? '')}</text><text x="${p.x}" y="${plotHeight + 2}" text-anchor="middle" fill="white" font-size="20">${htmlEscape(row.x?.unit ?? '')}</text></g>`;
      }
      const y = 30 + index * (plotHeight - 20) / rows.length, barWidth = Math.abs(row.datum.value) / Math.max(Math.abs(minY), maxY) * plotWidth * .38;
      return `<g id="item-${index}"><text x="0" y="${y + 24}" fill="white" font-size="${vertical ? 28 : 30}">${htmlEscape(row.datum.label)}</text><rect x="${plotWidth * .45}" y="${y}" width="${barWidth}" height="25" fill="${color}"/><text x="${plotWidth * .46 + barWidth}" y="${y + 24}" fill="white" font-size="26">${htmlEscape(row.datum.sourceToken)} ${htmlEscape(row.datum.unit)}</text></g>`;
    }).join('') + '</svg>';
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;src:url(Inter.ttf)}*{box-sizing:border-box}html,body{margin:0;background:transparent;color:#f8fafc;font-family:Inter,sans-serif}
#main{position:relative;width:${width}px;height:${height}px;padding:${vertical ? '340px 72px 250px' : '270px 90px 90px'};overflow:hidden}
h1{font-size:${vertical ? 60 : 68}px;line-height:1.14;margin:0 0 64px;font-weight:750;max-width:100%}
.items{display:grid;gap:${vertical ? 30 : 32}px;grid-template-columns:${recipe.treatment === 'comparison' ? '1fr 1fr' : '1fr'}}
.item{font-size:${fontSize}px;line-height:1.2;display:flex;gap:26px;align-items:center;min-width:0}.number{font-size:30px;color:${color};flex-shrink:0;width:60px}.item span:last-child{overflow-wrap:anywhere}
</style><script src="gsap.min.js"></script></head><body><div id="main" data-composition-id="main" data-width="${width}" data-height="${height}" data-duration="${scene.durationMs / 1000}"><h1>${htmlEscape(scene.title)}</h1><div class="items">${body}</div></div>
<script>window.__timelines=window.__timelines||{};const t=gsap.timeline({paused:true});t.from('h1',{opacity:0,y:20,duration:.35},0);${items.map((item, index) => `t.from('#item-${index}',{opacity:0,x:28,duration:.4},/*cue:${encodeURIComponent(item.timing.beatId)}*/${item.timing.startMs / 1000});`).join('')}t.to({}, {duration:.001},/*end*/${Math.max(.001, scene.durationMs / 1000 - .001)});window.__timelines.main=t;</script></body></html>`;
};

export const lottieSource = (scene: TimedNarrationScene, width: number, height: number, fps: number, palette: VideoPalette, recipe: AnimationRecipe): Record<string, unknown> => {
  const end = Math.ceil(scene.durationMs / 1000 * fps), vertical = height > width;
  const hex = videoPaletteFor(palette).accents[recipe.accent].replace('#', '');
  const rgb = [0, 2, 4].map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const transform = (p: number[], start = 0) => ({o: {a: 1, k: [{t: start, s: [0], e: [100], o: {x: [.2], y: [0]}, i: {x: [.8], y: [1]}}, {t: start + fps * .35, s: [100]}]}, r: {a: 0, k: 0}, p: {a: 0, k: p}, a: {a: 0, k: [0, 0, 0]}, s: {a: 0, k: [100, 100, 100]}});
  const text = (value: string, index: number, y: number, size: number, start: number) => ({ddd: 0, ind: index, ty: 5, nm: value, ip: 0, op: end, st: 0, ks: transform([width / 2, y, 0], start), t: {d: {k: [{t: 0, s: {t: value, f: 'Inter', s: size, j: 2, tr: 0, lh: size * 1.2, fc: [0.97, .98, 1]}}]}, m: {g: 1, a: {a: 0, k: [0, 0]}}, a: []}});
  const wrap = (value: string, limit: number) => {const lines = ['']; for (const word of value.split(/\s+/u)) {if ((lines.at(-1)!.length + word.length + 1) > limit) lines.push(word); else lines[lines.length - 1] += (lines.at(-1) ? ' ' : '') + word;} return lines.join('\r');};
  const layers: unknown[] = [text(wrap(scene.title, vertical ? 28 : 45), 1, vertical ? 400 : 310, vertical ? 48 : 62, 0)];
  scene.primaryItems.forEach((label, i) => {
    const start = (scene.primaryItemTimings[i]?.startMs ?? 0) / 1000 * fps;
    const cy = (vertical ? 620 : 460) + i * (vertical ? Math.min(200, 900 / Math.max(1, scene.primaryItems.length - 1)) : Math.min(120, 400 / Math.max(1, scene.primaryItems.length - 1)));
    const layer = text(wrap(label, vertical ? 26 : 52), 10 + i, cy + 12, vertical ? 40 : 44, start);
    layer.ks.p.k[0] = width * .58;
    layers.push(layer);
    const scaleKeys = Array.from({length: Math.max(2, Math.ceil((end - start) / fps * 2))}, (_, index) => ({t: start + index * fps / 2, s: index % 2 ? [108, 108, 100] : [100, 100, 100], o: {x: [.2], y: [0]}, i: {x: [.8], y: [1]}}));
    layers.push({ddd: 0, ind: 30 + i, ty: 4, nm: `Focal ${i}`, ip: 0, op: end, st: 0, ks: {...transform([width / 2 - (vertical ? 350 : 650), cy, 0], start), ...(recipe.treatment === 'pulse' || recipe.emphasis === 'pulse' ? {s: {a: 1, k: scaleKeys}} : {})}, shapes: [
      {ty: 'el', p: {a: 0, k: [0, 0]}, s: {a: 0, k: [68, 68]}, nm: 'Focal ring'},
      {ty: 'st', c: {a: 0, k: [...rgb, 1]}, o: {a: 0, k: 100}, w: {a: 0, k: 7}, lc: 2, lj: 2},
      {ty: 'tm', s: {a: 0, k: 0}, e: {a: 1, k: [{t: start, s: [0], e: [100], o: {x: [.2], y: [0]}, i: {x: [.8], y: [1]}}, {t: start + fps * .6, s: [100]}]}, o: {a: 0, k: 0}},
    ]});
  });
  return {v: '5.12.0', fr: fps, ip: 0, op: end, w: width, h: height, nm: scene.title, ddd: 0, assets: [], fonts: {list: [{fName: 'Inter', fFamily: 'Inter', fStyle: 'Regular', ascent: 75}]}, markers: sceneCues(scene).map(cue => ({cm: cue.id, tm: cue.startMs / 1000 * fps, dr: cue.durationMs / 1000 * fps})), layers};
};
