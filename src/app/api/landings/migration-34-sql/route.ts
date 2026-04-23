// Возвращает содержимое SQL-миграции 34-landing-blocks.sql — чтобы пользователь
// мог скопировать её из UI одной кнопкой, без доступа к файловой системе проекта.

import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const path = join(process.cwd(), 'supabase', '34-landing-blocks.sql')
    const sql = await readFile(path, 'utf-8')
    return new Response(sql, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (err) {
    return NextResponse.json({
      error: 'Не удалось прочитать файл миграции',
      hint: err instanceof Error ? err.message : String(err),
    }, { status: 500 })
  }
}
