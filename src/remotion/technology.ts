export type TechnologyIconKind =
  | 'ai'
  | 'analytics'
  | 'api'
  | 'audio'
  | 'auth'
  | 'cache'
  | 'cloud'
  | 'code'
  | 'database'
  | 'document'
  | 'download'
  | 'email'
  | 'error'
  | 'event'
  | 'generic'
  | 'message'
  | 'mobile'
  | 'monitoring'
  | 'network'
  | 'payment'
  | 'queue'
  | 'retry'
  | 'schedule'
  | 'search'
  | 'security'
  | 'server'
  | 'storage'
  | 'transform'
  | 'upload'
  | 'user'
  | 'users'
  | 'video'
  | 'web'
  | 'webhook'
  | 'worker';

const RULES: Array<{kind: TechnologyIconKind; pattern: RegExp}> = [
  {kind: 'ai', pattern: /whisper|openai|machine learning|model inference|\bllm\b|\bai\b|generate.+answer/i},
  {kind: 'auth', pattern: /authenticat|authoriz|oauth|sign[ -]?in|login|credential|token|identity|\bkey\b/i},
  {kind: 'security', pattern: /security|encrypt|permission|protect|firewall|secret|certificate|\btls\b|\bssl\b/i},
  {kind: 'users', pattern: /customers|clients|people|members|accounts|consumers|producers|\busers\b/i},
  {kind: 'user', pattern: /customer|client|person|member|account|consumer|producer|\buser\b/i},
  {kind: 'email', pattern: /email|inbox|newsletter/i},
  {kind: 'message', pattern: /message|chat|notification|sms|comment/i},
  {kind: 'document', pattern: /document|invoice|receipt|report|file|pdf|markdown/i},
  {kind: 'cache', pattern: /cache|redis|memoiz/i},
  {kind: 'search', pattern: /search|retriev|relevant information|query|rank/i},
  {kind: 'audio', pattern: /audio|transcrib|speech|voice|podcast/i},
  {kind: 'video', pattern: /youtube|youtu\.be|video|\bmedia\b|\brender(?:ed|ing|s)?\b/i},
  {kind: 'database', pattern: /database|vector store|postgres|mysql|sqlite|metadata|\bdb\b/i},
  {kind: 'storage', pattern: /storage|bucket|archive|persist|warehouse|filesystem/i},
  {kind: 'queue', pattern: /queue|pending work|backpressure|dead[ -]?letter/i},
  {kind: 'webhook', pattern: /webhook|callback/i},
  {kind: 'api', pattern: /\bapi\b|request|endpoint|response|url/i},
  {kind: 'analytics', pattern: /analytic|metric|insight|dashboard|measure|statistic|chart/i},
  {kind: 'monitoring', pattern: /monitor|observab|trace|logging|health|telemetry|alert/i},
  {kind: 'payment', pattern: /payment|billing|checkout|invoice payment|price|transaction/i},
  {kind: 'mobile', pattern: /mobile|phone|android|ios|smartphone/i},
  {kind: 'network', pattern: /network|gateway|router|proxy|load balanc|dns/i},
  {kind: 'event', pattern: /event|trigger|publish|subscribe|signal/i},
  {kind: 'retry', pattern: /retry|replay|recover|resilien|fallback/i},
  {kind: 'schedule', pattern: /schedule|timer|cron|interval|calendar/i},
  {kind: 'transform', pattern: /transform|convert|parse|normalize|map|encode|decode/i},
  {kind: 'upload', pattern: /upload|ingest|import|submit|receive/i},
  {kind: 'download', pattern: /download|export|deliver|send|notify/i},
  {kind: 'error', pattern: /error|failure|exception|invalid|reject/i},
  {kind: 'cloud', pattern: /\baws\b|\bazure\b|\bgcp\b|cloud/i},
  {kind: 'server', pattern: /container|compose|deploy|server|service|backend/i},
  {kind: 'web', pattern: /browser|frontend|website|web app|\bui\b/i},
  {kind: 'code', pattern: /code|script|command|function|\bcli\b/i},
  {kind: 'worker', pattern: /worker|process|task|job|chunk|operation/i},
];

export const technologyIconKindFor = (label: string): TechnologyIconKind =>
  RULES.find(({pattern}) => pattern.test(label))?.kind ?? 'generic';
