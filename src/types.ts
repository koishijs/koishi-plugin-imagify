

export enum RulePattren {
  IF = 0,
  OR = 1,
  AND = 2,
  NOT = 3,
  ELSE = 4,
}

export enum RuleType {
  PLATFORM = 'platform',
  USER = 'user',
  GROUP = 'group',
  CHANNEL = 'channel',
  CONTENT = 'content',
}

export enum RuleComputed {
  EQUAL = 0,
  CONTAIN = 1,
  REGEXP = 2,
}

export interface ImageRule {
  pattren: RulePattren
  type: RuleType
  computed: RuleComputed
  righthand: string
  enable: boolean
}
