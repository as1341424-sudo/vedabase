import sys, sqlite3, re, os
sys.stdout.reconfigure(encoding='utf-8')

conn = sqlite3.connect(r'c:\Users\anura\OneDrive\Desktop\vedabase\data\folio.db')
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# Collect all unique tag patterns
print("=== ALL UNIQUE FOLIO TAG TYPES ===")
tag_re = re.compile(r'<([A-Z][A-Z0-9_]*(?::[^>]*)?(?:"[^"]*"[^>]*)?)>', re.IGNORECASE)

tag_commands = {}
cur.execute('SELECT plain FROM texts WHERE recid <= 5000')
for row in cur.fetchall():
    for m in tag_re.finditer(row[0] or ''):
        tag = m.group(1)
        cmd = tag.split(':')[0].split('+')[0].split('-')[0].upper()
        tag_commands[cmd] = tag_commands.get(cmd, 0) + 1

for cmd, cnt in sorted(tag_commands.items(), key=lambda x: -x[1]):
    print(f"  {cmd:15s} {cnt:8,}")

print("\n=== SAMPLE RECORDS (first 10) ===")
cur.execute("SELECT recid, plain, levelname, stylename FROM texts WHERE recid BETWEEN 1 AND 200 LIMIT 15")
for r in cur.fetchall():
    print(f"\nrecid={r['recid']} level={r['levelname']} style={r['stylename']}")
    print(f"  raw: {(r['plain'] or '')[:300]}")
