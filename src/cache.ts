import { Context } from "koishi"
import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { Cacher, CacheStore } from "./types"


export const FREQUENCY_THRESHOLD = 3
// export const FREQUENCY_TIMEOUT = 1000 * 60 * 60 * 24 * 7

export const cacheKeyHash = (key: string, salt: object): string =>
  createHash('md5').update(key + JSON.stringify(salt)).digest('hex')


export const cacheFrequency = (hashKey: string, cache: Cacher): Cacher =>
  new Map([...cache.entries(), [hashKey, { ...cache.get(hashKey), frequency: (cache.get(hashKey)?.frequency || 0) + 1 }]])

export function cachePromote(hashKey: string, cache: Cacher, frequencyThreshold: number = FREQUENCY_THRESHOLD): Cacher {
  const cacheItem = cache.get(hashKey)
  if (cacheItem && cacheItem.frequency >= frequencyThreshold) {
    return new Map([...cache.entries(), [hashKey, cacheItem]])
  }
  return cache
}

export const cacheDemote = async (store: ReturnType<CacheStore>, hashKey: string, cache: Cacher): Promise<Cacher> => {
  const cacheItem = cache.get(hashKey)
  if (!cacheItem) return cache
  await store.write(cacheItem.data)
  return new Map([...cache.entries()].filter(([k]) => k !== hashKey))
}

export const cacheFileStore: CacheStore = (ctx: Context, key: string) => {
  const rootDir = ctx.root.baseDir
  const cacheDir = resolve(rootDir, 'cache/imagify')
  const file = resolve(cacheDir, `${key}.temp`)
  ctx.$fs.stat(cacheDir).catch(async () => {
    await ctx.$fs.mkdir(cacheDir, { recursive: true })
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
    write: async (value: any) => ctx.database.create('imagify', { key, value }),
    remove: async () => ctx.database.remove('imagify', key),
    dipspose: () => { }
  }
}


