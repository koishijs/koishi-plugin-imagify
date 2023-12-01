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

export interface ImageRule {
  type: RuleType
  computed: RuleComputed
  righthand: string
}

export interface PageWorker<P> {
  busy: boolean
  page: P
}
