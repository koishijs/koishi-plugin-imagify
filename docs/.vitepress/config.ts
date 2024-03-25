import { defineConfig } from '@koishijs/vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: 'Imagify Plugin',
  description: 'Imagify is a powerful and flexible image processing tool.',

  head: [
    ['link', { rel: 'icon', href: '/icon.png' }],
    ['link', { rel: 'manifest', href: 'https://koishi.chat/manifest.json' }],
    ['meta', { name: 'theme-color', content: '#5546a3' }],
  ],

  themeConfig: {
    sidebar: [{
      text: '指南',
      items: [
        { text: '介绍', link: './' },
      ],
    }, {
      text: '更多',
      items: [
        { text: 'Koishi 官网', link: 'https://koishi.chat' },
        { text: '支持作者', link: 'https://afdian.net/a/lipraty' },
      ],
    }],
  },
})
