import { NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

const ALLOWED_TYPES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp']
const ALLOWED_EXTENSIONS = ['.svg', '.png', '.jpg', '.jpeg', '.webp']
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds 5MB limit' },
        { status: 400 }
      )
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext))) {
      return NextResponse.json(
        { error: 'File type not supported. Allowed: SVG, PNG, JPG, JPEG, WEBP' },
        { status: 400 }
      )
    }

    // Get file extension
    const originalName = file.name.toLowerCase()
    const ext = ALLOWED_EXTENSIONS.find(e => originalName.endsWith(e)) || '.png'

    // Generate unique filename
    const timestamp = Date.now()
    const safeName = originalName.replace(/[^a-z0-9._-]/g, '_').slice(0, 50)
    const fileName = `${timestamp}-${safeName}${ext}`

    // Ensure uploads directory exists
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    await mkdir(uploadsDir, { recursive: true })

    // Write file
    const filePath = path.join(uploadsDir, fileName)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(filePath, buffer)

    // Return relative URL path
    const url = `/uploads/${fileName}`

    return NextResponse.json({ url, fileName })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
