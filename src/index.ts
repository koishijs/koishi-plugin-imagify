import { Context, Schema, h, version as kVersion, pick } from 'koishi'
import { } from 'koishi-plugin-puppeteer'
import { } from '@koishijs/cache'
import { } from '@koishijs/plugin-notifier'
import type { Page } from 'puppeteer-core'
import { readFileSync } from 'fs'
import { ruler, parser, appendElements, templater, linerElements } from './helper'
import { ImageRule, RuleType, RuleComputed, PageWorker, CacheModel, CacheRule } from './types'
import { CacheService, FREQUENCY_THRESHOLD, cacheKeyHash } from './cache'

const { version: pVersion } = require('../package.json')
const css = readFileSync(require.resolve('./default.css'), 'utf8')

export const name = 'imagify'

export interface Config {
  quality: number
  regroupement: boolean
  pagepool: number
  advanced: boolean
  rules?: ImageRule[][]
  cache: {
    enable: boolean
    databased: boolean
    driver: CacheModel
    threshold: number
    rule: CacheRule[]
  }
  templates: string[]
  maxLineCount?: number
  maxLength?: number
  background: string
  blur: number
  style: string
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    quality: Schema.number().min(20).default(80).max(100).description('生成的图片质量').experimental(),
    regroupement: Schema.boolean().default(false).description('并发渲染（这会显著提高内存占用）'),
    cache: Schema.intersect([
      Schema.object({
        enable: Schema.boolean().default(false).description('启用缓存').experimental(),
      }),
      Schema.union([
        Schema.intersect([
          Schema.object({
            enable: Schema.const(true).required(),
            driver: Schema.union([
              Schema.const(CacheModel.NATIVE).description('由 imagify 自行管理').experimental(),
              Schema.const(CacheModel.CACHE).description('由 Cache 服务管理（需要 Cache 服务）'),
            ]).default(CacheModel.CACHE).description('缓存存储方式，推荐使用 cache 服务'),
            rule: Schema.array(Schema.object({})).role('table').description('缓存命中规则，点击右侧「添加行」添加规则。').hidden(),
          }),
          Schema.union([
            Schema.object({
              driver: Schema.const(CacheModel.NATIVE).required(),
              databased: Schema.boolean().default(true).description('使用数据库代替本地文件（需要 database 服务）').disabled(),
              threshold: Schema.number().min(1).default(FREQUENCY_THRESHOLD).description('缓存阈值，当缓存命中次数超过该值时，缓存将被提升为高频缓存'),
            }),
            Schema.object({}),
          ]),
        ]),
        Schema.object({}),
      ]),
    ]),
  }),
  Schema.union([
    Schema.object({
      regroupement: Schema.const(true).required(),
      pagepool: Schema.number().min(1).default(5).max(128).description('初始化页面池数量'),
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
      })).role('table').description('AND 规则，点击右侧「添加行」添加 OR 规则。')).description('规则列表，点击右侧「添加项目」添加 AND 规则。详见<a href="https://imagify.koishi.chat/rule">文档</a>'),
      templates: Schema.array(Schema.string().role('textarea')).description('自定义模板，点击右侧「添加行」添加模板。').disabled(),
    }).description('高级设置'),
  ]),
  Schema.intersect([
    Schema.object({
      background: Schema.string().role('link').description('背景图片地址，以 http(s):// 开头'),
      blur: Schema.number().min(1).max(50).default(10).description('文本卡片模糊程度'),
      customize: Schema.boolean().default(false).description('自定义样式'),
    }).description('样式设置'),
    Schema.union([
      Schema.object({
        customize: Schema.const(true).required(),
        style: Schema.string().role('textarea').default(css).description('直接编辑样式， class 见<a href="https://imagify.koishi.chat/style">文档</a>'),
      }),
      Schema.object({}),
    ])
  ]),
]) as Schema<Config>

export const inject = {
  required: ['puppeteer'],
  optional: ['database', 'cache']
}

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('imagify')
  let cacheService: CacheService
  let pagepool: PageWorker<Page>[] = []
  let page: Page
  let template: string

  // load fs of NATIVE cache model
  // if (config.cache.enable && config.cache.driver === CacheModel.NATIVE)
  // ctx.plugin(FsPlugin)

  if (config?.cache?.enable) {
    cacheService = new CacheService(ctx, config)
  }

  async function createPage(template) {
    const page = await ctx.puppeteer.page()
    await page.setContent(templater(template, {
      style: config.style || css,
      background: `background: url(${config.background});`,
      blur: config.blur,
      element: '',
      kVersion,
      pVersion
    }), {
      waitUntil: 'networkidle0'
    })
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
    if (config?.cache?.enable) {
      // clean residue cache
      if (config?.cache?.driver === CacheModel.CACHE) await ctx.cache.clear('imagify')
      else if (config?.cache?.driver === CacheModel.NATIVE) await cacheService.dispose()
    }
    template ??= readFileSync(require.resolve('./template.thtml'), 'utf8')
    // preload pages
    if (config.regroupement)
      for (let i = 0; i < config.pagepool; i++)
        pagepool.push({
          busy: false,
          page: await createPage(template)
        })
  })

  ctx.on('dispose', async () => {
    for (const page of pagepool) {
      page.busy = false
      await page.page.close()
    }
    if (config?.cache)
      if (config?.cache?.driver === CacheModel.CACHE) await ctx.cache.clear('imagify')
      else if (config?.cache?.driver === CacheModel.NATIVE) await cacheService.dispose()
  })

  ctx.before('send', async (session, options) => {
    // console.time('imagifycost')
    session.argv = (options?.session as (typeof session))?.argv || {}
    const rule = ruler(session)
    const verdict = config.advanced
      ? config.rules.every(rule)
      : session.elements.filter(e => e.type.includes(session.platform)).length === 0
        ? h('', session.elements).toString(true).length > config.maxLength || session.elements.filter(e => linerElements.includes(e.type)).length > config.maxLineCount
        : false
    let cached = false
    // imagify of non platform elements
    // pass empty content
    if (verdict && session.content && session.elements.length > 0) {
      let img: Buffer
      const hashKey = cacheKeyHash(session.content)
      if (config?.cache?.enable) {
        const cacheItem = await cacheService.load(hashKey)
        if (cacheItem) {
          img = Buffer.from(cacheItem, 'base64')
          cached = true
        }
      }
      if (!cached) {
        const screenShotPage = async (page: Page) => {
          // try activates this tab
          await page.bringToFront()

          const { width, height } = await page.evaluate((elementString) => {
            document.body.style.margin = '0'
            document.querySelector('.text-card').innerHTML = elementString
            // fix screenshot size of body element
            const rect = document.body.getBoundingClientRect()
            return {
              width: rect.width,
              height: rect.height
            }
          }, (await parser(session.elements, session)).join(''))
          return await page.screenshot({
            clip: { x: 0, y: 0, width, height },
            quality: config.quality,
            type: 'jpeg'
          })
        }
        if (config.regroupement) {
          const worker = await getWorker()
          try {
            img = await screenShotPage(worker.page)
            worker.busy = false
          } catch (error) {
            worker.busy = false
            logger.error(error)
          }
        } else img = await screenShotPage(page ??= await createPage(template))
        if (config?.cache?.enable) await cacheService.save(hashKey, Buffer.from(img).toString('base64'))
      }
      // console.timeEnd('imagifycost')
      session.elements = [h.image(img, 'image/jpeg'), ...session.elements.filter(e => appendElements.includes(e.type))]
    }
  }, true)
}
