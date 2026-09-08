import {describe, expect, it, vi} from 'vitest';

const {measureTextMock} = vi.hoisted(() => ({
  measureTextMock: vi.fn(({
    fontSize,
    text,
    textTransform,
  }: {
    fontSize: number;
    text: string;
    textTransform?: string;
  }) => ({
    height: fontSize,
    width: (textTransform === 'uppercase' ? text.length * 0.8 : text.length * 0.5)
      * fontSize,
  })),
}));

vi.mock('@remotion/layout-utils', () => ({measureText: measureTextMock}));

import {FittedText} from './FittedText.js';

describe('FittedText', () => {
  it('keeps a supplied amount and unit together while fitting the full group', () => {
    const text = '+₹8,930.12 Cr';
    const rendered = FittedText({
      fontWeight: 800,
      lineHeight: 1.16,
      maxFontSize: 30,
      maxHeight: 70,
      maxLines: 2,
      maxWidth: 140,
      text,
      wrapTokens: [text],
    });
    expect(rendered.props.children).toHaveLength(1);
    expect(rendered.props.children[0]?.props.children).toBe(text);
    expect(rendered.props.style.fontSize).toBeLessThan(30);
  });

  it('measures text using the same text transform that it renders', () => {
    const rendered = FittedText({
      align: 'left',
      fontWeight: 900,
      lineHeight: 1,
      maxFontSize: 22,
      maxHeight: 28,
      maxLines: 1,
      maxWidth: 370,
      style: {textTransform: 'uppercase'},
      text: 'The new AI engineering standard',
    });

    expect(measureTextMock).toHaveBeenCalledWith(expect.objectContaining({
      textTransform: 'uppercase',
    }));
    expect(rendered.props.style.fontSize).toBeLessThan(22);
  });
});
