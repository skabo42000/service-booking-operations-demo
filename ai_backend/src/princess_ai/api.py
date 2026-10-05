"""Mali interni API za AI vodič; javni Next.js endpoint je posrednik."""

import os
import secrets
import threading

from fastapi import FastAPI, HTTPException, Security
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field

from princess_ai.agent import respond

app = FastAPI(title="Princess AI demo", docs_url=None, redoc_url=None, openapi_url=None)
busy = threading.Lock()


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=500)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/ask")
def ask(body: AskRequest, key: str | None = Security(APIKeyHeader(name="X-Assistant-Key", auto_error=False))) -> dict:
    expected = os.getenv("ASSISTANT_API_KEY", "")
    if len(expected) < 20 or not key or not secrets.compare_digest(key, expected):
        raise HTTPException(status_code=401, detail="Neovlašćen pristup.")
    if not busy.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="Vodič trenutno odgovara na drugo pitanje.")
    try:
        return respond(body.question)
    except Exception as error:
        print(f"[assistant] {type(error).__name__}")
        raise HTTPException(status_code=502, detail="Vodič trenutno nije dostupan.") from error
    finally:
        busy.release()
