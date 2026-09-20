import {describe, expect, it} from 'vitest';
import {
  countWords,
  MAX_TOPIC_WORDS,
  MIN_TOPIC_WORDS,
  topicDocumentIssues,
  topicDocumentSchema,
  topicFileName,
  TOPIC_AUTHOR_PROMPT,
  type TopicDocument,
} from './topic-author.js';

const body = (extra = '') => `Identity is the foundational key to inclusion.

Consider an individual opening a bank account. The individual hands the bank officer an identity document, and the bank officer reads every detail on it. ${extra}

${Array.from({length: 22}, (_, index) => `Supporting sentence number ${index} explains one aspect of the mechanism clearly.`).join(' ')}`;

const document = (over: Partial<TopicDocument> = {}): TopicDocument => ({
  title: 'Digital identity',
  participants: ['individual', 'bank officer'],
  interactionSentence: 'The individual hands the bank officer an identity document, and the bank officer reads every detail on it.',
  markdown: body(),
  ...over,
});

describe('countWords', () => {
  it('counts whitespace-separated words and ignores padding', () => {
    expect(countWords('  one   two\nthree ')).toBe(3);
    expect(countWords('   ')).toBe(0);
  });
});

describe('topicDocumentIssues', () => {
  it('accepts a document that satisfies every downstream rule', () => {
    expect(topicDocumentIssues(document())).toEqual([]);
  });

  // The planner grounds a staged scene with one excerpt naming every
  // participant; without that sentence the video silently falls back to text.
  it('rejects an interaction sentence missing a participant', () => {
    const issues = topicDocumentIssues(document({
      interactionSentence: 'The individual hands over an identity document.',
      markdown: body().replace('The individual hands the bank officer an identity document, and the bank officer reads every detail on it.', 'The individual hands over an identity document.'),
    }));
    expect(issues.join(' ')).toContain('must name every participant');
  });

  it('rejects an interaction sentence that is not in the document', () => {
    expect(topicDocumentIssues(document({
      interactionSentence: 'The clerk stamps a passport at the border.',
    })).join(' ')).toContain('not copied verbatim');
  });

  it('rejects a participant that never appears in the prose', () => {
    expect(topicDocumentIssues(document({
      participants: ['individual', 'notary'],
    })).join(' ')).toContain('"notary" never appears');
  });

  it('rejects duplicate participants', () => {
    const issues = topicDocumentIssues(document({participants: ['individual', 'Individual']}));
    expect(issues.join(' ')).toContain('distinct roles');
  });

  it('rejects a document that is too short to explain anything', () => {
    expect(topicDocumentIssues(document({markdown: 'Too short.'})).join(' '))
      .toContain(`at least ${MIN_TOPIC_WORDS}`);
  });

  it('rejects a document that would blow the planning token budget', () => {
    const long = `${body()} ${'padding word '.repeat(MAX_TOPIC_WORDS)}`;
    expect(topicDocumentIssues(document({markdown: long})).join(' '))
      .toContain(`under ${MAX_TOPIC_WORDS}`);
  });

  it('reports every problem at once rather than one per round trip', () => {
    expect(topicDocumentIssues(document({
      markdown: 'Short.',
      participants: ['ghost', 'phantom'],
    })).length).toBeGreaterThan(2);
  });

  it('matches participants regardless of casing or spacing', () => {
    expect(topicDocumentIssues(document({
      participants: ['Individual', 'Bank  Officer'],
      interactionSentence: 'The  individual hands the bank officer an identity document, and the bank officer reads every detail on it.',
    }))).toEqual([]);
  });
});

describe('topicDocumentSchema', () => {
  it('requires at least two participants, since one person is not an exchange', () => {
    expect(topicDocumentSchema.safeParse({...document(), participants: ['individual']}).success).toBe(false);
  });

  it('caps the cast at the three the renderer can stage', () => {
    expect(topicDocumentSchema.safeParse({...document(), participants: ['a', 'b', 'c', 'd']}).success).toBe(false);
  });
});

describe('topicFileName', () => {
  it('slugifies a topic into a markdown filename', () => {
    expect(topicFileName('Happy International Identity Day!')).toBe('happy-international-identity-day.md');
    expect(topicFileName('Zero-Knowledge Proofs & You')).toBe('zero-knowledge-proofs-you.md');
  });

  it('never produces a leading, trailing or doubled separator', () => {
    expect(topicFileName('  ...Hello...  ')).toBe('hello.md');
  });

  it('falls back rather than producing an empty name', () => {
    expect(topicFileName('!!!')).toBe('topic.md');
  });

  it('keeps the name a reasonable length', () => {
    expect(topicFileName('word '.repeat(60)).length).toBeLessThanOrEqual(64);
  });
});

describe('TOPIC_AUTHOR_PROMPT', () => {
  it('states the constraints the planner will later enforce', () => {
    for (const rule of ['CONCRETE HUMAN SCENE', 'NO INVENTED FACTS', 'QUOTABLE', 'VOICE']) {
      expect(TOPIC_AUTHOR_PROMPT).toContain(rule);
    }
  });

  it('keeps the stated word limits in step with the validator', () => {
    expect(TOPIC_AUTHOR_PROMPT).toContain(String(MIN_TOPIC_WORDS));
    expect(TOPIC_AUTHOR_PROMPT).toContain(String(MAX_TOPIC_WORDS));
  });
});
