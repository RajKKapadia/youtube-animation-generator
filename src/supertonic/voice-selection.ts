import type {DraftNarratedPlan} from '../types.js';
import type {SupertonicVoice} from './protocol.js';

export interface SupertonicVoiceProfile {
  voice: SupertonicVoice;
  description: string;
  useCases: string;
  signals: readonly string[];
}

export interface SupertonicVoiceSelection {
  voice: SupertonicVoice;
  reason: string;
  matchedSignals: string[];
}

// Profiles and use cases follow Supertone's preset voice guide:
// https://supertone-inc.github.io/supertonic-py/voices/
export const SUPERTONIC_VOICE_PROFILES: readonly SupertonicVoiceProfile[] = [
  {
    voice: 'M1',
    description: 'lively, upbeat, clear, and confident',
    useCases: 'promotional videos, upbeat explainers, announcements, and general narration',
    signals: ['promotion', 'promotional', 'launch', 'upbeat', 'exciting', 'announcement', 'feature reveal', 'overview'],
  },
  {
    voice: 'M2',
    description: 'deep, composed, serious, and grounded',
    useCases: 'corporate content, serious announcements, documentaries, and formal guidance',
    signals: ['serious', 'corporate', 'risk', 'security', 'crisis', 'policy', 'governance', 'compliance'],
  },
  {
    voice: 'M3',
    description: 'polished, authoritative, and trustworthy',
    useCases: 'business presentations, leadership messages, and investor briefings',
    signals: ['investor', 'investment', 'valuation', 'earnings', 'finance', 'financial', 'leadership', 'executive', 'business strategy', 'market analysis'],
  },
  {
    voice: 'M4',
    description: 'soft, neutral, approachable, and friendly',
    useCases: 'educational content, friendly explainers, onboarding, and youth-oriented narration',
    signals: ['tutorial', 'educational', 'lesson', 'learn', 'beginner', 'onboarding', 'how to', 'walkthrough', 'friendly explainer'],
  },
  {
    voice: 'M5',
    description: 'warm, soft-spoken, calm, and story-driven',
    useCases: 'audiobooks, reflective stories, relaxation, and emotional narration',
    signals: ['story', 'storytelling', 'journey', 'memoir', 'audiobook', 'reflective', 'emotional', 'bedtime', 'relaxation'],
  },
  {
    voice: 'F1',
    description: 'calm, steady, composed, and professional',
    useCases: 'guided instructions, customer service, meditation, and professional narration',
    signals: ['instructions', 'procedure', 'customer service', 'support guide', 'guided', 'meditation', 'professional narration'],
  },
  {
    voice: 'F2',
    description: 'bright, cheerful, playful, and youthful',
    useCases: 'youth content, playful ads, social videos, and character voices',
    signals: ['playful', 'youth', 'kids', 'children', 'social media', 'cheerful', 'character', 'game', 'fun'],
  },
  {
    voice: 'F3',
    description: 'clear, articulate, professional, and broadcast-ready',
    useCases: 'news, documentaries, commercials, and formal presentations',
    signals: ['news', 'headline', 'broadcast', 'documentary', 'investigation', 'formal presentation', 'commercial'],
  },
  {
    voice: 'F4',
    description: 'crisp, confident, expressive, and direct',
    useCases: 'technical training, business explainers, pitch decks, and product announcements',
    signals: ['training', 'product', 'pitch', 'technical', 'architecture', 'software', 'engineering', 'data', 'artificial intelligence', 'ai', 'workflow', 'system design'],
  },
  {
    voice: 'F5',
    description: 'kind, gentle, calm, and soothing',
    useCases: 'wellness, supportive messages, audiobooks, and empathetic narration',
    signals: ['wellness', 'wellbeing', 'empathetic', 'supportive', 'health', 'healing', 'care', 'gentle', 'personal growth'],
  },
] as const;

const normalizeForMatching = (value: string): string =>
  ` ${value.toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;

const containsSignal = (text: string, signal: string): boolean =>
  text.includes(normalizeForMatching(signal));

export const selectSupertonicVoice = (
  plan: DraftNarratedPlan,
): SupertonicVoiceSelection => {
  const weightedText = [
    {text: plan.title, weight: 5},
    {text: plan.scenes.map((scene) => scene.title).join(' '), weight: 3},
    {
      text: plan.scenes.map((scene) => [
        scene.template,
        scene.visual.kind,
        scene.visual.motif,
        ...scene.primaryItems,
        ...scene.secondaryItems,
      ].join(' ')).join(' '),
      weight: 2,
    },
    {
      text: [
        plan.sourceText,
        ...plan.scenes.flatMap((scene) =>
          scene.beats.flatMap((beat) => beat.phrases.map((phrase) => phrase.text)),
        ),
      ].join(' '),
      weight: 1,
    },
  ].map(({text, weight}) => ({text: normalizeForMatching(text), weight}));

  const scored = SUPERTONIC_VOICE_PROFILES.map((profile, profileIndex) => {
    const matchedSignals = profile.signals.filter((signal) =>
      weightedText.some(({text}) => containsSignal(text, signal)),
    );
    const score = profile.signals.reduce(
      (total, signal) => total + weightedText.reduce(
        (subtotal, field) => subtotal + (containsSignal(field.text, signal) ? field.weight : 0),
        0,
      ),
      0,
    );
    return {matchedSignals, profile, profileIndex, score};
  }).sort((left, right) => right.score - left.score || left.profileIndex - right.profileIndex);

  const best = scored[0]!;
  if (best.score === 0) {
    const fallback = SUPERTONIC_VOICE_PROFILES[0]!;
    return {
      voice: fallback.voice,
      matchedSignals: [],
      reason: `${fallback.description}; Supertone recommends it for ${fallback.useCases}, and the plan had no stronger voice-profile signals.`,
    };
  }

  return {
    voice: best.profile.voice,
    matchedSignals: best.matchedSignals,
    reason: `${best.profile.description}; matched ${best.matchedSignals.slice(0, 3).join(', ')} and is recommended for ${best.profile.useCases}.`,
  };
};
