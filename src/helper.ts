import { Context, Random, Session, h } from "koishi"
import { CacheFunctionFork, CacheOptions, ImageRule, RuleComputed, RuleMathTag, RuleType } from "./types"
import { resolve } from "path"
import { existsSync } from "node:fs"
import { mkdir, unlink, writeFile } from "fs/promises"
import { createHash } from "crypto"

export const renderElements = [
  'img',
  'p', 'a', 'br',
  'b', 'strong',
  'i', 'em',
  'u', 'ins',
  's', 'del']
export const specialElements = ['image', 'text', 'random', 'template', 'execute']
export const appendElements = ['at', 'button', 'quote']
export const linerElements = ['p', 'br', 'button', 'quote']
export const filterAttributes = ['content', 'url']
export const specialTags = ['img']
export const cacheDataDir = './data/imagify/temps'

/**
 * Element parser to html
 * @param elements Koishi element
 */
export async function parser(elements: h[], session?: Session): Promise<string[]> {
  const result: string[] = []
  for (const element of elements) {
    const tagName: string = element.type
    const children = await parser(element.children, session) || []
    const attributes = Object.entries(element.attrs)
    if (renderElements.includes(element.type))
      result.push(createHTML(tagName, attributes, children.join('')))
    else if (specialElements.includes(element.type)) switch (element.type) {
      case 'image':
        result.push(createHTML('img', [['class', '_image'], ['src', element.attrs['url']], ['alt', element.attrs['content']]]))
        break
      case 'text':
        const content = element.attrs['content'].replace(/ /g, '&nbsp;').replace(/\n/g, '<br/>')
        result.push(createHTML('span', [['class', ['_text']]], content))
        break
      case 'template':
        result.push(createHTML('span', [['class', '_template']], children.join('')))
        break
      case 'random':
        const index = Random.pick(element.children, 1)
        result.push(createHTML('span', [['class', '_random']], (await parser(index)).join('')))
      case 'execute':
        const command = element.children.filter(e => e.type === 'text').map(e => e.attrs['content']).join('')
        // if (session) {
        //   const cmd = await session.execute(command, true)
        //   result.push(createHTML('span', [['class', '_execute']], cmd))
        // } else {
        result.push(createHTML('span', [['class', '_execute']], `{{${command}}}`))
        // }
        break
    } else continue
  }
  return result
}

/**
 * Create html tag
 * @TODO xss filter
 * 
 * @param tagName tag name
 * @param attributes the attributes of tag
 * @param children the children of tag
 */
export function createHTML(tagName: string, attributes: [string, any][] = [], children?: string): string {
  if (!tagName) return ''
  const attrs = attributes.map(([key, value]) => `${key}="${value}"`)
  if (specialTags.includes(tagName)) return `<${tagName}${attributes.length ? ' ' : ''}${attributes.join(' ')}>`
  if (!children) return `<${tagName}${attributes.length ? ' ' : ''}${attributes.join(' ')} />`
  return `<${tagName}${attrs.length > 0 ? ' ' : ''}${attrs.join(' ')}>${children}</${tagName}>`
}


/**
 * Render a html template with data.
 * @param template template string
 * @param data 
 */
export function templater(template: string, data: { [key: string]: any }) {
  return template.replace(/{(.*?)}/g, (_, key) => data[key] || '')
}

/**
 * Create a rule tester
 * @param session 
 */
export function ruler(session: Session) {
  const { platform, selfId, userId, guildId, channelId, content } = session
  const typeMap = {
    [RuleType.PLATFORM]: platform,
    [RuleType.BOT]: selfId,
    [RuleType.USER]: userId,
    [RuleType.GROUP]: guildId,
    [RuleType.CHANNEL]: channelId,
    [RuleType.CONTENT]: content,
    [RuleType.LENGTH]: h('', session.elements).toString(true).length,
    [RuleType.COMMAND]: session.argv?.command?.name,
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
          console.warn(`[imagify] rule math value is NaN: ${lefthand} ${tag} ${value}`)
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
            console.warn(`[imagify] rule math tag is invalid: ${lefthand} ${tag} ${value}`)
            return false
        }
      }
    },
  ]

  return (rules: ImageRule[]) => {
    for (const rule of rules) {
      const { type, computed, righthand } = rule

      // conetent length rule only support math computed
      if (type === RuleType.LENGTH && computed !== RuleComputed.MATH) continue
      // command rule do not support math computed
      if (type === RuleType.COMMAND && computed === RuleComputed.MATH) continue

      // check right hand
      if (!righthand) continue
      const lefthand = typeMap[type]
      // check left hand
      if (!lefthand) continue
      const computedFunc = computedMap[computed]
      const result = computedFunc(lefthand, righthand)
      if (result) return result
      else continue
    }
  }
}

/**
 * Diff two string or array
 */
export function diff(o, n) { }

export class MemoryCache {
  private cache = new WeakMap<any, any>()

  get(key: any) {
    return this.cache.get(key)
  }
  set(key: any, value: any) {
    this.cache.set({ key }, value)
  }
  has(key: any) {
    return this.cache.has(key)
  }
  delete(key: any) {
    return this.cache.delete(key)
  }
  clear() {
    this.cache = new WeakMap()
  }
}

export function keyHash(key: string, salt: object) {
  return createHash('md5').update(key + JSON.stringify(salt)).digest('hex')
}

export async function memozied<T extends any, C extends Context = any>(origin: T, options: CacheOptions<C>, ctx?: C): Promise<CacheFunctionFork & { origin: T }> {
  const { store, key, salt } = options
  const hashKey = keyHash(key, salt)
  let fork: CacheFunctionFork
  try {
    fork = await store(hashKey, origin, options)
  } catch (error) {
    throw new Error(error)
  }
  return Object.assign(fork, { origin })
}

export async function memoziedCacherStore(key: string, value: any, opt: CacheOptions): Promise<CacheFunctionFork> {
  const ctx = opt.ctx as Context
  if (!ctx) throw new Error('"ctx" is required when using "cacher" driver.')
  await ctx.cache.set('imagify', key, value)
  return {
    dispose: () => {
      ctx.cache.delete('imagify', key)
    }
  }
}

export async function memoziedDatabaseStore(key: string, value: any, opt: CacheOptions): Promise<CacheFunctionFork> {
  const { ctx } = opt
  if (!ctx) throw new Error('"ctx" is required when using "database" driver.')
  await (ctx as Context).database.create('imagify', { key, value })
  return {
    dispose: () => {
      (ctx as Context).database.remove('imagify', { key })
    }
  }
}

export async function memoziedFileStore(key: string, value: any, opt: CacheOptions): Promise<CacheFunctionFork> {
  const { filePath } = opt
  if (!filePath) throw new Error('"filePath" is required when using "file" driver.')
  if (!existsSync(filePath)) await mkdir(filePath, { recursive: true })
  const file = resolve(filePath, `${key}.temp`)
  try {
    writeFile(filePath, Buffer.from(value))
  } catch (error) {
    throw new Error(error)
  }
  return {
    dispose: () => {
      unlink(file)
    }
  }
}

export async function memoziedMemoryStore(key: string, value: any, opt: CacheOptions): Promise<CacheFunctionFork> {
  const { cache } = opt
  if (!cache) throw new Error('"cache" is required when using "memory" driver.')
  try {
    (cache as MemoryCache).set(key, value)
  } catch (error) {
    throw new Error(error)
  }
  return {
    dispose: () => {
      (cache as MemoryCache).delete(key)
    }
  }
}
