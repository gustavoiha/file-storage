#!/usr/bin/env node
// Usage: node screenshot.mjs <html-file-or-url> <out.png> [width=1440] [height=900] [--full]
// Renders a local HTML file (or URL) in headless Chromium and saves a PNG.
// Playwright lives in .agent-local/tools (shared by the design and testing agents).
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..') // repo root, from this script's location
const require = createRequire(`${ROOT}/.agent-local/tools/package.json`)
const { chromium } = require('playwright')

const [src, out, w = '1440', h = '900', ...flags] = process.argv.slice(2)
if (!src || !out) { console.error('usage: screenshot.mjs <html|url> <out.png> [width] [height] [--full]'); process.exit(2) }
const url = /^https?:|^file:/.test(src) ? src : pathToFileURL(resolve(src)).href
const width = Number(w), height = Number(h)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: width < 600 ? 3 : 2 })
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto(url, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts && document.fonts.ready)
await page.screenshot({ path: out, fullPage: flags.includes('--full') })
await browser.close()
console.log(JSON.stringify({ out, width, height, errors }))
