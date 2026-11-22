#!/usr/bin/env python3
"""
simular_push.py — Simulador en memoria de los escenarios de disparo para `enviar_push.py`.

No modifica `nivel_calamar.csv`, no modifica `assets/fews_calamar.json`,
no llama a Supabase ni envía notificaciones reales.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from enviar_push import (
    TZ_BOGOTA,
    Lectura,
    cargar_config,
    evaluar_disparo,
    parse_timestamp,
)


def _lectura(iso: str, nivel_cm: float) -> Lectura:
    parsed = parse_timestamp(iso)
    assert parsed is not None
    return Lectura(
        iso=parsed[0],
        dt_colombia=parsed[1],
        nivel_cm=nivel_cm,
        fuente="FEWS (simulado)",
    )


def imprimir_resultado(nombre: str, tipo: str | None, payload: dict | None) -> None:
    print(f"\n=== ESCENARIO: {nombre} ===")
    print(f"Disparo: {tipo or 'NINGUNO (bloqueado/anti-repetición)'}")
    if payload:
        notif = payload["notification"]
        print(f"Título : {notif['title']}")
        print(f"Cuerpo :\n  " + "\n  ".join(notif["body"].splitlines()))


def main() -> int:
    config = cargar_config()
    ahora = datetime(2026, 11, 22, 14, 0, 0, tzinfo=TZ_BOGOTA)

    # 1. Sube (+12 cm respecto a lectura anterior, por encima de umbral lectura 10 cm o lectura normal +6 cm)
    tipo, payload, st1 = evaluar_disparo(
        [_lectura("2026-11-22T06:00:00", 730.0), _lectura("2026-11-22T12:00:00", 736.0)],
        {"ultima_lectura_iso": "2026-11-22T06:00:00", "ultimo_estado_cota": "verde"},
        config,
        ahora,
    )
    assert tipo == "registro_nuevo" and payload is not None
    assert "▲ 7.36 m · subió 6 cm" in payload["notification"]["body"]
    imprimir_resultado("1a. Sube normal (▲)", tipo, payload)

    # 1b. Subida rápida (+35 cm en 24 h)
    tipo, payload, _ = evaluar_disparo(
        [_lectura("2026-11-21T12:00:00", 707.0), _lectura("2026-11-22T12:00:00", 742.0)],
        {"ultima_lectura_iso": "2026-11-22T06:00:00", "ultimo_estado_cota": "verde"},
        config,
        ahora,
    )
    assert tipo == "cambio_importante_24h" and payload is not None
    assert "▲ Subida rápida: 7.42 m (+35 cm en 24 h)" in payload["notification"]["body"]
    imprimir_resultado("1b. Subida rápida 24 h (▲)", tipo, payload)

    # 2. Baja (▼)
    tipo, payload, _ = evaluar_disparo(
        [_lectura("2026-11-22T06:00:00", 738.0), _lectura("2026-11-22T12:00:00", 730.0)],
        {"ultima_lectura_iso": "2026-11-22T06:00:00", "ultimo_estado_cota": "verde"},
        config,
        ahora,
    )
    assert tipo == "registro_nuevo" and payload is not None
    assert "▼ 7.30 m · bajó 8 cm" in payload["notification"]["body"]
    imprimir_resultado("2. Baja (▼)", tipo, payload)

    # 3. Sin cambio (▬)
    tipo, payload, _ = evaluar_disparo(
        [_lectura("2026-11-22T06:00:00", 738.0), _lectura("2026-11-22T12:00:00", 738.0)],
        {"ultima_lectura_iso": "2026-11-22T06:00:00", "ultimo_estado_cota": "verde"},
        config,
        ahora,
    )
    assert tipo == "registro_nuevo" and payload is not None
    assert "▬ 7.38 m · sin cambio" in payload["notification"]["body"]
    imprimir_resultado("3. Sin cambio (▬)", tipo, payload)

    # 4. Cruce de cota crítica oficial configurada (985 cm) con amarilla/naranja en null
    tipo, payload, st_cota = evaluar_disparo(
        [_lectura("2026-11-22T06:00:00", 980.0), _lectura("2026-11-22T12:00:00", 990.0)],
        {"ultima_lectura_iso": "2026-11-22T06:00:00", "ultimo_estado_cota": "verde"},
        config,
        ahora,
    )
    assert tipo == "cota_roja" and payload is not None
    assert "Alerta crítica: 9.90 m" in payload["notification"]["body"]
    imprimir_resultado("4a. Cruce cota crítica", tipo, payload)

    # Repetición en la misma lectura -> debe bloquear aviso duplicado
    tipo_dup, payload_dup, _ = evaluar_disparo(
        [_lectura("2026-11-22T06:00:00", 980.0), _lectura("2026-11-22T12:00:00", 990.0)],
        st_cota,
        config,
        ahora,
    )
    assert tipo_dup is None and payload_dup is None
    imprimir_resultado("4b. Anti-repetición misma lectura", tipo_dup, payload_dup)

    # 5. Sin datos nuevos durante > 24 h (una sola vez y no repite)
    hace_30h = ahora - timedelta(hours=30)
    iso_viejo = hace_30h.strftime("%Y-%m-%dT%H:%M:%S")
    tipo, payload, st_sin_datos = evaluar_disparo(
        [_lectura(iso_viejo, 650.0)],
        {"ultima_lectura_iso": iso_viejo, "ultimo_estado_cota": "verde", "aviso_sin_datos_enviado": False},
        config,
        ahora,
    )
    assert tipo == "sin_datos_24h" and payload is not None
    imprimir_resultado("5a. Sin datos nuevos > 24 h", tipo, payload)

    tipo2, payload2, _ = evaluar_disparo(
        [_lectura(iso_viejo, 650.0)],
        st_sin_datos,
        config,
        ahora + timedelta(hours=6),
    )
    assert tipo2 is None and payload2 is None
    imprimir_resultado("5b. Anti-repetición sin datos > 24 h", tipo2, payload2)

    print("\nTodos los escenarios simulados pasaron correctamente sin tocar archivos reales.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
