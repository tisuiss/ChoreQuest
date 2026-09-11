"""'/api/ecole' -- the Family Zone "École" tab: mirrors the family's
EcoleDirecte school data (homework / grades / timetable / attendance) via a
single Fernet-encrypted parent account.

Read endpoint (`/overview`) is open to a paired screen OR a logged-in user
(require_family_access), like the rest of Family Zone. Credential management
is parent-only. Secrets are never echoed back.
"""

import asyncio
import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import async_session, get_db
from backend.crypto import decrypt_secret, encrypt_secret
from backend.dependencies import require_family_access, require_parent
from backend.models import EcoleDirecteAccount, User
from backend.rate_limit import rate_limiter
from backend.schemas import (
    EcoleCredentialsIn,
    EcoleCredentialsPutResponse,
    EcoleCredentialsStatus,
    EcoleOverviewResponse,
    EcoleQcmAnswerIn,
    EcoleQcmProposition,
)
from backend.services import ecoledirecte as ed

router = APIRouter(prefix="/api/ecole", tags=["ecole"])
logger = logging.getLogger(__name__)

_bg_running = False
_bg_tasks: set = set()  # keep strong refs so fire-and-forget tasks aren't GC'd


async def _get_row(db: AsyncSession) -> EcoleDirecteAccount | None:
    result = await db.execute(select(EcoleDirecteAccount).limit(1))
    return result.scalar_one_or_none()


def _mask(username: str | None) -> str | None:
    if not username:
        return None
    if len(username) <= 2:
        return "*" * len(username)
    return username[0] + "*" * (len(username) - 2) + username[-1]


def _child_names(row: EcoleDirecteAccount | None) -> list[str]:
    if not row or not row.children_json:
        return []
    try:
        return [
            (f"{c.get('prenom') or ''} {c.get('nom') or ''}").strip() or c.get("eleve_id")
            for c in json.loads(row.children_json)
        ]
    except Exception:
        return []


def _overview_payload(row: EcoleDirecteAccount | None) -> dict:
    return {
        "configured": bool(row and row.username_enc),
        "children": json.loads(row.children_json or "[]") if row else [],
        "snapshot": json.loads(row.snapshot_json or "{}") if row else {},
        "last_sync_at": row.last_sync_at.isoformat() if row and row.last_sync_at else None,
        "last_error": row.last_error if row else None,
        "qcm_pending": bool(row and row.qcm_pending),
    }


def _qcm_props(row: EcoleDirecteAccount | None) -> list[EcoleQcmProposition] | None:
    if not row or not row.qcm_propositions_json:
        return None
    try:
        return [
            EcoleQcmProposition(index=p["index"], text=p["text"])
            for p in json.loads(row.qcm_propositions_json)
        ]
    except Exception:
        return None


def _kick_refresh() -> None:
    """Fire-and-forget background refresh, guarded so only one runs at a time."""
    global _bg_running
    if _bg_running:
        return
    _bg_running = True

    async def _run():
        global _bg_running
        try:
            async with async_session() as db:
                await ed.refresh_snapshot(db)
        except Exception:
            logger.exception("EcoleDirecte background refresh failed")
        finally:
            _bg_running = False

    task = asyncio.create_task(_run())
    _bg_tasks.add(task)
    task.add_done_callback(_bg_tasks.discard)


# ---------------------------------------------------------------------------
# READ -- consumed by the École tab
# ---------------------------------------------------------------------------

@router.get("/overview", response_model=EcoleOverviewResponse)
async def get_overview(
    db: AsyncSession = Depends(get_db),
    _access: User | None = Depends(require_family_access),
):
    row = await _get_row(db)
    if row and row.username_enc and not row.qcm_pending:
        stale = row.last_sync_at is None or (datetime.utcnow() - row.last_sync_at) > ed.STALE_AFTER
        if stale:
            _kick_refresh()
    return _overview_payload(row)


# ---------------------------------------------------------------------------
# credential management -- parent only
# ---------------------------------------------------------------------------

@router.get("/credentials", response_model=EcoleCredentialsStatus)
async def get_credentials_status(
    db: AsyncSession = Depends(get_db),
    _parent: User = Depends(require_parent),
):
    row = await _get_row(db)
    return EcoleCredentialsStatus(
        configured=bool(row and row.username_enc),
        username_masked=_mask(decrypt_secret(row.username_enc)) if row else None,
        children=_child_names(row),
        last_sync_at=row.last_sync_at.isoformat() if row and row.last_sync_at else None,
        last_error=row.last_error if row else None,
        qcm_pending=bool(row and row.qcm_pending),
        qcm_question=row.qcm_question if row else None,
        qcm_propositions=_qcm_props(row),
    )


@router.put("/credentials", response_model=EcoleCredentialsPutResponse)
async def put_credentials(
    body: EcoleCredentialsIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _parent: User = Depends(require_parent),
):
    client_ip = request.client.host if request.client else "unknown"
    rate_limiter.check(f"ecole-cred:{client_ip}", 5, 300)

    row = await _get_row(db)
    cn = decrypt_secret(row.qcm_cn_enc) if row else None
    cv = decrypt_secret(row.qcm_cv_enc) if row else None

    res = await ed.login(body.username, body.password, cn, cv)
    status = res.get("status")

    if row is None:
        row = EcoleDirecteAccount(username_enc="", password_enc="")
        db.add(row)

    if status == "ok":
        row.username_enc = encrypt_secret(body.username)
        row.password_enc = encrypt_secret(body.password)
        row.ecole_token_enc = encrypt_secret(res["token"])
        row.children_json = json.dumps(res["children"])
        row.qcm_pending = False
        row.qcm_question = None
        row.qcm_propositions_json = None
        row.last_error = None
        await db.commit()
        _kick_refresh()
        return EcoleCredentialsPutResponse(status="ok")

    if status == "qcm_required":
        row.username_enc = encrypt_secret(body.username)
        row.password_enc = encrypt_secret(body.password)
        # the 250-response token is the X-Token for fetch_qcm / submit_qcm
        row.ecole_token_enc = encrypt_secret(res["token"])
        row.qcm_pending = True
        try:
            qcm = await ed.fetch_qcm(res["token"])
        except ed.EcoleError as e:
            row.last_error = str(e)
            await db.commit()
            return EcoleCredentialsPutResponse(status="error", message=str(e))
        props = [
            {"index": i, "text": t, "b64": b}
            for i, (t, b) in enumerate(zip(qcm["propositions"], qcm["propositions_b64"]))
        ]
        row.qcm_question = qcm["question"]
        row.qcm_propositions_json = json.dumps(props)
        row.ecole_token_enc = encrypt_secret(qcm["token"])
        await db.commit()
        return EcoleCredentialsPutResponse(
            status="qcm_required",
            question=qcm["question"],
            propositions=[EcoleQcmProposition(index=p["index"], text=p["text"]) for p in props],
        )

    if status == "totp_unsupported":
        return EcoleCredentialsPutResponse(
            status="totp_unsupported",
            message=(
                "App-based two-factor (TOTP) is enabled on this EcoleDirecte account "
                "and cannot be used by an unattended integration. Switch two-factor "
                "back to the security question, then try again."
            ),
        )

    return EcoleCredentialsPutResponse(status="error", message=res.get("message"))


@router.post("/credentials/qcm", response_model=EcoleCredentialsPutResponse)
async def answer_qcm(
    body: EcoleQcmAnswerIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _parent: User = Depends(require_parent),
):
    client_ip = request.client.host if request.client else "unknown"
    rate_limiter.check(f"ecole-cred:{client_ip}", 5, 300)

    row = await _get_row(db)
    if row is None or not row.qcm_pending or not row.qcm_propositions_json:
        raise HTTPException(status_code=400, detail="No pending security question")

    props = json.loads(row.qcm_propositions_json)
    if body.proposition_index < 0 or body.proposition_index >= len(props):
        raise HTTPException(status_code=400, detail="Invalid answer index")
    choix_b64 = props[body.proposition_index]["b64"]

    token = decrypt_secret(row.ecole_token_enc)
    username = decrypt_secret(row.username_enc)
    password = decrypt_secret(row.password_enc)
    if not token or not username or not password:
        raise HTTPException(status_code=400, detail="Credential state is inconsistent -- re-enter the login")

    try:
        sub = await ed.submit_qcm(token, choix_b64)
    except ed.EcoleError as e:
        return EcoleCredentialsPutResponse(status="error", message=str(e))

    row.qcm_cn_enc = encrypt_secret(sub["cn"])
    row.qcm_cv_enc = encrypt_secret(sub["cv"])

    res = await ed.login(username, password, sub["cn"], sub["cv"])
    if res.get("status") == "ok":
        row.ecole_token_enc = encrypt_secret(res["token"])
        row.children_json = json.dumps(res["children"])
        row.qcm_pending = False
        row.qcm_question = None
        row.qcm_propositions_json = None
        row.last_error = None
        await db.commit()
        _kick_refresh()
        return EcoleCredentialsPutResponse(status="ok")

    # The security question IS answered (cn/cv stored); a still-failing login
    # is likely transient. Drop qcm_pending so the background task retries
    # with the stored cn/cv on its next cycle; surface the error meanwhile.
    row.qcm_pending = False
    row.qcm_question = None
    row.qcm_propositions_json = None
    row.last_error = res.get("message") or "Login still failing after the security question"
    await db.commit()
    return EcoleCredentialsPutResponse(status="error", message=row.last_error)


@router.post("/refresh", response_model=EcoleOverviewResponse)
async def force_refresh(
    db: AsyncSession = Depends(get_db),
    _access: User | None = Depends(require_family_access),
):
    rate_limiter.check("ecole-refresh-endpoint", 4, 60)
    await ed.refresh_snapshot(db)
    return _overview_payload(await _get_row(db))


@router.delete("/credentials", status_code=204)
async def delete_credentials(
    db: AsyncSession = Depends(get_db),
    _parent: User = Depends(require_parent),
):
    row = await _get_row(db)
    if row is not None:
        await db.delete(row)
        await db.commit()
    return None
