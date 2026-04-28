#!/usr/bin/env node
// Применяет миграцию 56-learning-platform.sql по statements через Supabase Management API.
// Cloudflare режет >25KB → отправляем statements один за другим.

import fs from 'node:fs'
import path from 'node:path'

const env = Object.fromEntries(
  fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()] })
)

const TOKEN = env.SUPABASE_MANAGEMENT_TOKEN
const REF = env.SUPABASE_PROJECT_REF

const sql = fs.readFileSync(path.join(process.cwd(), 'supabase', '56-learning-platform.sql'), 'utf8')

// Корректный сплиттер: учитывает -- комментарии, /* */ блоки, $$ блоки, '...' строки
function splitStatements(text) {
  const stmts = []
  let buf = ''
  let i = 0
  const len = text.length
  while (i < len) {
    const ch = text[i]
    const next2 = text.slice(i, i+2)

    // Однострочный комментарий --
    if (next2 === '--') {
      const eol = text.indexOf('\n', i)
      const end = eol === -1 ? len : eol
      buf += text.slice(i, end)
      i = end
      continue
    }
    // Блочный комментарий /* */
    if (next2 === '/*') {
      const close = text.indexOf('*/', i + 2)
      const end = close === -1 ? len : close + 2
      buf += text.slice(i, end)
      i = end
      continue
    }
    // $$ блоки
    if (next2 === '$$') {
      const close = text.indexOf('$$', i + 2)
      const end = close === -1 ? len : close + 2
      buf += text.slice(i, end)
      i = end
      continue
    }
    // Одинарные кавычки
    if (ch === "'") {
      let j = i + 1
      while (j < len) {
        if (text[j] === "'" && text[j+1] === "'") { j += 2; continue }
        if (text[j] === "'") { j++; break }
        j++
      }
      buf += text.slice(i, j)
      i = j
      continue
    }
    // Точка с запятой = разделитель
    if (ch === ';') {
      const trimmed = buf.trim()
      if (trimmed) stmts.push(trimmed + ';')
      buf = ''
      i++
      continue
    }
    buf += ch
    i++
  }
  if (buf.trim()) stmts.push(buf.trim())
  return stmts
}

const statements = splitStatements(sql)
console.log(`Total statements: ${statements.length}`)

async function runQuery(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  })
  return { status: r.status, body: await r.text() }
}

let ok = 0, err = 0
const failures = []
for (let idx = 0; idx < statements.length; idx++) {
  const stmt = statements[idx]
  // Чисто комментарии или пустые — пропускаем
  const stripped = stmt.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim()
  if (!stripped || stripped === ';') continue

  const res = await runQuery(stmt)
  if (res.status >= 200 && res.status < 300) {
    ok++
    process.stdout.write('.')
  } else {
    err++
    failures.push({ idx, stmt: stmt.slice(0, 300), status: res.status, body: res.body.slice(0, 600) })
    process.stdout.write('X')
  }
}

console.log(`\nOK: ${ok}, ERR: ${err}`)
if (failures.length) {
  for (const f of failures) {
    console.log('---', `[#${f.idx}]`, 'status', f.status)
    console.log('STMT:', f.stmt)
    console.log('ERR:', f.body)
  }
  process.exit(1)
}
