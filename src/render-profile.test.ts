import {describe, expect, it} from 'vitest';
import {
  RENDER_PROFILES,
  VERTICAL_TEMPLATE_LAYOUTS,
  aspectSuffix,
  isVerticalDimensions,
  profilesForSelection,
} from './render-profile.js';
import {outputManifestSchema} from './types.js';
import {filenameForClip} from './render.js';
import {narratedOutputPaths} from './narrated-render.js';

describe('render profiles', () => {
  it('expands both in stable landscape-first order', () => {
    expect(profilesForSelection('both').map(({aspectRatio}) => aspectRatio)).toEqual([
      '16:9',
      '9:16',
    ]);
    expect(aspectSuffix('16:9')).toBe('');
    expect(aspectSuffix('9:16')).toBe('-9x16');
  });

  it('uses native dimensions and the requested vertical safe area', () => {
    expect(RENDER_PROFILES['16:9']).toMatchObject({width: 1920, height: 1080});
    expect(RENDER_PROFILES['9:16']).toEqual({
      aspectRatio: '9:16',
      width: 1080,
      height: 1920,
      safeArea: {top: 120, right: 72, bottom: 220, left: 72},
    });
    expect(isVerticalDimensions(1080, 1920)).toBe(true);
  });

  it('defines dedicated native vertical structures for all templates', () => {
    expect(VERTICAL_TEMPLATE_LAYOUTS).toEqual({
      'process-flow': {axis: 'vertical', structure: 'stacked-nodes-down-connectors'},
      comparison: {axis: 'vertical', structure: 'stacked-panels-compact-grid'},
      timeline: {axis: 'vertical', structure: 'vertical-spine-alternating-stages'},
      callout: {axis: 'vertical', structure: 'tall-centered-panel'},
    });
  });

  it('adds the vertical suffix before overlay and narrated extensions', () => {
    const clip = {
      id: 'animation-01',
      startCue: 1,
      endCue: 1,
      sourceStartMs: 12_000,
      sourceEndMs: 14_000,
      durationMs: 2_000,
      transcript: 'A queue.',
      template: 'callout' as const,
      title: 'Queue',
      primaryItems: ['Queue'],
      secondaryItems: [],
      leftLabel: '',
      rightLabel: '',
      reason: 'Definition',
    };
    expect(filenameForClip(clip, 0, 'green', RENDER_PROFILES['9:16'])).toBe(
      '00h00m12s-01-callout-9x16.mp4',
    );
    expect(
      narratedOutputPaths({
        aspectRatio: 'both',
        outputDirectory: '/tmp/out',
        stem: 'summary',
      }).map(({file}) => file),
    ).toEqual(['summary.mp4', 'summary-9x16.mp4']);
  });
});

describe('version 2 manifests', () => {
  it('requires aspect ratio and native dimensions', () => {
    expect(() => outputManifestSchema.parse({
      version: 1,
      sourceSubtitle: '/tmp/example.srt',
      generatedAt: 'now',
      format: 'green',
      clips: [],
    })).toThrow();
    expect(outputManifestSchema.parse({
      version: 2,
      sourceSubtitle: '/tmp/example.srt',
      generatedAt: 'now',
      format: 'green',
      aspectRatio: '9:16',
      width: 1080,
      height: 1920,
      clips: [],
    })).toMatchObject({aspectRatio: '9:16', width: 1080, height: 1920});
  });
});
