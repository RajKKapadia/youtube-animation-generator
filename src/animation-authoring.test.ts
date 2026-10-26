import {afterEach, describe, expect, it, vi} from 'vitest';
import {authorAnimationRecipe} from './animation-tools.js';
import {animationProofPlan} from './verify-animation-tools.js';

const ai = vi.hoisted(() => ({provider: 'openai', responses: vi.fn(), chat: vi.fn()}));
vi.mock('./ai-client.js', async original => ({...await original<typeof import('./ai-client.js')>(), createAIClient: () => ({provider: ai.provider, model: 'fixture', client: {responses: {create: ai.responses}, chat: {completions: {create: ai.chat}}}})}));
afterEach(() => vi.clearAllMocks());
describe('bounded animation authoring providers', () => {
  it('uses strict structured output for OpenAI and prefaults decorative fields', async () => {
    ai.provider = 'openai'; ai.responses.mockResolvedValue({output_text: '{"treatment":"icon-reveal"}'});
    expect(await authorAnimationRecipe(animationProofPlan().scenes[1]!, 'lottie')).toEqual({treatment: 'icon-reveal', emphasis: 'reveal', accent: 'primary', gestures: []});
    expect(ai.responses.mock.calls[0]![0].text.format.type).toBe('json_schema'); expect(ai.chat).not.toHaveBeenCalled();
  });
  it.each(['gemini', 'groq'])('uses the schema-derived JSON shape for %s', async provider => {
    ai.provider = provider; ai.chat.mockResolvedValue({choices: [{message: {content: '{"treatment":"character-exchange"}'}}]});
    await authorAnimationRecipe(animationProofPlan().scenes[2]!, 'stykanimate');
    expect(ai.chat.mock.calls[0]![0].messages[0].content).toContain('character-exchange'); expect(ai.responses).not.toHaveBeenCalled();
  });
  it('bounds repair attempts and never accepts an incompatible recipe', async () => {
    ai.provider = 'openai'; ai.responses.mockResolvedValue({output_text: '{"treatment":"chart"}'});
    await expect(authorAnimationRecipe(animationProofPlan().scenes[1]!, 'lottie')).rejects.toThrow('not supported'); expect(ai.responses).toHaveBeenCalledTimes(2);
  });
});
