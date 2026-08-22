import type {CSSProperties} from 'react';
import {measureText} from '@remotion/layout-utils';
import {fitTextToBox} from './text-fit.js';

export const RENDER_FONT_FAMILY = 'Arial, Helvetica, sans-serif';

export interface FittedTextProps {
  align?: 'center' | 'left' | 'right';
  fontWeight: number | string;
  letterSpacing?: number;
  lineHeight: number;
  maxFontSize: number;
  maxHeight: number;
  maxLines: number;
  maxWidth: number;
  style?: CSSProperties;
  text: string;
}

export const FittedText = ({
  align = 'center',
  fontWeight,
  letterSpacing = 0,
  lineHeight,
  maxFontSize,
  maxHeight,
  maxLines,
  maxWidth,
  style,
  text,
}: FittedTextProps) => {
  const layout = fitTextToBox({
    lineHeight,
    maxFontSize,
    maxHeight,
    maxLines,
    maxWidth,
    measureWidth: (value, fontSize) =>
      measureText({
        fontFamily: RENDER_FONT_FAMILY,
        fontSize,
        fontWeight,
        letterSpacing: `${letterSpacing}px`,
        text: value,
        validateFontIsLoaded: false,
      }).width,
    text,
  });

  return (
    <span
      style={{
        ...style,
        alignItems:
          align === 'center' ? 'center' : align === 'left' ? 'flex-start' : 'flex-end',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: RENDER_FONT_FAMILY,
        fontSize: layout.fontSize,
        fontWeight,
        letterSpacing,
        lineHeight,
        maxHeight,
        maxWidth,
        textAlign: align,
      }}
    >
      {layout.lines.map((line, index) => (
        <span key={`${line}-${index}`} style={{display: 'block', whiteSpace: 'nowrap'}}>
          {line}
        </span>
      ))}
    </span>
  );
};
