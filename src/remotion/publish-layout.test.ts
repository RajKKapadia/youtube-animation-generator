import {describe, expect, it} from 'vitest';
import {PUBLISH_COVER_PROFILES} from '../publish-profile.js';
import {publishCardLayout, publishCoverLayout, publishTextTokens} from './publish-layout.js';
import {fitTextToBox} from './text-fit.js';

const financialLabels = [
  'FII/FPI: 🔴 −₹3,111.94 Cr',
  'DII: 🟢 +₹8,930.12 Cr',
  'Combined: 🟢 +₹5,818.18 Cr',
];

describe('publish typography', () => {
  it.each([
    ['DII:+₹8,930.12 Cr', 'DII:+₹8,930.12 Cr'],
    ['FII/FPI: (−₹3,111.94 Cr)', '(−₹3,111.94 Cr)'],
    ['Net flow: +₹5,818.18 Cr.', '+₹5,818.18 Cr.'],
  ])('keeps punctuated amounts together in %s', (text, amount) => {
    const tokens = publishTextTokens(text);
    expect(tokens.join(' ')).toBe(text);
    expect(tokens).toContain(amount);
  });

  it.each([
    ...financialLabels,
    'Return: +12.50 %',
    'Revenue: USD 12.5 million',
    'Budget: Rs. 1,00,000 crore',
    'Balance: ₹−1,234.50 Cr',
    'Cloud2 uses 2FA and v1.2.3',
    'Producer → Queue → Consumer',
  ])('preserves source text and groups the amount in %s', (text) => {
    const tokens = publishTextTokens(text);
    expect(tokens.join(' ')).toBe(text);
    if (text.endsWith(' Cr')) expect(tokens.at(-1)).toMatch(/\d Cr$/u);
  });

  it.each(['16:9', '9:16'] as const)('uses the available card space in %s', (aspect) => {
    const layout = publishCoverLayout(PUBLISH_COVER_PROFILES[aspect]);
    if (!layout.vertical) {
      expect(layout.titleWidth + layout.gap + layout.panelWidth).toBe(layout.contentWidth);
    }
    const card = publishCardLayout(layout.panelContentWidth, !layout.vertical);
    expect(card.textWidth).toBeGreaterThan(layout.vertical ? 700 : 300);
    for (const text of financialLabels) {
      const fitted = fitTextToBox({
        text,
        wrapTokens: publishTextTokens(text),
        lineHeight: 1.16,
        maxWidth: card.textWidth,
        maxHeight: card.textHeight,
        maxLines: card.maxLines,
        maxFontSize: card.fontSize,
        measureWidth: (line, size) => Array.from(line).length * size * 0.56,
      });
      expect(fitted.lines.join(' ')).toBe(text);
      expect(fitted.lines.at(-1)).toMatch(/\d Cr$/u);
      expect(fitted.lines).not.toContain('Cr');
      expect(fitted.fontSize).toBeGreaterThanOrEqual(24);
    }
  });

  it('fits an atomic amount by reducing its size instead of splitting currency or unit', () => {
    const amount = '+₹8,930.12 Cr';
    const result = fitTextToBox({
      text: amount,
      wrapTokens: publishTextTokens(amount),
      maxWidth: 120,
      maxHeight: 80,
      maxLines: 3,
      maxFontSize: 30,
      lineHeight: 1.16,
      measureWidth: (line, size) => line.length * size * 0.6,
    });
    expect(result.lines).toEqual([amount]);
    expect(amount.length * result.fontSize * 0.6).toBeLessThanOrEqual(120);
  });
});
