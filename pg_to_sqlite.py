"""Migrate Render PostgreSQL -> local SQLite. One-shot script."""
import json
import re
import sqlite3
import sys
from datetime import date, datetime, time
from decimal import Decimal
from uuid import UUID

import psycopg2
import psycopg2.extras

PG_URL = "postgresql://album_pg_user:M8iW3Jr1PTYaVjiJbwi8DX20LDHfz9ff@dpg-d7umie9kh4rs73abjerg-a.oregon-postgres.render.com/album_pg?sslmode=require"
SQLITE_PATH = "album_pg.sqlite"

# Map PG type name (from information_schema.data_type / udt_name) to SQLite affinity.
def sqlite_type(data_type: str, udt: str) -> str:
    dt = data_type.lower()
    if dt in ("smallint", "integer", "bigint"):
        return "INTEGER"
    if dt in ("real", "double precision"):
        return "REAL"
    if dt == "numeric":
        return "NUMERIC"
    if dt == "boolean":
        return "INTEGER"  # 0/1
    if dt == "bytea":
        return "BLOB"
    # text, varchar, char, uuid, json, jsonb, timestamp, date, time, ARRAY, etc.
    return "TEXT"


def translate_default(default_sql):
    """Translate a PG column_default expression into a SQLite-compatible one.
    Returns None to mean 'no default' (skip)."""
    if default_sql is None:
        return None
    s = default_sql.strip()
    # Drop server-side identity functions we handle app-side.
    if "gen_random_uuid" in s or "nextval(" in s:
        return None
    # Strip ::type casts (e.g. 'pending'::status_type → 'pending').
    s = re.sub(r"::\s*[a-zA-Z_][\w]*(?:\s*\[\s*\])?", "", s)
    # PG now() → SQLite datetime('now'); wrap in parens so SQLite accepts it as an expression default.
    if re.fullmatch(r"now\(\s*\)", s):
        return "(datetime('now'))"
    if s in ("true", "TRUE"):
        return "1"
    if s in ("false", "FALSE"):
        return "0"
    # Otherwise keep as-is (literals like 'BASE', 0, ''::text after strip → '').
    return s


def adapt(value):
    if value is None:
        return None
    if isinstance(value, bool):
        return 1 if value else 0
    if isinstance(value, (int, float, str, bytes)):
        return value
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (list, dict, tuple)):
        return json.dumps(value, default=str)
    return str(value)


def main():
    pg = psycopg2.connect(PG_URL)
    pg.set_session(readonly=True)
    cur = pg.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Tables in public, in dependency order would be nicer but we drop FKs anyway.
    cur.execute(
        """
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
        """
    )
    tables = [r["table_name"] for r in cur.fetchall()]
    print(f"Found {len(tables)} tables")

    lite = sqlite3.connect(SQLITE_PATH)
    lite.execute("PRAGMA foreign_keys = OFF")
    # Turso requires WAL mode for uploads. WAL is also fine for bulk loading.
    lite.execute("PRAGMA journal_mode = WAL")
    lite.execute("PRAGMA synchronous = OFF")

    total_rows = 0
    summary = []

    for table in tables:
        cur.execute(
            """
            SELECT column_name, data_type, udt_name, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = %s
            ORDER BY ordinal_position
            """,
            (table,),
        )
        cols = cur.fetchall()
        col_defs = []
        col_names = []
        for c in cols:
            name = c["column_name"]
            col_names.append(name)
            t = sqlite_type(c["data_type"], c["udt_name"])
            default_sql = translate_default(c["column_default"])
            piece = f'"{name}" {t}'
            if default_sql:
                piece += f" DEFAULT {default_sql}"
            if c["is_nullable"] == "NO" and default_sql is None:
                piece += " NOT NULL"
            col_defs.append(piece)

        # Primary key
        cur.execute(
            """
            SELECT a.attname
            FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = %s::regclass AND i.indisprimary
            ORDER BY array_position(i.indkey, a.attnum)
            """,
            (f'public."{table}"',),
        )
        pk_cols = [r["attname"] for r in cur.fetchall()]
        pk_clause = ""
        if pk_cols:
            pk_list = ", ".join(f'"{c}"' for c in pk_cols)
            pk_clause = f", PRIMARY KEY ({pk_list})"

        ddl = f'CREATE TABLE IF NOT EXISTS "{table}" ({", ".join(col_defs)}{pk_clause})'
        lite.execute(f'DROP TABLE IF EXISTS "{table}"')
        lite.execute(ddl)

        # Copy rows
        col_list = ", ".join(f'"{c}"' for c in col_names)
        placeholders = ", ".join("?" * len(col_names))
        insert_sql = f'INSERT INTO "{table}" ({col_list}) VALUES ({placeholders})'

        copy_cur = pg.cursor(name=f"copy_{table}")  # server-side cursor
        copy_cur.itersize = 1000
        copy_cur.execute(f'SELECT {col_list} FROM public."{table}"')
        n = 0
        batch = []
        for row in copy_cur:
            batch.append(tuple(adapt(v) for v in row))
            if len(batch) >= 1000:
                lite.executemany(insert_sql, batch)
                n += len(batch)
                batch.clear()
        if batch:
            lite.executemany(insert_sql, batch)
            n += len(batch)
        copy_cur.close()
        lite.commit()
        summary.append((table, n))
        total_rows += n
        print(f"  {table}: {n} rows")

    # Replay non-PK indexes (best-effort port; skip PG-only types/options).
    cur.execute(
        """
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
        ORDER BY tablename, indexname
        """
    )
    idx_ok = 0
    idx_skip = 0
    for row in cur.fetchall():
        name = row["indexname"]
        ddl = row["indexdef"]
        if name.endswith("_pkey"):
            continue  # PKs are part of CREATE TABLE
        low = ddl.lower()
        if any(t in low for t in (" using gin", " using gist", " using hash", " using brin", " using spgist", " include (")):
            idx_skip += 1
            print(f"  skip {name}: PG-only index option")
            continue
        # Rewrite for SQLite:
        ddl_sqlite = ddl.replace(" USING btree", "").replace(" USING BTREE", "")
        ddl_sqlite = ddl_sqlite.replace("public.", "")
        # Strip PG `::type` and `::type[]` casts (partial-index WHERE clauses).
        ddl_sqlite = re.sub(r"::\s*[a-zA-Z_][\w]*(\s*\[\s*\])?", "", ddl_sqlite)
        try:
            lite.execute(ddl_sqlite)
            idx_ok += 1
        except sqlite3.Error as e:
            idx_skip += 1
            print(f"  skip {name}: {e}")
    lite.commit()
    print(f"Indexes: {idx_ok} created, {idx_skip} skipped")

    lite.close()
    pg.close()
    print(f"\nTotal: {total_rows} rows across {len(tables)} tables -> {SQLITE_PATH}")
    return summary


if __name__ == "__main__":
    main()
