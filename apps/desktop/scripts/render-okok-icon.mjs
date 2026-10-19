import { createRequire } from 'node:module'
import { mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(new URL('../package.json', import.meta.url))
const sharp = require('sharp')

const source = process.argv[2]
const destination = fileURLToPath(new URL('../resources/icon-macos.png', import.meta.url))
const size = 1024
const { data, info } = await sharp(source).flatten({ background: '#ffffff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
const rgba = Buffer.alloc(info.width * info.height * 4)
let minX = info.width
let minY = info.height
let maxX = 0
let maxY = 0
for (let y = 0; y < info.height; y += 1) {
  for (let x = 0; x < info.width; x += 1) {
    const i = (y * info.width + x) * info.channels
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3
    const alpha = lum > 210 ? 0 : lum < 30 ? 255 : Math.round(255 * (1 - (lum - 30) / 180))
    const o = (y * info.width + x) * 4
    rgba[o] = 255
    rgba[o + 1] = 255
    rgba[o + 2] = 255
    rgba[o + 3] = alpha
    if (alpha > 16) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
}
const mark = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
  .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
  .resize({ width: Math.round(size * 0.58), height: Math.round(size * 0.68), fit: 'inside' })
  .png()
  .toBuffer()
const meta = await sharp(mark).metadata()
await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 255 } } })
  .composite([{ input: mark, left: Math.round((size - meta.width) / 2), top: Math.round((size - meta.height) / 2) }])
  .png()
  .toFile(destination)

const iconset = fileURLToPath(new URL('../.desktop-build/okok.iconset', import.meta.url))
await rm(iconset, { recursive: true, force: true })
await mkdir(iconset, { recursive: true })
const sizes = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
]
for (const [name, edge] of sizes) {
  await sharp(destination).resize(edge, edge).png().toFile(join(iconset, name))
}
console.log(JSON.stringify({ destination, iconset, mark: { width: meta.width, height: meta.height } }))
