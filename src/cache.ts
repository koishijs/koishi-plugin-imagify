import { Context } from "koishi"
import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { CacheDatabase, CacheModel, Cacher, CacheStore } from "./types"
import { Config } from "."

declare module 'koishi' {
  interface Tables {
    imagify: CacheDatabase
  }
}

declare module '@koishijs/cache' {
  interface Tables {
    imagify: string
  }
}

export const FREQUENCY_THRESHOLD = 3
export const FREQUENCY_NOW = Date.now()
export const FREQUENCY_TIMEOUT = 1000 * 60 * 60 * 24 * 7

export const cacheKeyHash = (key: string, salt: object): string =>
  createHash('md5').update(key + JSON.stringify(salt)).digest('hex')

export const cacheFrequency = (hashKey: string, cache: Cacher, timestamp: number): Cacher =>
  new Map([...cache.entries(), [hashKey, {
    ...cache.get(hashKey),
    frequency: (cache.get(hashKey)?.frequency || 0) + 1,
    created: timestamp
  }]])

export function cachePromote(hashKey: string, cache: Cacher, frequencyThreshold: number): Cacher {
  const cacheItem = cache.get(hashKey)
  if (!cacheItem) return cache
  if (cacheItem && cacheItem.frequency >= frequencyThreshold) {
    return new Map([...cache.entries(), [hashKey, cacheItem]])
  }
  return cache
}

export const cacheDemote = async (store: ReturnType<CacheStore>, hashKey: string, cache: Cacher): Promise<Cacher> => {
  const cacheItem = cache.get(hashKey)
  if (!cacheItem) return cache
  await store.write(cacheItem.data)
  // clean Map data only if cache is demoted. remain cache Map key is used for tracking and cleaning.
  return new Map([...cache.entries()].map(([key, value]) => key === hashKey ? [key, { ...value, data: undefined }] : [key, value]))
}

export const cacheFileStore: CacheStore = (ctx: Context, key: string) => {
  const rootDir = ctx.root.baseDir
  const cacheDir = resolve(rootDir, 'cache/imagify')
  const file = resolve(cacheDir, `${key}.temp`)
  ctx.inject(['$fs'], ctx => {
    ctx.$fs.stat(cacheDir).catch(async () => {
      await ctx.$fs.mkdir(cacheDir, { recursive: true })
    })
  })
  try {
    return {
      read: async () => await ctx.$fs.readFile(file),
      write: async (value: any) => await ctx.$fs.writeFile(file, value),
      remove: async () => await ctx.$fs.rm(file),
      dipspose: () => { }
    }
  } catch (error) {
    throw new Error(error)
  }
}

export const cacheDatabaseStore: CacheStore = (ctx: Context, key: string) => {
  return {
    read: async () => ctx.database.get('imagify', key),
    write: async (value: any) => ctx.database.upsert('imagify', [{ key, value }], ['key']),
    remove: async () => ctx.database.remove('imagify', key),
    dipspose: () => { }
  }
}

export const getCache = async <T = never>(ctx: Context, key: string, cache: Cacher, store: CacheStore, frequencyThreshold: number = FREQUENCY_THRESHOLD, now: number = FREQUENCY_NOW): Promise<[T, Cacher]> => {
  if (!cache.has(key)) return [undefined, cache]
  const cacheItem = cache.get(key)
  const updatedCache = cachePromote(key, cache, frequencyThreshold)
  await cacheDemote(store(ctx, key), key, updatedCache)
  return [cacheItem ? cacheItem.data : await store(ctx, key).read(), cache]
}

export const setCache = async <T = never>(ctx: Context, key: string, data: T, cache: Cacher, store: CacheStore, frequencyThreshold: number): Promise<[T, Cacher]> => {
  const updatedCache = cachePromote(key, cache, frequencyThreshold);
  await store(ctx, key).write(data);
  return [data, updatedCache];
}

export const cleanAllCache = async (ctx: Context, cache: Cacher, store: CacheStore): Promise<undefined> => {
  const keys = Array.from(cache.keys())
  for (const key of keys) {
    const cacheItem = cache.get(key)
    if (cacheItem) continue
    await store(ctx, key).remove()
  }
  cache.clear()
  return undefined
}

export class CacheService {
  #cache: Cacher
  dirver: CacheModel
  store: CacheStore

  constructor(private ctx: Context, private config: Config) {
    const { cache } = config
    if (cache.databased && ctx.database) {
      ctx.model.extend('imagify', {
        key: 'string',
        value: 'text'
      }, {
        unique: ['key']
      })
      this.store = cacheDatabaseStore
    } else {
      this.store = cacheFileStore
    }
    if (cache.driver === CacheModel.NATIVE)
      this.#cache = new Map()
  }
  async save(key: string, value: string) {
    const { cache } = this.config
    if (cache.driver === CacheModel.CACHE) {
      await this.ctx.cache.set('imagify', key, value)
      return value
    }
    const [cacheItem, updatedCache] = (await setCache(this.ctx, key, value, this.#cache, this.store, this.config.cache.threshold))
    this.#cache = updatedCache
    return cacheItem
  }
  async load(key: string) {
    const { cache } = this.config
    if (cache.driver === CacheModel.CACHE)
      return await this.ctx.cache.get('imagify', key)
    const [cacheItem, updatedCache] = (await getCache(this.ctx, key, this.#cache, this.store, this.config.cache.threshold))
    this.#cache = updatedCache
    return cacheItem
  }
  async dispose() {
    if (this.config.cache.driver === CacheModel.NATIVE)
      await cleanAllCache(this.ctx, this.#cache, this.store)
    // ctx.cache is no need to clean,
  }
}
