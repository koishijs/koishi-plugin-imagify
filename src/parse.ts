import { h } from "koishi"

export const renderElements = [
  'p', 'a', 'br',
  'b', 'strong',
  'i', 'em',
  'u', 'ins',
  's', 'del']
export const specialElements = ['image', 'text']
export const appendElements = ['at', 'button', 'execute', 'quote']

export function paser(elements: h[]) {
  const result = []
  for (const element of elements) {
    let obj = {
      type: element.type,
      attrs: Object.entries(element.attrs).map(([key, value]) => `${key}="${value}"`),
    }
    if (renderElements.includes(element.type)) obj['content'] = paser(element.children)
    else if (specialElements.includes(element.type)) switch (element.type) {
      case 'image':
        obj['type'] = 'img'
        obj['attrs'] = [`src="${element.attrs['url']}"`]
        break
      case 'text':
        const content = element.attrs['content'].replace(/ /g, '&nbsp;')
        if (content.includes('\n')) {
          obj['type'] = 'p'
          obj['attrs'] = []
          obj['content'] = content.split('\n').map(line => `<span>${line}</span><br>`).join('')
        } else
          obj['content'] = content
        break
    } else continue
    result.push(obj)
  }
  return result
}
