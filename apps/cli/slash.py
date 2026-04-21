"""Slash command parser and registry for the REPL.

A slash command has the form `/name [args...]`. Arguments are split using
`shlex` so quoted values containing spaces or JSON literals are preserved.

Each handler receives `(ctx, argv)`:
  - `ctx` is the live REPL context (see `repl.Ctx`).
  - `argv` is the list of raw string tokens after the command name.

Handlers must *never* raise `SystemExit` — they render errors to `ctx.console`
and return so the REPL can keep going.
"""
from __future__ import annotations

import json
import shlex
from dataclasses import dataclass, field
from typing import Any, Callable

import httpx

from apps.cli import config as cli_config


@dataclass
class Ctx:
    """Mutable REPL state passed to every slash handler."""

    console: Any
    api_url: str
    token: str | None
    email: str | None
    session_id: str
    messages: list[dict]
    should_exit: bool = False
    _registry: dict[str, "SlashCommand"] = field(default_factory=dict)


@dataclass
class SlashCommand:
    name: str
    handler: Callable[[Ctx, list[str]], None]
    help: str
    aliases: tuple[str, ...] = ()


def parse(line: str) -> tuple[str, list[str]] | None:
    """Parse a slash line. Returns `(name, argv)` or None for non-slash input."""
    stripped = line.strip()
    if not stripped.startswith("/"):
        return None
    body = stripped[1:].strip()
    if not body:
        return "", []
    try:
        tokens = shlex.split(body, posix=True)
    except ValueError:
        tokens = body.split()
    if not tokens:
        return "", []
    return tokens[0], tokens[1:]


def dispatch(line: str, ctx: Ctx) -> bool:
    """Parse `line` and invoke the matching handler. Returns True if handled."""
    parsed = parse(line)
    if parsed is None:
        return False
    name, argv = parsed
    if not name:
        ctx.console.print("[yellow]Empty slash command. Try /help.[/yellow]")
        return True
    cmd = ctx._registry.get(name.lower())
    if not cmd:
        ctx.console.print(f"[red]Unknown command:[/red] /{name}. Try [cyan]/help[/cyan].")
        return True
    try:
        cmd.handler(ctx, argv)
    except KeyboardInterrupt:
        ctx.console.print("[yellow]…interrupted[/yellow]")
    except httpx.HTTPError as exc:
        ctx.console.print(f"[red]HTTP error:[/red] {exc}")
    except Exception as exc:  # noqa: BLE001 — REPL must survive handler crashes
        ctx.console.print(f"[red]Handler error:[/red] {exc}")
    return True


def _kv_args(argv: list[str], spec: dict[str, str]) -> dict[str, str]:
    """Parse `--flag value` pairs. `spec` maps flag -> dest key.

    Unknown flags raise ValueError so the REPL surfaces a helpful error.
    """
    out: dict[str, str] = {}
    i = 0
    while i < len(argv):
        tok = argv[i]
        if tok.startswith("--"):
            dest = spec.get(tok)
            if dest is None:
                raise ValueError(f"unknown flag {tok}. Expected one of: {', '.join(spec)}")
            if i + 1 >= len(argv):
                raise ValueError(f"{tok} requires a value")
            out[dest] = argv[i + 1]
            i += 2
        else:
            raise ValueError(f"unexpected positional argument: {tok!r}")
    return out


def _require_token(ctx: Ctx) -> bool:
    if not ctx.token:
        ctx.console.print(
            "[red]Not logged in.[/red] Use [cyan]/login <email> <password>[/cyan] or "
            "set the [cyan]A1PLUS_TOKEN[/cyan] env var."
        )
        return False
    return True


def _headers(ctx: Ctx) -> dict[str, str]:
    return {"Authorization": f"Bearer {ctx.token}", "Content-Type": "application/json"}


def _render_json(ctx: Ctx, title: str, payload: Any) -> None:
    from rich.panel import Panel
    from rich.syntax import Syntax

    text = json.dumps(payload, ensure_ascii=False, indent=2)
    ctx.console.print(
        Panel(
            Syntax(text, "json", theme="ansi_dark", word_wrap=True),
            title=title,
            border_style="blue",
            expand=False,
        )
    )


def _render_http_result(ctx: Ctx, title: str, resp: httpx.Response) -> None:
    if resp.status_code >= 400:
        try:
            body = resp.json()
        except Exception:
            body = {"detail": resp.text}
        ctx.console.print(
            f"[red]HTTP {resp.status_code}[/red]: "
            f"{body.get('detail') if isinstance(body, dict) else body}"
        )
        return
    try:
        payload = resp.json()
    except Exception:
        ctx.console.print(resp.text)
        return
    _render_json(ctx, title, payload)


# ─── Handlers ───────────────────────────────────────────────────────────────


def _cmd_help(ctx: Ctx, argv: list[str]) -> None:
    from rich.table import Table

    table = Table(title="Slash commands", show_lines=False, header_style="bold cyan")
    table.add_column("Command")
    table.add_column("Description")

    seen: set[str] = set()
    for cmd in ctx._registry.values():
        if cmd.name in seen:
            continue
        seen.add(cmd.name)
        label = f"/{cmd.name}"
        if cmd.aliases:
            label += " (" + ", ".join(f"/{a}" for a in cmd.aliases) + ")"
        table.add_row(label, cmd.help)
    ctx.console.print(table)


def _cmd_exit(ctx: Ctx, argv: list[str]) -> None:
    ctx.should_exit = True
    ctx.console.print("[dim]Bye.[/dim]")


def _cmd_clear(ctx: Ctx, argv: list[str]) -> None:
    ctx.messages.clear()
    ctx.console.print("[dim]Conversation history cleared.[/dim]")


def _cmd_reset_session(ctx: Ctx, argv: list[str]) -> None:
    import uuid

    ctx.session_id = f"cli-{uuid.uuid4().hex[:8]}"
    cli_config.update(last_session_id=ctx.session_id)
    ctx.console.print(f"[dim]New session: {ctx.session_id}[/dim]")


def _cmd_login(ctx: Ctx, argv: list[str]) -> None:
    if len(argv) < 2:
        ctx.console.print("[yellow]Usage:[/yellow] /login <email> <password>")
        return
    email, password = argv[0], argv[1]
    with httpx.Client(timeout=15) as client:
        resp = client.post(
            f"{ctx.api_url}/auth/login",
            json={"email": email, "password": password},
        )
    if resp.status_code != 200:
        ctx.console.print(f"[red]Login failed (HTTP {resp.status_code}):[/red] {resp.text}")
        return
    data = resp.json()
    token = data.get("accessToken") or data.get("access_token")
    if not token:
        ctx.console.print(f"[red]Login response missing access token:[/red] {data}")
        return
    ctx.token = token
    ctx.email = email
    cli_config.update(token=token, email=email, api_url=ctx.api_url)
    ctx.console.print(f"[green]Logged in as[/green] {email}")


def _cmd_logout(ctx: Ctx, argv: list[str]) -> None:
    ctx.token = None
    ctx.email = None
    cli_config.clear_token()
    ctx.console.print("[dim]Logged out; token cleared from config.[/dim]")


def _cmd_whoami(ctx: Ctx, argv: list[str]) -> None:
    from rich.table import Table

    table = Table(show_header=False, box=None, pad_edge=False)
    table.add_column(style="dim")
    table.add_column()
    table.add_row("email", ctx.email or "(anonymous)")
    table.add_row("api_url", ctx.api_url)
    table.add_row("session", ctx.session_id)
    table.add_row("config", str(cli_config.config_path()))
    table.add_row("token", "set" if ctx.token else "unset")
    ctx.console.print(table)


def _cmd_trademark_check(ctx: Ctx, argv: list[str]) -> None:
    if not _require_token(ctx):
        return
    opts = _kv_args(
        argv,
        {
            "--name": "name",
            "--description": "description",
            "--applicant": "applicant",
            "--applicant-type": "applicant_type",
            "--categories": "categories",
        },
    )
    if "name" not in opts:
        ctx.console.print("[yellow]Usage:[/yellow] /trademark-check --name <name> [--categories '[\"35\"]']")
        return
    categories = json.loads(opts["categories"]) if "categories" in opts else ["35"]
    with httpx.Client(timeout=30) as client:
        resp = client.post(
            f"{ctx.api_url}/trademarks/check",
            headers=_headers(ctx),
            json={
                "trademarkName": opts["name"],
                "businessDescription": opts.get("description", ""),
                "applicantName": opts.get("applicant", ""),
                "applicantType": opts.get("applicant_type", "company"),
                "categories": categories,
            },
        )
    _render_http_result(ctx, "trademark-check", resp)


def _cmd_diagnose(ctx: Ctx, argv: list[str]) -> None:
    if not _require_token(ctx):
        return
    opts = _kv_args(
        argv,
        {
            "--description": "description",
            "-d": "description",
            "--business-name": "business_name",
            "--industry": "industry",
            "--stage": "stage",
        },
    )
    if "description" not in opts:
        ctx.console.print("[yellow]Usage:[/yellow] /diagnose -d <description>")
        return
    with httpx.Client(timeout=60) as client:
        resp = client.post(
            f"{ctx.api_url}/diagnosis",
            headers=_headers(ctx),
            json={
                "businessDescription": opts["description"],
                "businessName": opts.get("business_name") or None,
                "industry": opts.get("industry") or None,
                "stage": opts.get("stage") or None,
            },
        )
    _render_http_result(ctx, "diagnose", resp)


def _cmd_assets(ctx: Ctx, argv: list[str]) -> None:
    if not _require_token(ctx):
        return
    with httpx.Client(timeout=15) as client:
        resp = client.get(f"{ctx.api_url}/assets", headers=_headers(ctx))
    _render_http_result(ctx, "assets", resp)


def _cmd_generate_application(ctx: Ctx, argv: list[str]) -> None:
    if not _require_token(ctx):
        return
    opts = _kv_args(
        argv,
        {
            "--name": "name",
            "--applicant": "applicant",
            "--description": "description",
            "--categories": "categories",
            "--risk-level": "risk_level",
        },
    )
    if "name" not in opts:
        ctx.console.print(
            "[yellow]Usage:[/yellow] /generate-application --name <name> "
            "[--applicant <x>] [--categories '[\"42\"]'] [--risk-level yellow]"
        )
        return
    categories = json.loads(opts["categories"]) if "categories" in opts else ["35"]
    with httpx.Client(timeout=60) as client:
        resp = client.post(
            f"{ctx.api_url}/trademarks/application/jobs",
            headers=_headers(ctx),
            json={
                "trademarkName": opts["name"],
                "applicantName": opts.get("applicant", ""),
                "businessDescription": opts.get("description", ""),
                "categories": categories,
                "riskLevel": opts.get("risk_level", "yellow"),
            },
        )
    _render_http_result(ctx, "generate-application", resp)


def _cmd_contract_review(ctx: Ctx, argv: list[str]) -> None:
    if not _require_token(ctx):
        return
    opts = _kv_args(argv, {"--text": "text"})
    text = opts.get("text", "").strip()
    if not text:
        ctx.console.print("[yellow]Usage:[/yellow] /contract-review --text \"<contract body>\"")
        return
    with httpx.Client(timeout=60) as client:
        resp = client.post(
            f"{ctx.api_url}/stream/contracts/review",
            headers=_headers(ctx),
            json={"contract_text": text},
        )
    _render_http_result(ctx, "contract-review", resp)


def _cmd_patent_assess(ctx: Ctx, argv: list[str]) -> None:
    if not _require_token(ctx):
        return
    opts = _kv_args(argv, {"--description": "description", "-d": "description"})
    if "description" not in opts:
        ctx.console.print("[yellow]Usage:[/yellow] /patent-assess -d <description>")
        return
    with httpx.Client(timeout=60) as client:
        resp = client.post(
            f"{ctx.api_url}/stream/patents/assess",
            headers=_headers(ctx),
            json={"description": opts["description"]},
        )
    _render_http_result(ctx, "patent-assess", resp)


def _cmd_policy_digest(ctx: Ctx, argv: list[str]) -> None:
    if not _require_token(ctx):
        return
    opts = _kv_args(argv, {"--industry": "industry", "-i": "industry"})
    if "industry" not in opts:
        ctx.console.print("[yellow]Usage:[/yellow] /policy-digest -i <industry>")
        return
    with httpx.Client(timeout=60) as client:
        resp = client.post(
            f"{ctx.api_url}/stream/policies/digest",
            headers=_headers(ctx),
            json={"industry": opts["industry"]},
        )
    _render_http_result(ctx, "policy-digest", resp)


def _cmd_save(ctx: Ctx, argv: list[str]) -> None:
    if not argv:
        ctx.console.print("[yellow]Usage:[/yellow] /save <path.md>")
        return
    from pathlib import Path

    path = Path(argv[0]).expanduser().resolve()
    lines: list[str] = [f"# A1+ IP Coworker — session {ctx.session_id}", ""]
    for msg in ctx.messages:
        role = msg.get("role", "?")
        header = "## 用户" if role == "user" else "## 助手"
        lines.append(header)
        lines.append("")
        lines.append(str(msg.get("content", "")).strip())
        lines.append("")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")
    ctx.console.print(f"[green]Saved[/green] {len(ctx.messages)} messages → [cyan]{path}[/cyan]")


# ─── Registry ───────────────────────────────────────────────────────────────


_COMMANDS: tuple[SlashCommand, ...] = (
    SlashCommand("help", _cmd_help, "List all slash commands.", aliases=("?",)),
    SlashCommand("exit", _cmd_exit, "Exit the REPL.", aliases=("quit", "q")),
    SlashCommand("clear", _cmd_clear, "Clear local conversation history."),
    SlashCommand("reset-session", _cmd_reset_session, "Start a new session id."),
    SlashCommand("login", _cmd_login, "/login <email> <password> — authenticate and persist token."),
    SlashCommand("logout", _cmd_logout, "Clear saved token."),
    SlashCommand("whoami", _cmd_whoami, "Show current user, api url and token status."),
    SlashCommand("trademark-check", _cmd_trademark_check, "Check trademark similarity (--name, --categories)."),
    SlashCommand("diagnose", _cmd_diagnose, "Run IP diagnosis (-d <description>)."),
    SlashCommand("assets", _cmd_assets, "List IP assets."),
    SlashCommand(
        "generate-application",
        _cmd_generate_application,
        "Queue a trademark application job (--name, --applicant, --categories).",
    ),
    SlashCommand("contract-review", _cmd_contract_review, "Review contract IP clauses (--text)."),
    SlashCommand("patent-assess", _cmd_patent_assess, "Assess patent feasibility (-d <description>)."),
    SlashCommand("policy-digest", _cmd_policy_digest, "Industry IP policy digest (-i <industry>)."),
    SlashCommand("save", _cmd_save, "/save <path.md> — export the conversation as Markdown."),
)


def build_registry() -> dict[str, SlashCommand]:
    registry: dict[str, SlashCommand] = {}
    for cmd in _COMMANDS:
        registry[cmd.name] = cmd
        for alias in cmd.aliases:
            registry[alias] = cmd
    return registry
