import { Context, Schema, h, version as kVersion } from 'koishi'
import { } from 'koishi-plugin-puppeteer'
import type { Page } from 'puppeteer-core'
import { readFileSync } from 'fs'
import { readFile } from 'fs/promises'
import { appendElements, parser } from './parse'
import { template } from './template'
import { ImageRule, RuleComputed, RulePattren, RuleType } from './types'

const { version: pVersion } = require('../package.json')
const css = readFileSync(require.resolve('./default.css'), 'utf8')

export const name = 'imagify'

export interface Config {
  fastify: boolean
  advanced: boolean
  rules: ImageRule[]
  maxLineCount: number
  maxLength: number
  background: string
  blur: number
  style: string
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    fastify: Schema.boolean().default(false).description('快速出图模式（这会显著提高内存占用）').experimental(),
    advanced: Schema.boolean().default(false).description('是否启用高级模式')
  }).description('基本设置'),
  Schema.union([
    Schema.object({
      // @ts-ignore
      advanced: Schema.const(false),
      maxLineCount: Schema.number().min(1).default(20).description('当文本行数超过该值时转为图片'),
      maxLength: Schema.number().min(1).default(648).description('当返回的文本字数超过该值时转为图片'),
    }),
    Schema.object({
      advanced: Schema.const(true).required(),
      rules: Schema.array(Schema.object({
        pattren: Schema.union([
          Schema.const(RulePattren.IF).description('如果'),
          Schema.const(RulePattren.OR).description('或者'),
          Schema.const(RulePattren.AND).description('并且'),
          Schema.const(RulePattren.NOT).description('不'),
          Schema.const(RulePattren.ELSE).description('否则'),
        ]).description('模式'),
        type: Schema.union([
          RuleType.PLATFORM,
          RuleType.USER,
          RuleType.GROUP,
          RuleType.CHANNEL,
          RuleType.CONTENT
        ]).description('数据源'),
        computed: Schema.union([
          Schema.const(RuleComputed.EQUAL).description('等于'),
          Schema.const(RuleComputed.CONTAIN).description('包含'),
          Schema.const(RuleComputed.REGEXP).description('正则'),
        ]).description('规则计算方式'),
        righthand: Schema.string(),
        enable: Schema.boolean().default(true).description('是否启用'),
      })).default([]).role('table').description('规则列表').experimental()
    }).description('高级设置')
  ]) as Schema<Config>,
  Schema.object({
    background: Schema.string().role('link').description('背景图片地址，以 http(s):// 开头'),
    blur: Schema.number().min(1).max(50).default(10).description('文本卡片模糊程度'),
    style: Schema.string().role('textarea').default(css).description('文本卡片样式').experimental(),
  }).description('卡片设置'),
])

export const inject = ['puppeteer']

export function apply(ctx: Context, config: Config) {
  let page: Page
  let temp: string

  ctx.on('ready', async () => {
    const temp = await readFile(require.resolve('./template.thtml'), 'utf8')
    if (config.fastify) {
      if (!page) page = await ctx.puppeteer.page()
      page.setContent(template(temp, {
        style: config.style,
        background: config.background,
        blur: config.blur,
        element: '',
        kVersion,
        pVersion
      }))
    }
  })

  ctx.before('send', async (session) => {
    // imagify of non platform elements
    if (session.elements.filter(e => e.type.includes(session.platform)).length === 0)
      if (h('', session.elements).toString(true).length > config.maxLength || session.elements.filter(e => ['p', 'a', 'button'].includes(e.type)).length > config.maxLineCount) {
        const image = await ctx.puppeteer.render(await template(temp, {
          style: config.style,
          background: config.background,
          blur: config.blur,
          element: (await parser(session.elements, session)).join(''),
          kVersion,
          pVersion
        }))
        session.elements = [...h.parse(image), ...session.elements.filter(e => appendElements.includes(e.type))]
      }
  }, true)
}
