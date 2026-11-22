#!/usr/bin/env python3
"""
enviar_push.py — Robot sin servidor de avisos Web Push para JUAN (Calamar [29037020]).

Lee `nivel_calamar.csv`, `assets/fews_calamar.json` y `config_alertas.json`.
Calcula flecha (▲ ▼ ▬) y variación, actualiza `resumenLectura` en `assets/fews_calamar.json`
para que interfaz y aviso compartan el mismo cálculo, evalúa reglas de disparo y
envía Web Push (VAPID) a las suscripciones activas almacenadas en Supabase.

Variables de entorno requeridas (vía GitHub Secrets en Actions):
  SUPABASE_URL         URL del proyecto Supabase (ej. https://xxx.supabase.co)
  SUPABASE_SECRET_KEY  Clave secreta de Supabase (sb_secret_...)
  VAPID_PRIVATE_KEY    Clave privada VAPID (PEM o base64url cruda)
  VAPID_SUBJECT        Contacto VAPID (ej. mailto:contacto@tudominio.org)

Opciones CLI:
  --prueba             Envía un aviso de ejemplo sin modificar CSV/JSON ni estado.
  --solo-yo            Envía únicamente a una suscripción (PUSH_TEST_ENDPOINT o la más reciente).
  --solo-yo-id TEXT    Subcadena o UUID de endpoint concreto para --solo-yo.
"""
from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote
from zoneinfo import ZoneInfo

try:
    import requests
except ImportError:  # pragma: no cover - opcional para simulación pura
    requests = None  # type: ignore[assignment]

try:
    from pywebpush import WebPushException, webpush
except ImportError:  # pragma: no cover - opcional para simulación pura
    WebPushException = Exception  # type: ignore[assignment,misc]
    webpush = None  # type: ignore[assignment]

ROOT_DIR = Path(__file__).resolve().parent
CSV_PATH = ROOT_DIR / "nivel_calamar.csv"
FEWS_JSON_PATH = ROOT_DIR / "assets" / "fews_calamar.json"
DOCS_FEWS_JSON_PATH = ROOT_DIR / "docs" / "assets" / "fews_calamar.json"
CONFIG_PATH = ROOT_DIR / "config_alertas.json"
ESTADO_ID = "calamar_29037020"
TZ_BOGOTA = ZoneInfo("America/Bogota")

MESES_ES = (
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
)

SEVERIDAD_COTA = {
    "sin_umbral": 0,
    "verde": 0,
    "amarilla": 1,
    "naranja": 2,
    "roja": 3,
}

log = logging.getLogger("enviar_push")


@dataclass(frozen=True)
class Lectura:
    iso: str
    dt_colombia: datetime
    nivel_cm: float
    fuente: str


def cargar_config(path: Path = CONFIG_PATH) -> dict[str, Any]:
    if not path.exists():
        return {
            "notificaciones": {
                "variacion_significativa_lectura_cm": 10,
                "variacion_significativa_24h_cm": 20,
                "horas_sin_datos_aviso": 24,
                "tolerancia_sin_cambio_cm": 0.05,
            },
            "cotas": {
                "amarilla": {"valor_cm": None},
                "naranja": {"valor_cm": None},
                "roja": {"valor_cm": 985},
            },
        }
    return json.loads(path.read_text(encoding="utf-8"))


def parse_timestamp(raw: str | None) -> tuple[str, datetime] | None:
    if not raw:
        return None
    s = str(raw).strip()
    if not s:
        return None

    m = re.match(
        r"^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?",
        s,
    )
    has_time = False
    if m:
        year, month, day = int(m[1]), int(m[2]), int(m[3])
        if m[4] is not None and m[5] is not None:
            hour, minute = int(m[4]), int(m[5])
            second = int(m[6]) if m[6] else 0
            has_time = True
        else:
            hour = minute = second = 0
    else:
        m2 = re.match(
            r"^(\d{1,2})/(\d{1,2})/(\d{4})(?:[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?",
            s,
        )
        if not m2:
            return None
        day, month, year = int(m2[1]), int(m2[2]), int(m2[3])
        if m2[4] is not None and m2[5] is not None:
            hour, minute = int(m2[4]), int(m2[5])
            second = int(m2[6]) if m2[6] else 0
            has_time = True
        else:
            hour = minute = second = 0

    try:
        dt = datetime(year, month, day, hour, minute, second, tzinfo=TZ_BOGOTA)
    except ValueError:
        return None

    date_part = f"{year:04d}-{month:02d}-{day:02d}"
    iso = f"{date_part}T{hour:02d}:{minute:02d}:{second:02d}" if has_time else date_part
    return iso, dt


def clean_nivel(raw: Any) -> float | None:
    try:
        val = float(str(raw).strip().replace(",", "."))
    except (TypeError, ValueError):
        return None
    if not (-1e9 < val < 1e9):
        return None
    if 2000 < abs(val) <= 200_000:
        val /= 100.0
    if val < 0 or val > 2000:
        return None
    return round(val, 2)


def cargar_lecturas(
    csv_path: Path = CSV_PATH,
    fews_json_path: Path = FEWS_JSON_PATH,
) -> list[Lectura]:
    por_iso: dict[str, Lectura] = {}

    if csv_path.exists():
        with csv_path.open("r", encoding="utf-8-sig", newline="") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                ts = parse_timestamp(row.get("Fecha"))
                nivel = clean_nivel(row.get("Nivel_cm"))
                if not ts or nivel is None:
                    continue
                iso, dt = ts
                por_iso[iso] = Lectura(
                    iso=iso,
                    dt_colombia=dt,
                    nivel_cm=nivel,
                    fuente="Histórico IDEAM",
                )

    if fews_json_path.exists():
        try:
            payload = json.loads(fews_json_path.read_text(encoding="utf-8"))
            for rec in payload.get("records", []):
                ts = parse_timestamp(rec.get("f"))
                nivel = clean_nivel(rec.get("n"))
                if not ts or nivel is None:
                    continue
                iso, dt = ts
                por_iso[iso] = Lectura(
                    iso=iso,
                    dt_colombia=dt,
                    nivel_cm=nivel,
                    fuente="FEWS",
                )
        except (OSError, json.JSONDecodeError) as exc:
            log.warning("No se pudo leer %s: %s", fews_json_path.name, exc)

    return sorted(por_iso.values(), key=lambda x: (x.dt_colombia, x.iso))


def fmt_cm(val: float) -> str:
    return f"{abs(val):.1f}".removesuffix(".0")


def fmt_fecha_colombia(dt: datetime, has_time: bool = True) -> str:
    mes = MESES_ES[dt.month - 1]
    if has_time:
        return f"{dt.day} {mes} {dt.hour:02d}:{dt.minute:02d}"
    return f"{dt.day} {mes} {dt.year}"


def calcular_resumen_lectura(
    lecturas: list[Lectura], config: dict[str, Any]
) -> dict[str, Any] | None:
    if not lecturas:
        return None

    tol = float(
        config.get("notificaciones", {}).get("tolerancia_sin_cambio_cm", 0.05)
    )
    ultimo = lecturas[-1]
    previo = lecturas[-2] if len(lecturas) >= 2 else None
    delta_cm = (
        round(ultimo.nivel_cm - previo.nivel_cm, 1) if previo is not None else 0.0
    )

    if delta_cm > tol:
        flecha = "▲"
        tendencia = "sube"
    elif delta_cm < -tol:
        flecha = "▼"
        tendencia = "baja"
    else:
        flecha = "▬"
        tendencia = "sin_cambio"

    # Buscar referencia ~24h atrás dentro de [18h, 36h]
    var_24h_cm: float | None = None
    objetivo = ultimo.dt_colombia - timedelta(hours=24)
    mejor: Lectura | None = None
    mejor_diff_s = float("inf")
    for cand in reversed(lecturas[:-1]):
        horas = (ultimo.dt_colombia - cand.dt_colombia).total_seconds() / 3600.0
        if horas < 18.0:
            continue
        if horas > 36.0:
            break
        diff = abs((cand.dt_colombia - objetivo).total_seconds())
        if diff < mejor_diff_s:
            mejor_diff_s = diff
            mejor = cand
    if mejor is not None:
        var_24h_cm = round(ultimo.nivel_cm - mejor.nivel_cm, 1)

    nivel_m = round(ultimo.nivel_cm / 100.0, 2)
    if flecha == "▬":
        cambio_texto = "Sin cambio"
    elif flecha == "▲":
        cambio_texto = f"Subió {fmt_cm(delta_cm)} cm vs. lectura anterior"
    else:
        cambio_texto = f"Bajó {fmt_cm(delta_cm)} cm vs. lectura anterior"

    return {
        "fechaHora": ultimo.iso,
        "nivelCm": ultimo.nivel_cm,
        "nivelMetros": nivel_m,
        "nivelPrevioCm": previo.nivel_cm if previo else None,
        "deltaCm": delta_cm,
        "variacion24hCm": var_24h_cm,
        "flecha": flecha,
        "tendencia": tendencia,
        "cambioTexto": cambio_texto,
        "calculadoPor": "enviar_push.py",
        "calculadoEn": datetime.now(timezone.utc).isoformat(),
    }


def evaluar_cota(nivel_cm: float, config: dict[str, Any]) -> str:
    cotas = config.get("cotas", {})
    roja = cotas.get("roja", {}).get("valor_cm")
    naranja = cotas.get("naranja", {}).get("valor_cm")
    amarilla = cotas.get("amarilla", {}).get("valor_cm")

    if roja is not None and nivel_cm >= float(roja):
        return "roja"
    if naranja is not None and nivel_cm >= float(naranja):
        return "naranja"
    if amarilla is not None and nivel_cm >= float(amarilla):
        return "amarilla"
    if any(x is not None for x in (roja, naranja, amarilla)):
        return "verde"
    return "sin_umbral"


def construir_payload_notificacion(linea_principal: str, fecha_texto: str) -> dict[str, Any]:
    cuerpo = (
        f"{linea_principal}\n"
        f"Lectura Colombia: {fecha_texto} · dato preliminar IDEAM/FEWS\n"
        "No reemplaza comunicados de UNGRD, IDEAM ni CMGRD."
    )
    return {
        "notification": {
            "title": "Río Magdalena · Calamar",
            "body": cuerpo,
            "icon": "static/juan_icon_192.png",
            "badge": "static/juan_icon_192.png",
            "tag": "juan-nivel-calamar",
            "renotify": True,
            "lang": "es",
            "data": {
                "url": "./",
                "onActionClick": {
                    "default": {
                        "operation": "focusLastFocusedOrOpen",
                        "url": "./",
                    }
                },
            },
        }
    }


def evaluar_disparo(
    lecturas: list[Lectura],
    estado: dict[str, Any],
    config: dict[str, Any],
    ahora_colombia: datetime,
) -> tuple[str | None, dict[str, Any] | None, dict[str, Any]]:
    """
    Evalúa si corresponde enviar push según las reglas del observatorio:
      1. Sin datos nuevos por > 24 h (una sola vez hasta que vuelva a haber lectura).
      2. Cruce hacia arriba de cota oficial configurada (amarilla/naranja/roja si != None).
      3. Cambio importante frente a lectura anterior o en 24 h (> X cm en config).
      4. Lectura nueva posterior a la última avisada.
    Devuelve (tipo_aviso | None, payload | None, nuevo_estado_dict).
    """
    resumen = calcular_resumen_lectura(lecturas, config)
    if resumen is None or not lecturas:
        return None, None, dict(estado)

    ultimo = lecturas[-1]
    notif_cfg = config.get("notificaciones", {})
    umbral_lectura = float(notif_cfg.get("variacion_significativa_lectura_cm", 10))
    umbral_24h = float(notif_cfg.get("variacion_significativa_24h_cm", 20))
    horas_sin_datos = float(notif_cfg.get("horas_sin_datos_aviso", 24))

    estado_cota_actual = evaluar_cota(ultimo.nivel_cm, config)
    estado_cota_prev = str(estado.get("ultimo_estado_cota") or "verde")
    ultima_iso_avisada = estado.get("ultima_lectura_iso")
    aviso_sin_datos_enviado = bool(estado.get("aviso_sin_datos_enviado", False))

    has_time = "T" in ultimo.iso
    fecha_txt = fmt_fecha_colombia(ultimo.dt_colombia, has_time=has_time)
    nivel_m_str = f"{resumen['nivelMetros']:.2f}"
    flecha = resumen["flecha"]
    delta_cm = float(resumen["deltaCm"])
    var_24h = resumen["variacion24hCm"]

    nuevo_estado = {
        "id": ESTADO_ID,
        "ultima_lectura_iso": ultima_iso_avisada,
        "ultimo_nivel_cm": ultimo.nivel_cm,
        "ultimo_estado_cota": estado_cota_actual,
        "ultimo_aviso_tipo": estado.get("ultimo_aviso_tipo"),
        "ultimo_aviso_en": estado.get("ultimo_aviso_en"),
        "aviso_sin_datos_enviado": aviso_sin_datos_enviado,
        "aviso_sin_datos_en": estado.get("aviso_sin_datos_en"),
        "actualizado_en": datetime.now(timezone.utc).isoformat(),
    }

    # Regla 4: más de 24h sin lectura nueva (si es lectura diaria sin hora, contar desde fin de día)
    ref_dt = ultimo.dt_colombia if has_time else ultimo.dt_colombia.replace(hour=23, minute=59)
    horas_retraso = (ahora_colombia - ref_dt).total_seconds() / 3600.0
    es_lectura_nueva = ultima_iso_avisada is None or ultimo.iso > str(ultima_iso_avisada)

    if not es_lectura_nueva and horas_retraso > horas_sin_datos:
        if aviso_sin_datos_enviado:
            return None, None, nuevo_estado
        linea = f"▬ Sin datos nuevos (>24 h) · última lectura: {nivel_m_str} m"
        nuevo_estado["ultimo_aviso_tipo"] = "sin_datos_24h"
        nuevo_estado["ultimo_aviso_en"] = datetime.now(timezone.utc).isoformat()
        nuevo_estado["aviso_sin_datos_enviado"] = True
        nuevo_estado["aviso_sin_datos_en"] = datetime.now(timezone.utc).isoformat()
        return "sin_datos_24h", construir_payload_notificacion(linea, fecha_txt), nuevo_estado

    # Si llegó lectura nueva o cambió a cota superior, reiniciar bandera de sin_datos
    if es_lectura_nueva:
        nuevo_estado["aviso_sin_datos_enviado"] = False

    # Regla 3: cruce de una cota oficial configurada hacia nivel mayor
    sube_cota = SEVERIDAD_COTA.get(estado_cota_actual, 0) > SEVERIDAD_COTA.get(
        estado_cota_prev, 0
    )
    if sube_cota and estado_cota_actual in ("roja", "naranja", "amarilla"):
        etiqueta = {
            "roja": "Alerta crítica",
            "naranja": "Alerta naranja",
            "amarilla": "Alerta amarilla",
        }[estado_cota_actual]
        linea = f"{flecha} {etiqueta}: {nivel_m_str} m"
        nuevo_estado["ultima_lectura_iso"] = ultimo.iso
        nuevo_estado["ultimo_aviso_tipo"] = f"cota_{estado_cota_actual}"
        nuevo_estado["ultimo_aviso_en"] = datetime.now(timezone.utc).isoformat()
        return (
            f"cota_{estado_cota_actual}",
            construir_payload_notificacion(linea, fecha_txt),
            nuevo_estado,
        )

    if not es_lectura_nueva:
        return None, None, nuevo_estado

    # Regla 2: cambio importante (en 24h o frente a lectura anterior)
    if var_24h is not None and abs(var_24h) >= umbral_24h:
        accion = "Subida rápida" if var_24h > 0 else "Bajada rápida"
        signo = "+" if var_24h > 0 else "-"
        linea = f"{flecha} {accion}: {nivel_m_str} m ({signo}{fmt_cm(var_24h)} cm en 24 h)"
        nuevo_estado["ultima_lectura_iso"] = ultimo.iso
        nuevo_estado["ultimo_aviso_tipo"] = "cambio_importante_24h"
        nuevo_estado["ultimo_aviso_en"] = datetime.now(timezone.utc).isoformat()
        return (
            "cambio_importante_24h",
            construir_payload_notificacion(linea, fecha_txt),
            nuevo_estado,
        )

    if abs(delta_cm) >= umbral_lectura:
        accion = "Subida rápida" if delta_cm > 0 else "Bajada rápida"
        signo = "+" if delta_cm > 0 else "-"
        linea = f"{flecha} {accion}: {nivel_m_str} m ({signo}{fmt_cm(delta_cm)} cm)"
        nuevo_estado["ultima_lectura_iso"] = ultimo.iso
        nuevo_estado["ultimo_aviso_tipo"] = "cambio_importante_lectura"
        nuevo_estado["ultimo_aviso_en"] = datetime.now(timezone.utc).isoformat()
        return (
            "cambio_importante_lectura",
            construir_payload_notificacion(linea, fecha_txt),
            nuevo_estado,
        )

    # Regla 1: registro nuevo estándar con flecha y variación
    if flecha == "▲":
        linea = f"▲ {nivel_m_str} m · subió {fmt_cm(delta_cm)} cm"
    elif flecha == "▼":
        linea = f"▼ {nivel_m_str} m · bajó {fmt_cm(delta_cm)} cm"
    else:
        linea = f"▬ {nivel_m_str} m · sin cambio"

    nuevo_estado["ultima_lectura_iso"] = ultimo.iso
    nuevo_estado["ultimo_aviso_tipo"] = "registro_nuevo"
    nuevo_estado["ultimo_aviso_en"] = datetime.now(timezone.utc).isoformat()
    return "registro_nuevo", construir_payload_notificacion(linea, fecha_txt), nuevo_estado


def escribir_resumen_en_fews_json(resumen: dict[str, Any]) -> None:
    if not FEWS_JSON_PATH.exists():
        return
    try:
        data = json.loads(FEWS_JSON_PATH.read_text(encoding="utf-8"))
        if data.get("resumenLectura") == resumen:
            return
        data["resumenLectura"] = resumen
        serializado = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
        FEWS_JSON_PATH.write_text(serializado, encoding="utf-8")
        if DOCS_FEWS_JSON_PATH.parent.exists():
            DOCS_FEWS_JSON_PATH.write_text(serializado, encoding="utf-8")
    except (OSError, json.JSONDecodeError) as exc:
        log.warning("No se pudo actualizar resumenLectura en fews_calamar.json: %s", exc)


class SupabaseAdminClient:
    def __init__(self, url: str, secret_key: str) -> None:
        if requests is None:
            raise RuntimeError("Falta el paquete 'requests'. Ejecuta: pip install -r requirements.txt")
        self.base_url = url.rstrip("/")
        self.headers = {
            "apikey": secret_key,
            "Content-Type": "application/json",
        }

    def obtener_estado(self) -> dict[str, Any]:
        r = requests.get(
            f"{self.base_url}/rest/v1/push_estado",
            params={"id": f"eq.{ESTADO_ID}", "select": "*"},
            headers=self.headers,
            timeout=15,
        )
        r.raise_for_status()
        filas = r.json()
        return filas[0] if filas else {"id": ESTADO_ID, "ultimo_estado_cota": "verde"}

    def guardar_estado(self, estado: dict[str, Any]) -> None:
        r = requests.post(
            f"{self.base_url}/rest/v1/push_estado",
            headers={**self.headers, "Prefer": "resolution=merge-duplicates"},
            json=estado,
            timeout=15,
        )
        r.raise_for_status()

    def listar_suscripciones_activas(self) -> list[dict[str, Any]]:
        r = requests.get(
            f"{self.base_url}/rest/v1/push_suscripciones",
            params={
                "activo": "eq.true",
                "select": "id,endpoint,p256dh,auth,creado_en",
                "order": "creado_en.desc",
            },
            headers=self.headers,
            timeout=15,
        )
        r.raise_for_status()
        return r.json()

    def desactivar_suscripcion(self, endpoint: str) -> None:
        encoded = quote(endpoint, safe="")
        r = requests.patch(
            f"{self.base_url}/rest/v1/push_suscripciones?endpoint=eq.{encoded}",
            headers=self.headers,
            json={"activo": False},
            timeout=15,
        )
        if not r.ok:
            log.warning("No se pudo desactivar suscripción expirada: HTTP %s", r.status_code)

    def marcar_envio_ok(self, endpoint: str) -> None:
        encoded = quote(endpoint, safe="")
        r = requests.patch(
            f"{self.base_url}/rest/v1/push_suscripciones?endpoint=eq.{encoded}",
            headers=self.headers,
            json={"ultimo_envio_ok": datetime.now(timezone.utc).isoformat()},
            timeout=15,
        )
        if not r.ok:
            log.warning("No se pudo actualizar ultimo_envio_ok: HTTP %s", r.status_code)


def enviar_a_suscripciones(
    supabase: SupabaseAdminClient,
    suscripciones: list[dict[str, Any]],
    payload: dict[str, Any],
    vapid_private_key: str,
    vapid_subject: str,
) -> tuple[int, int, int]:
    if webpush is None:
        raise RuntimeError("Falta el paquete 'pywebpush'. Ejecuta: pip install pywebpush")
    enviados = 0
    expirados = 0
    errores = 0
    data_str = json.dumps(payload, ensure_ascii=False)

    for sub in suscripciones:
        endpoint = sub["endpoint"]
        sub_info = {
            "endpoint": endpoint,
            "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
        }
        try:
            webpush(
                subscription_info=sub_info,
                data=data_str,
                vapid_private_key=vapid_private_key,
                vapid_claims={"sub": vapid_subject},
                ttl=3600,
            )
            enviados += 1
            supabase.marcar_envio_ok(endpoint)
        except WebPushException as exc:
            status = getattr(exc.response, "status_code", None)
            if status in (404, 410):
                expirados += 1
                supabase.desactivar_suscripcion(endpoint)
                log.info("Suscripción expirada (%s); marcada inactiva.", status)
            else:
                errores += 1
                log.warning("Fallo enviando push (%s): %s", status, exc)
        except Exception as exc:
            errores += 1
            log.warning("Error inesperado enviando push: %s", exc)

    return enviados, expirados, errores


def main() -> int:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
    )
    parser = argparse.ArgumentParser(description="Robot Web Push Observatorio JUAN")
    parser.add_argument(
        "--prueba",
        action="store_true",
        help="Envía un aviso de ejemplo sin modificar CSV, JSON ni push_estado.",
    )
    parser.add_argument(
        "--solo-yo",
        action="store_true",
        help="Envía únicamente a una suscripción (PUSH_TEST_ENDPOINT o la más reciente).",
    )
    parser.add_argument(
        "--solo-yo-id",
        default=os.getenv("PUSH_TEST_ENDPOINT", ""),
        help="Subcadena de ID o endpoint concreto para filtrar con --solo-yo.",
    )
    args = parser.parse_args()

    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    supabase_secret = os.getenv("SUPABASE_SECRET_KEY", "").strip()
    vapid_private = os.getenv("VAPID_PRIVATE_KEY", "").strip()
    vapid_subject = os.getenv("VAPID_SUBJECT", "").strip()

    config = cargar_config()

    if not args.prueba:
        lecturas = cargar_lecturas()
        resumen = calcular_resumen_lectura(lecturas, config)
        if resumen is not None:
            escribir_resumen_en_fews_json(resumen)
    else:
        lecturas = []

    if not all([supabase_url, supabase_secret, vapid_private, vapid_subject]):
        msg = (
            "Faltan secretos (SUPABASE_URL, SUPABASE_SECRET_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT)."
        )
        if args.prueba:
            log.error(msg)
            return 1
        log.info("%s Se omite el envío push sin fallar.", msg)
        return 0

    if not vapid_subject.startswith(("mailto:", "https://")):
        vapid_subject = f"mailto:{vapid_subject}"

    supabase = SupabaseAdminClient(supabase_url, supabase_secret)

    if args.prueba:
        ahora_str = fmt_fecha_colombia(datetime.now(TZ_BOGOTA), has_time=True)
        tipo_aviso = "prueba"
        payload = construir_payload_notificacion(
            "▲ 5.28 m · subió 4 cm (prueba)", ahora_str
        )
        nuevo_estado = None
    else:
        estado = supabase.obtener_estado()
        ahora = datetime.now(TZ_BOGOTA)
        tipo_aviso, payload, nuevo_estado = evaluar_disparo(
            lecturas, estado, config, ahora
        )
        if tipo_aviso is None or payload is None:
            log.info("Sin condiciones de disparo para nuevo aviso push.")
            return 0

    suscripciones = supabase.listar_suscripciones_activas()
    if args.solo_yo:
        filtro = (args.solo_yo_id or "").strip()
        if filtro:
            suscripciones = [
                s
                for s in suscripciones
                if filtro in str(s.get("id", "")) or filtro in s.get("endpoint", "")
            ]
        else:
            suscripciones = suscripciones[:1]

    if not suscripciones:
        log.warning("No hay suscripciones activas para enviar (%s).", tipo_aviso)
        if nuevo_estado is not None and not args.solo_yo:
            supabase.guardar_estado(nuevo_estado)
        return 1 if args.prueba else 0

    enviados, expirados, errores = enviar_a_suscripciones(
        supabase, suscripciones, payload, vapid_private, vapid_subject
    )
    log.info(
        "Aviso '%s' procesado: %d enviados, %d expirados, %d errores.",
        tipo_aviso,
        enviados,
        expirados,
        errores,
    )

    if nuevo_estado is not None and not args.solo_yo and (enviados > 0 or expirados > 0):
        supabase.guardar_estado(nuevo_estado)

    if args.prueba and enviados == 0:
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
