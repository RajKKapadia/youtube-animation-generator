export type TextWidthMeasurer = (text: string, fontSize: number) => number;

export interface FitTextToBoxOptions {
  lineHeight: number;
  maxFontSize: number;
  maxHeight: number;
  maxLines: number;
  maxWidth: number;
  measureWidth: TextWidthMeasurer;
  text: string;
}

export interface FittedTextLayout {
  fontSize: number;
  lines: string[];
}

const breakLongToken = (
  token: string,
  fontSize: number,
  maxWidth: number,
  measureWidth: TextWidthMeasurer,
): string[] => {
  const chunks: string[] = [];
  let chunk = '';

  for (const character of Array.from(token)) {
    const candidate = `${chunk}${character}`;
    if (chunk.length > 0 && measureWidth(candidate, fontSize) > maxWidth) {
      chunks.push(chunk);
      chunk = character;
    } else {
      chunk = candidate;
    }
  }

  if (chunk.length > 0) {
    chunks.push(chunk);
  }
  return chunks;
};

const wrapText = (
  text: string,
  fontSize: number,
  maxWidth: number,
  measureWidth: TextWidthMeasurer,
): string[] => {
  const words = text.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) {
    return [];
  }

  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine.length > 0 ? `${currentLine} ${word}` : word;
    if (measureWidth(candidate, fontSize) <= maxWidth) {
      currentLine = candidate;
      continue;
    }

    if (currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = '';
    }

    if (measureWidth(word, fontSize) <= maxWidth) {
      currentLine = word;
      continue;
    }

    const chunks = breakLongToken(word, fontSize, maxWidth, measureWidth);
    lines.push(...chunks.slice(0, -1));
    currentLine = chunks.at(-1) ?? '';
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }
  return lines;
};

export const fitTextToBox = ({
  lineHeight,
  maxFontSize,
  maxHeight,
  maxLines,
  maxWidth,
  measureWidth,
  text,
}: FitTextToBoxOptions): FittedTextLayout => {
  if (text.trim().length === 0) {
    return {fontSize: maxFontSize, lines: []};
  }

  const fits = (fontSize: number): {fits: boolean; lines: string[]} => {
    const lines = wrapText(text, fontSize, maxWidth, measureWidth);
    return {
      fits:
        lines.length <= maxLines &&
        lines.length * fontSize * lineHeight <= maxHeight,
      lines,
    };
  };

  const preferredSize = fits(maxFontSize);
  if (preferredSize.fits) {
    return {fontSize: maxFontSize, lines: preferredSize.lines};
  }

  let low = 1;
  let high = maxFontSize;
  let bestFontSize = 1;
  let bestLines = fits(1).lines;

  for (let iteration = 0; iteration < 24; iteration++) {
    const candidate = (low + high) / 2;
    const result = fits(candidate);
    if (result.fits) {
      bestFontSize = candidate;
      bestLines = result.lines;
      low = candidate;
    } else {
      high = candidate;
    }
  }

  const fontSize = Math.floor(bestFontSize * 10) / 10;
  return {
    fontSize,
    lines: wrapText(text, fontSize, maxWidth, measureWidth),
  };
};
