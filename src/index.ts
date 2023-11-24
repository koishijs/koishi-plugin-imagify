import { Context, Schema, h, version as kVersion } from 'koishi'
import { } from 'koishi-plugin-puppeteer'
import type { Page } from 'puppeteer-core'
import { readFileSync } from 'fs'
import { readFile } from 'fs/promises'
import { appendElements, parser } from './parse'
import { template } from './template'
import { ImageRule, RuleActivity, RuleComputed, RulePattren, RuleType } from './types'

const { version: pVersion } = require('../package.json')
const css = readFileSync(require.resolve('./default.css'), 'utf8')

export const name = 'imagify'

export interface Config {
  fastify: boolean
  pagepool: number
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
    fastify: Schema.boolean().default(false).description('快速出图模式（用 200M 以上内存占用换来 100MS 左右的速度提升！）').experimental(),
  }),
  Schema.union([
    Schema.object({
      fastify: Schema.const(true).required(),
      pagepool: Schema.number().min(1).default(5).description('页面池大小（请谨慎设置，小心 OOM ）'),
    }),
    Schema.object({})
  ]),
  Schema.object({
    advanced: Schema.boolean().default(false).description('是否启用高级模式')
  }),
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
        ]).description('规则'),
        type: Schema.union([
          Schema.const(RuleType.PLATFORM).description('平台名'),
          Schema.const(RuleType.USER).description('用户ID'),
          Schema.const(RuleType.GROUP).description('群组ID'),
          Schema.const(RuleType.CHANNEL).description('频道ID'),
          Schema.const(RuleType.BOT).description('机器人ID'),
          Schema.const(RuleType.CONTENT).description('内容文本'),
        ]).description('类型'),
        computed: Schema.union([
          Schema.const(RuleComputed.REGEXP).description('正则'),
          Schema.const(RuleComputed.EQUAL).description('等于'),
          Schema.const(RuleComputed.NOT_EQUAL).description('不等于'),
          Schema.const(RuleComputed.CONTAIN).description('包含'),
          Schema.const(RuleComputed.NOT_CONTAIN).description('不包含'),
        ]).description('计算'),
        righthand: Schema.string().description('匹配'),
        activity: Schema.union([
          Schema.const(RuleActivity.WAIT).description('后继规则'),
          Schema.const(RuleActivity.END).description('结束规则'),
        ]).description('动作').default(RuleActivity.WAIT),
      })).default([{
        pattren: RulePattren.IF,
        type: RuleType.PLATFORM,
        computed: RuleComputed.EQUAL,
        righthand: 'qq',
        activity: RuleActivity.WAIT
      }]).role('table').description('规则列表，直到第一个「如果」出现，后续规则才会生效').experimental()
    }).description('高级设置')
  ]) as Schema<Config>,
  Schema.object({
    background: Schema.string().role('link').description('背景图片地址，以 http(s):// 开头'),
    blur: Schema.number().min(1).max(50).default(10).description('文本卡片模糊程度'),
    style: Schema.string().role('textarea').default(css).description('文本卡片样式'),
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
