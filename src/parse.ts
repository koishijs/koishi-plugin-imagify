import { Random, h } from "koishi"

export const renderElements = [
  'p', 'a', 'br',
  'b', 'strong',
  'i', 'em',
  'u', 'ins',
  's', 'del']
export const specialElements = ['image', 'text', 'random', 'template']
export const appendElements = ['at', 'button', 'execute', 'quote']
export const filterAttributes = ['content', 'url']
export const specialTags = ['img']

/**
 * Element parser to html
 * @param elements Koishi element
 */
export function parser(elements: h[]): string[] {
  const result: string[] = []
  for (const element of elements) {
    const tagName: string = element.type
    const children = parser(element.children) || []
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
        result.push(createHTML('span', [['class', '_random']], parser(index).join('')))
    } else continue
  }
  return result
}

/**
 * Create html tag
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
