export interface SemanticIconDefinition {
  id: string;
  label: string;
  keywords: readonly string[];
}

export const SEMANTIC_ICON_DEFINITIONS = [
  {
    id: 'standard-protocol',
    label: 'Standard or protocol',
    keywords: ['hardware standard', 'model hardware standard', 'common language', 'standard', 'protocol', 'specification', 'interoperability', 'portable'],
  },
  {
    id: 'standard-compatible',
    label: 'Compatibility',
    keywords: ['compatible', 'compatibility', 'interoperable', 'interoperability', 'works across', 'shared interface', 'mixed-language', 'cross-language'],
  },
  {
    id: 'hardware-cpu',
    label: 'CPU or processor',
    keywords: ['cpu', 'processor', 'central processing unit', 'compute hardware', 'performance core', 'native performance', 'c performance', 'systems core'],
  },
  {
    id: 'hardware-accelerator',
    label: 'GPU or accelerator',
    keywords: ['gpu', 'accelerator', 'accelerated computing', 'npu', 'tpu'],
  },
  {
    id: 'hardware-memory',
    label: 'Memory',
    keywords: ['memory', 'ram', 'vram', 'memory bandwidth'],
  },
  {
    id: 'hardware-circuit',
    label: 'Chip or circuit board',
    keywords: ['hardware', 'chip', 'silicon', 'circuit', 'board', 'semiconductor'],
  },
  {
    id: 'ai-model',
    label: 'AI model',
    keywords: ['ai model', 'language model', 'machine learning', 'model inference', 'llm', 'model'],
  },
  {
    id: 'ai-agent',
    label: 'AI agent',
    keywords: ['ai agent', 'ai-assisted', 'coding agent', 'agent', 'agentic', 'tool use', 'reasoning loop'],
  },
  {
    id: 'automation-workflow',
    label: 'Automation workflow',
    keywords: ['automation', 'workflow', 'orchestration', 'automated process', 'concurrency', 'parallel work', 'system work'],
  },
  {
    id: 'analytics-chart',
    label: 'Analytics chart',
    keywords: ['analytics', 'metric', 'insight', 'dashboard', 'measure', 'statistic', 'chart', 'benchmark', 'benchmarks', 'tests and benchmarks'],
  },
  {
    id: 'api-endpoint',
    label: 'API or endpoint',
    keywords: ['api', 'endpoint', 'request', 'response', 'integration'],
  },
  {
    id: 'audio-wave',
    label: 'Audio or voice',
    keywords: ['audio', 'voice', 'speech', 'podcast', 'transcription'],
  },
  {
    id: 'auth-key',
    label: 'Authentication key',
    keywords: ['authentication', 'authorization', 'oauth', 'login', 'sign in', 'credential', 'token', 'identity', 'key'],
  },
  {
    id: 'cache-archive',
    label: 'Cache',
    keywords: ['cache', 'cached', 'redis', 'memoization'],
  },
  {
    id: 'cloud',
    label: 'Cloud',
    keywords: ['cloud', 'aws', 'azure', 'gcp'],
  },
  {
    id: 'code',
    label: 'Code',
    keywords: ['code', 'script', 'command', 'function', 'cli', 'native executable', 'single executable', 'binary'],
  },
  {
    id: 'data-database',
    label: 'Database',
    keywords: ['database', 'vector store', 'postgres', 'mysql', 'sqlite', 'metadata', 'db'],
  },
  {
    id: 'document',
    label: 'Document',
    keywords: ['document', 'invoice', 'receipt', 'report', 'file', 'pdf', 'markdown'],
  },
  {
    id: 'download',
    label: 'Download or export',
    keywords: ['download', 'export', 'deliver'],
  },
  {
    id: 'email',
    label: 'Email',
    keywords: ['email', 'inbox', 'newsletter'],
  },
  {
    id: 'error-warning',
    label: 'Error or warning',
    keywords: ['error', 'failure', 'exception', 'invalid', 'reject', 'warning'],
  },
  {
    id: 'event-trigger',
    label: 'Event or trigger',
    keywords: ['event', 'trigger', 'publish', 'subscribe', 'signal'],
  },
  {
    id: 'message-chat',
    label: 'Message or chat',
    keywords: ['message', 'chat', 'notification', 'sms', 'comment', 'conversation'],
  },
  {
    id: 'mobile',
    label: 'Mobile device',
    keywords: ['mobile', 'phone', 'android', 'ios', 'smartphone'],
  },
  {
    id: 'monitoring',
    label: 'Monitoring',
    keywords: ['monitoring', 'observability', 'trace', 'logging', 'health', 'telemetry', 'alert'],
  },
  {
    id: 'network',
    label: 'Network',
    keywords: ['network', 'gateway', 'router', 'proxy', 'load balancer', 'dns'],
  },
  {
    id: 'payment',
    label: 'Payment',
    keywords: ['payment', 'billing', 'checkout', 'price', 'transaction', 'wallet'],
  },
  {
    id: 'queue',
    label: 'Queue',
    keywords: ['message queue', 'queue', 'pending work', 'backpressure', 'dead letter', 'message broker'],
  },
  {
    id: 'retry',
    label: 'Retry or recovery',
    keywords: ['retry', 'replay', 'recover', 'resilience', 'fallback'],
  },
  {
    id: 'schedule',
    label: 'Schedule',
    keywords: ['schedule', 'timer', 'cron', 'interval', 'calendar'],
  },
  {
    id: 'search',
    label: 'Search',
    keywords: ['search', 'retrieve', 'retrieval', 'query', 'rank'],
  },
  {
    id: 'security',
    label: 'Security',
    keywords: ['security', 'memory safety', 'memory-safe', 'encrypt', 'permission', 'protect', 'firewall', 'secret', 'certificate', 'tls', 'ssl'],
  },
  {
    id: 'server',
    label: 'Server',
    keywords: ['server', 'service', 'backend', 'container', 'deployment'],
  },
  {
    id: 'storage',
    label: 'Storage',
    keywords: ['storage', 'bucket', 'persist', 'warehouse', 'filesystem', 'disk'],
  },
  {
    id: 'transform',
    label: 'Transform',
    keywords: ['transform', 'convert', 'parse', 'normalize', 'map', 'encode', 'decode'],
  },
  {
    id: 'upload',
    label: 'Upload or ingest',
    keywords: ['upload', 'ingest', 'import', 'submit', 'receive'],
  },
  {
    id: 'user',
    label: 'User',
    keywords: ['user', 'customer', 'client', 'person', 'member', 'account', 'consumer', 'producer'],
  },
  {
    id: 'users',
    label: 'Users',
    keywords: ['users', 'customers', 'clients', 'people', 'members', 'accounts', 'consumers', 'producers'],
  },
  {
    id: 'video',
    label: 'Video',
    keywords: ['video', 'youtube', 'media', 'render'],
  },
  {
    id: 'web',
    label: 'Web application',
    keywords: ['browser', 'frontend', 'website', 'web app', 'ui'],
  },
  {
    id: 'webhook',
    label: 'Webhook',
    keywords: ['webhook', 'callback'],
  },
  {
    id: 'worker',
    label: 'Worker',
    keywords: ['worker', 'process', 'task', 'job', 'operation'],
  },
] as const satisfies readonly SemanticIconDefinition[];

export type SemanticIconId = typeof SEMANTIC_ICON_DEFINITIONS[number]['id'];

const definitionsById = new Map<string, SemanticIconDefinition>(
  SEMANTIC_ICON_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export const normalizeIconText = (value: string): string =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replaceAll('&', ' and ')
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim();

const containsCompletePhrase = (text: string, phrase: string): boolean =>
  ` ${text} `.includes(` ${phrase} `);

export const semanticIconDefinitionFor = (
  id: string,
): SemanticIconDefinition | undefined => definitionsById.get(id);

export const semanticIconRelevanceScore = (
  id: string,
  text: string,
): number => {
  const definition = semanticIconDefinitionFor(id);
  if (!definition) return 0;
  const normalizedText = normalizeIconText(text);
  if (!normalizedText) return 0;
  return definition.keywords.reduce((score, keyword) => {
    const normalizedKeyword = normalizeIconText(keyword);
    if (!normalizedKeyword || !containsCompletePhrase(normalizedText, normalizedKeyword)) {
      return score;
    }
    const wordCount = normalizedKeyword.split(' ').length;
    return score + wordCount * 4 + (normalizedText === normalizedKeyword ? 8 : 0);
  }, 0);
};

export const semanticIconIdForText = (text: string): SemanticIconId | undefined => {
  const candidates = SEMANTIC_ICON_DEFINITIONS
    .map((definition, index) => ({
      id: definition.id,
      index,
      score: semanticIconRelevanceScore(definition.id, text),
    }))
    .filter(({score}) => score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  return candidates[0]?.id;
};

export const semanticIconCatalogPrompt = (): string =>
  SEMANTIC_ICON_DEFINITIONS
    .map(({id, keywords, label}) => `- ${id}: ${label}; use for ${keywords.slice(0, 5).join(', ')}`)
    .join('\n');

export const iconRecordForItems = ({
  primaryItems,
  secondaryItems,
  icons,
}: {
  primaryItems: string[];
  secondaryItems: string[];
  icons: {
    primary: Array<string | null>;
    secondary: Array<string | null>;
  };
}): Record<string, string> => Object.fromEntries([
  ...primaryItems.flatMap((label, index) => {
    const id = icons.primary[index];
    return id ? [[label, id] as const] : [];
  }),
  ...secondaryItems.flatMap((label, index) => {
    const id = icons.secondary[index];
    return id ? [[label, id] as const] : [];
  }),
]);
