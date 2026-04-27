#!/usr/bin/env python3
"""
Восстановление БД из бэкапа, сделанного backup-db.py.

Usage:
    python3 scripts/restore-backup.py .backups/2026-04-27-2025-pre-rls-rewrite

ВНИМАНИЕ: скрипт ОЧИЩАЕТ существующие таблицы перед восстановлением (TRUNCATE CASCADE).
Используй только если ты уверен что хочешь откатить состояние БД к моменту бэкапа.

Что делает:
1. Отключает все триггеры и RLS на время восстановления (через SET session_replication_role)
2. Для каждой таблицы из манифеста:
   - TRUNCATE table CASCADE
   - INSERT всех строк из соответствующего JSON файла
3. Включает триггеры обратно

Что НЕ делает:
- Не восстанавливает schema (структура таблиц должна быть совместимой)
- Не восстанавливает auth.users (только public.* таблицы)
- Не восстанавливает storage buckets (файлы Supabase Storage)
"""
import json, os, sys, urllib.request, urllib.error
from pathlib import Path

if len(sys.argv) < 2:
    print("Usage: restore-backup.py <backup_dir>", file=sys.stderr)
    sys.exit(1)

backup_dir = Path(sys.argv[1])
if not backup_dir.is_dir():
    print(f"Backup dir not found: {backup_dir}", file=sys.stderr)
    sys.exit(1)

# Загружаем env vars из .env.local
env_file = Path(__file__).parent.parent / '.env.local'
if env_file.exists():
    for line in env_file.read_text().splitlines():
        if line.startswith('#') or '=' not in line:
            continue
        k, _, v = line.partition('=')
        os.environ.setdefault(k.strip(), v.strip())

PROJECT_REF = os.environ['SUPABASE_PROJECT_REF']
TOKEN = os.environ['SUPABASE_MANAGEMENT_TOKEN']
URL = f'https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query'


def query(sql):
    req = urllib.request.Request(
        URL, method='POST',
        headers={
            'Authorization': f'Bearer {TOKEN}',
            'Content-Type': 'application/json',
            'User-Agent': 'studency-claude/1.0',
        },
        data=json.dumps({'query': sql}).encode(),
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        msg = e.read().decode()[:500]
        print(f'  HTTP {e.code}: {msg}', file=sys.stderr)
        return None


def sql_value(v):
    if v is None:
        return 'NULL'
    if isinstance(v, bool):
        return 'TRUE' if v else 'FALSE'
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (dict, list)):
        return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    s = str(v).replace("'", "''")
    return f"'{s}'"


manifest = json.loads((backup_dir / 'manifest.json').read_text())
print(f"Restoring backup from {manifest['created_at']}")
print(f"Total tables: {manifest['total_tables']}, total rows: {manifest['total_rows']}")
confirm = input("Тип 'yes' чтобы продолжить (БД будет очищена и заполнена из бэкапа): ")
if confirm.strip() != 'yes':
    print("Cancelled.")
    sys.exit(0)

# Отключаем session_replication_role чтобы FK/триггеры не мешали
print("\n[1/3] Disabling triggers...")
query("SET session_replication_role = 'replica';")

# Восстанавливаем таблицы в порядке как в манифесте
print("\n[2/3] Restoring data...")
restored = 0
for entry in manifest['tables']:
    t = entry['table']
    if entry['rows'] in (0, 'ERROR') or not entry['file']:
        continue
    fpath = backup_dir / entry['file']
    if not fpath.exists():
        print(f"  {t}: file missing, skip")
        continue
    rows = json.loads(fpath.read_text())
    if not rows:
        continue

    # TRUNCATE
    res = query(f'TRUNCATE TABLE "{t}" CASCADE;')
    if res is None:
        print(f"  {t}: TRUNCATE failed, skip")
        continue

    # INSERT batched
    cols = list(rows[0].keys())
    cols_sql = ', '.join(f'"{c}"' for c in cols)
    BATCH = 100
    inserted = 0
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i+BATCH]
        values_sql = ',\n  '.join(
            '(' + ', '.join(sql_value(r.get(c)) for c in cols) + ')'
            for r in batch
        )
        sql = f'INSERT INTO "{t}" ({cols_sql}) VALUES\n  {values_sql};'
        res = query(sql)
        if res is None:
            print(f"  {t}: INSERT batch at row {i} failed", file=sys.stderr)
            break
        inserted += len(batch)
    print(f"  {t}: {inserted}/{len(rows)} rows restored")
    restored += inserted

# Включаем триггеры обратно
print("\n[3/3] Re-enabling triggers...")
query("SET session_replication_role = 'origin';")

print(f"\nDONE. Restored {restored} rows.")
