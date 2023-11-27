

export enum RulePattren {
  IF = 0,
  OR = 1,
  AND = 2,
}

export enum RuleType {
  PLATFORM = '$platform',
  BOT = '$bot',
  USER = '$user',
  GROUP = '$group',
  CHANNEL = '$channel',
  CONTENT = '$content',
  LENGTH = '$length',
}

export enum RuleComputed {
  REGEXP = 0,
  EQUAL = 1,
  NOT_EQUAL = 2,
  CONTAIN = 3,
  NOT_CONTAIN = 4,
}

export enum RuleActivity {
  WAIT = 0,
  END = 1,
}

export interface ImageRule {
  pattren: RulePattren
  type: RuleType
  computed: RuleComputed
  righthand: string
  activity: RuleActivity
}
