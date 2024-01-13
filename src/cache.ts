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




// class FrequencyCache<T = any> {
//   private cache: Map<string, CacheData<T>> = new Map()
//   private memoryStoreage: Map<string, T> = new Map() // store data in memory, hashKey -> data
//   private fileStoreageTable: Map<string, string> = new Map() // store data in file, hashKey -> filePath

//   constructor(private threshold: number = 3) { }

//   private updateFrequency(hashKey: string, cache: Map<string, CacheData<T>>): Map<string, CacheData<T>> {
//     const cacheItem = cache.get(hashKey)
//     if (!cacheItem) return cache
//     const updatedCacheItem = { ...cacheItem, frequency: cacheItem.frequency++ }
//     return new Map([...cache.entries(), [hashKey, updatedCacheItem]])
//   }

//   private promote(hashKey: string, cache: Map<string, CacheData<T>>): [Map<string, CacheData<T>>, Map<string, T | string>] {
//     const cacheItem = cache.get(hashKey);
//     if (cacheItem && cacheItem.frequency >= this.threshold) {
//       // promote to memory if frequency is greater than threshold
//       const updatedMemoryCache = new Map([...this.memoryStoreage.entries(), [hashKey, cacheItem.data]]);
//       const updatedCache = new Map([...cache.entries()].filter(([k]) => k !== hashKey));
//       return [updatedCache, updatedMemoryCache];
//     }
//     return [cache, this.memoryStoreage];
//   }

//   private demote(hashKey: string, cache: Map<string, CacheData<T>>): [Map<string, CacheData<T>>, Map<string, T | string>] {
//     const cacheItem = cache.get(hashKey);
//     if (!cacheItem) return [cache, this.fileStoreageTable];
//     // demote to file if frequency is less than threshold
//     const updatedFileStoreageTable = new Map<string, T | string>([...this.fileStoreageTable.entries(), [hashKey, cacheItem.data]]);
//     const updatedCache = new Map([...cache.entries()].filter(([k]) => k !== hashKey));
//     return [updatedCache, updatedFileStoreageTable];
//   }

//   public async get(hashKey: string): Promise<T | string | undefined> {
//     const updatedCache = this.updateFrequency(hashKey, this.cache)
//     const [cache, storeage] = this.promote(hashKey, updatedCache)
//     // If the data is not in memory, demote it to file storage
//     if (!storeage.get(hashKey)) {
//       const [updatedCache, updatedFileStoreageTable] = this.demote(hashKey, cache)
//       this.cache = updatedCache
//       this.fileStoreageTable = updatedFileStoreageTable
//     }
//     this.cache = cache
//     this.memoryStoreage = storeage as Map<string, T>
//     return this.memoryStoreage.get(hashKey) || this.fileStoreageTable.get(hashKey)
//   }
// }
