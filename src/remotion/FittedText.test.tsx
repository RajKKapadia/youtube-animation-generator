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
