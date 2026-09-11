"""EcoleDirecte (unofficial) API client + snapshot builder for the Family
Zone "École" tab.

EcoleDirecte has no public API. This talks to the private
`api.ecoledirecte.com/v3` endpoints the web app uses, which are undocumented
and change without notice -- everything here is best-effort and must degrade
gracefully (a failure fills `last_error` on the account row; the tab keeps
showing the last good snapshot, the page never crashes).

Auth flow:
  1. GET /v3/login.awp?gtk=1  -> a `GTK` cookie, echoed as the `X-Gtk` header
  2. POST /v3/login.awp with form field `data=<json>`  -> code 200 (token +
     accounts) or code 250 (security-question QCM required)
  3. QCM: GET then POST /v3/connexion/doubleauth.awp -> a reusable cn/cv pair
     that is sent in `fa:[...]` on every future login to skip the question
Every response carries a fresh `token`; send it as `X-Token` on the next call.
The User-Agent must be identical for the gtk bootstrap and all authed calls.
"""

import asyncio
import base64
import json
import logging
import re
from datetime import date, datetime, timedelta

import httpx
from sqlalchemy import select

from backend.crypto import decrypt_secret, encrypt_secret
from backend.rate_limit import rate_limiter

logger = logging.getLogger(__name__)

ED_BASE = "https://api.ecoledirecte.com/v3"
ED_VERSION = "4.75.0"  # bump here if EcoleDirecte rejects the version (code 517)
ED_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
HTTP_TIMEOUT = 20.0
STALE_AFTER = timedelta(minutes=30)

# Never run two refreshes (=> two concurrent logins) at once -- EcoleDirecte
# treats that as abuse.
_refresh_lock = asyncio.Lock()


class EcoleError(Exception):
    pass


class EcoleTokenExpired(EcoleError):
    pass


# ---------------------------------------------------------------------------
# low-level HTTP
# ---------------------------------------------------------------------------

def _new_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=ED_BASE,
        headers={"User-Agent": ED_USER_AGENT},
        timeout=HTTP_TIMEOUT,
    )


def _form_data(payload: dict) -> dict:
    """EcoleDirecte POST bodies are `application/x-www-form-urlencoded` with a
    single field literally named `data` whose value is a JSON string."""
    return {"data": json.dumps(payload, separators=(",", ":"))}


def _b64_text(value) -> str:
    """Decode a base64 field, strip HTML tags, collapse whitespace, truncate."""
    if not value:
        return ""
    try:
        text = base64.b64decode(value).decode("utf-8", "replace")
    except Exception:
        text = str(value)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"[ \t]+", " ", text).strip()
    return text[:400]


async def _bootstrap_gtk(client: httpx.AsyncClient) -> str:
    await client.get(f"/login.awp?gtk=1&v={ED_VERSION}")
    gtk = client.cookies.get("GTK")
    if not gtk:
        raise EcoleError("Could not obtain the GTK bootstrap token")
    return gtk


async def _request(
    client: httpx.AsyncClient,
    path_with_query: str,
    token: str | None,
    payload: dict,
    *,
    extra_headers: dict | None = None,
) -> tuple[dict, str | None]:
    """POST an authed EcoleDirecte call. Returns (data, refreshed_token)."""
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    if token:
        headers["X-Token"] = token
    if extra_headers:
        headers.update(extra_headers)

    resp = await client.post(path_with_query, data=_form_data(payload), headers=headers)
    body = resp.json()
    code = body.get("code")
    if code == 200:
        return body.get("data") or {}, body.get("token")
    if code == 525:
        raise EcoleTokenExpired("EcoleDirecte session token expired")
    if code == 520:
        raise EcoleError("EcoleDirecte rejected the session (User-Agent changed)")
    raise EcoleError(body.get("message") or f"EcoleDirecte error code {code}")


# ---------------------------------------------------------------------------
# login + QCM double-auth
# ---------------------------------------------------------------------------

def _extract_children(accounts: list) -> list[dict]:
    parent = next((a for a in accounts if a.get("typeCompte") == "P"), None)
    if parent is not None:
        eleves = (parent.get("profile") or {}).get("eleves") or []
        out = []
        for e in eleves:
            classe = e.get("classe") or {}
            out.append({
                "eleve_id": str(e.get("id")),
                "prenom": e.get("prenom"),
                "nom": e.get("nom"),
                "classe": classe.get("libelle") or classe.get("code"),
            })
        return out
    # A student account logged in directly -- just itself.
    student = next((a for a in accounts if a.get("typeCompte") == "E"), None)
    if student is not None:
        return [{
            "eleve_id": str(student.get("id")),
            "prenom": student.get("prenom"),
            "nom": student.get("nom"),
            "classe": None,
        }]
    return []


async def login(username: str, password: str, cn: str | None = None, cv: str | None = None) -> dict:
    """Returns exactly one of:
      {"status": "ok", "token", "accounts", "children"}
      {"status": "qcm_required", "token"}      # token from the 250 response
      {"status": "totp_unsupported"}
      {"status": "error", "message"}
    """
    payload = {"identifiant": username, "motdepasse": password, "isRelogin": False, "uuid": ""}
    if cn and cv:
        payload["fa"] = [{"cn": cn, "cv": cv}]
    try:
        async with _new_client() as client:
            gtk = await _bootstrap_gtk(client)
            resp = await client.post(
                f"/login.awp?v={ED_VERSION}",
                data=_form_data(payload),
                headers={"X-Gtk": gtk, "Content-Type": "application/x-www-form-urlencoded"},
            )
            body = resp.json()
            code = body.get("code")
            if code == 200:
                accounts = (body.get("data") or {}).get("accounts") or []
                return {
                    "status": "ok",
                    "token": body.get("token"),
                    "accounts": accounts,
                    "children": _extract_children(accounts),
                }
            if code == 250:
                if (body.get("data") or {}).get("totp"):
                    return {"status": "totp_unsupported"}
                return {"status": "qcm_required", "token": body.get("token")}
            return {"status": "error", "message": body.get("message") or f"code {code}"}
    except httpx.HTTPError as e:
        return {"status": "error", "message": f"network error: {e}"}
    except EcoleError as e:
        return {"status": "error", "message": str(e)}


async def fetch_qcm(token: str) -> dict:
    """Fetch the pending security question. `question`/`propositions` are
    base64 in the response; we return both the decoded text and the raw
    base64 (submit_qcm needs the exact original bytes)."""
    async with _new_client() as client:
        data, new_token = await _request(
            client, f"/connexion/doubleauth.awp?verbe=get&v={ED_VERSION}", token, {}
        )
    props_b64 = data.get("propositions") or []
    return {
        "question": _b64_text(data.get("question")),
        "propositions": [_b64_text(p) for p in props_b64],
        "propositions_b64": list(props_b64),
        "token": new_token or token,
    }


async def submit_qcm(token: str, choix_b64: str) -> dict:
    """Submit the chosen answer (as the *original* base64 string). Returns the
    reusable {cn, cv} proof."""
    async with _new_client() as client:
        data, new_token = await _request(
            client,
            f"/connexion/doubleauth.awp?verbe=post&v={ED_VERSION}",
            token,
            {"choix": choix_b64},
        )
    cn, cv = data.get("cn"), data.get("cv")
    if not cn or not cv:
        raise EcoleError("QCM answer rejected")
    return {"cn": cn, "cv": cv, "token": new_token or token}


# ---------------------------------------------------------------------------
# data getters -- each returns (normalized, refreshed_token)
# ---------------------------------------------------------------------------

async def get_homework(client, token, eleve_id) -> tuple[list, str | None]:
    data, new_token = await _request(
        client, f"/Eleves/{eleve_id}/cahierdetexte.awp?verbe=get&v={ED_VERSION}", token, {}
    )
    cutoff = (date.today() - timedelta(days=2)).isoformat()
    items: list[dict] = []
    for day, entries in (data or {}).items():
        if day < cutoff:
            continue
        for e in entries or []:
            a = e.get("aFaire") or {}
            if not a:
                continue
            items.append({
                "date": day,
                "matiere": e.get("matiere"),
                "code": e.get("codeMatiere"),
                "contenu": _b64_text(a.get("contenu")),
                "effectue": bool(a.get("effectue")),
                "donne_le": a.get("donneLe"),
                "en_ligne": bool(a.get("rendreEnLigne")),
                "interro": bool(e.get("interrogation")),
            })
    items.sort(key=lambda x: (x["date"], x.get("matiere") or ""))
    return items[:20], new_token


async def get_grades(client, token, eleve_id) -> tuple[dict, str | None]:
    data, new_token = await _request(
        client,
        f"/Eleves/{eleve_id}/notes.awp?verbe=get&v={ED_VERSION}",
        token,
        {"anneeScolaire": ""},
    )
    periode = None
    for p in data.get("periodes") or []:
        if not p.get("cloture"):
            periode = {"periode": p.get("periode"), "id": p.get("idPeriode")}
            break
    notes = []
    for n in data.get("notes") or []:
        notes.append({
            "valeur": n.get("valeur"),
            "sur": n.get("noteSur"),
            "coef": n.get("coef"),
            "matiere": n.get("libelleMatiere"),
            "code": n.get("codeMatiere"),
            "devoir": n.get("devoir"),
            "date": n.get("date"),
            "date_saisie": n.get("dateSaisie"),
            "moyenne_classe": n.get("moyenneClasse"),
            "min": n.get("minClasse"),
            "max": n.get("maxClasse"),
            "significatif": not n.get("nonSignificatif"),
        })
    notes.sort(key=lambda x: x.get("date_saisie") or x.get("date") or "", reverse=True)
    return {"periode": periode, "notes": notes[:20]}, new_token


async def get_timetable(client, token, eleve_id, date_debut, date_fin) -> tuple[list, str | None]:
    data, new_token = await _request(
        client,
        f"/E/{eleve_id}/emploidutemps.awp?verbe=get&v={ED_VERSION}",
        token,
        {"dateDebut": date_debut, "dateFin": date_fin, "avecTrous": False},
    )
    lessons = []
    for l in data if isinstance(data, list) else []:
        lessons.append({
            "matiere": l.get("matiere") or l.get("text"),
            "prof": l.get("prof"),
            "salle": l.get("salle"),
            "start": l.get("start_date"),
            "end": l.get("end_date"),
            "annule": bool(l.get("isAnnule")),
            "color": l.get("color"),
        })
    lessons.sort(key=lambda x: x.get("start") or "")
    return lessons, new_token


async def get_viescolaire(client, token, eleve_id) -> tuple[dict, str | None]:
    data, new_token = await _request(
        client, f"/Eleves/{eleve_id}/viescolaire.awp?verbe=get&v={ED_VERSION}", token, {}
    )

    def _compact(row):
        return {
            "type": row.get("typeElement"),
            "libelle": row.get("libelle"),
            "date": row.get("date"),
            "display": row.get("displayDate"),
            "justifie": bool(row.get("justifie")),
            "motif": row.get("motif"),
            "commentaire": row.get("commentaire"),
        }

    return {
        "absences_retards": [_compact(r) for r in (data.get("absencesRetards") or [])][:20],
        "sanctions": [_compact(r) for r in (data.get("sanctionsEncouragements") or [])][:20],
    }, new_token


# ---------------------------------------------------------------------------
# snapshot orchestration
# ---------------------------------------------------------------------------

async def refresh_snapshot(db) -> None:
    """Log in (reusing the cached token, then cn/cv, then a full QCM-skipping
    login as needed), pull all four datasets for every child, and persist a
    compact snapshot + last_sync_at / last_error on the singleton account
    row. Never raises."""
    from backend.models import EcoleDirecteAccount

    if _refresh_lock.locked():
        return

    async with _refresh_lock:
        result = await db.execute(select(EcoleDirecteAccount).limit(1))
        row = result.scalar_one_or_none()
        if row is None or not row.username_enc or row.qcm_pending:
            return

        try:
            rate_limiter.check("ecole-refresh", 1, 60)
        except Exception:
            return  # a refresh already ran in the last minute

        username = decrypt_secret(row.username_enc)
        password = decrypt_secret(row.password_enc)
        cn = decrypt_secret(row.qcm_cn_enc)
        cv = decrypt_secret(row.qcm_cv_enc)
        token = decrypt_secret(row.ecole_token_enc)

        if not username or not password:
            row.last_error = "Stored credentials are unreadable (SECRET_KEY changed?) -- reconfigure in Settings."
            await db.commit()
            return

        try:
            children = json.loads(row.children_json or "[]")

            # (Re)authenticate if we have no token or the first probe 525s.
            if not token or not children:
                token, children = await _authenticate(db, row, username, password, cn, cv)
                if token is None:
                    return  # _authenticate wrote last_error / qcm_pending

            snapshot = json.loads(row.snapshot_json or "{}")
            partial_errors = []

            async with _new_client() as client:
                for child in children:
                    eid = child["eleve_id"]
                    try:
                        rate_limiter.check(f"ecole-fetch:{eid}", 6, 60)
                    except Exception:
                        continue
                    try:
                        hw, token = await get_homework(client, token, eid)
                        gr, token = await get_grades(client, token, eid)
                        start = date.today()
                        tt, token = await get_timetable(
                            client, token, eid, start.isoformat(), (start + timedelta(days=6)).isoformat()
                        )
                        vs, token = await get_viescolaire(client, token, eid)
                        snapshot[eid] = {
                            "homework": hw, "grades": gr, "timetable": tt, "viescolaire": vs,
                        }
                    except EcoleTokenExpired:
                        token, children = await _authenticate(db, row, username, password, cn, cv)
                        if token is None:
                            return
                    except Exception as e:  # noqa: BLE001 -- keep other children
                        logger.warning("EcoleDirecte fetch failed for child %s: %s", eid, e)
                        prev = snapshot.get(eid, {})
                        prev["error"] = str(e)
                        snapshot[eid] = prev
                        partial_errors.append(f"{child.get('prenom') or eid}: {e}")

            row.snapshot_json = json.dumps(snapshot)
            row.children_json = json.dumps(children)
            row.ecole_token_enc = encrypt_secret(token)
            row.last_sync_at = datetime.utcnow()
            row.last_error = "; ".join(partial_errors) if partial_errors else None
            await db.commit()
        except Exception as e:  # noqa: BLE001
            logger.exception("EcoleDirecte refresh_snapshot failed")
            row.last_error = str(e)
            await db.commit()


async def _authenticate(db, row, username, password, cn, cv) -> tuple[str | None, list | None]:
    """Full login. On success returns (token, children) and clears qcm state.
    On QCM / TOTP / error, writes the row and returns (None, None)."""
    res = await login(username, password, cn, cv)
    status = res.get("status")
    if status == "ok":
        row.qcm_pending = False
        row.qcm_question = None
        row.qcm_propositions_json = None
        return res["token"], res["children"]
    if status == "qcm_required":
        row.qcm_pending = True
        row.last_error = "EcoleDirecte is asking a security question -- answer it in Settings."
        await db.commit()
        return None, None
    if status == "totp_unsupported":
        row.last_error = (
            "App-based two-factor (TOTP) is enabled on this EcoleDirecte account and "
            "cannot be used unattended. Switch two-factor back to the security question."
        )
        await db.commit()
        return None, None
    row.last_error = res.get("message") or "EcoleDirecte login failed"
    await db.commit()
    return None, None
