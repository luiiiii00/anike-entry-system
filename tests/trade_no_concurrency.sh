#!/usr/bin/env bash
# Prueba de concurrencia real de la numeración de operaciones.
# Levanta un PostgreSQL temporal, aplica tests/trade_no_concurrency.sql
# (mismo mecanismo que producción) y lanza N inserciones concurrentes del
# MISMO usuario. Falla si aparece un número duplicado o un hueco.
set -euo pipefail

PGBIN="${PGBIN:-/tmp/pgtest/pg/bin}"
DATA="${DATA:-/tmp/pgtest/data}"
PORT="${PORT:-55432}"
CLIENTS="${CLIENTS:-25}"
USER_ID='11111111-1111-1111-1111-111111111111'
export PGHOST=/tmp/pgtest PGPORT="$PORT" PGDATABASE=postgres

if [ ! -d "$DATA" ]; then
  "$PGBIN/initdb" -D "$DATA" -U postgres >/dev/null
fi
"$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp/pgtest -h ''" -l /tmp/pgtest/pg.log start >/dev/null
trap '"$PGBIN/pg_ctl" -D "$DATA" stop -m fast >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 30); do "$PGBIN/pg_isready" -q && break; sleep 1; done

"$PGBIN/psql" -U postgres -v ON_ERROR_STOP=1 -q -c 'DROP SCHEMA IF EXISTS private CASCADE' \
  -c 'DROP TABLE IF EXISTS public.evaluations CASCADE'
"$PGBIN/psql" -U postgres -v ON_ERROR_STOP=1 -q -f "$(dirname "$0")/trade_no_concurrency.sql"

# N clientes concurrentes insertando para el mismo usuario.
for _ in $(seq 1 "$CLIENTS"); do
  "$PGBIN/psql" -U postgres -q -c \
    "INSERT INTO public.evaluations (user_id) VALUES ('$USER_ID')" &
done
wait

read -r rows distinct minno maxno < <("$PGBIN/psql" -U postgres -At -F' ' -c \
  "SELECT count(*), count(DISTINCT trade_no), min(trade_no), max(trade_no)
     FROM public.evaluations WHERE user_id = '$USER_ID'")

echo "filas=$rows numeros_distintos=$distinct min=$minno max=$maxno"
if [ "$rows" != "$CLIENTS" ] || [ "$distinct" != "$CLIENTS" ] || [ "$minno" != "1" ] || [ "$maxno" != "$CLIENTS" ]; then
  echo "FALLO: la numeración no fue atómica"
  exit 1
fi
echo "OK: $CLIENTS inserciones concurrentes -> $distinct números únicos y consecutivos (1..$maxno)"
