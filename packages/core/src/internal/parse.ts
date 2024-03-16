import { Dict, Random, type Element } from 'koishi'
import { RenderType } from '../types'

export const universalElement = [
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

export function parserUniversal(type: string, attrs: Dict, render: RenderType = RenderType.PUPPETEER) {
  if (render === RenderType.PUPPETEER) {
    return createHTML(type, [['class', `_${type}`], ...Object.entries(attrs)])
  } else if (render === RenderType.CANVAS) {

  }
}

export function parserImage(src: string, render: RenderType = RenderType.PUPPETEER) {
  if (render === RenderType.PUPPETEER) {
    return createHTML('img', [['class', '_image'], ['src', src]])
  } else if (render === RenderType.CANVAS) {

  }

}

export function parserText(type: string, content: string, render: RenderType = RenderType.PUPPETEER) {
  if (render === RenderType.PUPPETEER) {
    return createHTML('span', [['class', `_${type}`]], content.replace(/ /g, '&nbsp;').replace(/\n/g, '<br/>'))
  } else if (render === RenderType.CANVAS) {

  }
}

function parser(elements: Element[], render?: RenderType.CANVAS): string
function parser(elements: Element[], render?: RenderType.PUPPETEER): string
function parser(elements: Element[], render?: RenderType): string {
  render = render || RenderType.PUPPETEER
  const result: string[] = []
  if (render === RenderType.PUPPETEER) {
    elements.filter(ele => universalElement.concat(specialElements).includes(ele.type))
      .forEach(ele => {
        result.push(visit(ele, render))
      })
    return result.join('')
  } else if (render === RenderType.CANVAS) {
    return
  }
}

export function visit(element: Element, render: RenderType = RenderType.PUPPETEER) {
  const { type, attrs, children } = element
  if (universalElement.includes(type)) {
    return parserUniversal(type, attrs, render)
  } else if (type === 'image' || type === 'img') {
    const src = attrs['src'] || attrs['url']
  } else if (type === 'text' || type === 'template') {
    return parserText(type, attrs['content'], render)
  } else if (type === 'random') {
    const index = Random.pick(children, 1)
    return parserText('random', parser(index), render)
  } else if (type === 'execute') {
    const command = children.filter(e => e.type === 'text').map(e => e.attrs['content']).join('')
    return parserText('execute', `{{${command}}}`, render)
  }
}
