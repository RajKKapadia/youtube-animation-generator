import {describe, expect, it} from 'vitest';
import {draftNarratedPlanSchema, type DraftNarratedPlan} from '../types.js';
import {selectSupertonicVoice} from './voice-selection.js';

const planFor = (title: string, sourceText: string): DraftNarratedPlan =>
  draftNarratedPlanSchema.parse({
    version: 6,
    kind: 'narrated-video',
    stage: 'draft',
    sourceText,
    generatedAt: '2026-08-27T00:00:00.000Z',
    model: 'fixture',
    targetDurationSeconds: 10,
    language: 'en',
    title,
    palette: 'cyan',
    mediaAssets: [],
    scenes: [{
      id: 'scene',
      backgroundPrompt: 'Abstract background.',
      template: 'callout',
      title,
      primaryItems: ['Topic'],
      secondaryItems: [],
      leftLabel: '',
      rightLabel: '',
      reason: 'Explains the source.',
      visual: {kind: 'icon-spotlight', motion: 'reveal', motif: 'none', assetId: null},
      beats: [{
        id: 'beat',
        expression: 'none',
        phrases: [{id: 'phrase', text: sourceText}],
        primaryItemIndices: [0],
        secondaryItemIndices: [],
      }],
    }],
  });

describe('automatic Supertonic voice selection', () => {
  it.each([
    ['Investor briefing', 'A financial valuation and earnings analysis for investors.', 'M3'],
    ['Beginner onboarding tutorial', 'Learn the product through a friendly walkthrough.', 'M4'],
    ['A reflective journey', 'A warm emotional story told like an audiobook.', 'M5'],
    ['Playful social video', 'A cheerful game for kids and youth audiences.', 'F2'],
    ['Daily news broadcast', 'A formal headline report and investigation.', 'F3'],
    ['Software architecture training', 'Technical system design and AI workflow engineering.', 'F4'],
    ['Supportive wellness guide', 'Gentle empathetic health and personal growth guidance.', 'F5'],
  ])('selects an official use-case profile for %s', (title, source, expected) => {
    const selection = selectSupertonicVoice(planFor(title, source));
    expect(selection.voice).toBe(expected);
    expect(selection.matchedSignals.length).toBeGreaterThan(0);
    expect(selection.reason).toContain(selection.matchedSignals[0]);
  });

  it('falls back deterministically to the general-purpose M1 preset', () => {
    expect(selectSupertonicVoice(planFor('Untitled topic', 'Several concepts are presented.')))
      .toMatchObject({voice: 'M1', matchedSignals: []});
  });
});
