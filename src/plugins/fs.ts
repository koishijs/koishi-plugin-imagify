import { Context } from "koishi";
import * as fs from 'fs/promises'

declare module 'koishi' {
  interface Context {
    $fs: typeof fs
  }
}

export function apply(ctx: Context) {
  ctx.provide('$fs', fs)
  ctx.on('dispose', () => {
    ctx.$fs = undefined
  })
}
