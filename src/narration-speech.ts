// Deterministic English speech text. Display/source text never goes through this
// conversion. Work with decimal strings and BigInt so precision is not rounded.
const SMALL = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion', 'quintillion'];
const digitWords = (digits: string): string => [...digits].map((digit) => SMALL[Number(digit)]).join(' ');

const underThousand = (value: number): string => {
  if (value < 20) return SMALL[value]!;
  if (value < 100) return [TENS[Math.floor(value / 10)], value % 10 ? SMALL[value % 10] : ''].filter(Boolean).join(' ');
  return `${SMALL[Math.floor(value / 100)]} hundred${value % 100 ? ` and ${underThousand(value % 100)}` : ''}`;
};

const integerWords = (digits: string, indian: boolean): string => {
  if (/^0\d/.test(digits) || digits.length > 21) return digitWords(digits);
  const value = BigInt(digits);
  if (value < 1000n) return underThousand(Number(value));
  if (indian) {
    for (const [scale, name] of [[10000000n, 'crore'], [100000n, 'lakh'], [1000n, 'thousand']] as const) {
      if (value >= scale) {
        const remainder = value % scale;
        return `${integerWords(String(value / scale), true)} ${name}${remainder ? ` ${integerWords(String(remainder), true)}` : ''}`;
      }
    }
  }
  const groups: string[] = [];
  let remaining = value;
  let scale = 0;
  while (remaining) {
    const group = Number(remaining % 1000n);
    if (group) groups.unshift([underThousand(group), SCALES[scale]].filter(Boolean).join(' '));
    remaining /= 1000n;
    scale += 1;
  }
  return groups.join(' ');
};

const CURRENCIES: Record<string, readonly [string, string]> = {
  '₹': ['rupee', 'rupees'], INR: ['rupee', 'rupees'], Rs: ['rupee', 'rupees'], 'Rs.': ['rupee', 'rupees'],
  '$': ['dollar', 'dollars'], USD: ['US dollar', 'US dollars'],
  '€': ['euro', 'euros'], EUR: ['euro', 'euros'],
  '£': ['pound', 'pounds'], GBP: ['British pound', 'British pounds'],
};
const MAGNITUDES: Record<string, string> = {
  cr: 'crore', crore: 'crore', crores: 'crore', lakh: 'lakh', lakhs: 'lakh',
  thousand: 'thousand', million: 'million', billion: 'billion', trillion: 'trillion',
  K: 'thousand', M: 'million', B: 'billion',
};
const INITIALISMS: Record<string, string> = {
  FII: 'foreign institutional investors', FIIs: 'foreign institutional investors',
  DII: 'domestic institutional investors', DIIs: 'domestic institutional investors',
  FPI: 'foreign portfolio investors', FPIs: 'foreign portfolio investors',
};

// Protect identifiers, URLs, dates, times, fractions, ranges and scientific
// notation as complete spans: never partially verbalize an ambiguous literal.
const PROTECTED = /`[^`]*`|(?:https?:\/\/|www\.)\S+|[\w.+-]+@[\w.-]+|\b\d+(?:\.\d+)?[eE][+-]?\d+\b|\b\d+(?:\.\d+){2,}\b|\b\d+(?:\.\d+)?(?:\s*[-–—/:]\s*\d+(?:\.\d+)?)+\b|\b[\p{L}_][\p{L}\p{N}_.+-]*\d[\p{L}\p{N}_.+-]*/gu;
const QUANTITY = /(?<![\p{L}\p{N}_.])(?<sign>[+−±-])?\s*(?:(?<currency>₹|\$|€|£|INR|USD|EUR|GBP|Rs\.?)\s*)?(?<currencySign>[+−±-])?\s*(?<number>\d+(?:,\d+)*(?:\.\d+)?|\.\d+)(?:\s*(?<magnitude>crores?|lakhs?|thousand|million|billion|trillion|[Cc][Rr]|[KMB])(?![\p{L}\p{N}_]))?(?:\s*(?<percent>%))?(?![\p{L}\p{N}_]|[.,]\d)/gu;

export const normalizeNarrationSpeech = (text: string, language: string): string => {
  if (language !== 'en') return text;
  const protectedSpans = [...text.matchAll(PROTECTED)]
    .filter(([token]) => !/^(?:INR|USD|EUR|GBP|Rs\.?)\d/.test(token))
    .map((match) => ({start: match.index, end: match.index + match[0].length}));
  const protectedAt = (start: number, end: number): boolean =>
    protectedSpans.some((span) => start < span.end && end > span.start);
  const replacements: {start: number; end: number; text: string}[] = [];

  for (const match of text.matchAll(QUANTITY)) {
    // Leading whitespace is not part of the quantity and must survive intact.
    const start = match.index + match[0].length - match[0].trimStart().length;
    const end = match.index + match[0].length;
    if (protectedAt(start, end)) continue;
    const {sign, currency, currencySign, number, magnitude, percent} = match.groups!;
    if ((sign && currencySign) || (currency && percent)) continue;
    const [integer = '', fraction] = number!.split('.');
    const indianGrouping = /^\d{1,2}(?:,\d{2})+,\d{3}$/.test(integer);
    if (integer.includes(',') && !/^\d{1,3}(?:,\d{3})+$/.test(integer) && !indianGrouping) continue;
    const digits = integer.replaceAll(',', '') || '0';
    const currencyNames = currency ? CURRENCIES[currency] : undefined;
    const indian = indianGrouping || currencyNames?.[1] === 'rupees';
    const spoken = integerWords(digits, indian);
    const polarity = sign ?? currencySign;
    const parts = [
      polarity === '+' ? 'plus' : polarity === '±' ? 'plus or minus' : polarity ? 'minus' : '',
      spoken + (fraction !== undefined ? ` point ${digitWords(fraction)}` : ''),
      magnitude ? MAGNITUDES[magnitude] ?? MAGNITUDES[magnitude.toLowerCase()] : '',
      currencyNames?.[digits === '1' && fraction === undefined && !magnitude ? 0 : 1],
      percent ? 'percent' : '',
    ];
    replacements.push({start, end, text: parts.filter(Boolean).join(' ')});
  }
  for (const match of text.matchAll(/\b(?:FIIs?|DIIs?|FPIs?)\b/g)) {
    if (!protectedAt(match.index, match.index + match[0].length)) {
      replacements.push({start: match.index, end: match.index + match[0].length, text: INITIALISMS[match[0]]!});
    }
  }
  let result = text;
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    result = result.slice(0, replacement.start) + replacement.text + result.slice(replacement.end);
  }
  return result;
};
