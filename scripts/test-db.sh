#!/usr/bin/env bash
# Aplica as migrations em um PostgreSQL local com stub do Supabase e executa
# os testes de RLS/integridade. Requer psql e um servidor PostgreSQL 15+.
# A migration de pgvector é aplicada somente se a extensão estiver instalada.
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${TEST_DB_NAME:-central_academica_test}"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)
if [ -n "${TEST_DB_URL:-}" ]; then ADMIN=(psql "$TEST_DB_URL" -v ON_ERROR_STOP=1 -q -X); else ADMIN=(su postgres -c); fi

run_admin() { if [ -n "${TEST_DB_URL:-}" ]; then psql "$TEST_DB_URL" -v ON_ERROR_STOP=1 -q -X -c "$1"; else su postgres -c "psql -v ON_ERROR_STOP=1 -q -X -c \"$1\""; fi; }
run_file() { if [ -n "${TEST_DB_URL:-}" ]; then psql "${TEST_DB_URL%/*}/$DB" -v ON_ERROR_STOP=1 -q -X -f "$1"; else su postgres -c "psql -d $DB -v ON_ERROR_STOP=1 -q -X -f '$1'"; fi; }

run_admin "drop database if exists $DB" >/dev/null
run_admin "create database $DB" >/dev/null
run_file tests/db/supabase-stub.sql
HAS_VECTOR=$(su postgres -c "psql -d $DB -tAX -c \"select count(*) from pg_available_extensions where name='vector'\"" 2>/dev/null || echo 0)
for f in supabase/migrations/*.sql; do
  if [[ "$f" == *pgvector* && "$HAS_VECTOR" != "1" ]]; then
    echo "⚠  pgvector indisponível localmente — pulando $f"
    continue
  fi
  echo "→ aplicando $f"
  run_file "$f"
done
echo "→ executando testes"
for t in tests/db/*.test.sql; do
  echo "  • $t"
  run_file "$t" > /dev/null
done
echo "✔ testes de banco concluídos"
