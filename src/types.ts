export enum RuleType {
  PLATFORM = '$platform',
  BOT = '$bot',
  USER = '$user',
  GROUP = '$group',
  CHANNEL = '$channel',
  CONTENT = '$content',
  LENGTH = '$length',
  COMMAND = '$command',
}

export enum RuleComputed {
  REGEXP = 0,
  EQUAL = 1,
  NOT_EQUAL = 2,
  CONTAIN = 3,
  NOT_CONTAIN = 4,
  MATH = 5,
}

export enum RuleMathTag {
  GT = 'GT',
  GE = 'GE',
  LT = 'LT',
  LE = 'LE',
}

export enum CacheDriver {
  FILE = 'file',
  CACHER = 'cacher',
  DATABASE = 'database',
  MEMORY = 'memory',
}

export interface CacheConfig {
  cacher?: any
  driver?: CacheDriver
  path?: string
}

export interface ImageRule {
  type: RuleType
  computed: RuleComputed
  righthand: string
}

export interface CacheRule {
  name: string

}

export interface CacheData {
  id: number
  key: string
  value: string
}

export interface CacheOptions<C = unknown> {
  key: string
  salt: object
  store: CacheFunction
  filePath?: string
  ctx?: C
  cache?: any
}

export interface CacheFunctionFork {
  dispose: () => void
}

export type CacheFunction = (key: any, value: any, opt: CacheOptions) => Promise<CacheFunctionFork>

export interface PageWorker<P> {
  busy: boolean
  page: P
}
