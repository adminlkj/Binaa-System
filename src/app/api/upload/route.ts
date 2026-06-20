import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs/promises'
import crypto from 'crypto'

/**
 * POST /api/upload
 *
 * Receives a multipart/form-data upload (field name: "file") and persists it
 * under /public/uploads with a unique timestamped file name. Returns the public
 * URL path so the client can store it in the database and render it via <img>.
 *
 * Supported types: image/svg+xml, image/png, image/jpeg, image/webp, image/gif
 * Max size: 5 MB
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'No file provided. Expected field name "file".' },
        { status: 400 },
      )
    }

    // Validate MIME type
    const allowedTypes = [
      'image/svg+xml',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/gif',
    ]
    const contentType = (file.type || '').toLowerCase()
    if (!allowedTypes.includes(contentType)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type || 'unknown'}. Allowed: SVG, PNG, JPG, WEBP, GIF.` },
        { status: 415 },
      )
    }

    // Validate file size (max 5MB)
    const MAX_SIZE = 5 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds 5MB (received ${(file.size / 1024 / 1024).toFixed(2)}MB).` },
        { status: 413 },
      )
    }

    // Ensure the uploads directory exists
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    await fs.mkdir(uploadsDir, { recursive: true })

    // Build a unique file name preserving the extension
    const ext = path.extname(file.name || '').toLowerCase() || defaultExt(contentType)
    const uniqueId = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`
    const fileName = `${uniqueId}${ext}`
    const filePath = path.join(uploadsDir, fileName)

    // Write the file to disk
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    await fs.writeFile(filePath, buffer)

    // Return the public URL (relative path so it works in all environments)
    const url = `/uploads/${fileName}`

    return NextResponse.json({
      url,
      fileName,
      size: file.size,
      type: contentType,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: 'Failed to upload file. Please try again.' },
      { status: 500 },
    )
  }
}

function defaultExt(contentType: string): string {
  switch (contentType) {
    case 'image/svg+xml':
      return '.svg'
    case 'image/png':
      return '.png'
    case 'image/jpeg':
    case 'image/jpg':
      return '.jpg'
    case 'image/webp':
      return '.webp'
    case 'image/gif':
      return '.gif'
    default:
      return '.bin'
  }
}

/**
 * GET /api/upload
 * Simple health-check / hint endpoint so a 405 doesn't confuse clients.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    method: 'POST',
    description: 'Upload endpoint for image files (SVG, PNG, JPG, WEBP, GIF). Max 5MB.',
  })
}
