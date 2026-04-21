"""Interactive Agent REPL for A1+ IP Coworker.

Entry point: `python -m apps.cli` with a TTY, or `python -m apps.cli repl`.

Loop:
  1. Prompt with prompt_toolkit (arrow-key history, Ctrl+C tolerant).
  2. If input starts with `/`, dispatch via `slash.dispatch`.
  3. Otherwise, POST to `/chat/stream` and render SSE tokens live with Rich,
     then append {user, assistant} to the local history.
"""
from __future__ import annotations

import sys
import uuid

from apps.cli import config as cli_config
from apps.cli import slash
from apps.cli.streaming import stream_sse_to_console


def _banner(console, ctx: slash.Ctx) -> None:
    from rich.panel import Panel
    from rich.text import Text

    who = ctx.email or "anonymous"
    token_state = "[green]token OK[/green]" if ctx.token else "[yellow]no token[/yellow]"
    body = Text.from_markup(
        f"[bold]A1+ IP Coworker[/bold] · [dim]session[/dim] {ctx.session_id}\n"
        f"[dim]user[/dim] {who}  ·  [dim]api[/dim] {ctx.api_url}  ·  {token_state}\n"
        f"Type [cyan]/help[/cyan] for commands, [cyan]/exit[/cyan] or Ctrl-D to quit."
    )
    console.print(Panel(body, border_style="magenta", expand=False))


def run(api_url: str, token: str | None) -> int:
    """Start the REPL. Returns a process exit code."""
    try:
        from prompt_toolkit import PromptSession
        from prompt_toolkit.history import FileHistory
        from rich.console import Console
    except ImportError as exc:
        sys.stderr.write(
            f"REPL requires extra deps ({exc}). Run: pip install rich prompt_toolkit\n"
        )
        return 2

    console = Console()

    stored = cli_config.load()
    email = stored.get("email") if token == stored.get("token") else None

    session_id = stored.get("last_session_id") or f"cli-{uuid.uuid4().hex[:8]}"

    ctx = slash.Ctx(
        console=console,
        api_url=api_url,
        token=token,
        email=email,
        session_id=session_id,
        messages=[],
    )
    ctx._registry = slash.build_registry()

    history_path = cli_config.config_dir() / "repl_history"
    history_path.parent.mkdir(parents=True, exist_ok=True)
    prompt_session = PromptSession(history=FileHistory(str(history_path)))

    _banner(console, ctx)

    while not ctx.should_exit:
        try:
            line = prompt_session.prompt("\n❯ ")
        except (EOFError, KeyboardInterrupt):
            console.print()
            break
        line = line.strip()
        if not line:
            continue

        if line.startswith("/"):
            slash.dispatch(line, ctx)
            continue

        if not ctx.token:
            console.print(
                "[red]Not logged in.[/red] Use [cyan]/login <email> <password>[/cyan] "
                "or set [cyan]A1PLUS_TOKEN[/cyan]."
            )
            continue

        body = {
            "message": line,
            "history": list(ctx.messages),
            "context": {},
            "sessionId": ctx.session_id,
        }
        headers = {
            "Authorization": f"Bearer {ctx.token}",
            "Content-Type": "application/json",
        }

        try:
            result = stream_sse_to_console(ctx.api_url, headers, body, console)
        except KeyboardInterrupt:
            console.print("[yellow]…generation interrupted[/yellow]")
            continue
        except Exception as exc:  # noqa: BLE001 — REPL must survive network errors
            console.print(f"[red]Chat error:[/red] {exc}")
            continue

        if result.get("error"):
            console.print(
                f"[red]{result.get('code', 'ERROR')}[/red]: {result.get('message', '')}"
            )
            continue

        ctx.messages.append({"role": "user", "content": line})
        reply = result.get("reply") or ""
        if reply:
            ctx.messages.append({"role": "assistant", "content": reply})

    cli_config.update(last_session_id=ctx.session_id)
    return 0
