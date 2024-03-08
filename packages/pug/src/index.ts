import { Context, Schema } from 'koishi'

export const name = 'imagify-pug'

export interface Config { }

export const config: Schema<Config> = Schema.object({})

export function apply(ctx: Context, config: Schema) {

}

