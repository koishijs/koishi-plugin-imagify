import { Session, h } from "koishi";
import { ImageRule, RuleActivity, RuleMathTag, RulePattren, RuleType } from "./types";

export function ruler(session: Session) {
  const { platform, selfId, userId, guildId, channelId, content } = session
  const typeMap = {
    [RuleType.PLATFORM]: platform,
    [RuleType.BOT]: selfId,
    [RuleType.USER]: userId,
    [RuleType.GROUP]: guildId,
    [RuleType.CHANNEL]: channelId,
    [RuleType.CONTENT]: content,
    [RuleType.LENGTH]: h('', session.elements).toString().length,
  }
  const computedMap = [
    // REGEXP
    (lefthand: string | number, righthand: string) => new RegExp(righthand).test(lefthand.toString()),
    // EQUAL
    (lefthand: string | number, righthand: string) => lefthand === righthand,
    // NOT_EQUAL
    (lefthand: string | number, righthand: string) => lefthand !== righthand,
    // CONTAIN
    (lefthand: string | number, righthand: string) => lefthand.toString().includes(righthand),
    // NOT_CONTAIN
    (lefthand: string | number, righthand: string) => !lefthand.toString().includes(righthand),
    // MATH
    (lefthand: string | number, righthand: string) => {
      if (typeof lefthand === 'string') return false
      else {
        const [tag, value] = righthand.split(':')
        const valueNumber = Number(value)
        if (isNaN(valueNumber)) {
          console.error(`[imagify] rule math value is NaN: ${lefthand} ${tag} ${value}`)
          return false
        }
        switch (tag) {
          case RuleMathTag.GT:
            return lefthand > valueNumber
          case RuleMathTag.GE:
            return lefthand >= valueNumber
          case RuleMathTag.LT:
            return lefthand < valueNumber
          case RuleMathTag.LE:
            return lefthand <= valueNumber
          default:
            console.error(`[imagify] rule math tag is invalid: ${lefthand} ${tag} ${value}`)
            return false
        }
      }
    },
  ]

  return (rules: ImageRule[]) => {
    for (const rule of rules) {
      const { type, computed, righthand } = rule
      const lefthand = typeMap[type]
      const computedFunc = computedMap[computed]
      const result = computedFunc(lefthand, righthand)
      if (result) return result
      break
    }

    return false
  }
}
