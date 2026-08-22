export type TechnologyIconKind =
  | 'ai'
  | 'api'
  | 'audio'
  | 'celery'
  | 'database'
  | 'docker'
  | 'fastapi'
  | 'ffmpeg'
  | 'generic'
  | 'langchain'
  | 'langgraph'
  | 'postgresql'
  | 'python'
  | 'qdrant'
  | 'queue'
  | 'redis'
  | 'search'
  | 'video'
  | 'worker'
  | 'youtube';

const RULES: Array<{kind: TechnologyIconKind; pattern: RegExp}> = [
  {kind: 'youtube', pattern: /youtube|youtu\.be/i},
  {kind: 'docker', pattern: /docker|container|compose/i},
  {kind: 'python', pattern: /python/i},
  {kind: 'postgresql', pattern: /postgres(?:ql)?|pgvector/i},
  {kind: 'redis', pattern: /redis/i},
  {kind: 'qdrant', pattern: /qdrant|quadrant/i},
  {kind: 'fastapi', pattern: /fastapi/i},
  {kind: 'ffmpeg', pattern: /ffmpeg|convert.+audio|audio conversion/i},
  {kind: 'celery', pattern: /celery/i},
  {kind: 'langgraph', pattern: /langgraph/i},
  {kind: 'langchain', pattern: /langchain/i},
  {kind: 'ai', pattern: /whisper|openai|\bllm\b|\bai\b|generate.+answer/i},
  {kind: 'search', pattern: /search|retriev|relevant information|query/i},
  {kind: 'audio', pattern: /audio|transcrib|speech/i},
  {kind: 'database', pattern: /database|vector store|store knowledge|metadata/i},
  {kind: 'queue', pattern: /queue|background job/i},
  {kind: 'video', pattern: /video|download|media/i},
  {kind: 'api', pattern: /\bapi\b|request|endpoint|url/i},
  {kind: 'worker', pattern: /worker|process|task|chunk/i},
];

export const technologyIconKindFor = (label: string): TechnologyIconKind =>
  RULES.find(({pattern}) => pattern.test(label))?.kind ?? 'generic';
