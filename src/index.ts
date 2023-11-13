import { Context, Schema, h, version } from 'koishi'
import { } from 'koishi-plugin-puppeteer'
import { readFileSync } from 'fs'
import { readFile } from 'fs/promises'
import { appendElements, paser } from './parse'
import { template } from './template'

const { version: pv } = require('../package.json')
const css = readFileSync(require.resolve('./default.css'), 'utf8')

export const name = 'imagify'

export interface Config {
  maxLineCount: number
  maxLength: number
  background: string
  blur: number
  style: string
}

export const Config: Schema<Config> = Schema.object({
  maxLineCount: Schema.number().min(1).default(20).description('当文本行数超过该值时转为图片'),
  maxLength: Schema.number().min(1).default(600).description('当返回的文本字数超过该值时转为图片'),
  background: Schema.string().role('link').description('背景图片地址，以 http(s):// 开头'),
  blur: Schema.number().min(1).max(10).default(3).description('文本卡片模糊程度'),
  style: Schema.string().role('textarea').default(css).description('文本卡片样式'),
})

export const using = ['puppeteer']

export function apply(ctx: Context, config: Config) {
  ctx.before('send', async (session) => {
    if (h('', session.elements).toString(true).length > config.maxLength || session.elements.filter(e => ['p', 'a', 'button'].includes(e.type)).length > config.maxLineCount) {
      const elements = paser(session.elements)
      const image = await ctx.puppeteer.render(template(await readFile(require.resolve('./template.thtml'), 'utf8'), {
          style: config.style,
          background: config.background,
          blur: config.blur,
          element: elements.map(element => `<${element.type}>${element.content}</${element.type}>`).join(''),
        })
      )
      session.elements = [...h.parse(image), ...session.elements.filter(e => appendElements.includes(e.type))]
    }
  }, true)
}
