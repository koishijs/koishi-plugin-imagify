import { Random, type Element } from 'koishi'

export const renderElements = [
  'p', 'a', 'br',
  'b', 'strong',
  'i', 'em',
  'u', 'ins',
  's', 'del']
export const specialElements = ['img', 'image', 'text', 'random', 'template', 'execute']
export const appendElements = ['at', 'button', 'quote', 'execute']
export const linerElements = ['p', 'br', 'button', 'quote']
export const filterAttributes = ['content', 'url']
export const specialTags = ['img']
export const cacheDataDir = './data/imagify/temps'

export function parseToHTML(elements: Element[]) {
  const result: string[] = []
  for (const element of elements) {
    const tagName: string = element.type
    const children = parseToHTML(element.children) || []
    const attributes = Object.entries(element.attrs)
    if (renderElements.includes(element.type))
      result.push(createHTML(tagName, attributes, children.join('')))
    else if (specialElements.includes(element.type)) switch (element.type) {
      case 'image':
      case 'img':
        result.push(createHTML('img', [['class', '_image'], ['src',
          element.type === 'image'
            ? element.attrs['url']
            : element.attrs['src'] || ''
        ], ['alt', element.attrs['content']]]))
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
        result.push(createHTML('span', [['class', '_random']], (parseToHTML(index)).join('')))
      case 'execute':
        const command = element.children.filter(e => e.type === 'text').map(e => e.attrs['content']).join('')
        result.push(createHTML('span', [['class', '_execute']], `{{${command}}}`))
        break
    } else continue
  }
  return result
}

/**
 * Create html tag
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

export function parseToCanvas(elements: Element.Fragment[]) {

}
