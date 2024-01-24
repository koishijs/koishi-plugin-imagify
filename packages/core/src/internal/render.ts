import { Context } from 'koishi'
import { } from 'koishi-plugin-puppeteer'
import type { Page } from 'puppeteer-core'
import { PageWorker } from '../types'

/// Puppeteer render

/**
 * Load html template to page
 */
export async function pptrRender(page: Page, html: string): Promise<Page> {
  await page.evaluate((eleString) => {
    document.querySelector('#container').innerHTML = eleString
  }, html)
  return page
}

/**
 * Get a worker from pagepool
 * @param pagepool 
 */
export async function pptrGetWorker(pagepool: PageWorker<Page>[]): Promise<[PageWorker<Page>[], Promise<PageWorker<Page>>]> {
  return [pagepool, new Promise<PageWorker<Page>>((resolve) => {
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
  })]
}

/**
 * Screenshot page
 * @param quality image quality. maxmium hundred positive integer
 */
export async function pptrScreenshot(page: Page, quality: number = 100): Promise<[Page, Buffer]> {
  const { width, height } = await page.evaluate(() => {
    const element = document.querySelector('._image')
    return { width: element.clientWidth, height: element.clientHeight }
  })
  return [page, await page.screenshot({
    clip: { x: 0, y: 0, width, height },
    quality,
    type: 'jpeg'
  })]
}

/**
 * ?
 */
export const pptrClose = (page: Page) => page.close()

/// Canvas render

