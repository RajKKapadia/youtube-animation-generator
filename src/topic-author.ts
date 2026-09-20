import {z} from 'zod';
import {createAIClient, withTransientRetries} from './ai-client.js';

// Writes the SOURCE document the rest of the pipeline consumes. Everything the
// planner can do downstream is bounded by what this text contains, and the
// failure modes are specific rather than general:
//
//   - A character scene needs two named people interacting in one sentence,
//     because the scene is grounded by an extractive excerpt of that sentence.
//   - Every visual treatment is grounded by exact excerpts, so the prose has to
//     be quotable: short declarative sentences, not sprawling clauses.
//   - Charts need real numbers; an invented one propagates into the video as a
//     fabricated claim, so a topic with no real figures must state none.
//   - The whole source rides in the planning prompt, and free provider tiers
//     cap a request at 6-8k tokens, so length is a hard constraint not a style.

export const MIN_TOPIC_WORDS = 220;
export const MAX_TOPIC_WORDS = 400;

export const topicDocumentSchema = z.object({
  title: z.string().trim().min(3).max(90),
  /** Role names of the people staged in the concrete scene. */
  participants: z.array(z.string().trim().min(2).max(32)).min(2).max(3),
  /** The sentence in which those participants interact, copied verbatim. */
  interactionSentence: z.string().trim().min(20).max(400),
  markdown: z.string().trim().min(200),
});

export type TopicDocument = z.infer<typeof topicDocumentSchema>;

export const countWords = (text: string): number =>
  text.trim().split(/\s+/u).filter(Boolean).length;

const normalize = (value: string): string =>
  value.normalize('NFKC').replace(/\s+/gu, ' ').toLocaleLowerCase('en-US').trim();

/**
 * Checks the document against what the planner will later demand of it, so a
 * weak draft is rejected here rather than silently producing a video with no
 * characters. Returns every problem at once: one round trip per fix is slow
 * and the model repairs better with the full list.
 */
export const topicDocumentIssues = (document: TopicDocument): string[] => {
  const issues: string[] = [];
  const words = countWords(document.markdown);
  if (words < MIN_TOPIC_WORDS) issues.push(`the document is ${words} words; write at least ${MIN_TOPIC_WORDS}`);
  if (words > MAX_TOPIC_WORDS) issues.push(`the document is ${words} words; keep it under ${MAX_TOPIC_WORDS}`);

  const body = normalize(document.markdown);
  for (const participant of document.participants) {
    if (!body.includes(normalize(participant))) {
      issues.push(`participant "${participant}" never appears in the document`);
    }
  }
  if (new Set(document.participants.map(normalize)).size !== document.participants.length) {
    issues.push('the participants must be distinct roles');
  }

  // The scene is grounded by an excerpt, so the sentence has to exist verbatim.
  const sentence = normalize(document.interactionSentence);
  if (!body.includes(sentence)) {
    issues.push('interactionSentence is not copied verbatim from the document');
  } else if (!document.participants.every((participant) => sentence.includes(normalize(participant)))) {
    issues.push('interactionSentence must name every participant, so one excerpt proves the exchange');
  }
  return issues;
};

export const TOPIC_AUTHOR_PROMPT = `You write the SOURCE document for a short narrated explainer video. You are not writing the video; you are writing the factual text a storyboard planner will later draw from. That planner can only show what this document literally says, and it verifies claims by copying exact sentences out of it.

Write about the supplied topic in plain Markdown. Requirements:

1. LENGTH: ${MIN_TOPIC_WORDS}-${MAX_TOPIC_WORDS} words. This is a hard limit: the whole document is sent in a later prompt with a strict token budget.

2. A CONCRETE HUMAN SCENE. Include one short paragraph describing a specific moment between two named people, for example a customer and a bank officer, a patient and a pharmacist, a traveller and a border officer. Name the roles plainly and repeat those exact role names whenever you refer to them. At least one sentence must contain BOTH roles and describe what passes between them. Without this the video cannot show characters at all; it falls back to text on a background. Choose roles that genuinely belong to the topic. If the topic is abstract, find the moment where a real person encounters it.

3. QUOTABLE SENTENCES. Prefer short declarative sentences that read well when copied out on their own. Avoid long clause chains, rhetorical questions, and sentences that only make sense with the previous one.

4. NO INVENTED FACTS. Include a number, date, or named organisation only if you are confident it is accurate. A wrong figure becomes a false claim on screen. It is better to state a mechanism than to guess a statistic. Never invent a source, study, or quotation.

5. SHAPE: open with the single clearest statement of what matters and why. Then the concrete human scene. Then two to four supporting points as a short bulleted list. Then one closing sentence stating the takeaway. If the topic is a day of observance, an anniversary, or an event, open with the greeting or occasion line and return to it in the closing sentence.

6. VOICE: third person and consistent. Do not switch between "you" and "the individual". Do not address the viewer. Do not refer to the video, the document, or yourself.

Return JSON with these fields:
- "title": a short title for the document
- "participants": the two or three role names used in the concrete scene, spelled exactly as they appear in the text
- "interactionSentence": the one sentence from your document containing every participant, copied verbatim
- "markdown": the complete document`;

export interface TopicAuthorOptions {
  topic: string;
  model?: string | undefined;
  provider?: string | undefined;
  /** Extra direction from the caller, passed through verbatim. */
  guidance?: string | undefined;
  maxAttempts?: number;
}

export const authorTopicDocument = async (
  options: TopicAuthorOptions,
): Promise<{document: TopicDocument; model: string; provider: string; attempts: number}> => {
  const {client, model, provider} = createAIClient({
    model: options.model,
    provider: options.provider,
  });
  const maxAttempts = options.maxAttempts ?? 3;
  const messages: Array<{role: 'system' | 'user'; content: string}> = [
    {role: 'system', content: TOPIC_AUTHOR_PROMPT},
    {
      role: 'user',
      content: `TOPIC: ${options.topic}${options.guidance ? `\n\nADDITIONAL DIRECTION: ${options.guidance}` : ''}`,
    },
  ];

  let lastIssues: string[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) {
      // Only the problems go back, never the rejected draft: echoing it roughly
      // doubles the request and free tiers reject the retry outright.
      messages.push({
        role: 'user',
        content: `Your previous document was rejected. Write a new one that avoids these problems: ${lastIssues.join('; ')}.`,
      });
    }
    const response = await withTransientRetries(() => client.chat.completions.create({
      model,
      messages,
      response_format: {type: 'json_object'},
      ...(provider === 'groq' ? {reasoning_effort: 'low' as const} : {}),
    }));
    const text = response.choices[0]?.message?.content;
    if (!text) throw new Error(`${provider} returned no topic document.`);

    const parsed = topicDocumentSchema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      lastIssues = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'document'}: ${issue.message}`);
      continue;
    }
    const issues = topicDocumentIssues(parsed.data);
    if (issues.length === 0) {
      return {document: parsed.data, model, provider, attempts: attempt};
    }
    lastIssues = issues;
  }
  throw new Error(
    `Could not write a usable topic document after ${maxAttempts} attempts: ${lastIssues.join('; ')}`,
  );
};

/** `Happy International Identity Day` -> `happy-international-identity-day` */
export const topicFileName = (topic: string): string => {
  const slug = topic
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .toLocaleLowerCase('en-US')
    .slice(0, 60)
    .replace(/-+$/u, '');
  return `${slug || 'topic'}.md`;
};
