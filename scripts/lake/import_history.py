#!/usr/bin/env python3
"""Import AvecLake comanda_itens into client_services.last_done_at history."""
from __future__ import annotations

import os
import re
import time
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import boto3
import psycopg

SP = ZoneInfo("America/Sao_Paulo")
SALONS = {"brasil": 40613, "iguatemi": 99801}


def load_env():
    for path in ("/tmp/avec-lake/env", "/tmp/rom-dbs/env"):
        if not os.path.exists(path):
            continue
        for line in open(path):
            line = line.strip()
            if line.startswith("export "):
                line = line[7:]
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                os.environ[k] = v.strip().strip("'\"")


def athena():
    return boto3.client("athena", region_name=os.environ["AWS_DEFAULT_REGION"])


def run_athena(sql: str, timeout: int = 600) -> list[list[str | None]]:
    client = athena()
    q = client.start_query_execution(
        QueryString=sql,
        QueryExecutionContext={"Database": os.environ["ATHENA_DB"]},
        ResultConfiguration={"OutputLocation": os.environ["ATHENA_OUTPUT"]},
        WorkGroup=os.environ["ATHENA_WG"],
    )
    qid = q["QueryExecutionId"]
    for _ in range(timeout):
        st = client.get_query_execution(QueryExecutionId=qid)["QueryExecution"]["Status"]
        if st["State"] in ("SUCCEEDED", "FAILED", "CANCELLED"):
            if st["State"] != "SUCCEEDED":
                raise RuntimeError(st.get("StateChangeReason", st["State"]))
            break
        time.sleep(1)
    else:
        raise TimeoutError(sql[:120])

    rows: list[list[str | None]] = []
    token = None
    while True:
        kw: dict[str, Any] = {"QueryExecutionId": qid, "MaxResults": 1000}
        if token:
            kw["NextToken"] = token
        res = client.get_query_results(**kw)
        data = res["ResultSet"]["Rows"]
        start = 1 if not rows else 0
        if not rows:
            rows.append([c.get("VarCharValue") for c in data[0]["Data"]])
            start = 1
        for r in data[start:]:
            rows.append([c.get("VarCharValue") for c in r["Data"]])
        token = res.get("NextToken")
        if not token:
            break
    return rows


def as_dicts(raw: list[list[str | None]]) -> list[dict[str, str | None]]:
    if not raw:
        return []
    headers = [h or f"c{i}" for i, h in enumerate(raw[0])]
    return [
        {headers[i]: (r[i] if i < len(r) else None) for i in range(len(headers))}
        for r in raw[1:]
    ]


def norm_phone(raw: str | None) -> str | None:
    if not raw:
        return None
    digits = re.sub(r"\D", "", raw)
    if not digits:
        return None
    if digits.startswith("55") and len(digits) >= 12:
        return f"+{digits}"
    if len(digits) in (10, 11):
        return f"+55{digits}"
    return f"+{digits}"


def phone_key(raw: str | None) -> str | None:
    p = norm_phone(raw)
    if not p:
        return None
    d = re.sub(r"\D", "", p)
    return d[-11:] if len(d) >= 11 else d


def categorize(service: str | None) -> str:
    s = (service or "").upper()
    if re.search(r"COLOR|REFLEX|MECHA|LOURO|TINT", s):
        return "coloracao"
    if re.search(r"HIDRAT|BOTOX|CRONOGRAM|RECONSTR|TRATAM|PROGRESS", s):
        return "tratamento"
    if re.search(r"CORTE|ESCOVA|PENTEADO|ESCOV|BRUSHING|FINALIZ", s):
        return "corte"
    if re.search(r"MANIC|PEDIC|UNHA|ESMALT|SPA\s*DOS\s*PES|MAO|MÃO", s):
        return "bem_estar"
    if re.search(r"PRODUTO|VAREJO", s):
        return "produto"
    return "outro"


def cadence_days(category: str) -> int | None:
    return {
        "corte": 35,
        "coloracao": 45,
        "tratamento": 30,
        "bem_estar": 21,
        "produto": None,
        "outro": 45,
    }.get(category)


def parse_ts(raw: str | None) -> datetime | None:
    if not raw:
        return None
    raw = raw.strip().replace("T", " ")
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(raw[:26], fmt)
            return dt.replace(tzinfo=SP)
        except ValueError:
            continue
    return None


def fetch_history(salao_id: int, days_back: int = 180) -> list[dict[str, str | None]]:
    # Uma linha por cliente+serviço = última realização (suficiente para last_done_at)
    sql = f"""
    SELECT
      cast(c.salao_cliente_id as varchar) as salao_cliente_id,
      arbitrary(sc.nome) as cliente_nome,
      arbitrary(sc.telefone) as cliente_telefone,
      arbitrary(sc.celular) as cliente_celular,
      ci.item as servico,
      cast(max_by(ci.profissional_id, coalesce(ci.data_pago, c.data_finalizada, c.data)) as varchar) as profissional_id,
      max_by(p.nome, coalesce(ci.data_pago, c.data_finalizada, c.data)) as profissional_nome,
      cast(max_by(ci.valor, coalesce(ci.data_pago, c.data_finalizada, c.data)) as varchar) as valor,
      cast(max(coalesce(ci.data_pago, c.data_finalizada, c.data)) as varchar) as done_at,
      cast(count(*) as varchar) as vezes
    FROM avec_lake_db.comanda_itens ci
    JOIN avec_lake_db.comandas c
      ON c.id = ci.comanda_id AND c.salao_id = ci.salao_id
    LEFT JOIN avec_lake_db.salao_cliente sc
      ON sc.id = c.salao_cliente_id AND sc.salao_id = c.salao_id
    LEFT JOIN avec_lake_db.profissionais p
      ON p.id = ci.profissional_id AND p.salao_id = ci.salao_id
    WHERE ci.salao_id = {salao_id}
      AND date(coalesce(ci.data_pago, c.data_finalizada, c.data))
          BETWEEN current_date - interval '{days_back}' day AND current_date
      AND ci.item is not null AND length(trim(ci.item)) > 0
      AND upper(coalesce(c.status, '')) NOT IN ('CANCELADA', 'CANCELADO')
    GROUP BY c.salao_cliente_id, ci.item
    """
    return as_dicts(run_athena(sql))


def load_indexes(conn: psycopg.Connection) -> tuple[dict[str, str], dict[str, str]]:
    by_phone: dict[str, str] = {}
    by_avec: dict[str, str] = {}
    with conn.cursor() as cur:
        cur.execute(
            """
            select id::text, phone, avec_client_id
            from contacts
            where anonymized_at is null
            """
        )
        for cid, phone, avec_id in cur.fetchall():
            k = phone_key(phone)
            if k and k not in by_phone:
                by_phone[k] = cid
            if avec_id and str(avec_id) not in by_avec:
                by_avec[str(avec_id)] = cid
    return by_phone, by_avec


def resolve_contact(
    by_phone: dict[str, str],
    by_avec: dict[str, str],
    row: dict[str, str | None],
) -> str | None:
    avec = row.get("salao_cliente_id")
    if avec and avec in by_avec:
        return by_avec[avec]
    for raw in (row.get("cliente_celular"), row.get("cliente_telefone")):
        k = phone_key(raw)
        if k and k in by_phone:
            return by_phone[k]
    return None


def import_history(unit: str, database_url: str, days_back: int = 180) -> dict[str, Any]:
    salao_id = SALONS[unit]
    print(f"\n==== history {unit} salao={salao_id} days={days_back} ====")
    rows = fetch_history(salao_id, days_back)
    print(f"lake rows={len(rows)}")

    stats = {
        "unit": unit,
        "lake_rows": len(rows),
        "inserted": 0,
        "matched": 0,
        "unmatched": 0,
        "skipped": 0,
    }

    with psycopg.connect(database_url) as conn:
        by_phone, by_avec = load_indexes(conn)
        print(f"contacts phone={len(by_phone)} avec_id={len(by_avec)}")

        with conn.cursor() as cur:
            cur.execute("delete from client_services where notes like 'lake:comanda_item:%%'")
            deleted = cur.rowcount
        conn.commit()
        print(f"cleared previous lake history={deleted}")

        batch: list[tuple] = []
        for r in rows:
            done = parse_ts(r.get("done_at"))
            if not done:
                stats["skipped"] += 1
                continue
            cid = resolve_contact(by_phone, by_avec, r)
            if not cid:
                stats["unmatched"] += 1
                continue
            stats["matched"] += 1
            service = (r.get("servico") or "Serviço").strip()[:200]
            cat = categorize(service)
            pro = (r.get("profissional_nome") or "").strip() or None
            price = None
            try:
                if r.get("valor") is not None:
                    price = float(r["valor"])
            except ValueError:
                price = None
            note = f"lake:comanda_item:{r.get('salao_cliente_id')}:{service[:80]}"
            batch.append(
                (
                    cid,
                    service,
                    cat,
                    cadence_days(cat),
                    done,
                    pro,
                    price,
                    note,
                )
            )

        # chunk insert
        with conn.cursor() as cur:
            for i in range(0, len(batch), 1000):
                chunk = batch[i : i + 1000]
                cur.executemany(
                    """
                    insert into client_services (
                      contact_id, name, category, cadence_days,
                      last_done_at, professional_name, last_price, notes, active
                    ) values (%s,%s,%s,%s,%s,%s,%s,%s,true)
                    """,
                    chunk,
                )
                print(f"  inserted chunk {i}-{i+len(chunk)}")
        conn.commit()
        stats["inserted"] = len(batch)
        print(f"inserted history={len(batch)}")

    return stats


def main():
    load_env()
    only = os.environ.get("ONLY_UNIT")
    days = int(os.environ.get("DAYS_BACK", "180"))
    results = []
    mapping = [
        ("brasil", "DATABASE_URL_BRASIL"),
        ("iguatemi", "DATABASE_URL_IGUATEMI"),
        ("romsales", "DATABASE_URL_ROMSALES"),
    ]
    for unit_key, env_key in mapping:
        if only and only != unit_key:
            continue
        url = os.environ.get(env_key)
        if not url:
            continue
        lake_unit = "brasil" if unit_key == "romsales" else unit_key
        results.append(import_history(lake_unit, url, days_back=days))
    print("\nDONE")
    for r in results:
        print(r)


if __name__ == "__main__":
    main()
