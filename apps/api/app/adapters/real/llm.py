from __future__ import annotations

import asyncio
import json
import logging
import random
import re
import time
from collections.abc import AsyncGenerator
from typing import Any

import httpx

# Volcengine Ark's /api/coding/v3/ endpoint has strict per-minute rate limits
# and occasional transient connection resets. We retry the initial request a
# few times with exponential backoff+jitter; once streaming starts we can no
# longer safely retry (tokens would be duplicated on resume), so mid-stream
# errors still bubble up unchanged.
_ARK_RETRY_STATUS_CODES = (429, 502, 503, 504)
_ARK_MAX_RETRIES = 5
_ARK_BACKOFF_BASE_S = 0.8

# Exceptions that are safe to retry BEFORE the stream has emitted any token.
# Retrying after the first byte would duplicate tokens, so callers must gate
# on a "has emitted" flag.
_ARK_PRESTREAM_RETRY_EXCEPTIONS: tuple[type[BaseException], ...] = (
    httpx.ConnectError,
    httpx.ConnectTimeout,
    httpx.ReadTimeout,
    httpx.RemoteProtocolError,
)

# Dedicated timeouts:
#   connect: fail fast so we can retry on transient TCP/TLS issues.
#   read:    None — Doubao can pause >60s between tokens on big generations,
#            and we rely on server-side SSE keepalive to keep the socket warm.
#   write:   cap at 30s for big prompts.
#   pool:    short so contention surfaces instead of queuing silently.
_ARK_TIMEOUT = httpx.Timeout(connect=10.0, read=None, write=30.0, pool=10.0)

# Reusable async client for streaming calls. httpx.AsyncClient holds a
# connection pool, so we create ONE per process to avoid re-doing the TLS
# handshake on every Ark call (a major latency contributor under load).
_ARK_POOL_LIMITS = httpx.Limits(max_keepalive_connections=16, max_connections=32)

_async_client: httpx.AsyncClient | None = None


def _get_async_client() -> httpx.AsyncClient:
    """Lazily create the shared AsyncClient on first use.

    We create lazily so tests and scripts that merely import this module
    don't pay the cost of opening a client they never use.
    """
    global _async_client
    if _async_client is None or _async_client.is_closed:
        _async_client = httpx.AsyncClient(
            timeout=_ARK_TIMEOUT,
            limits=_ARK_POOL_LIMITS,
            http2=False,
        )
    return _async_client


async def aclose_shared_clients() -> None:
    """Gracefully close pooled clients. Call from app shutdown hooks."""
    global _async_client
    if _async_client is not None and not _async_client.is_closed:
        await _async_client.aclose()
    _async_client = None


from apps.api.app.adapters.base import make_envelope
from apps.api.app.core.error_handler import SystemError as APISystemError
from apps.api.app.ports.interfaces import LLMPort
from apps.api.app.schemas.common import SourceRef
from apps.api.app.schemas.diagnosis import DiagnosisRequest, DiagnosisResult
from apps.api.app.schemas.trademark import ApplicationDraftRequest

logger = logging.getLogger(__name__)


def _parse_retry_after(header_value: str | None) -> float | None:
    """Parse the Retry-After header. Ark returns a number of seconds."""
    if not header_value:
        return None
    try:
        return max(0.0, float(header_value.strip()))
    except (TypeError, ValueError):
        return None


def _compute_retry_delay(attempt: int, retry_after: float | None) -> float:
    """Use the server's Retry-After hint when present, otherwise exponential backoff+jitter."""
    if retry_after is not None:
        # Cap Retry-After so we don't block a user request for minutes;
        # but also honor values up to 20s which is typical for Ark RPM windows.
        return min(20.0, max(retry_after, _ARK_BACKOFF_BASE_S))
    return _ARK_BACKOFF_BASE_S * (2 ** attempt) + random.uniform(0, 0.4)


async def _ark_retry_sleep(attempt: int, *, reason: str, retry_after: float | None = None) -> None:
    """Backoff with jitter (or Retry-After hint) before retrying an Ark call."""
    delay = _compute_retry_delay(attempt, retry_after)
    logger.warning(
        "Ark call retrying attempt=%d delay=%.2fs reason=%s retry_after=%s",
        attempt + 1,
        delay,
        reason,
        retry_after,
    )
    await asyncio.sleep(delay)


def _ark_retry_sleep_sync(attempt: int, *, reason: str, retry_after: float | None = None) -> None:
    """Synchronous counterpart of _ark_retry_sleep for the sync chat() path."""
    delay = _compute_retry_delay(attempt, retry_after)
    logger.warning(
        "Ark sync call retrying attempt=%d delay=%.2fs reason=%s retry_after=%s",
        attempt + 1,
        delay,
        reason,
        retry_after,
    )
    time.sleep(delay)


def _ark_open_stream(
    url: str,
    headers: dict[str, str],
    payload: dict[str, Any],
    timeout: httpx.Timeout | None = None,
):
    """Async context manager that yields an httpx streamed response.

    Reuses a module-level AsyncClient (connection pool) to avoid per-call
    TLS handshakes. The request-level timeout can still be overridden via
    the ``timeout`` argument.
    """

    class _Ctx:
        async def __aenter__(self):
            client = _get_async_client()
            try:
                build_kwargs: dict[str, Any] = {"headers": headers, "json": payload}
                if timeout is not None:
                    build_kwargs["timeout"] = timeout
                self._stream = client.stream("POST", url, **build_kwargs)
                self._response = await self._stream.__aenter__()
            except BaseException:
                raise
            return self._response

        async def __aexit__(self, exc_type, exc, tb):
            await self._stream.__aexit__(exc_type, exc, tb)

    return _Ctx()


async def _iter_sse_payloads(response: httpx.Response) -> AsyncGenerator[str, None]:
    """Yield SSE ``data:`` payload strings from an Ark streaming response.

    Uses ``aiter_bytes`` + manual ``\\n\\n`` segmentation because
    ``aiter_lines`` splits on every ``\\n`` — if Ark ever sends a multi-line
    JSON value inside a single ``data:`` field, the line iterator would
    deliver partial JSON that the JSON decoder silently drops. The byte
    buffer approach is resilient to that and to TCP packet boundaries that
    fall mid-line.
    """
    buffer = b""
    async for chunk in response.aiter_bytes():
        if not chunk:
            continue
        buffer += chunk
        # SSE events are terminated by a blank line (``\n\n``). Some
        # producers use CRLF; normalise once up front.
        buffer = buffer.replace(b"\r\n", b"\n")
        while True:
            sep_idx = buffer.find(b"\n\n")
            if sep_idx < 0:
                break
            event_bytes = buffer[:sep_idx]
            buffer = buffer[sep_idx + 2 :]
            try:
                event_text = event_bytes.decode("utf-8", errors="replace")
            except Exception:  # pragma: no cover - defensive
                continue
            data_lines: list[str] = []
            for line in event_text.split("\n"):
                if line.startswith("data:"):
                    # SSE spec: field value starts after the colon; strip
                    # exactly one leading space if present, but accept
                    # producers that omit it (``data:{...}``).
                    val = line[5:]
                    if val.startswith(" "):
                        val = val[1:]
                    data_lines.append(val)
            if data_lines:
                yield "\n".join(data_lines)
    # Flush any trailing partial event that the server closed without a
    # final ``\n\n`` separator (rare but allowed).
    tail = buffer.strip()
    if tail:
        try:
            event_text = tail.decode("utf-8", errors="replace")
        except Exception:  # pragma: no cover
            return
        data_lines = []
        for line in event_text.split("\n"):
            if line.startswith("data:"):
                val = line[5:]
                if val.startswith(" "):
                    val = val[1:]
                data_lines.append(val)
        if data_lines:
            yield "\n".join(data_lines)

# ---------------------------------------------------------------------------
# Hardcoded Doubao (Volcano Ark) connection — do NOT move to env vars.
# 用户显式要求把 Doubao-Seed-2.0-pro 接入信息硬编码到程序里。
# OpenAI-compatible endpoint: POST {DOUBAO_BASE_URL}/chat/completions
# ---------------------------------------------------------------------------
DOUBAO_API_KEY = "7142ce5f-e0c2-4d65-b667-77a13baff76a"
DOUBAO_BASE_URL = "https://ark.cn-beijing.volces.com/api/coding/v3"
DOUBAO_MODEL = "Doubao-Seed-2.0-pro"
DOUBAO_PROVIDER = "doubao"


DIAGNOSE_SYSTEM_PROMPT = """你是A1+ IP顾问。根据用户业务描述输出JSON：{"summary":"一段话","priority_assets":["资产列表"],"risks":["风险"],"next_actions":["行动"],"recommended_track":"trademark|copyright|patent","recommended_trademark_categories":["35","42"]}。商标：9=科技,35=商业,41=教育,42=软件,43=餐饮,44=医疗。"""

DIAGNOSE_USER_TEMPLATE = "公司：{business_name}，业务：{business_description}，行业：{industry}，阶段：{stage}。输出JSON。"


def _render_knowledge_snippets(knowledge: dict | None, max_items: int = 6) -> str:
    """Collapse the knowledgeBase envelope into a compact prompt snippet.

    We only keep short bullet-style pointers so the diagnosis prompt stays
    well below the model's context window. Titles + notes are enough to nudge
    the LLM toward real CNIPA/商标分类 vocabulary without dumping the whole
    knowledge base.
    """
    if not knowledge:
        return ""
    payload = knowledge.get("normalizedPayload") or knowledge.get("normalized_payload") or knowledge
    if not isinstance(payload, dict):
        return ""
    items = payload.get("items") or []
    if not items:
        return ""
    lines: list[str] = []
    for item in items[:max_items]:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        note = str(item.get("kind") or item.get("priority") or "").strip()
        if note:
            lines.append(f"- {title}（{note}）")
        else:
            lines.append(f"- {title}")
    if not lines:
        return ""
    return "参考知识库要点：\n" + "\n".join(lines)

APPLICATION_SUMMARY_SYSTEM_PROMPT = """你是 A1+ IP Coworker 的申请书摘要助手。根据用户填写的商标申请信息，生成结构化的申请书摘要。

请输出 JSON 格式：
- summary: 一段话概述本次商标申请
- highlights: 字符串数组，列出申请书的要点

重要提醒：所有内容仅供参考，以官方为准。"""

APPLICATION_SUMMARY_USER_TEMPLATE = """为以下商标申请生成摘要：

商标名称：{trademark_name}
申请人：{applicant_name}
申请类别：{categories}
风险等级：{risk_level}
业务描述：{business_description}

请严格以 JSON 格式输出。"""


class _LLMClient:
    def __init__(self, provider: str, api_key: str, base_url: str, model: str):
        self.provider = provider
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model

    def chat(self, system_prompt: str, user_prompt: str) -> str:
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.3,
            "max_tokens": 2048,
        }
        # Sync path: generous read timeout (Ark can spend a while on a full
        # non-streaming answer), but short connect so transient DNS/TLS
        # blips surface quickly and get retried below.
        timeout = httpx.Timeout(connect=10.0, read=120.0, write=30.0, pool=10.0)
        attempt = 0
        # Fresh client per call is fine for the sync path: sync endpoints
        # are request/response and not worth the complexity of pooling.
        with httpx.Client(timeout=timeout) as client:
            while True:
                try:
                    response = client.post(url, headers=headers, json=payload)
                except _ARK_PRESTREAM_RETRY_EXCEPTIONS as exc:
                    if attempt >= _ARK_MAX_RETRIES:
                        raise
                    _ark_retry_sleep_sync(attempt, reason=f"{type(exc).__name__}: {exc}")
                    attempt += 1
                    continue
                status = response.status_code
                if status in _ARK_RETRY_STATUS_CODES and attempt < _ARK_MAX_RETRIES:
                    retry_after = _parse_retry_after(response.headers.get("Retry-After"))
                    logger.warning(
                        "ark.sync.retry_status status=%s attempt=%d body_preview=%s",
                        status,
                        attempt,
                        response.text[:200] if response.content else "",
                    )
                    _ark_retry_sleep_sync(attempt, reason=f"HTTP {status}", retry_after=retry_after)
                    attempt += 1
                    continue
                response.raise_for_status()
                try:
                    data = response.json()
                except json.JSONDecodeError as exc:
                    raise APISystemError(
                        message="LLM returned non-JSON response",
                        error_location="llm.chat",
                    ) from exc
                # Guard every hop: some provider errors arrive with HTTP 200
                # and a body like {"error": {...}} and no ``choices`` array.
                choices = (data or {}).get("choices") or []
                if not choices:
                    preview = json.dumps(data, ensure_ascii=False)[:200] if isinstance(data, dict) else str(data)[:200]
                    logger.warning("ark.sync.empty_choices body_preview=%s", preview)
                    raise APISystemError(
                        message="LLM returned empty choices",
                        error_location="llm.chat",
                    )
                first = choices[0] or {}
                msg = first.get("message") or {}
                content = msg.get("content")
                if content is None or (isinstance(content, str) and not content.strip()):
                    raise APISystemError(
                        message="LLM returned empty content",
                        error_location="llm.chat",
                    )
                return content

    async def chat_stream(self, system_prompt: str, user_prompt: str) -> AsyncGenerator[str, None]:
        """Stream chat completion tokens from the LLM API."""
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.3,
            "max_tokens": 2048,
            "stream": True,
        }
        attempt = 0
        emitted_any = False
        parse_warned = False
        while True:
            try:
                async with _ark_open_stream(url, headers, payload) as response:
                    status = response.status_code
                    if (
                        status in _ARK_RETRY_STATUS_CODES
                        and attempt < _ARK_MAX_RETRIES
                        and not emitted_any
                    ):
                        retry_after = _parse_retry_after(response.headers.get("Retry-After"))
                        await _ark_retry_sleep(attempt, reason=f"HTTP {status}", retry_after=retry_after)
                        attempt += 1
                        continue
                    response.raise_for_status()
                    async for data_str in _iter_sse_payloads(response):
                        if data_str == "[DONE]":
                            return
                        try:
                            chunk = json.loads(data_str)
                            choices = chunk.get("choices") or []
                            if not choices:
                                continue
                            delta = (choices[0] or {}).get("delta", {}) or {}
                            content = delta.get("content")
                            if content:
                                emitted_any = True
                                yield content
                        except (json.JSONDecodeError, IndexError, KeyError) as exc:
                            # Log once per stream to avoid flooding, but make
                            # sure we never silently drop payloads without a
                            # trace — that was masking real format drift.
                            if not parse_warned:
                                logger.warning(
                                    "ark.stream.parse_failed type=%s preview=%r",
                                    type(exc).__name__,
                                    data_str[:120],
                                )
                                parse_warned = True
                            continue
                    return
            except _ARK_PRESTREAM_RETRY_EXCEPTIONS as exc:
                # Only safe to retry if we haven't yielded any token yet —
                # otherwise the user would see duplicated output.
                if emitted_any or attempt >= _ARK_MAX_RETRIES:
                    raise
                await _ark_retry_sleep(attempt, reason=f"{type(exc).__name__}: {exc}")
                attempt += 1

    async def multi_turn_chat(
        self,
        messages: list[dict],
        tools: list[dict] | None,
    ) -> AsyncGenerator[dict, None]:
        """Stream multi-turn chat with function calling support."""
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.3,
            "max_tokens": 2048,
            "stream": True,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        accumulated_tool_calls: dict[int, dict] = {}
        finish_reason = None

        attempt = 0
        streamed_any = False
        parse_warned = False
        while True:
            try:
                async with _ark_open_stream(url, headers, payload) as response:
                    status = response.status_code
                    if (
                        status in _ARK_RETRY_STATUS_CODES
                        and attempt < _ARK_MAX_RETRIES
                        and not streamed_any
                    ):
                        retry_after = _parse_retry_after(response.headers.get("Retry-After"))
                        await _ark_retry_sleep(attempt, reason=f"HTTP {status}", retry_after=retry_after)
                        attempt += 1
                        continue
                    response.raise_for_status()
                    async for data_str in _iter_sse_payloads(response):
                        if data_str == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            choices = chunk.get("choices") or []
                            if not choices:
                                continue
                            choice = choices[0] or {}
                            delta = choice.get("delta", {}) or {}
                            finish_reason = choice.get("finish_reason") or finish_reason

                            for tc in delta.get("tool_calls", []) or []:
                                idx = tc.get("index", 0)
                                if idx not in accumulated_tool_calls:
                                    accumulated_tool_calls[idx] = {"name": "", "arguments": ""}
                                fn = tc.get("function", {}) or {}
                                if fn.get("name"):
                                    accumulated_tool_calls[idx]["name"] = fn["name"]
                                accumulated_tool_calls[idx]["arguments"] += fn.get("arguments", "")

                            content = delta.get("content")
                            if content:
                                streamed_any = True
                                yield {"type": "token", "content": content}
                        except (json.JSONDecodeError, IndexError, KeyError) as exc:
                            if not parse_warned:
                                logger.warning(
                                    "ark.multi_turn.parse_failed type=%s preview=%r",
                                    type(exc).__name__,
                                    data_str[:120],
                                )
                                parse_warned = True
                            continue
                    break
            except _ARK_PRESTREAM_RETRY_EXCEPTIONS as exc:
                if attempt >= _ARK_MAX_RETRIES or streamed_any:
                    raise
                await _ark_retry_sleep(attempt, reason=f"{type(exc).__name__}: {exc}")
                attempt += 1

        if finish_reason == "tool_calls" and accumulated_tool_calls:
            for idx in sorted(accumulated_tool_calls.keys()):
                tc = accumulated_tool_calls[idx]
                tool_name = tc.get("name") or "<unknown>"
                try:
                    args = json.loads(tc["arguments"]) if tc["arguments"] else {}
                except json.JSONDecodeError as exc:
                    # Silently coercing to ``{}`` made the model "call" a
                    # tool with no arguments, which then succeeded with
                    # nonsense or failed opaquely. Surface explicitly so
                    # chat_service can forward an `error` SSE and stop.
                    logger.warning(
                        "ark.tool_call.args_invalid tool=%s err=%s args_preview=%r",
                        tool_name,
                        exc,
                        (tc.get("arguments") or "")[:200],
                    )
                    yield {
                        "type": "error",
                        "message": f"工具参数解析失败：{tool_name}",
                        "errorLocation": "llm.multi_turn_chat.tool_args",
                    }
                    return
                yield {"type": "tool_call", "name": tool_name, "args": args}

        yield {"type": "done"}


def _build_client() -> _LLMClient:
    return _LLMClient(
        provider=DOUBAO_PROVIDER,
        api_key=DOUBAO_API_KEY,
        base_url=DOUBAO_BASE_URL,
        model=DOUBAO_MODEL,
    )


def _find_balanced_json(text: str, start_idx: int) -> int:
    """Return end index (inclusive) of balanced JSON object starting at text[start_idx]='{', or -1."""
    depth = 0
    in_string = False
    escape = False
    for i in range(start_idx, len(text)):
        c = text[i]
        if escape:
            escape = False
            continue
        if c == "\\":
            escape = True
            continue
        if c == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return i
    return -1


def _repair_llm_json(s: str) -> str:
    """Repair common LLM JSON issues: missing commas between adjacent values."""
    # Missing comma between '"value"' and next '"key"' on same or next token: "..."  "..."
    s = re.sub(r'("(?:[^"\\]|\\.)*")(\s*)("(?:[^"\\]|\\.)*"\s*:)', r"\1,\2\3", s)
    # Missing comma between '}' or ']' and next '"key"'
    s = re.sub(r'([}\]])(\s*)("(?:[^"\\]|\\.)*"\s*:)', r"\1,\2\3", s)
    # Missing comma between '"value"' and next '{' or '['
    s = re.sub(r'("(?:[^"\\]|\\.)*")(\s*)([\[{])', r"\1,\2\3", s)
    # Trailing commas before } or ]
    s = re.sub(r",(\s*[}\]])", r"\1", s)
    return s


def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()

    start = text.find("{")
    end = text.rfind("}")
    candidate = text[start : end + 1] if start != -1 and end != -1 else text

    # Tier 1: direct parse (fast path)
    try:
        return json.loads(candidate)
    except json.JSONDecodeError as exc_direct:
        first_err = exc_direct

    # Tier 2: balanced-brace extraction (handles stray trailing prose after valid object)
    if start != -1:
        bal_end = _find_balanced_json(text, start)
        if bal_end != -1:
            try:
                return json.loads(text[start : bal_end + 1])
            except json.JSONDecodeError:
                pass

    # Tier 3: raw_decode — longest valid JSON prefix
    if start != -1:
        try:
            obj, _consumed = json.JSONDecoder().raw_decode(text[start:])
            if isinstance(obj, dict):
                logger.debug(
                    "llm.extract_json.raw_decode_recovered first_error=%s consumed=%d",
                    repr(first_err)[:200],
                    _consumed,
                )
                return obj
        except json.JSONDecodeError:
            pass

    # Tier 4: repair common LLM malformations, then parse
    repaired = _repair_llm_json(candidate)
    try:
        obj = json.loads(repaired)
        logger.debug(
            "llm.extract_json.repair_recovered candidate_len=%d repaired_len=%d",
            len(candidate),
            len(repaired),
        )
        return obj
    except json.JSONDecodeError:
        pass

    # Give up: raise the original error so upstream instrumentation sees the real failure
    raise first_err


class RealLlmAdapter(LLMPort):
    port_name = "llm"
    provider_name = DOUBAO_PROVIDER
    mode = "real"

    def __init__(self) -> None:
        self._client = _build_client()

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def diagnose(self, payload: DiagnosisRequest, knowledge: dict, trace_id: str):
        base_prompt = DIAGNOSE_USER_TEMPLATE.format(
            business_name=payload.business_name or "未提供",
            business_description=payload.business_description,
            industry=payload.industry or "未提供",
            stage=payload.stage or "未提供",
        )
        kb_snippet = _render_knowledge_snippets(knowledge)
        user_prompt = f"{base_prompt}\n\n{kb_snippet}" if kb_snippet else base_prompt

        logger.debug("llm.diagnose.entry trace_id=%s", trace_id)
        try:
            raw = self._client.chat(DIAGNOSE_SYSTEM_PROMPT, user_prompt)
            parsed = _extract_json(raw)
        except Exception as exc:
            _status = getattr(getattr(exc, "response", None), "status_code", None)
            _body_preview = ""
            if isinstance(exc, httpx.HTTPStatusError):
                try:
                    _body_preview = exc.response.text[:400]
                except Exception:
                    pass
            logger.exception(
                "llm.diagnose.failed trace_id=%s status=%s body=%s",
                trace_id,
                _status,
                _body_preview,
            )
            raise APISystemError(
                message=f"AI 诊断服务调用失败：{exc}",
                error_location="llm.diagnose",
            ) from exc

        result = DiagnosisResult(
            summary=parsed.get("summary", ""),
            priority_assets=parsed.get("priority_assets", []),
            risks=parsed.get("risks", []),
            next_actions=parsed.get("next_actions", []),
            recommended_track=parsed.get("recommended_track", "trademark"),
            recommended_trademark_categories=parsed.get(
                "recommended_trademark_categories", ["35"]
            ),
        )
        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[
                SourceRef(
                    title=f"LLM ({self.provider_name})",
                    note=f"模型 {self._client.model}",
                )
            ],
            disclaimer="诊断结果由 AI 生成，仅供参考，以官方为准。",
            normalized_payload=result,
        )

    def summarize_application(self, payload: ApplicationDraftRequest, trace_id: str):
        user_prompt = APPLICATION_SUMMARY_USER_TEMPLATE.format(
            trademark_name=payload.trademark_name,
            applicant_name=payload.applicant_name,
            categories=", ".join(payload.categories),
            risk_level=payload.risk_level,
            business_description=payload.business_description,
        )

        try:
            raw = self._client.chat(APPLICATION_SUMMARY_SYSTEM_PROMPT, user_prompt)
            parsed = _extract_json(raw)
        except Exception as exc:
            logger.exception("LLM summarize failed: %s", exc)
            raise APISystemError(
                message=f"AI 申请书摘要服务调用失败：{exc}",
                error_location="llm.summarize_application",
            ) from exc

        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[
                SourceRef(
                    title=f"LLM ({self.provider_name})",
                    note=f"模型 {self._client.model}",
                )
            ],
            disclaimer="申请书摘要由 AI 生成，仅供参考，以官方为准。",
            normalized_payload={
                "summary": parsed.get("summary", ""),
                "highlights": parsed.get("highlights", []),
            },
        )

    def analyze_text(self, system_prompt: str, user_prompt: str, trace_id: str):
        try:
            raw = self._client.chat(system_prompt, user_prompt)
        except Exception as exc:
            logger.exception("LLM analyze_text failed: %s", exc)
            raise APISystemError(
                message=f"AI 文本分析服务调用失败：{exc}",
                error_location="llm.analyze_text",
            ) from exc

        try:
            parsed = _extract_json(raw)
        except (json.JSONDecodeError, ValueError):
            parsed = {"analysis": raw}

        return make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[
                SourceRef(
                    title=f"LLM ({self.provider_name})",
                    note=f"模型 {self._client.model}",
                )
            ],
            disclaimer="分析结果由 AI 生成，仅供参考。",
            normalized_payload=parsed,
        )

    async def diagnose_stream(
        self,
        payload: DiagnosisRequest,
        knowledge: dict[str, Any],
        trace_id: str,
    ) -> AsyncGenerator[str, None]:
        from apps.api.app.core.streaming import sse_event

        base_prompt = DIAGNOSE_USER_TEMPLATE.format(
            business_name=payload.business_name or "未提供",
            business_description=payload.business_description,
            industry=payload.industry or "未提供",
            stage=payload.stage or "未提供",
        )
        kb_snippet = _render_knowledge_snippets(knowledge)
        user_prompt = f"{base_prompt}\n\n{kb_snippet}" if kb_snippet else base_prompt

        yield sse_event("meta", {"traceId": trace_id, "provider": self.provider_name, "mode": self.mode})

        accumulated = ""
        try:
            async for token in self._client.chat_stream(DIAGNOSE_SYSTEM_PROMPT, user_prompt):
                accumulated += token
                yield sse_event("token", {"content": token})

            parsed = _extract_json(accumulated)
        except Exception as exc:
            _status = getattr(getattr(exc, "response", None), "status_code", None)
            _body_preview = ""
            if isinstance(exc, httpx.HTTPStatusError):
                try:
                    _body_preview = exc.response.text[:400]
                except Exception:
                    pass
            _err_pos = None
            if isinstance(exc, json.JSONDecodeError):
                _err_pos = getattr(exc, "pos", None)
            logger.exception(
                "llm.diagnose_stream.failed trace_id=%s status=%s accumulated_len=%d json_err_pos=%s body=%s",
                trace_id,
                _status,
                len(accumulated),
                _err_pos,
                _body_preview,
            )
            yield sse_event(
                "error",
                {
                    "message": f"AI 诊断服务调用失败：{exc}",
                    "errorLocation": "llm.diagnose_stream",
                    "traceId": trace_id,
                },
            )
            return

        result = DiagnosisResult(
            summary=parsed.get("summary", ""),
            priority_assets=parsed.get("priority_assets", []),
            risks=parsed.get("risks", []),
            next_actions=parsed.get("next_actions", []),
            recommended_track=parsed.get("recommended_track", "trademark"),
            recommended_trademark_categories=parsed.get("recommended_trademark_categories", ["35"]),
        )
        envelope = make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title=f"LLM ({self.provider_name})", note=f"模型 {self._client.model}")],
            disclaimer="诊断结果由 AI 生成，仅供参考，以官方为准。",
            normalized_payload=result,
        )
        yield sse_event("result", envelope.model_dump(by_alias=True))

    async def summarize_application_stream(
        self,
        payload: ApplicationDraftRequest,
        trace_id: str,
    ) -> AsyncGenerator[str, None]:
        from apps.api.app.core.streaming import sse_event

        user_prompt = APPLICATION_SUMMARY_USER_TEMPLATE.format(
            trademark_name=payload.trademark_name,
            applicant_name=payload.applicant_name,
            categories=", ".join(payload.categories),
            risk_level=payload.risk_level,
            business_description=payload.business_description,
        )

        yield sse_event("meta", {"traceId": trace_id, "provider": self.provider_name, "mode": self.mode})

        accumulated = ""
        try:
            async for token in self._client.chat_stream(APPLICATION_SUMMARY_SYSTEM_PROMPT, user_prompt):
                accumulated += token
                yield sse_event("token", {"content": token})

            parsed = _extract_json(accumulated)
        except Exception as exc:
            logger.exception("LLM summarize_stream failed: %s", exc)
            yield sse_event(
                "error",
                {
                    "message": f"AI 申请书摘要服务调用失败：{exc}",
                    "errorLocation": "llm.summarize_application_stream",
                    "traceId": trace_id,
                },
            )
            return

        envelope = make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title=f"LLM ({self.provider_name})", note=f"模型 {self._client.model}")],
            disclaimer="申请书摘要由 AI 生成，仅供参考，以官方为准。",
            normalized_payload={"summary": parsed.get("summary", ""), "highlights": parsed.get("highlights", [])},
        )
        yield sse_event("result", envelope.model_dump(by_alias=True))

    async def analyze_text_stream(
        self,
        system_prompt: str,
        user_prompt: str,
        trace_id: str,
    ) -> AsyncGenerator[str, None]:
        from apps.api.app.core.streaming import sse_event

        yield sse_event("meta", {"traceId": trace_id, "provider": self.provider_name, "mode": self.mode})

        accumulated = ""
        try:
            async for token in self._client.chat_stream(system_prompt, user_prompt):
                accumulated += token
                yield sse_event("token", {"content": token})
        except Exception as exc:
            logger.exception("LLM analyze_text_stream failed: %s", exc)
            yield sse_event(
                "error",
                {
                    "message": f"AI 文本分析服务调用失败：{exc}",
                    "errorLocation": "llm.analyze_text_stream",
                    "traceId": trace_id,
                },
            )
            return

        try:
            parsed = _extract_json(accumulated)
        except (json.JSONDecodeError, ValueError):
            parsed = {"analysis": accumulated}

        envelope = make_envelope(
            mode=self.mode,
            provider=self.provider_name,
            trace_id=trace_id,
            source_refs=[SourceRef(title=f"LLM ({self.provider_name})", note=f"模型 {self._client.model}")],
            disclaimer="分析结果由 AI 生成，仅供参考。",
            normalized_payload=parsed,
        )
        yield sse_event("result", envelope.model_dump(by_alias=True))

    async def multi_turn_stream(
        self,
        messages: list[dict[str, str]],
        tools: list[dict],
        system_prompt: str,
        trace_id: str,
    ) -> AsyncGenerator[dict, None]:
        yield {"type": "meta", "provider": self.provider_name, "mode": self.mode, "traceId": trace_id}

        full_messages = [{"role": "system", "content": system_prompt}] + messages
        try:
            async for event in self._client.multi_turn_chat(full_messages, tools):
                yield event
        except Exception as exc:
            _status = getattr(getattr(exc, "response", None), "status_code", None)
            logger.exception(
                "llm.multi_turn_stream.failed trace_id=%s status=%s", trace_id, _status
            )
            # Do NOT emit a trailing ``done`` after an ``error`` — callers
            # (chat_service.run_chat_stream) rely on ``error`` as the
            # terminal event so they can forward it verbatim and stop.
            yield {
                "type": "error",
                "message": f"AI 多轮对话服务调用失败：{exc}",
                "errorLocation": "llm.multi_turn_stream",
                "traceId": trace_id,
            }
