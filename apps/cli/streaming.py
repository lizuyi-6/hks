"""SSE consumption helpers shared by JSON-mode (`main.py`) and REPL-mode (`repl.py`).

Two consumption modes:

- `collect_sse(...)`: drain the stream and return the full aggregate as a dict.
  Used by the `chat` subcommand to produce agent-friendly JSON.
- `stream_sse_to_console(...)`: render tokens live with Rich, print action
  panels inline, and return the accumulated reply text. Used by the REPL.

The backend SSE event schema (from `apps/api/app/api/routes/chat.py` +
`apps/api/app/services/chat_service.py`) is:

    event: meta        data: {...}
    event: token       data: {"content": "..."}
    event: action_start  data: {"action": "...", ...}
    event: action_result data: {"action": "...", "ok": true, ...}
    event: done        data: {"followUp": [...], "disclaimer": "..."}
    event: error       data: {"code": "...", "message": "..."}
"""
from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncIterator

import httpx


async def _iter_sse_events(
    api_url: str,
    headers: dict,
    body: dict,
    path: str = "/chat/stream",
    timeout: float = 120.0,
) -> AsyncIterator[tuple[str, dict]]:
    """Low-level SSE reader. Yields `(event_type, data_dict)` pairs.

    Raises `httpx.HTTPStatusError` on non-2xx responses (except 401 which is
    yielded as a synthetic `("error", {...})` so callers can render it).
    """
    async with httpx.AsyncClient(timeout=httpx.Timeout(timeout)) as client:
        async with client.stream("POST", f"{api_url}{path}", headers=headers, json=body) as resp:
            if resp.status_code == 401:
                yield "error", {"code": "UNAUTHORIZED", "message": "Token expired or invalid"}
                return
            resp.raise_for_status()

            pending_event_type: str | None = None
            async for line in resp.aiter_lines():
                line = line.strip()
                if not line:
                    pending_event_type = None
                    continue
                if line.startswith("event: "):
                    pending_event_type = line[7:].strip()
                    continue
                if line.startswith("data: ") and pending_event_type:
                    try:
                        data = json.loads(line[6:])
                    except json.JSONDecodeError:
                        data = {}
                    etype = pending_event_type
                    pending_event_type = None
                    yield etype, data


async def _collect_sse_async(api_url: str, headers: dict, body: dict) -> dict:
    accumulated_text = ""
    actions: list[dict] = []
    follow_ups: list[str] = []
    disclaimer = ""
    meta: dict = {}

    async for etype, data in _iter_sse_events(api_url, headers, body):
        if etype == "meta":
            meta = data
        elif etype == "token":
            accumulated_text += data.get("content", "")
        elif etype == "action_start":
            actions.append({"phase": "start", **data})
        elif etype == "action_result":
            actions.append({"phase": "result", **data})
        elif etype == "done":
            follow_ups = data.get("followUp", [])
            disclaimer = data.get("disclaimer", "")
        elif etype == "error":
            # Surface auth / transport errors without throwing: let the CLI
            # render them as a regular result envelope.
            if data.get("code") == "UNAUTHORIZED":
                return {"error": True, **data}
            actions.append({"phase": "error", **data})

    return {
        "reply": accumulated_text,
        "actions": actions,
        "followUps": follow_ups,
        "disclaimer": disclaimer,
        "meta": meta,
    }


def collect_sse(api_url: str, headers: dict, body: dict) -> dict:
    """Sync wrapper around `_collect_sse_async`. Preserves `_collect_sse` shape."""
    return asyncio.run(_collect_sse_async(api_url, headers, body))


def stream_sse_to_console(
    api_url: str,
    headers: dict,
    body: dict,
    console: Any,
) -> dict:
    """Stream chat SSE and render it live with Rich.

    Returns the same shape as `collect_sse()` so the REPL can append the
    assistant reply to its local history.
    """
    from rich.live import Live
    from rich.markdown import Markdown
    from rich.panel import Panel
    from rich.text import Text

    accumulated_text = ""
    actions: list[dict] = []
    follow_ups: list[str] = []
    disclaimer = ""
    meta: dict = {}

    async def _run() -> None:
        nonlocal accumulated_text, actions, follow_ups, disclaimer, meta

        with Live(
            Markdown(""),
            console=console,
            refresh_per_second=12,
            vertical_overflow="visible",
        ) as live:
            async for etype, data in _iter_sse_events(api_url, headers, body):
                if etype == "meta":
                    meta = data
                elif etype == "token":
                    accumulated_text += data.get("content", "")
                    live.update(Markdown(accumulated_text or "…"))
                elif etype == "action_start":
                    actions.append({"phase": "start", **data})
                    action_name = data.get("action") or data.get("name") or "action"
                    live.console.print(
                        Panel(
                            Text(f"▶ {action_name}", style="cyan"),
                            border_style="cyan",
                            expand=False,
                        )
                    )
                elif etype == "action_result":
                    actions.append({"phase": "result", **data})
                    action_name = data.get("action") or data.get("name") or "action"
                    ok = data.get("ok", True)
                    style = "green" if ok else "red"
                    glyph = "✓" if ok else "✗"
                    summary = data.get("summary") or data.get("message") or ""
                    label = f"{glyph} {action_name}"
                    if summary:
                        label += f" · {summary}"
                    live.console.print(
                        Panel(Text(label, style=style), border_style=style, expand=False)
                    )
                elif etype == "done":
                    follow_ups = data.get("followUp", [])
                    disclaimer = data.get("disclaimer", "")
                elif etype == "error":
                    actions.append({"phase": "error", **data})
                    live.console.print(
                        Panel(
                            Text(
                                f"✗ {data.get('code', 'ERROR')}: {data.get('message', '')}",
                                style="red",
                            ),
                            border_style="red",
                            expand=False,
                        )
                    )

    asyncio.run(_run())

    if follow_ups:
        from rich.panel import Panel
        from rich.text import Text

        body_text = Text()
        for idx, item in enumerate(follow_ups, start=1):
            if idx > 1:
                body_text.append("\n")
            body_text.append(f"{idx}. ", style="bold")
            body_text.append(str(item))
        console.print(Panel(body_text, title="建议 · 下一步", border_style="yellow", expand=False))

    if disclaimer:
        console.print(f"[dim]{disclaimer}[/dim]")

    return {
        "reply": accumulated_text,
        "actions": actions,
        "followUps": follow_ups,
        "disclaimer": disclaimer,
        "meta": meta,
    }
