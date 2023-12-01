import { Context, Schema, h, version as kVersion } from 'koishi'
import { } from 'koishi-plugin-puppeteer'
import type { Page } from 'puppeteer-core'
import { readFileSync } from 'fs'
import { readFile } from 'fs/promises'
import { ruler, parser, appendElements, templater } from './helper'
import { ImageRule, RuleType, RuleComputed, PageWorker } from './types'

const { version: pVersion } = require('../package.json')
const css = readFileSync(require.resolve('./default.css'), 'utf8')

export const name = 'imagify'

export interface Config {
  fastify: boolean
  pagepool: number
  advanced: boolean
  rules: ImageRule[][]
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
      pagepool: Schema.number().min(1).default(5).max(128).description('初始化页面池数量（请谨慎设置，小心 OOM ）'),
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
      rules: Schema.array(Schema.array(Schema.object({
        type: Schema.union([
          Schema.const(RuleType.PLATFORM).description('平台名'),
          Schema.const(RuleType.USER).description('用户ID'),
          Schema.const(RuleType.GROUP).description('群组ID'),
          Schema.const(RuleType.CHANNEL).description('频道ID'),
          Schema.const(RuleType.BOT).description('机器人ID'),
          Schema.const(RuleType.COMMAND).description('命令名'),
          Schema.const(RuleType.CONTENT).description('内容文本'),
          Schema.const(RuleType.LENGTH).description('内容字数'),
        ]).description('类型'),
        computed: Schema.union([
          Schema.const(RuleComputed.REGEXP).description('正则'),
          Schema.const(RuleComputed.EQUAL).description('等于'),
          Schema.const(RuleComputed.NOT_EQUAL).description('不等于'),
          Schema.const(RuleComputed.CONTAIN).description('包含'),
          Schema.const(RuleComputed.NOT_CONTAIN).description('不包含'),
          Schema.const(RuleComputed.MATH).description('数学（高级）'),
        ]).description('计算'),
        righthand: Schema.string().description('匹配'),
      })).role('table').description('AND 规则，点击右侧「添加行」添加 OR 规则。')).description('规则列表，点击右侧「添加项目」添加 AND 规则。详见<a href="https://imagify.koishi.chat/rule">文档</a>').experimental()
    }).description('高级设置')
  ]),
  Schema.object({
    background: Schema.string().role('link').description('背景图片地址，以 http(s):// 开头'),
    blur: Schema.number().min(1).max(50).default(10).description('文本卡片模糊程度'),
    style: Schema.string().role('textarea').default(css).description('直接编辑样式， class 见<a href="https://imagify.koishi.chat/style">文档</a>'),
  }).description('卡片设置'),
]) as Schema<Config>

export const inject = ['puppeteer']

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('imagify')
  let pagepool: PageWorker<Page>[] = []

  async function createPage(temp) {
    const page = await ctx.puppeteer.page()
    await page.setContent(templater(temp, {
      style: config.style,
      background: config.background,
      blur: config.blur,
      element: '',
      kVersion,
      pVersion
    }))
    return page
  }

  async function getWorker() {
    return new Promise<PageWorker<Page>>((resolve) => {
      function check() {
        const available = pagepool.find(p => !p.busy)

        if (available) {
          available.busy = true
          resolve(available)
        } else {
          setTimeout(check, 100)
        }
      }
      check()
    });
  }

  ctx.on('ready', async () => {
    const temp = await readFile(require.resolve('./template.thtml'), 'utf8')

    // preload pages
    if (config.fastify)
      for (let i = 0; i < config.pagepool; i++)
        pagepool.push({
          busy: false,
          page: await createPage(temp)
        })
    else
      pagepool.push({
        busy: false,
        page: await createPage(temp)
      })
  })

  ctx.on('dispose', async () => {
    for (const page of pagepool) {
      page.busy = false
      await page.page.close()
    }
  })

  ctx.before('send', async (session, options) => {
    session.argv = (options.session as (typeof session)).argv
    const rule = ruler(session)
    const tester = config.advanced
      ? config.rules.every(rule)
      : session.elements.filter(e => e.type.includes(session.platform)).length === 0
        ? h('', session.elements).toString(true).length > config.maxLength || session.elements.filter(e => ['p', 'a', 'button'].includes(e.type)).length > config.maxLineCount
        : false

    // imagify of non platform elements
    if (tester) {
      const worker = await getWorker()
      try {
        await worker.page.evaluate((elementString) => {
          document.body.style.margin = '0'
          document.querySelector('.text-card').innerHTML = elementString
        }, (await parser(session.elements, session)).join(''))
        worker.busy = false

        // fix screenshot size of <body>
        const { width, height } = await worker.page.evaluate(body => {
          const { width, height } = body.getBoundingClientRect();
          return { width, height };
        }, await worker.page.$('body'));

        session.elements = [
          h.image(await worker.page.screenshot({
            clip: { x: 0, y: 0, width, height }
          }), 'image/png'),
          ...session.elements.filter(e => appendElements.includes(e.type))
        ]
      } catch (error) {
        worker.busy = false
        logger.error(error)
      }
    }
  }, true)
}
