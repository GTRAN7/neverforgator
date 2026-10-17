"""Real Auth0-style token checks, without contacting Auth0.

We make our own RSA key pair, sign tokens with it, and make the server use our
public key instead of downloading Auth0's. Then we check that good tokens work
and forged / wrong-audience / expired / missing tokens are all rejected.
"""
import base64
import time

import pytest
import rsa  # pure-Python RSA, installed alongside python-jose
from jose import jwt

from app import auth, config

ISSUER = "https://test-tenant.us.auth0.com/"
AUDIENCE = "https://loci-api"

# 1024-bit keys keep the tests fast; Auth0 itself uses 2048-bit keys.
public_key, private_key = rsa.newkeys(1024)
_, attacker_private_key = rsa.newkeys(1024)


def _b64url_int(n: int) -> str:
    raw = n.to_bytes((n.bit_length() + 7) // 8, "big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


# Our public key, in the same "JWKS" format Auth0 publishes.
TEST_JWKS = {
    "keys": [
        {
            "kty": "RSA",
            "kid": "test-key",
            "use": "sig",
            "alg": "RS256",
            "n": _b64url_int(public_key.n),
            "e": _b64url_int(public_key.e),
        }
    ]
}


def make_token(key=private_key, **overrides):
    now = int(time.time())
    claims = {"sub": "auth0|abc123", "iss": ISSUER, "aud": AUDIENCE, "iat": now, "exp": now + 3600}
    claims.update(overrides)
    pem = key.save_pkcs1().decode()
    return jwt.encode(claims, pem, algorithm="RS256", headers={"kid": "test-key"})


@pytest.fixture()
def real_auth(client, monkeypatch):
    monkeypatch.setattr(config, "DEV_AUTH", False)
    monkeypatch.setattr(config, "AUTH0_DOMAIN", "test-tenant.us.auth0.com")
    monkeypatch.setattr(config, "AUTH0_ISSUER", ISSUER)
    monkeypatch.setattr(config, "AUTH0_AUDIENCE", AUDIENCE)
    monkeypatch.setattr(auth, "_get_jwks", lambda force_refresh=False: TEST_JWKS)
    monkeypatch.setattr(auth, "_fetch_profile", lambda token: {"email": "a@ufl.edu", "name": "Al"})
    return client


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def test_valid_token(real_auth):
    r = real_auth.get("/me", headers=bearer(make_token()))
    assert r.status_code == 200, r.text
    assert r.json()["auth0_sub"] == "auth0|abc123"
    assert r.json()["email"] == "a@ufl.edu"


def test_missing_token(real_auth):
    assert real_auth.get("/me").status_code == 401


def test_dev_header_ignored_when_dev_auth_off(real_auth):
    assert real_auth.get("/me", headers={"X-Dev-User": "alice"}).status_code == 401


@pytest.mark.parametrize(
    "token",
    [
        make_token(aud="https://some-other-api"),
        make_token(iss="https://evil.example.com/"),
        make_token(exp=int(time.time()) - 60),
        make_token(key=attacker_private_key),  # forged signature
        "not-a-jwt",
    ],
)
def test_bad_tokens_rejected(real_auth, token):
    assert real_auth.get("/me", headers=bearer(token)).status_code == 401
