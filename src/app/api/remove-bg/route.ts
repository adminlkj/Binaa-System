import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs/promises'

/**
 * Remove background from currency symbol images.
 * Handles both light (white) and dark backgrounds.
 * Returns a transparent PNG data URL suitable for embedding in print templates.
 */
export async function POST(request: Request) {
  try {
    const { imageUrl } = await request.json()

    if (!imageUrl) {
      return NextResponse.json({ error: 'No imageUrl provided' }, { status: 400 })
    }

    // Resolve the local file path from the public URL
    const publicDir = path.join(process.cwd(), 'public')
    const filePath = path.join(publicDir, imageUrl.replace(/^\//, ''))

    // Security check - prevent path traversal
    const resolvedPath = path.resolve(filePath)
    if (!resolvedPath.startsWith(publicDir)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }

    // Check file exists
    try {
      await fs.access(resolvedPath)
    } catch {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const sharp = (await import('sharp')).default
    const buffer = await fs.readFile(resolvedPath)

    // Get image metadata to determine the dominant background color
    const metadata = await sharp(buffer).metadata()
    const { width = 0, height = 0 } = metadata

    // Sample corner pixels to determine background color
    const cornerSamples = await sharp(buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
      .then(({ data, info }) => {
        const channels = info.channels
        const corners = [
          // Top-left
          { x: 0, y: 0 },
          // Top-right
          { x: Math.min(5, info.width - 1), y: 0 },
          // Bottom-left
          { x: 0, y: Math.min(5, info.height - 1) },
          // Bottom-right
          { x: Math.min(5, info.width - 1), y: Math.min(5, info.height - 1) },
          // Center edges
          { x: Math.floor(info.width / 2), y: 0 },
          { x: Math.floor(info.width / 2), y: Math.min(5, info.height - 1) },
        ]
        return corners.map(c => {
          const idx = (c.y * info.width + c.x) * channels
          return { r: data[idx], g: data[idx + 1], b: data[idx + 2] }
        })
      })

    // Determine if background is light or dark based on corner samples
    const avgBrightness = cornerSamples.reduce((sum, c) => sum + (c.r + c.g + c.b) / 3, 0) / cornerSamples.length
    const isLightBackground = avgBrightness > 128

    // Process the image to remove background
    const processedBuffer = await sharp(buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
      .then(({ data, info }) => {
        const channels = info.channels

        if (isLightBackground) {
          // Light background: remove pixels close to white/light gray
          const threshold = 230
          const tolerance = 25 // color distance from the average background

          for (let i = 0; i < data.length; i += channels) {
            const r = data[i]
            const g = data[i + 1]
            const b = data[i + 2]

            // Check if pixel is close to white/light
            const isNearWhite = r > threshold && g > threshold && b > threshold
            // Check if pixel is close to the sampled background color
            const avgCorner = cornerSamples[0]
            const colorDist = Math.sqrt(
              (r - avgCorner.r) ** 2 +
              (g - avgCorner.g) ** 2 +
              (b - avgCorner.b) ** 2
            )
            const isNearBackground = colorDist < tolerance * 3

            if (isNearWhite || isNearBackground) {
              data[i + 3] = 0 // Make transparent
            } else {
              // For symbol pixels, ensure full opacity
              data[i + 3] = 255
            }
          }
        } else {
          // Dark background: remove dark pixels, keep lighter ones (symbol)
          const darkThreshold = 60
          const tolerance = 40

          for (let i = 0; i < data.length; i += channels) {
            const r = data[i]
            const g = data[i + 1]
            const b = data[i + 2]
            const brightness = (r + g + b) / 3

            // Check if pixel is close to the dark background
            const avgCorner = cornerSamples[0]
            const colorDist = Math.sqrt(
              (r - avgCorner.r) ** 2 +
              (g - avgCorner.g) ** 2 +
              (b - avgCorner.b) ** 2
            )

            if (brightness < darkThreshold || colorDist < tolerance) {
              data[i + 3] = 0 // Make transparent
            } else {
              // Convert dark-background symbols to dark color for visibility on white
              // If the symbol is light colored on a dark bg, darken it slightly
              if (brightness > 150) {
                // Symbol is lighter - keep as is but ensure full opacity
                data[i + 3] = 255
              } else {
                data[i + 3] = 200 // Slight transparency for mid-tones
              }
            }
          }
        }

        return sharp(data, {
          raw: {
            width: info.width,
            height: info.height,
            channels: 4,
          },
        })
          .png()
          .toBuffer()
      })

    // Trim transparent borders to get a tight symbol
    let trimmedBuffer: Buffer
    try {
      trimmedBuffer = await sharp(processedBuffer)
        .trim({ threshold: 10 })
        .png()
        .toBuffer()
    } catch {
      // Fallback if trim fails (e.g. older sharp versions)
      try {
        trimmedBuffer = await sharp(processedBuffer)
          // @ts-expect-error older sharp API
          .trim(10)
          .png()
          .toBuffer()
      } catch {
        trimmedBuffer = processedBuffer
      }
    }

    // Convert to base64 data URL
    const base64 = trimmedBuffer.toString('base64')
    const dataUrl = `data:image/png;base64,${base64}`

    return NextResponse.json({ dataUrl })
  } catch (error) {
    console.error('Remove background error:', error)
    return NextResponse.json({ error: 'Failed to process image' }, { status: 500 })
  }
}
