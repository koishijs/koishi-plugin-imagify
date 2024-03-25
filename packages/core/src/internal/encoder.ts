import { Element, Quester, Random } from "koishi"

// preparing additional fields for Element to facilitate rendering
declare module 'koishi' {
  interface Element {
    class?: string
    style?: string
    strict?: boolean
  }
}

type Parser = (element: Element, http?: Quester) => Promise<Element>
interface SVGData {
  http: Quester
  css?: string
}

export const universalElement = new Set([
  'p', 'a', 'br',
  'b', 'strong',
  'i', 'em',
  'u', 'ins',
  's', 'del'])
export const specialElements = new Set(['img', 'image', 'text', 'random', 'template', 'execute'])
export const appendElements = new Set(['at', 'button', 'quote', 'execute'])
export const linerElements = new Set(['p', 'br', 'button', 'quote'])
export const filterAttributes = ['content', 'url']
export const specialTags = ['img']

export function stringifyDOM(tagName: string, attributes: [string, any][] = [], children: string, strict: boolean = false): string {
  if (strict) attributes.unshift(['xmlns', 'http://www.w3.org/1999/xhtml'])
  const attrs = attributes.map(([key, value]) => `${key}="${value}"`)
  let result = '<' + tagName
  if (attrs.length) result += ' ' + attrs.join(' ')
  if (!strict) {
    if (specialTags.includes(tagName)) return result += '>'
    if (!children) return result += '/>'
  }
  return result += `>${children || ''}</${tagName}>`
}

/**
 * Visit element
 * @param element 
 */
export async function visit(element: Element, parser?: Parser): Promise<string> {
  const { type } = element
  element.class = `_${type}`
  if (parser)
    element = await parser(element)
  const { attrs, children, strict } = element
  const childrens = []
  if (children)
    for (const child of children)
      childrens.push(await visit(child, parser))
  if (element.class) attrs.class = element.class
  if (element.style) attrs.style = element.style

  const attributes = Object.entries(attrs)

  if (universalElement.has(type)) return stringifyDOM(type, attributes, childrens.join(''), strict)

  switch (type) {
    case 'img':
    case 'image':
      return stringifyDOM('img', attributes, childrens.join(''), strict)
    case 'text':
      return stringifyDOM('span', attributes, childrens.join(''), strict)
    case 'template':
      return stringifyDOM('div', attributes, childrens.join(''), strict)
    case 'random':
      const picker = Random.pick(element.children, 1)
      return stringifyDOM('span', attributes, await visit(picker[0], parser), strict)
    case 'execute':
      const command = element.children.filter(e => e.type === 'text').map(e => e.attrs.content).join('')
      return stringifyDOM('span', attributes, `/${command}`, strict)
    case 'at':
      return stringifyDOM('span', attributes, `@${attrs.name}(${attrs.id || attrs.role || attrs.type})`, strict)
    case 'sharp':
      return stringifyDOM('span', attributes, `#${attrs.name}(${attrs.id || attrs.role || attrs.type})`, strict)
  }
}

/**
 * Render message elements to html
 * @param elements message elements
 */
export async function renderHTML(elements: Element[]) {
  const result: string[] = []
  for (const element of elements) {
    result.push(await visit(element))
  }
  return result.join('')
}

/**
 * Render message elements to xhtml of the svg
 * @param elements message elements
 */
export async function renderSVG(elements: Element[], options: SVGData) {
  const result: string[] = []
  const { http, css } = options
  for (const element of elements) {
    result.push(await visit(element, async (element) => {
      const { type, attrs, class: className } = element
      // download data url to base64
      if (attrs?.src || attrs?.url) {
        const url = new URL(attrs?.src || attrs?.url)
        if (url.protocol !== 'data:') {
          const res = await http(url.href)
          const base64 = Buffer.from(res.data).toString('base64')
          if (res.headers['content-type'])
            element.attrs.src = `data:${res.headers['content-type'] || 'text/plain'};base64,${base64}`
          else
            throw new Error('Invalid content type: ' + res.headers['content-type'])
        }
      }
      // inline style
      if (css) {
        const style = cssParser(css)
        if (css[className]) {
          element.style = Object.entries(style[className]).map(([key, value]) => `${key}:${value}`).join(';')
        }
      }
      element.attrs['xmlns'] = 'http://www.w3.org/1999/xhtml'
      element.strict = true
      if (element.class) element.class = undefined
      return element
    }))
  }
  return `<svg xmlns="http://www.w3.org/2000/svg">
    <foreignObject width="100%" height="100%">
      ${result.join('')}
    </foreignObject>
  </svg>`
}

const cssRules = ['color', 'border', 'width', 'margin', 'margin-right', 'marigin-left']

/**
 * Parse css string to object
 * @param style css string
 */
export function cssParser(style: string) {
  const classList = style.split('}')
  const result = {}
  for (const item of classList) {
    const [className, properties] = item.split('{')
    if (className.includes('@')) continue // ignore @media
    const propertiesList = properties.split(';').filter(Boolean)
    result[className] = {}
    for (const prop of propertiesList) {
      const [property, value] = prop.split(':')
      if (cssRules.includes(property))
        result[className][property] = value // only allow certain properties
      else
        continue
    }
  }
  return result
}
