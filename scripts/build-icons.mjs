/**
 * build-icons.mjs
 *
 * Generates all app icon formats from resources/icon.svg:
 *
 *   resources/icon.png          512 × 512  – runtime tray + Linux window icon
 *   build/icon.ico              multi-size – Windows exe, NSIS installer (16/32/48/64/128/256)
 *   build/icon.icns             multi-size – macOS app bundle (all required sizes)
 *
 * Run manually:   node scripts/build-icons.mjs
 * Runs automatically as part of:  npm run build
 *
 * Requirements:
 *   sharp    – libvips-backed SVG rasterisation (highest quality, correct gamma)
 *   to-ico   – pure-JS multi-resolution ICO assembler
 */

import sharp from 'sharp'
import toIco from 'to-ico'
import { writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SVG = join(ROOT, 'resources', 'icon.svg')

if (!existsSync(SVG)) {
  console.error(`Error: SVG source not found at ${SVG}`)
  process.exit(1)
}

/** Rasterise the SVG to a PNG buffer at the given square pixel size. */
async function rasterize(size) {
  return sharp(SVG)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
    .toBuffer()
}

/**
 * Assemble a PNG-based ICNS file from an array of { type, data } entries.
 *
 * ICNS format:
 *   [magic "icns"][total size uint32BE]
 *   for each block: [OSType 4 bytes][block size incl. 8-byte header uint32BE][PNG bytes]
 *
 * OSType reference (PNG-in-ICNS, supported macOS 10.7+):
 *   icp4  16×16      ic11  16@2×  (32×32 PNG)
 *   icp5  32×32      ic12  32@2×  (64×64 PNG)
 *   icp6  64×64      ic13  128@2× (256×256 PNG)
 *   ic07  128×128    ic14  256@2× (512×512 PNG)
 *   ic08  256×256
 *   ic09  512×512
 *   ic10  1024×1024
 */
function buildIcns(entries) {
  const blocks = entries.map(({ type, data }) => {
    const header = Buffer.allocUnsafe(8)
    header.write(type, 0, 'ascii')
    header.writeUInt32BE(data.length + 8, 4)
    return Buffer.concat([header, data])
  })
  const body = Buffer.concat(blocks)
  const header = Buffer.allocUnsafe(8)
  header.write('icns', 0, 'ascii')
  header.writeUInt32BE(body.length + 8, 4)
  return Buffer.concat([header, body])
}

async function main() {
  await mkdir(join(ROOT, 'build'), { recursive: true })

  console.log('Building icons from resources/icon.svg …\n')

  const SIZES = [16, 32, 48, 64, 128, 256, 512, 1024]
  const p = {}
  for (const s of SIZES) {
    process.stdout.write(`  Rasterising ${String(s).padStart(4)} × ${s} … `)
    p[s] = await rasterize(s)
    process.stdout.write('done\n')
  }

  // ── resources/icon.png ──────────────────────────────────────────────────────
  // 512 px: used by the runtime tray icon and as the Linux window icon.
  await writeFile(join(ROOT, 'resources', 'icon.png'), p[512])
  console.log('\n  ✓  resources/icon.png       (512 × 512)')

  // ── build/icon.ico ──────────────────────────────────────────────────────────
  // Multi-resolution ICO for the Windows executable and NSIS installer.
  // Sizes: 16, 32, 48, 64, 128, 256 — covers all Windows shell contexts.
  const icoBuffer = await toIco([p[16], p[32], p[48], p[64], p[128], p[256]])
  await writeFile(join(ROOT, 'build', 'icon.ico'), icoBuffer)
  console.log('  ✓  build/icon.ico           (16/32/48/64/128/256 px)')

  // ── build/icon.icns ─────────────────────────────────────────────────────────
  // PNG-based ICNS for the macOS app bundle.
  const icnsBuffer = buildIcns([
    { type: 'icp4', data: p[16] }, //  16 × 16
    { type: 'icp5', data: p[32] }, //  32 × 32
    { type: 'icp6', data: p[64] }, //  64 × 64
    { type: 'ic07', data: p[128] }, // 128 × 128
    { type: 'ic08', data: p[256] }, // 256 × 256
    { type: 'ic09', data: p[512] }, // 512 × 512
    { type: 'ic10', data: p[1024] }, // 1024 × 1024
    { type: 'ic11', data: p[32] }, //  16 × 16 @2×
    { type: 'ic12', data: p[64] }, //  32 × 32 @2×
    { type: 'ic13', data: p[256] }, // 128 × 128 @2×
    { type: 'ic14', data: p[512] } // 256 × 256 @2×
  ])
  await writeFile(join(ROOT, 'build', 'icon.icns'), icnsBuffer)
  console.log('  ✓  build/icon.icns          (all macOS sizes + @2× retina)')

  // ── build/icon.png ──────────────────────────────────────────────────────────
  // 512 px PNG for electron-builder's Linux AppImage / deb / snap targets.
  await writeFile(join(ROOT, 'build', 'icon.png'), p[512])
  console.log('  ✓  build/icon.png           (512 × 512, Linux targets)')

  console.log('\nIcon generation complete.\n')
}

main().catch((err) => {
  console.error('\nIcon generation failed:', err)
  process.exit(1)
})
