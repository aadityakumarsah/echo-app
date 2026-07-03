"""
eSewa and Khalti payment routes for Nepal users.

eSewa v2:  https://developer.esewa.com.np
Khalti v2: https://docs.khalti.com

Both gateways redirect the user to their hosted checkout, then redirect back
to our success/failure URLs with payment details. We verify server-side, then
activate the subscription using the same upsert_subscription() function that
Stripe uses — so hasAccess() on the frontend works identically.

Env vars needed (set in Render dashboard):
  ESEWA_PRODUCT_CODE   — merchant code from eSewa portal (test: EPAYTEST)
  ESEWA_SECRET_KEY     — HMAC key from eSewa portal (test: 8gBm/:&EnhH.1/q)
  KHALTI_SECRET_KEY    — secret key from Khalti dashboard (starts with "live_secret_key_...")
"""

import hashlib
import hmac
import base64
import os
import time
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from pydantic import BaseModel

from app.core.auth import get_current_user
from app.db.subscriptions import upsert_subscription

nepal_payments_router = APIRouter(prefix="/nepal-payments", tags=["Nepal Payments"])

# ── NPR plan amounts (paisa for Khalti, rupees for eSewa) ────────────────────
# Approximate NPR equivalents: weekly ≈ Rs 400, monthly ≈ Rs 1300, yearly ≈ Rs 25000
NPR_PRICES = {
    "weekly":  {"npr": 399,   "label": "Rs. 399 / week"},
    "monthly": {"npr": 1299,  "label": "Rs. 1,299 / month"},
    "yearly":  {"npr": 24999, "label": "Rs. 24,999 / year"},
}


# ── Schemas ───────────────────────────────────────────────────────────────────

class NepalCheckoutRequest(BaseModel):
    plan: str        # "weekly" | "monthly" | "yearly"
    gateway: str     # "esewa" | "khalti"
    success_url: str
    failure_url: str


class NepalCheckoutResponse(BaseModel):
    gateway: str
    # eSewa: we give the form fields + action URL (client posts a hidden form)
    # Khalti: we give a redirect URL directly
    action_url: str         # URL to POST (eSewa) or redirect to (Khalti)
    fields: dict | None     # eSewa form fields; None for Khalti
    transaction_uuid: str   # stored in localStorage to verify on return


class VerifyRequest(BaseModel):
    gateway: str            # "esewa" | "khalti"
    plan: str
    transaction_uuid: str
    # eSewa passes these back in the success URL as ?data=<base64>
    esewa_data: str | None = None
    # Khalti passes back pidx
    khalti_pidx: str | None = None


# ── eSewa helpers ─────────────────────────────────────────────────────────────

def _esewa_signature(total_amount: int, transaction_uuid: str, product_code: str) -> str:
    secret = os.getenv("ESEWA_SECRET_KEY", "8gBm/:&EnhH.1/q")  # test default
    message = f"total_amount={total_amount},transaction_uuid={transaction_uuid},product_code={product_code}"
    sig = hmac.new(secret.encode(), message.encode(), hashlib.sha256).digest()
    return base64.b64encode(sig).decode()


def _esewa_is_live() -> bool:
    key = os.getenv("ESEWA_SECRET_KEY", "")
    return bool(key) and key != "8gBm/:&EnhH.1/q"


def _esewa_base_url() -> str:
    if _esewa_is_live():
        return "https://epay.esewa.com.np/api/epay/main/v2/form"
    return "https://rc-epay.esewa.com.np/api/epay/main/v2/form"


def _esewa_verify_url() -> str:
    if _esewa_is_live():
        return "https://epay.esewa.com.np/api/epay/transaction/status/"
    return "https://rc-epay.esewa.com.np/api/epay/transaction/status/"


# ── Khalti helpers ────────────────────────────────────────────────────────────

def _khalti_is_live() -> bool:
    key = os.getenv("KHALTI_SECRET_KEY", "")
    return key.startswith("live_secret_key")


def _khalti_base_url() -> str:
    if _khalti_is_live():
        return "https://khalti.com/api/v2"
    return "https://dev.khalti.com/api/v2"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@nepal_payments_router.post("/initiate", response_model=NepalCheckoutResponse)
def initiate_nepal_payment(
    body: NepalCheckoutRequest,
    user: dict = Depends(get_current_user),
):
    if body.plan not in NPR_PRICES:
        raise HTTPException(status_code=400, detail=f"Unknown plan: {body.plan}")
    if body.gateway not in ("esewa", "khalti"):
        raise HTTPException(status_code=400, detail="gateway must be 'esewa' or 'khalti'")

    user_id = user["id"]
    transaction_uuid = str(uuid.uuid4())
    amount = NPR_PRICES[body.plan]["npr"]

    if body.gateway == "esewa":
        product_code = os.getenv("ESEWA_PRODUCT_CODE", "EPAYTEST")
        signature = _esewa_signature(amount, transaction_uuid, product_code)
        fields = {
            "amount": str(amount),
            "tax_amount": "0",
            "total_amount": str(amount),
            "transaction_uuid": transaction_uuid,
            "product_code": product_code,
            "product_service_charge": "0",
            "product_delivery_charge": "0",
            "success_url": f"{body.success_url}?gateway=esewa&plan={body.plan}&uuid={transaction_uuid}",
            "failure_url": f"{body.failure_url}?gateway=esewa",
            "signed_field_names": "total_amount,transaction_uuid,product_code",
            "signature": signature,
        }
        return NepalCheckoutResponse(
            gateway="esewa",
            action_url=_esewa_base_url(),
            fields=fields,
            transaction_uuid=transaction_uuid,
        )

    else:  # khalti
        secret_key = os.getenv("KHALTI_SECRET_KEY", "test_secret_key_dc74e0fd57cb46cd93832aee0a390234")
        headers = {"Authorization": f"Key {secret_key}", "Content-Type": "application/json"}
        payload = {
            "return_url": f"{body.success_url}?gateway=khalti&plan={body.plan}&uuid={transaction_uuid}",
            "website_url": "https://clario-np.vercel.app",
            "amount": amount * 100,  # Khalti uses paisa (1 NPR = 100 paisa)
            "purchase_order_id": transaction_uuid,
            "purchase_order_name": f"Clario {body.plan.title()} Plan",
            "customer_info": {
                "name": user.get("user_metadata", {}).get("full_name", "Clario User"),
                "email": user.get("email", ""),
            },
        }
        try:
            resp = httpx.post(
                f"{_khalti_base_url()}/epayment/initiate/",
                json=payload,
                headers=headers,
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPStatusError as e:
            logger.error("Khalti initiate error: {} — {}", e.response.status_code, e.response.text)
            raise HTTPException(status_code=502, detail=f"Khalti error: {e.response.text}")
        except Exception as e:
            logger.error("Khalti request failed: {}", e)
            raise HTTPException(status_code=502, detail="Khalti request failed")

        return NepalCheckoutResponse(
            gateway="khalti",
            action_url=data["payment_url"],
            fields=None,
            transaction_uuid=transaction_uuid,
        )


@nepal_payments_router.post("/verify")
def verify_nepal_payment(
    body: VerifyRequest,
    user: dict = Depends(get_current_user),
):
    """
    Called from the success page after the gateway redirects back.
    Verifies payment server-side, then activates the subscription.
    """
    user_id = user["id"]

    if body.gateway == "esewa":
        if not body.esewa_data:
            raise HTTPException(status_code=400, detail="Missing esewa_data")

        # Decode the base64 response from eSewa
        try:
            decoded = base64.b64decode(body.esewa_data).decode()
            import json
            resp_data = json.loads(decoded)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid esewa_data encoding")

        # Verify the response signature
        product_code = os.getenv("ESEWA_PRODUCT_CODE", "EPAYTEST")
        total_amount = resp_data.get("total_amount", "").replace(",", "")
        t_uuid = resp_data.get("transaction_uuid", "")
        expected_sig = _esewa_signature(int(float(total_amount)), t_uuid, product_code)

        if resp_data.get("signature") != expected_sig:
            logger.warning("eSewa signature mismatch for user {}", user_id)
            raise HTTPException(status_code=400, detail="eSewa signature verification failed")

        # Double-check with eSewa status API
        try:
            amount = NPR_PRICES[body.plan]["npr"]
            check = httpx.get(
                _esewa_verify_url(),
                params={
                    "product_code": product_code,
                    "total_amount": amount,
                    "transaction_uuid": t_uuid,
                },
                timeout=10,
            )
            check.raise_for_status()
            status_data = check.json()
        except Exception as e:
            logger.error("eSewa status check failed: {}", e)
            raise HTTPException(status_code=502, detail="eSewa verification request failed")

        if status_data.get("status") != "COMPLETE":
            raise HTTPException(status_code=402, detail=f"Payment not complete: {status_data.get('status')}")

    elif body.gateway == "khalti":
        if not body.khalti_pidx:
            raise HTTPException(status_code=400, detail="Missing khalti_pidx")

        secret_key = os.getenv("KHALTI_SECRET_KEY", "test_secret_key_dc74e0fd57cb46cd93832aee0a390234")
        headers = {"Authorization": f"Key {secret_key}"}
        try:
            resp = httpx.post(
                f"{_khalti_base_url()}/epayment/lookup/",
                json={"pidx": body.khalti_pidx},
                headers=headers,
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=502, detail=f"Khalti lookup error: {e.response.text}")
        except Exception as e:
            raise HTTPException(status_code=502, detail="Khalti verification failed")

        if data.get("status") != "Completed":
            raise HTTPException(status_code=402, detail=f"Payment not complete: {data.get('status')}")
    else:
        raise HTTPException(status_code=400, detail="Unknown gateway")

    # ── Payment verified — activate subscription ───────────────────────────
    now = int(time.time())
    plan = body.plan
    period_seconds = {"weekly": 7 * 86400, "monthly": 30 * 86400, "yearly": 365 * 86400}
    expires_ts = now + period_seconds.get(plan, 30 * 86400)

    upsert_subscription(
        user_id=user_id,
        plan=plan,
        status="active",
        current_period_end=expires_ts,
    )
    logger.info("Nepal payment verified ({}) for user {}: plan={}", body.gateway, user_id, plan)

    expires_at = datetime.fromtimestamp(expires_ts, tz=timezone.utc).isoformat()
    return {"verified": True, "plan": plan, "expires_at": expires_at}


@nepal_payments_router.get("/prices")
def get_nepal_prices():
    """Returns NPR prices for all plans — used by the frontend."""
    return NPR_PRICES
