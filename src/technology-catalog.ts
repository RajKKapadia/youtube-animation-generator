import * as simpleIcons from 'simple-icons';
import type {SimpleIcon} from 'simple-icons';
import type {TechnologyBrandIcon} from './types.js';

const normalize = (value: string): string =>
  value
    .toLocaleLowerCase('en-US')
    .replaceAll('&', ' and ')
    .replaceAll('+', ' plus ')
    .replaceAll('#', ' sharp ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const isSimpleIcon = (value: unknown): value is SimpleIcon =>
  typeof value === 'object' &&
  value !== null &&
  'title' in value &&
  typeof value.title === 'string' &&
  'slug' in value &&
  typeof value.slug === 'string' &&
  'path' in value &&
  typeof value.path === 'string' &&
  'hex' in value &&
  typeof value.hex === 'string';

const icons = Object.values(simpleIcons).filter(isSimpleIcon);
const iconsBySlug = new Map(icons.map((icon) => [icon.slug, icon]));

const IGNORED_TITLES = new Set([
  'answer',
  'code',
  'data',
  'e',
  'go',
  'lg',
  'matter',
  'make',
  'next',
  'node',
  'process',
  'run',
  'search',
  'target',
  'task',
  'v',
  'x',
]);

const OPTIONAL_VENDOR_PREFIXES = new Set([
  'adobe',
  'alibaba',
  'apache',
  'apple',
  'atlassian',
  'google',
  'ibm',
  'jetbrains',
  'meta',
  'microsoft',
  'mozilla',
  'oracle',
]);

const OPTIONAL_TECHNOLOGY_SUFFIXES = new Set(['css', 'js', 'ui']);

const ALIASES: Array<{pattern: RegExp; slug: string}> = [
  {pattern: /\bpgvector\b/i, slug: 'postgresql'},
  {pattern: /\bpostgres\b/i, slug: 'postgresql'},
  {pattern: /\bk8s\b/i, slug: 'kubernetes'},
  {pattern: /\bnode\.?js\b/i, slug: 'nodedotjs'},
  {
    pattern: /\bnode\b(?=\s+(?:api|app|application|backend|runtime|server|service))/i,
    slug: 'nodedotjs',
  },
  {pattern: /\bnextjs\b/i, slug: 'nextdotjs'},
  {pattern: /\bvuejs\b/i, slug: 'vuedotjs'},
  {pattern: /\breactjs\b/i, slug: 'react'},
  {pattern: /\bfast\s+api\b/i, slug: 'fastapi'},
  {pattern: /\bgolang\b/i, slug: 'go'},
];

const titleCandidates = icons
  .map((icon) => ({icon, term: normalize(icon.title)}))
  .filter(({term}) => term.length >= 3 && !IGNORED_TITLES.has(term))
  .sort((left, right) => right.term.length - left.term.length);

const shortenedCandidates = icons
  .flatMap((icon) => {
    const tokens = normalize(icon.title).split(' ');
    const terms: string[] = [];

    if (tokens.length > 1 && OPTIONAL_VENDOR_PREFIXES.has(tokens[0] ?? '')) {
      terms.push(tokens.slice(1).join(' '));
    }
    if (
      tokens.length > 1 &&
      OPTIONAL_TECHNOLOGY_SUFFIXES.has(tokens.at(-1) ?? '')
    ) {
      terms.push(tokens.slice(0, -1).join(' '));
    }

    return terms.map((term) => ({icon, term}));
  })
  .filter(({term}) => term.length >= 3 && !IGNORED_TITLES.has(term))
  .sort((left, right) => right.term.length - left.term.length);

const includesCompleteTerm = (label: string, term: string): boolean =>
  ` ${label} `.includes(` ${term} `);

const toBrandIcon = (icon: SimpleIcon): TechnologyBrandIcon => ({
  title: icon.title,
  slug: icon.slug,
  path: icon.path,
  hex: icon.hex,
});

export const technologyBrandIconFor = (
  label: string,
): TechnologyBrandIcon | undefined => {
  for (const alias of ALIASES) {
    if (alias.pattern.test(label)) {
      const icon = iconsBySlug.get(alias.slug);
      if (icon) {
        return toBrandIcon(icon);
      }
    }
  }

  const normalizedLabel = normalize(label);
  const candidate = titleCandidates.find(({term}) =>
    includesCompleteTerm(normalizedLabel, term),
  );
  if (candidate) {
    return toBrandIcon(candidate.icon);
  }

  const shortenedCandidate = shortenedCandidates.find(({term}) =>
    includesCompleteTerm(normalizedLabel, term),
  );
  return shortenedCandidate ? toBrandIcon(shortenedCandidate.icon) : undefined;
};

export const resolveTechnologyBrandIcons = (
  labels: Iterable<string>,
): Record<string, TechnologyBrandIcon> => {
  const resolved: Record<string, TechnologyBrandIcon> = {};

  for (const label of new Set(labels)) {
    const icon = technologyBrandIconFor(label);
    if (icon) {
      resolved[label] = icon;
    }
  }

  return resolved;
};
