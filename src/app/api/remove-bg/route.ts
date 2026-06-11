import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs/promises'

// This endpoint removes the background from a currency symbol image
// and returns the processed image as a transparent PNG data URL
export async function POST(request: Request) {
  try {
    const { imageUrl } = await request.json()

    if (!imageUrl) {
      return NextResponse.json({ error: 'No imageUrl provided' }, { status: 400 })
    }

    // Resolve the local file path from the public URL
    // imageUrl is like /uploads/filename.png
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

    // Use sharp to remove background and make it transparent
    const sharp = (await import('sharp')).default
    const buffer = await fs.readFile(resolvedPath)

    // Process the image:
    // 1. Remove alpha channel and flatten to white background
    // 2. Re-add alpha channel
    // 3. Treat near-white pixels as transparent
    const processedBuffer = await sharp(buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
      .then(({ data, info }) => {
        const channels = info.channels
        const threshold = 240 // Pixels with R,G,B all above this are considered "background"

        for (let i = 0; i < data.length; i += channels) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          // If the pixel is close to white/light background, make it transparent
          if (r > threshold && g > threshold && b > threshold) {
            data[i + 3] = 0 // Set alpha to 0 (transparent)
          }
          // For colored pixels on dark background, also handle
          if (channels === 4) {
            const a = data[i + 3]
            // If nearly opaque and very dark, keep it (text/symbol)
            // If nearly opaque and light, remove it (background)
          }
        }

        return sharp(data, {
          raw: {
            width: info.width,
            height: info.height,
            channels: 4, // Always output RGBA
          },
        })
          .png()
          .toBuffer()
      })

    // Convert to base64 data URL
    const base64 = processedBuffer.toString('base64')
    const dataUrl = `data:image/png;base64,${base64}`

    return NextResponse.json({ dataUrl })
  } catch (error) {
    console.error('Remove background error:', error)
    return NextResponse.json({ error: 'Failed to process image' }, { status: 500 })
  }
}
