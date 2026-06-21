import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs/promises'
import crypto from 'crypto'

/**
 * File upload endpoint.
 *
 * Accepts multipart/form-data with a `file` field, validates type and size,
 * writes the file to /public/uploads/<timestamp>-<random>.<ext>, and returns
 * `{ url: "/uploads/<filename>" }`.
 *
 * Used by the Settings screen for currency symbol image, company logo, stamp,
 * invoice header/footer images, etc.
 */

const ALLOWED_MIME_TYPES = new Set([
  'image/svg+xml',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
])

const ALLOWED_EXTENSIONS: Record<string, string> = {
  'image/svg+xml': 'svg',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'No file provided. Expected a "file" field in multipart/form-data.' },
        { status: 400 }
      )
    }

    // Validate MIME type
    const mimeType = file.type || ''
    let effectiveMime = mimeType
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      // Try to infer from filename extension as a fallback
      const ext = path.extname(file.name).toLowerCase().replace(/^\./, '')
      const inferredMime =
        ext === 'svg' ? 'image/svg+xml' :
        ext === 'png' ? 'image/png' :
        ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
        ext === 'webp' ? 'image/webp' :
        ext === 'gif' ? 'image/gif' : ''

      if (!inferredMime || !ALLOWED_MIME_TYPES.has(inferredMime)) {
        return NextResponse.json(
          { error: `Unsupported file type: ${mimeType || ext || 'unknown'}. Allowed: SVG, PNG, JPG, WEBP, GIF.` },
          { status: 400 }
        )
      }
      effectiveMime = inferredMime
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds the 5MB limit (received ${(file.size / 1024 / 1024).toFixed(2)}MB).` },
        { status: 400 }
      )
    }

    // Ensure the uploads directory exists
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    await fs.mkdir(uploadsDir, { recursive: true })

    // Build a unique filename
    const ext = ALLOWED_EXTENSIONS[effectiveMime] || path.extname(file.name).toLowerCase().replace(/^\./, '') || 'bin'
    const timestamp = Date.now()
    const random = crypto.randomBytes(6).toString('hex')
    const filename = `${timestamp}-${random}.${ext}`
    const filePath = path.join(uploadsDir, filename)

    // Write the file
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    await fs.writeFile(filePath, buffer)

    // Return the public URL
    const url = `/uploads/${filename}`
    return NextResponse.json({ url, filename, size: file.size, type: effectiveMime })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: 'Failed to upload file. Please try again.' },
      { status: 500 }
    )
  }
}

// Optional: GET endpoint to check if upload service is available
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/upload',
    methods: ['POST'],
    allowedTypes: Array.from(ALLOWED_MIME_TYPES),
    maxSize: `${MAX_FILE_SIZE / 1024 / 1024}MB`,
  })
}
