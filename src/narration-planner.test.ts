import {describe, expect, it} from 'vitest';
import {
  assertSourceBackedNarratedVisuals,
  estimateDraftNarrationTiming,
  materializeNarratedVisuals,
  narrationScriptMarkdown,
  narratedVisualPlanningWarnings,
  recoverUnsupportedNarratedVisuals,
  NARRATION_RESPONSE_SHAPE,
  narrationResponseShapeFor,
} from './narration-planner.js';
import {
  draftNarratedPlanSchema,
  narratedPlanSchema,
  narratedVisualKindSchema,
  type AnimationTemplate,
  type NarratedSceneVisual,
  type NarrationExpression,
} from './types.js';
import type {AssetRegistry} from './asset-registry.js';

const validPlan = {
  version: 7 as const,
  kind: 'narrated-video' as const,
  stage: 'draft' as const,
  sourceText: 'Queues let producers and consumers operate independently.',
  generatedAt: '2026-08-23T00:00:00.000Z',
  model: 'fixture',
  targetDurationSeconds: 60,
  language: 'en',
  title: 'Why queues help',
  palette: 'emerald' as const,
  assetAttributions: [] as any[],
  mediaAssets: [],
  scenes: [
    {
      id: 'queue-flow',
      backgroundPrompt: 'Abstract producer and consumer connected by a glowing queue.',
      template: 'process-flow' as AnimationTemplate,
      title: 'A queue decouples work',
      primaryItems: ['Producer', 'Queue', 'Consumer'],
      secondaryItems: [] as string[],
      leftLabel: '',
      rightLabel: '',
      reason: 'Shows the source flow.',
      icons: {
        focal: null as string | null,
        primary: [] as string[],
        secondary: [] as string[],
      },
      visual: {
        kind: 'diagram' as const,
        motion: 'reveal' as const,
        motif: 'none' as const,
        assetId: null,
      } as NarratedSceneVisual,
      beats: [
        {
          id: 'producer',
          expression: 'none' as NarrationExpression,
          phrases: [
            {id: 'producer-submits', text: 'The producer submits work.'},
          ],
          primaryItemIndices: [0],
          secondaryItemIndices: [],
        },
        {
          id: 'queue-consumer',
          expression: 'none' as NarrationExpression,
          phrases: [
            {id: 'queue-holds', text: 'The queue lets the consumer'},
            {id: 'consumer-independent', text: 'process it independently.'},
          ],
          primaryItemIndices: [1, 2],
          secondaryItemIndices: [],
        },
      ],
    },
  ],
};

describe('draftNarratedPlanSchema', () => {
  it('accepts exactly-once semantic item anchors', () => {
    const parsed = draftNarratedPlanSchema.parse(validPlan);
    expect(parsed.scenes).toHaveLength(1);
    expect(parsed.palette).toBe('emerald');
    expect(parsed.scenes[0]!.icons).toEqual({focal: null, primary: [], secondary: []});
  });

  it('persists explicit icon selections and validates their item alignment', () => {
    const explicit = structuredClone(validPlan);
    explicit.scenes[0]!.icons = {
      focal: 'queue',
      primary: ['user', 'queue', 'worker'],
      secondary: [],
    };
    expect(draftNarratedPlanSchema.parse(explicit).scenes[0]!.icons.primary)
      .toEqual(['user', 'queue', 'worker']);
    explicit.scenes[0]!.icons.primary.pop();
    expect(() => draftNarratedPlanSchema.parse(explicit)).toThrow(
      'one entry for every matching visual item',
    );
  });

  it('keeps original source and web research metadata paired', () => {
    const research = {
      version: 1 as const,
      kind: 'web-research' as const,
      sourceHash: 'a'.repeat(64),
      researchedAt: '2026-08-28T00:00:00.000Z',
      model: 'fixture',
      mode: 'required' as const,
      searchContextSize: 'medium' as const,
      maxToolCalls: 4 as const,
      queries: ['queue documentation'],
      summary: 'Checked the main claim.',
      claims: [{
        claim: 'Durable queues retain pending work.',
        status: 'supported' as const,
        sourceUrls: ['https://example.com/queues'],
      }],
      sources: [{
        url: 'https://example.com/queues',
        title: 'Queue documentation',
      }],
    };
    expect(() => draftNarratedPlanSchema.parse({...validPlan, research}))
      .toThrow('preserve both originalSourceText and research metadata');
    expect(() => draftNarratedPlanSchema.parse({
      ...validPlan,
      originalSourceText: validPlan.sourceText,
      research,
    })).not.toThrow();
  });

  it('accepts only curated video palettes', () => {
    for (const palette of ['cyan', 'violet', 'emerald', 'amber', 'rose'] as const) {
      expect(draftNarratedPlanSchema.parse({...validPlan, palette}).palette)
        .toBe(palette);
    }
    expect(() => draftNarratedPlanSchema.parse({...validPlan, palette: 'random'}))
      .toThrow();
  });

  it('rejects duplicate, missing, and unordered anchors', () => {
    const duplicate = structuredClone(validPlan);
    duplicate.scenes[0]!.beats[1]!.primaryItemIndices = [0, 2];
    expect(() => draftNarratedPlanSchema.parse(duplicate)).toThrow(
      'anchored exactly once',
    );

    const unordered = structuredClone(validPlan);
    unordered.scenes[0]!.beats[0]!.primaryItemIndices = [1];
    unordered.scenes[0]!.beats[1]!.primaryItemIndices = [0, 2];
    expect(() => draftNarratedPlanSchema.parse(unordered)).toThrow(
      'anchored exactly once',
    );
  });

  it('requires comparison scenes to have a second side', () => {
    const invalid = structuredClone(validPlan);
    invalid.scenes[0]!.template = 'comparison';
    expect(() => draftNarratedPlanSchema.parse(invalid)).toThrow(
      'require secondary items',
    );
  });

  it('keeps raw Supertonic tags out of subtitle phrases', () => {
    const invalid = structuredClone(validPlan);
    invalid.scenes[0]!.beats[0]!.phrases[0]!.text = '<laugh> Surprise.';
    expect(() => draftNarratedPlanSchema.parse(invalid)).toThrow(
      'expression field',
    );
  });

  it('limits expressions and rejects consecutive expressive beats', () => {
    const consecutive = structuredClone(validPlan);
    consecutive.scenes[0]!.beats[0]!.expression = 'breath';
    consecutive.scenes[0]!.beats[1]!.expression = 'laugh';
    expect(() => draftNarratedPlanSchema.parse(consecutive)).toThrow(
      'cannot be used on consecutive narration beats',
    );

    const tooMany = structuredClone(validPlan);
    tooMany.targetDurationSeconds = 15;
    tooMany.scenes[0]!.beats[0]!.expression = 'breath';
    tooMany.scenes[0]!.beats.push({
      id: 'conclusion',
      expression: 'sigh',
      phrases: [{id: 'conclusion-phrase', text: 'That is the result.'}],
      primaryItemIndices: [],
      secondaryItemIndices: [],
    });
    expect(() => draftNarratedPlanSchema.parse(tooMany)).toThrow(
      'at most 1 voice expression',
    );
  });

  it('normalizes version-2 phrase plans with neutral expressions', () => {
    const legacyV2 = {
      ...validPlan,
      version: 2 as const,
      scenes: validPlan.scenes.map((scene) => ({
        ...scene,
        beats: scene.beats.map(({expression: _expression, ...beat}) => beat),
      })),
    };
    const parsed = narratedPlanSchema.parse(JSON.parse(JSON.stringify(legacyV2)));
    expect(parsed.version).toBe(7);
    expect(parsed.palette).toBe('cyan');
    expect(parsed.scenes[0]!.beats.map((beat) => beat.expression)).toEqual([
      'none',
      'none',
    ]);
    expect(parsed.scenes[0]!.visual).toEqual({
      kind: 'diagram',
      motion: 'reveal',
      motif: 'none',
      assetId: null,
    });
  });

  it('normalizes version-3 expression plans to the compatibility palette', () => {
    const {palette: _palette, ...withoutPalette} = validPlan;
    const parsed = narratedPlanSchema.parse({
      ...withoutPalette,
      version: 3,
    });
    expect(parsed.version).toBe(7);
    expect(parsed.palette).toBe('cyan');
    expect(parsed.scenes[0]!.beats[0]!.expression).toBe('none');
  });

  it('normalizes version-1 beats into one phrase and supplies a background prompt', () => {
    const legacy = {
      ...validPlan,
      version: 1 as const,
      scenes: validPlan.scenes.map((scene) => ({
        ...scene,
        backgroundPrompt: undefined,
        beats: scene.beats.map((beat) => ({
          id: beat.id,
          text: beat.phrases.map(({text}) => text).join(' '),
          primaryItemIndices: beat.primaryItemIndices,
          secondaryItemIndices: beat.secondaryItemIndices,
        })),
      })),
    };
    const raw = JSON.parse(JSON.stringify(legacy));
    const parsed = narratedPlanSchema.parse(raw);
    expect(parsed.version).toBe(7);
    expect(parsed.palette).toBe('cyan');
    expect(parsed.scenes[0]!.backgroundPrompt).toContain('A queue decouples work');
    expect(parsed.scenes[0]!.beats[0]!.phrases).toEqual([
      {id: 'producer-phrase-1', text: 'The producer submits work.'},
    ]);
    expect(parsed.scenes[0]!.beats[0]!.expression).toBe('none');
  });

  it('normalizes version-4 palette plans to diagram visuals', () => {
    const legacy = structuredClone(validPlan) as Record<string, unknown>;
    legacy.version = 4;
    const scenes = legacy.scenes as Array<Record<string, unknown>>;
    delete scenes[0]!.visual;
    const parsed = narratedPlanSchema.parse(legacy);
    expect(parsed.version).toBe(7);
    expect(parsed.palette).toBe('emerald');
    expect(parsed.scenes[0]!.visual).toEqual({
      kind: 'diagram',
      motion: 'reveal',
      motif: 'none',
      assetId: null,
    });
  });

  it('normalizes version-5 visual plans without adding v6 media or chart metadata', () => {
    const legacy = structuredClone(validPlan) as Record<string, unknown>;
    legacy.version = 5;
    delete legacy.mediaAssets;
    const parsed = narratedPlanSchema.parse(legacy);
    expect(parsed.version).toBe(7);
    expect(parsed.mediaAssets).toEqual([]);
    expect(parsed.scenes[0]!.visual.kind).toBe('diagram');
  });

  it('validates exact chart evidence and numeric tokens in version-6 plans', () => {
    const sourceEvidence = 'Jalapeño reached 85,448 tokens/s while Existing reached 44,960 tokens/s.';
    const chartPlan = structuredClone(validPlan);
    chartPlan.sourceText = sourceEvidence;
    chartPlan.scenes[0]!.visual = {
      kind: 'data-visualization',
      motion: 'count-up',
      motif: 'analytics',
      assetId: null,
      chart: {
        type: 'metric-cards',
        title: 'Throughput',
        data: [
          {id: 'new', label: 'Jalapeño', value: 85_448, unit: 'tokens/s', precision: 0, sourceEvidence, sourceToken: '85,448'},
          {id: 'old', label: 'Existing', value: 44_960, unit: 'tokens/s', precision: 0, sourceEvidence, sourceToken: '44,960'},
        ],
        series: [],
        categories: [],
        cards: [
          {id: 'new-card', label: 'Jalapeño', datumId: 'new', annotationId: 'ratio'},
          {id: 'old-card', label: 'Existing', datumId: 'old', annotationId: null},
        ],
        derivedAnnotations: [{id: 'ratio', label: 'Higher', operation: 'ratio', currentDatumId: 'new', baselineDatumId: 'old', precision: 1}],
      },
    } as typeof chartPlan.scenes[0]['visual'];
    expect(draftNarratedPlanSchema.parse(chartPlan).scenes[0]!.visual.kind)
      .toBe('data-visualization');
    const unsupported = structuredClone(chartPlan);
    if (unsupported.scenes[0]!.visual.kind === 'data-visualization') {
      unsupported.scenes[0]!.visual.chart.data[0]!.sourceToken = '99,999';
    }
    expect(() => draftNarratedPlanSchema.parse(unsupported)).toThrow(
      'exact source label, numeric token, value, and evidence',
    );
  });

  it('rejects incompatible visual treatment and motion combinations', () => {
    const invalid = structuredClone(validPlan);
    invalid.scenes[0]!.visual.kind = 'metric-focus' as 'diagram';
    invalid.scenes[0]!.visual.motion = 'orbit' as 'reveal';
    expect(() => draftNarratedPlanSchema.parse(invalid)).toThrow(
      'orbit is not supported by metric-focus',
    );
  });

  it('normalizes version-1 timed beats without changing their sample timing', () => {
    const legacyTimed = {
      version: 1,
      kind: 'narrated-video',
      stage: 'timed',
      sourceText: validPlan.sourceText,
      generatedAt: validPlan.generatedAt,
      model: validPlan.model,
      targetDurationSeconds: 1,
      language: 'en',
      title: validPlan.title,
      sampleRate: 1_000,
      voice: 'M1',
      ttsSpeed: 1.05,
      ttsSteps: 8,
      voiceoverFile: 'audio/voiceover.wav',
      durationMs: 1_000,
      totalSamples: 1_000,
      scenes: [{
        ...validPlan.scenes[0],
        backgroundPrompt: undefined,
        startMs: 0,
        durationMs: 1_000,
        beats: [
          {
            id: 'producer',
            text: 'The producer submits work.',
            primaryItemIndices: [0],
            secondaryItemIndices: [],
            startMs: 100,
            durationMs: 300,
            audioFile: 'beats/producer.wav',
            sampleCount: 300,
          },
          {
            id: 'queue-consumer',
            text: 'The queue lets the consumer process it independently.',
            primaryItemIndices: [1, 2],
            secondaryItemIndices: [],
            startMs: 500,
            durationMs: 300,
            audioFile: 'beats/queue-consumer.wav',
            sampleCount: 300,
          },
        ],
        primaryItemTimings: [
          {beatId: 'producer', startMs: 100},
          {beatId: 'queue-consumer', startMs: 500},
          {beatId: 'queue-consumer', startMs: 500},
        ],
        secondaryItemTimings: [],
      }],
    };
    const parsed = narratedPlanSchema.parse(JSON.parse(JSON.stringify(legacyTimed)));
    expect(parsed.stage).toBe('timed');
    if (parsed.stage !== 'timed') throw new Error('Expected a timed plan.');
    expect(parsed.scenes[0]!.beats[1]!.phrases[0]).toEqual({
      id: 'queue-consumer-phrase-1',
      text: 'The queue lets the consumer process it independently.',
      startMs: 500,
      durationMs: 300,
      sampleCount: 300,
    });
    const invalidTiming = structuredClone(parsed);
    invalidTiming.scenes[0]!.beats[1]!.phrases[0]!.startMs = 900;
    expect(() => narratedPlanSchema.parse(invalidTiming)).toThrow(
      'Phrase timing must fall inside its narration beat',
    );
  });
});

describe('narrated visual planning warnings', () => {
  const registry: AssetRegistry = {
    assetRoot: '/tmp/assets',
    brandAssets: [],
    iconAssets: [],
    motionAssets: [],
    warnings: [],
  };

  it('warns without rejecting truthful low-variety plans and unresolved brands', () => {
    const scene = structuredClone(validPlan.scenes[0]!);
    const scenes = [0, 1, 2, 3].map((index) => ({
      ...scene,
      id: `scene-${index}`,
      visual: index === 3
        ? {kind: 'brand-showcase' as const, motion: 'reveal' as const, motif: 'data' as const}
        : {kind: 'diagram' as const, motion: 'reveal' as const, motif: 'none' as const},
    }));
    const warnings = narratedVisualPlanningWarnings({
      registry,
      scenes,
      sourceText: 'Producer Queue Consumer',
    });
    expect(warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('fewer than three truthful visual treatments'),
      expect.stringContaining('Adjacent scenes repeat'),
      expect.stringContaining('No exact logo is registered'),
    ]));
  });

  it('rejects invented company names and statistics before saving a plan', () => {
    const scene = structuredClone(validPlan.scenes[0]!);
    expect(() => assertSourceBackedNarratedVisuals({
      sourceText: 'OpenAI reported 42%.',
      scenes: [{
        ...scene,
        primaryItems: ['Invented Corp'],
        beats: [{...scene.beats[0]!, primaryItemIndices: [0]}],
        visual: {kind: 'brand-showcase', motion: 'reveal', motif: 'automation'},
      }],
    })).toThrow('not present in the source text');
    expect(() => assertSourceBackedNarratedVisuals({
      sourceText: 'OpenAI reported 42%.',
      scenes: [{
        ...scene,
        primaryItems: ['73% improvement'],
        beats: [{...scene.beats[0]!, primaryItemIndices: [0]}],
        visual: {kind: 'metric-focus', motion: 'count-up', motif: 'analytics'},
      }],
    })).toThrow('source-unsupported number');
  });

  it('accepts chart evidence separated by Markdown whitespace', () => {
    const sourceText = 'Jalapeño\n\n85,448 tokens/s\n\nExisting best\n\n44,960 tokens/s';
    const scene = structuredClone(validPlan.scenes[0]!);
    const chartScene = {
      ...scene,
      visual: {
        kind: 'data-visualization' as const,
        motion: 'count-up' as const,
        motif: 'analytics' as const,
        chart: {
          type: 'metric-cards' as const,
          title: 'Throughput',
          data: [
            {id: 'jalapeno', label: 'Jalapeño', value: 85_448, unit: 'tokens/s', precision: 0, sourceEvidence: 'Jalapeño 85,448 tokens/s', sourceToken: '85,448'},
            {id: 'existing', label: 'Existing best', value: 44_960, unit: 'tokens/s', precision: 0, sourceEvidence: 'Existing best 44,960 tokens/s', sourceToken: '44,960'},
          ],
          series: [],
          categories: [],
          cards: [
            {id: 'jalapeno-card', label: 'Jalapeño', datumId: 'jalapeno', annotationId: null},
            {id: 'existing-card', label: 'Existing best', datumId: 'existing', annotationId: null},
          ],
          derivedAnnotations: [],
        },
      },
    };
    expect(() => assertSourceBackedNarratedVisuals({
      scenes: [chartScene],
      sourceText,
    })).not.toThrow();
  });

  it('downgrades an unverified optional chart without discarding narration', () => {
    const scene = structuredClone(validPlan.scenes[0]!);
    const recovered = recoverUnsupportedNarratedVisuals({
      sourceText: 'The source reports 42 requests per second.',
      scenes: [{
        ...scene,
        visual: {
          kind: 'data-visualization',
          motion: 'count-up',
          motif: 'analytics',
          chart: {
            type: 'metric-cards',
            title: 'Requests',
            data: [
              {id: 'reported', label: 'source', value: 42, unit: 'requests/s', precision: 0, sourceEvidence: 'source reports 42 requests per second', sourceToken: '42'},
              {id: 'invented', label: 'baseline', value: 99, unit: 'requests/s', precision: 0, sourceEvidence: 'baseline reports 99 requests per second', sourceToken: '99'},
            ],
            series: [],
            categories: [],
            cards: [
              {id: 'reported-card', label: 'Reported', datumId: 'reported', annotationId: null},
              {id: 'invented-card', label: 'Baseline', datumId: 'invented', annotationId: null},
            ],
            derivedAnnotations: [],
          },
        },
      }],
    });
    expect(recovered.scenes[0]!.visual).toEqual({
      kind: 'diagram',
      motion: 'reveal',
      motif: 'none',
    });
    expect(recovered.scenes[0]!.beats).toEqual(scene.beats);
    expect(recovered.warnings).toEqual([
      expect.stringContaining('code-native fallback'),
    ]);
    expect(() => assertSourceBackedNarratedVisuals({
      scenes: recovered.scenes,
      sourceText: 'The source reports 42 requests per second.',
    })).not.toThrow();
  });

  it('requires exact grounding and explicit opt-in for generated foreground directions', () => {
    const scene = structuredClone(validPlan.scenes[0]!);
    const generatedScene = {
      ...scene,
      visual: {
        kind: 'image-focus' as const,
        motion: 'push-in' as const,
        motif: 'automation' as const,
        source: 'generated' as const,
        localImageId: null,
        generatedDirection: {
          sourceEvidence: 'Queues let producers and consumers operate independently.',
          sourceAnchors: ['Queues', 'consumers'],
          narrationBeat: 'The producer submits work.',
          subject: 'producers and consumers',
          action: 'operating independently around a queue',
          environment: 'a literal package handoff environment',
          framing: 'wide editorial composition',
          exclusions: ['text', 'logos'],
          depiction: 'literal' as const,
          metaphorRelationship: null,
        },
        fit: 'cover' as const,
        focalPosition: 'center' as const,
      },
    };
    expect(() => assertSourceBackedNarratedVisuals({
      sourceText: validPlan.sourceText,
      scenes: [generatedScene],
      generatedVisuals: 'off',
    })).toThrow('generated visuals are off');
    expect(() => assertSourceBackedNarratedVisuals({
      sourceText: validPlan.sourceText,
      scenes: [generatedScene],
      generatedVisuals: 'auto',
    })).not.toThrow();
    const unsupported = structuredClone(generatedScene);
    unsupported.visual.generatedDirection.sourceAnchors[1] = 'Invented Corp';
    expect(() => assertSourceBackedNarratedVisuals({
      sourceText: validPlan.sourceText,
      scenes: [unsupported],
      generatedVisuals: 'auto',
    })).toThrow('Invented Corp');
    expect(() => assertSourceBackedNarratedVisuals({
      sourceText: validPlan.sourceText,
      scenes: [0, 1, 2].map((index) => ({...generatedScene, id: `generated-${index}`})),
      generatedVisuals: 'auto',
    })).toThrow('more than two generated foreground scenes');
  });

  it('rejects an unrelated chat icon and agent animation for a hardware standard', () => {
    const scene = structuredClone(validPlan.scenes[0]!);
    const result = materializeNarratedVisuals({
      registry: {
        assetRoot: '/tmp/assets',
        brandAssets: [],
        iconAssets: [],
        warnings: [],
        motionAssets: [{
          id: 'ai-agent-pulse',
          motifs: ['automation'],
          keywords: ['AI agent', 'automation', 'tool use'],
          file: 'motion/ai-agent-pulse.json',
          sourceUrl: 'https://example.com/agent',
          creator: 'Fixture',
          license: 'Fixture',
          licenseUrl: null,
          attribution: 'Fixture',
          attributionRequired: false,
          loop: 'loop',
          playbackRate: 1,
          priority: 100,
          colorMap: {},
        }],
      },
      scenes: [{
        ...scene,
        title: 'A common language for hardware',
        primaryItems: ['Model Hardware Standard', 'CPU', 'GPU accelerator'],
        beats: [{
          ...scene.beats[0]!,
          phrases: [{id: 'standard-phrase', text: 'One standard connects model hardware.'}],
          primaryItemIndices: [0, 1, 2],
        }],
        icons: {
          focal: 'message-chat',
          primary: ['message-chat', 'hardware-cpu', 'hardware-accelerator'],
          secondary: [],
        },
        visual: {kind: 'icon-spotlight', motion: 'pulse', motif: 'automation'},
      }],
    });
    expect(result.scenes[0]!.icons).toEqual({
      focal: 'standard-protocol',
      primary: ['standard-protocol', 'hardware-cpu', 'hardware-accelerator'],
      secondary: [],
    });
    expect(result.scenes[0]!.visual.assetId).toBeNull();
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('message-chat'),
      expect.stringContaining('no registered animation matched'),
    ]));
  });

  it('keeps literal icons for Rust benefits and a mixed-language workflow', () => {
    const base = structuredClone(validPlan.scenes[0]!);
    const result = materializeNarratedVisuals({
      registry: {
        assetRoot: '/tmp/assets',
        brandAssets: [],
        iconAssets: [],
        warnings: [],
        motionAssets: [],
      },
      scenes: [{
        ...base,
        id: 'why-rust',
        title: 'Why Teams Choose Rust',
        primaryItems: [
          'Memory safety',
          'Near-C / C++ performance',
          'Single native executable',
          'Concurrency and system work',
        ],
        icons: {
          focal: 'security',
          primary: ['security', 'hardware-cpu', 'code', 'automation-workflow'],
          secondary: [],
        },
        visual: {kind: 'icon-spotlight', motion: 'reveal', motif: 'security'},
      }, {
        ...base,
        id: 'likely-future',
        title: 'The Likely Future',
        primaryItems: [
          'AI-assisted migration',
          'Tests, benchmarks, and review',
          'Mixed-language product',
          'Rust performance core',
        ],
        icons: {
          focal: 'ai-agent',
          primary: ['ai-agent', 'analytics-chart', 'standard-compatible', 'hardware-cpu'],
          secondary: [],
        },
        visual: {kind: 'agent-workflow', motion: 'flow', motif: 'ai-agent'},
      }],
    });
    expect(result.scenes[0]!.icons).toEqual({
      focal: 'security',
      primary: ['security', 'hardware-cpu', 'code', 'automation-workflow'],
      secondary: [],
    });
    expect(result.scenes[1]!.icons).toEqual({
      focal: 'ai-agent',
      primary: ['ai-agent', 'analytics-chart', 'standard-compatible', 'hardware-cpu'],
      secondary: [],
    });
  });
});

describe('narrationScriptMarkdown', () => {
  it('writes spoken quantities while keeping the draft caption text unchanged', () => {
    const plan = structuredClone(validPlan);
    plan.scenes[0]!.beats[0]!.phrases = [{id: 'amount', text: 'Total ₹8,930.12 crore.'}];
    expect(narrationScriptMarkdown(plan)).toContain('Total eight thousand nine hundred and thirty point one two crore rupees.');
    expect(plan.scenes[0]!.beats[0]!.phrases[0]!.text).toBe('Total ₹8,930.12 crore.');
  });

  it('writes the complete spoken script with reviewable expression cues', () => {
    const expressive = structuredClone(validPlan);
    expressive.scenes[0]!.beats[0]!.expression = 'breath';
    expect(narrationScriptMarkdown(draftNarratedPlanSchema.parse(expressive))).toBe(
      '# Why queues help\n\n' +
        '## Scene 1: A queue decouples work\n\n' +
        '*[breath]* The producer submits work. The queue lets the consumer process it independently.\n',
    );
  });

  it('adds clickable research sources to an enriched script', () => {
    const enriched = draftNarratedPlanSchema.parse({
      ...validPlan,
      originalSourceText: validPlan.sourceText,
      research: {
        version: 1,
        kind: 'web-research',
        sourceHash: 'a'.repeat(64),
        researchedAt: '2026-08-28T00:00:00.000Z',
        model: 'fixture',
        mode: 'required',
        searchContextSize: 'medium',
        maxToolCalls: 4,
        queries: ['queue documentation'],
        summary: 'Checked the main claim.',
        claims: [{
          claim: 'Durable queues retain pending work.',
          status: 'supported',
          sourceUrls: ['https://example.com/queues'],
        }],
        sources: [{
          url: 'https://example.com/queues',
          title: 'Queue documentation',
        }],
      },
    });
    expect(narrationScriptMarkdown(enriched)).toContain(
      '## Research sources\n\n1. [Queue documentation](https://example.com/queues)',
    );
  });
});

describe('estimateDraftNarrationTiming', () => {
  it('converts a draft plan to a valid timed plan at 44100 Hz', () => {
    const draft = draftNarratedPlanSchema.parse(validPlan);
    const timed = estimateDraftNarrationTiming(draft);
    expect(timed.stage).toBe('timed');
    expect(timed.sampleRate).toBe(44100);
    expect(timed.voiceoverFile).toBe('preview-silent.wav');
    expect(timed.scenes.length).toBe(draft.scenes.length);
    for (const scene of timed.scenes) {
      for (const beat of scene.beats) {
        expect(beat.startMs + beat.durationMs).toBeLessThanOrEqual(scene.durationMs);
      }
      for (const timing of scene.primaryItemTimings) {
        expect(timing.startMs).toBeLessThan(scene.durationMs);
      }
    }
  });

  it('handles scenes with many beats and short words without overflowing scene duration', () => {
    for (const beatCount of [8, 10, 12]) {
      const beats = Array.from({length: beatCount}, (_, i) => ({
        id: `beat-${i + 1}`,
        expression: 'none' as const,
        phrases: [{id: `p-${i + 1}`, text: 'Word'}],
        primaryItemIndices: i === 0 ? [0] : [],
        secondaryItemIndices: [],
      }));
      const plan = draftNarratedPlanSchema.parse({
        ...validPlan,
        scenes: [{
          ...validPlan.scenes[0]!,
          primaryItems: ['Single item'],
          beats,
        }],
      });
      const timed = estimateDraftNarrationTiming(plan);
      const scene = timed.scenes[0]!;
      expect(scene.beats.length).toBe(beatCount);
      const lastBeat = scene.beats[scene.beats.length - 1]!;
      expect(lastBeat.startMs + lastBeat.durationMs).toBeLessThanOrEqual(scene.durationMs);
      expect(scene.primaryItemTimings[0]!.startMs).toBeLessThan(scene.durationMs);
    }
  });
});



describe('NARRATION_RESPONSE_SHAPE', () => {
  // Providers without a structured-output helper receive this schema in the
  // prompt. A hand-maintained copy once drifted and silently restricted every
  // non-OpenAI provider to the original seven treatments, so assert that the
  // derived schema offers every kind the pipeline can actually render.
  it('offers every visual kind to providers that read the schema from the prompt', () => {
    for (const kind of narratedVisualKindSchema.options) {
      expect(NARRATION_RESPONSE_SHAPE).toContain(`"${kind}"`);
    }
  });

  // Free provider tiers cap a single request at 6-8k tokens and the rest of
  // the planning prompt already spends ~2.4k. A schema that creeps past this
  // budget produces a 413 at runtime, so fail here instead.
  it('fits the token budget that free provider tiers allow', () => {
    expect(NARRATION_RESPONSE_SHAPE.length).toBeLessThan(6_000);
  });

  it('keeps literal discriminators rather than collapsing them to string', () => {
    // z.literal() renders as `const`; mishandling it turns the visual union
    // into an unusable `kind:string` and hides every treatment.
    expect(NARRATION_RESPONSE_SHAPE).not.toContain('kind:string');
  });
});

describe('narrationResponseShapeFor', () => {
  const base = {
    generatedVisuals: 'off' as const,
    hasCodeSources: false,
    hasLocalImages: false,
    sourceHasNumbers: false,
  };

  // Free tiers count input and output against one per-minute budget, so a
  // schema describing treatments this run cannot use directly costs the plan
  // its output budget. A 6,695-token prompt left too little room to finish the
  // JSON, which surfaced as a 400 rather than a clean rate-limit error.
  it('drops treatments the run cannot use', () => {
    const shape = narrationResponseShapeFor(base);
    expect(shape).not.toContain('"code-walkthrough"');
    expect(shape).not.toContain('"image-focus"');
    expect(shape).not.toContain('"data-visualization"');
  });

  it('keeps every treatment the run can still reach', () => {
    const shape = narrationResponseShapeFor(base);
    for (const kind of ['diagram', 'character-scene', 'kinetic-text', 'sequence-diagram']) {
      expect(shape).toContain(`"${kind}"`);
    }
  });

  it('restores a treatment once its precondition is met', () => {
    expect(narrationResponseShapeFor({...base, hasCodeSources: true}))
      .toContain('"code-walkthrough"');
    expect(narrationResponseShapeFor({...base, sourceHasNumbers: true}))
      .toContain('"data-visualization"');
    expect(narrationResponseShapeFor({...base, generatedVisuals: 'auto'}))
      .toContain('"image-focus"');
    expect(narrationResponseShapeFor({...base, hasLocalImages: true}))
      .toContain('"image-focus"');
  });

  it('is meaningfully smaller than the unpruned shape', () => {
    expect(narrationResponseShapeFor(base).length)
      .toBeLessThan(NARRATION_RESPONSE_SHAPE.length * 0.65);
  });
});

describe('recoverUnsupportedNarratedVisuals — character scenes', () => {
  const sourceText = 'You arrive at a hotel to check in. The front desk asks the guest for identity proof and whether the guest is over 18.';
  const scene = (callout: unknown): DraftNarrationSceneSuggestion => ({
    id: 'scene-1', title: 'Check-in', template: 'callout',
    primaryItems: ['first step', 'second step'], secondaryItems: [],
    leftLabel: '', rightLabel: '', reason: 'Staged exchange',
    backgroundPrompt: 'Plain reception interior, unlit, out of focus.',
    icons: {focal: null, primary: [null, null], secondary: []},
    beats: [{
      id: 'b1', expression: 'none',
      phrases: [{id: 'p1', text: 'The guest arrives.'}],
      primaryItemIndices: [0, 1], secondaryItemIndices: [],
    }],
    visual: {
      kind: 'character-scene', motion: 'reveal', motif: 'security',
      set: 'counter', sign: 'RECEPTION',
      cast: [
        {id: 'guest', label: 'guest', position: 'left', outfit: 'casual', age: 'adult', behindSet: false, prop: null, propPrimaryItemIndex: null},
        {id: 'desk', label: 'front desk', position: 'right', outfit: 'uniform', age: 'adult', behindSet: true, prop: null, propPrimaryItemIndex: null},
      ],
      speakers: [{primaryItemIndex: 0, castId: 'guest'}],
      callout,
      sourceEvidence: 'The front desk asks the guest for identity proof',
    },
  } as DraftNarrationSceneSuggestion);

  // Losing a correctly staged scene because one decorative caption could not
  // be sourced costs far more than it protects.
  it('keeps the scene and drops a callout the source does not support', () => {
    const {scenes, warnings} = recoverUnsupportedNarratedVisuals({
      scenes: [scene({icon: null, eyebrow: 'Claim', headline: 'Invented outcome', tone: 'positive', primaryItemIndex: 1, sourceEvidence: 'The hotel keeps a photocopy forever.'})],
      sourceText,
    });
    expect(scenes[0]!.visual.kind).toBe('character-scene');
    expect((scenes[0]!.visual as {callout: unknown}).callout).toBeNull();
    expect(warnings.join(' ')).toContain('dropped its callout');
  });

  it('keeps a callout the source does support', () => {
    const grounded = {icon: null, eyebrow: 'Check', headline: 'Over 18', tone: 'positive', primaryItemIndex: 1, sourceEvidence: 'whether the guest is over 18'};
    const {scenes} = recoverUnsupportedNarratedVisuals({scenes: [scene(grounded)], sourceText});
    expect((scenes[0]!.visual as {callout: unknown}).callout).toEqual(grounded);
  });

  it('still falls back when the scene itself is unsupported', () => {
    const invented = scene(null);
    (invented.visual as {sourceEvidence: string}).sourceEvidence =
      'The butler carries the luggage upstairs.';
    const {scenes} = recoverUnsupportedNarratedVisuals({scenes: [invented], sourceText});
    expect(scenes[0]!.visual.kind).toBe('diagram');
  });
});
