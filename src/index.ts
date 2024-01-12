import { Context, Schema, h, version as kVersion, pick } from 'koishi'
import { } from 'koishi-plugin-puppeteer'
import { } from '@koishijs/cache'
import type { Page } from 'puppeteer-core'
import { readFileSync } from 'fs'
import { ruler, parser, appendElements, templater, linerElements, keyHash, memozied, memoziedFileStore, cacheDataDir, memoziedDatabaseStore, memoziedCacherStore, memoziedMemoryStore, MemoryCache } from './helper'
import { ImageRule, RuleType, RuleComputed, PageWorker, CacheRule, CacheDriver, CacheData, CacheFunctionFork } from './types'
import { resolve } from 'path'

declare module 'koishi' {
  interface Tables {
    imagify: CacheData
  }
}

declare module '@koishijs/cache' {
  interface Tables {
    imagify: string
  }
}

const { version: pVersion } = require('../package.json')
const css = readFileSync(require.resolve('./default.css'), 'utf8')

export const name = 'imagify'

export interface Config {
  quality: number
  regroupement: boolean
  pagepool: number
  advanced: boolean
  rules: ImageRule[][]
  cache: {
    enable: boolean
    driver: CacheDriver
    rule: CacheRule[]
  }
  templates: string[]
  maxLineCount: number
  maxLength: number
  background: string
  blur: number
  style: string
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    regroupement: Schema.boolean().default(false).description('并发渲染（这会显著提高内存占用）').experimental(),
    quality: Schema.number().min(20).default(80).max(100).description('生成的图片质量'),
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
      })).role('table').description('AND 规则，点击右侧「添加行」添加 OR 规则。')).description('规则列表，点击右侧「添加项目」添加 AND 规则。详见<a href="https://imagify.koishi.chat/rule">文档</a>').experimental(),
      cache: Schema.intersect([
        Schema.object({
          enable: Schema.boolean().default(false).description('启用缓存'),
          driver: Schema.union([
            Schema.const(CacheDriver.FILE).description('文件'),
            Schema.const(CacheDriver.DATABASE).description('数据库'),
            Schema.const(CacheDriver.CACHER).description('cache 插件（需要安装依赖）').experimental(),
            Schema.const(CacheDriver.MEMORY).description('内存（不推荐）').experimental(),
          ]).description('缓存存储方式'),
        }),
        Schema.union([
          Schema.object({
            enable: Schema.const(true).required(),
            rule: Schema.array(Schema.object({})).role('table').description('缓存命中规则，点击右侧「添加行」添加规则。').hidden(),
          }),
          Schema.object({}),
        ]),
      ]),
      templates: Schema.array(Schema.string().role('textarea')).description('自定义模板，点击右侧「添加行」添加模板。').disabled(),
    }).description('高级设置'),
  ]),
  Schema.intersect([
    Schema.union([
      Schema.object({
        background: Schema.string().role('link').description('背景图片地址，以 http(s):// 开头'),
        blur: Schema.number().min(1).max(50).default(10).description('文本卡片模糊程度'),
        customize: Schema.boolean().default(false).description('自定义样式'),
      }),
      Schema.object({
        customize: Schema.const(true).required(),
        style: Schema.string().role('textarea').default(css).description('直接编辑样式， class 见<a href="https://imagify.koishi.chat/style">文档</a>'),
      }),
    ])
  ]).description('样式设置'),
]) as Schema<Config>

export const inject = {
  required: ['puppeteer'],
  optional: ['database', 'cache']
}

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('imagify')
  const cacheFork: CacheFunctionFork[] = []
  let pagepool: PageWorker<Page>[] = []
  let cacher: MemoryCache
  let page: Page
  let template: string
  let configSalt

  if (config.cache && config.cache.enable) {
    if (config.cache.driver === CacheDriver.DATABASE)
      ctx.model.extend('imagify', {
        id: 'unsigned',
        key: 'string',
        value: 'string',
      }, {
        autoInc: true,
        primary: 'id',
        unique: ['key'],
      })
    if (config.cache.driver === CacheDriver.CACHER)
      if (!ctx.cache) {
        logger.warn('`cache` plugin is required when using `cacher` driver. callback to `file` driver.')
        config.cache.driver = CacheDriver.FILE
      }
    if (config.cache.driver === CacheDriver.MEMORY)
      cacher = new MemoryCache()
  }

  async function createPage(template) {
    const page = await ctx.puppeteer.page()
    await page.setContent(templater(template, {
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
    template ??= readFileSync(require.resolve('./template.thtml'), 'utf8')
    configSalt ??= {
      ...pick(config, ['style', 'background', 'blur', 'maxLineCount', 'maxLength']),
      templates: config.templates.map(t => readFileSync(t, 'utf8')),
    }
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
    cacheFork.forEach(fork => fork.dispose())
    cacher.clear()
  })

  ctx.before('send', async (session, options) => {
    session.argv ||= (options?.session as (typeof session))?.argv || {}
    const rule = ruler(session)
    const verdict = config.advanced
      ? config.rules.every(rule)
      : session.elements.filter(e => e.type.includes(session.platform)).length === 0
        ? h('', session.elements).toString(true).length > config.maxLength || session.elements.filter(e => linerElements.includes(e.type)).length > config.maxLineCount
        : false

    // imagify of non platform elements
    if (verdict) {
      let img
      if (config.cache && config.cache.enable) {
        const hashKey = keyHash(session.content, configSalt)
        const { store, options } = (() => {
          let result = {
            store: undefined,
            options: undefined
          }
          switch (config.cache.driver) {
            case CacheDriver.FILE:
              result.store = memoziedFileStore
              result.options['filePath'] = resolve(ctx.root.baseDir, cacheDataDir)
              break
            case CacheDriver.DATABASE:
              result.store = memoziedDatabaseStore
              break
            case CacheDriver.CACHER:
              result.store = memoziedCacherStore
              break
            case CacheDriver.MEMORY:
              result.store = memoziedMemoryStore
              result.options['cache'] = cacher
              break
          }
          return result
        })()
        // creat cache
        const cacheFork = await memozied<any, Context>(img, {
          key: session.content,
          salt: configSalt,
          store,
          ...options,
        }, ctx)
      }
      if (config.regroupement) {
        const worker = await getWorker()
        let page
        try {
          const { width, height } = await worker.page.evaluate((elementString) => {
            document.body.style.margin = '0'
            document.querySelector('.text-card').innerHTML = elementString
            // fix screenshot size of <body>
            return document.body.getBoundingClientRect()
          }, (await parser(session.elements, session)).join(''))
          worker.busy = false
          page = worker.page

          img = [h.image(await worker.page.screenshot({
            clip: { x: 0, y: 0, width, height },
            quality: config.quality,
          }), 'image/png')]
        } catch (error) {
          worker.busy = false
          logger.error(error)
        }
      } else {
        img = h.parse(await ctx.puppeteer.render(templater(template, {
          style: config.style,
          background: config.background,
          blur: config.blur,
          element: (await parser(session.elements, session)).join(''),
          kVersion,
          pVersion
        })))
      }

      session.elements = [...img, ...session.elements.filter(e => appendElements.includes(e.type))]
    }
  }, true)
}
