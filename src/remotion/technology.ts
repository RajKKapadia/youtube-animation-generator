export type TechnologyIconKind =
  | 'ai'
  | 'api'
  | 'audio'
  | 'cloud'
  | 'code'
  | 'database'
  | 'generic'
  | 'queue'
  | 'search'
  | 'server'
  | 'video'
  | 'web'
  | 'worker';

const RULES: Array<{kind: TechnologyIconKind; pattern: RegExp}> = [
  {kind: 'ai', pattern: /whisper|openai|\bllm\b|\bai\b|generate.+answer/i},
  {kind: 'search', pattern: /search|retriev|relevant information|query/i},
  {kind: 'audio', pattern: /audio|transcrib|speech/i},
  {kind: 'database', pattern: /database|vector store|store knowledge|metadata/i},
  {kind: 'queue', pattern: /queue|background job/i},
  {kind: 'video', pattern: /youtube|youtu\.be|video|download|media/i},
  {kind: 'api', pattern: /\bapi\b|request|endpoint|url/i},
  {kind: 'cloud', pattern: /\baws\b|\bazure\b|\bgcp\b|cloud/i},
  {kind: 'server', pattern: /container|compose|deploy|server|service/i},
  {kind: 'web', pattern: /browser|frontend|website|\bui\b/i},
  {kind: 'code', pattern: /code|script|command|\bcli\b/i},
  {kind: 'worker', pattern: /worker|process|task|chunk/i},
];

export const technologyIconKindFor = (label: string): TechnologyIconKind =>
  RULES.find(({pattern}) => pattern.test(label))?.kind ?? 'generic';
