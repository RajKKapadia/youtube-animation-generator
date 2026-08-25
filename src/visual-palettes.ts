import {z} from 'zod';

export const videoPaletteSchema = z.enum([
  'cyan',
  'violet',
  'emerald',
  'amber',
  'rose',
]);

export type VideoPalette = z.infer<typeof videoPaletteSchema>;

export interface VideoPaletteDefinition {
  accents: {
    primary: string;
    secondary: string;
  };
  background: {
    start: string;
    middle: string;
    end: string;
  };
  generatedImageDirection: string;
  intendedFit: string;
}

export const VIDEO_PALETTES: Record<VideoPalette, VideoPaletteDefinition> = {
  cyan: {
    background: {start: '#020617', middle: '#07142B', end: '#0A1023'},
    accents: {primary: '#22D3EE', secondary: '#A78BFA'},
    generatedImageDirection:
      'Use a deep navy technical palette with luminous cyan and restrained violet accents.',
    intendedFit: 'Infrastructure, clarity, precision, and technical subjects.',
  },
  violet: {
    background: {start: '#0D0718', middle: '#1B0D2B', end: '#24103A'},
    accents: {primary: '#A78BFA', secondary: '#F472B6'},
    generatedImageDirection:
      'Use a deep plum palette with luminous violet and restrained pink accents.',
    intendedFit: 'Artificial intelligence, creativity, abstraction, and future-facing ideas.',
  },
  emerald: {
    background: {start: '#031510', middle: '#06251D', end: '#0A3027'},
    accents: {primary: '#34D399', secondary: '#22D3EE'},
    generatedImageDirection:
      'Use a deep teal-green palette with luminous emerald and restrained cyan accents.',
    intendedFit: 'Growth, optimization, reliability, and sustainable systems.',
  },
  amber: {
    background: {start: '#171005', middle: '#2A1A08', end: '#351D07'},
    accents: {primary: '#FBBF24', secondary: '#FB923C'},
    generatedImageDirection:
      'Use a deep amber-brown palette with luminous gold and restrained orange accents.',
    intendedFit: 'Cost, urgency, caution, tradeoffs, and consequential decisions.',
  },
  rose: {
    background: {start: '#18080E', middle: '#2D0D1B', end: '#3A1022'},
    accents: {primary: '#FB7185', secondary: '#C084FC'},
    generatedImageDirection:
      'Use a deep burgundy palette with luminous rose and restrained purple accents.',
    intendedFit: 'Human impact, conflict, risk, and emotionally significant subjects.',
  },
};

export const videoPaletteFor = (
  palette: VideoPalette,
): VideoPaletteDefinition => VIDEO_PALETTES[palette];

export const hexToRgba = (hex: string, alpha: number): string => {
  const value = hex.replace(/^#/u, '');
  if (!/^[\da-f]{6}$/iu.test(value)) {
    throw new Error(`Expected a six-digit hex color, received ${hex}.`);
  }
  const number = Number.parseInt(value, 16);
  return `rgba(${number >> 16}, ${(number >> 8) & 255}, ${number & 255}, ${alpha})`;
};
