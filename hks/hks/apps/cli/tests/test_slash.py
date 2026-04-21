"""Unit tests for the CLI slash parser and dispatcher.

These tests intentionally avoid any network I/O and any dependency on
`prompt_toolkit` — they only exercise pure parsing + registry logic.
"""
from __future__ import annotations

import io
import json
from typing import Any

import pytest
from rich.console import Console

from apps.cli import slash


class FakeConsole:
    """Wraps a real Rich Console so Table/Panel renderables turn into text."""

    def __init__(self) -> None:
        self.buffer = io.StringIO()
        self._console = Console(
            file=self.buffer,
            force_terminal=False,
            no_color=True,
            width=120,
            legacy_windows=False,
        )

    def print(self, *objects: Any, **kwargs: Any) -> None:  # noqa: D401
        self._console.print(*objects, **kwargs)

    @property
    def text(self) -> str:
        return self.buffer.getvalue()


def _make_ctx(**overrides: Any) -> slash.Ctx:
    ctx = slash.Ctx(
        console=FakeConsole(),
        api_url="http://localhost:8000",
        token=None,
        email=None,
        session_id="cli-test",
        messages=[],
    )
    ctx._registry = slash.build_registry()
    for key, value in overrides.items():
        setattr(ctx, key, value)
    return ctx


# ─── parse() ────────────────────────────────────────────────────────────────


def test_parse_rejects_non_slash() -> None:
    assert slash.parse("hello world") is None
    assert slash.parse("") is None
    assert slash.parse("   ") is None


def test_parse_simple_command() -> None:
    assert slash.parse("/help") == ("help", [])


def test_parse_with_positional_and_flags() -> None:
    name, argv = slash.parse('/login alice@example.com "pa ss"')  # type: ignore[misc]
    assert name == "login"
    assert argv == ["alice@example.com", "pa ss"]


def test_parse_preserves_json_argument() -> None:
    name, argv = slash.parse('/trademark-check --name 云梦 --categories \'["42"]\'')  # type: ignore[misc]
    assert name == "trademark-check"
    assert argv == ["--name", "云梦", "--categories", '["42"]']


def test_parse_empty_slash() -> None:
    assert slash.parse("/") == ("", [])
    assert slash.parse("/   ") == ("", [])


# ─── _kv_args ───────────────────────────────────────────────────────────────


def test_kv_args_happy_path() -> None:
    out = slash._kv_args(
        ["--name", "云梦", "--categories", '["42"]'],
        {"--name": "name", "--categories": "categories"},
    )
    assert out == {"name": "云梦", "categories": '["42"]'}


def test_kv_args_unknown_flag_raises() -> None:
    with pytest.raises(ValueError, match="unknown flag"):
        slash._kv_args(["--bogus", "x"], {"--name": "name"})


def test_kv_args_missing_value_raises() -> None:
    with pytest.raises(ValueError, match="requires a value"):
        slash._kv_args(["--name"], {"--name": "name"})


def test_kv_args_positional_rejected() -> None:
    with pytest.raises(ValueError, match="unexpected positional"):
        slash._kv_args(["stray"], {"--name": "name"})


# ─── dispatch() ─────────────────────────────────────────────────────────────


def test_dispatch_returns_false_for_non_slash() -> None:
    ctx = _make_ctx()
    assert slash.dispatch("hello", ctx) is False


def test_dispatch_unknown_command_keeps_repl_alive() -> None:
    ctx = _make_ctx()
    assert slash.dispatch("/totally-fake", ctx) is True
    assert "Unknown command" in ctx.console.text
    assert ctx.should_exit is False


def test_dispatch_exit_sets_flag() -> None:
    ctx = _make_ctx()
    slash.dispatch("/exit", ctx)
    assert ctx.should_exit is True


def test_dispatch_quit_alias_works() -> None:
    ctx = _make_ctx()
    slash.dispatch("/quit", ctx)
    assert ctx.should_exit is True


def test_dispatch_clear_wipes_history() -> None:
    ctx = _make_ctx()
    ctx.messages.extend(
        [
            {"role": "user", "content": "hi"},
            {"role": "assistant", "content": "hello"},
        ]
    )
    slash.dispatch("/clear", ctx)
    assert ctx.messages == []


def test_dispatch_reset_session_changes_id(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("A1PLUS_CONFIG_DIR", str(tmp_path))
    ctx = _make_ctx()
    original = ctx.session_id
    slash.dispatch("/reset-session", ctx)
    assert ctx.session_id != original
    assert ctx.session_id.startswith("cli-")


def test_dispatch_auth_required_commands_without_token() -> None:
    ctx = _make_ctx()
    slash.dispatch("/assets", ctx)
    assert "Not logged in" in ctx.console.text


def test_dispatch_logout_clears_token(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("A1PLUS_CONFIG_DIR", str(tmp_path))
    ctx = _make_ctx(token="abc", email="a@b.c")
    slash.dispatch("/logout", ctx)
    assert ctx.token is None
    assert ctx.email is None


def test_dispatch_whoami_renders(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("A1PLUS_CONFIG_DIR", str(tmp_path))
    ctx = _make_ctx(token="abc", email="alice@example.com")
    slash.dispatch("/whoami", ctx)
    assert "alice@example.com" in ctx.console.text


def test_dispatch_save_writes_markdown(tmp_path) -> None:
    ctx = _make_ctx()
    ctx.messages.extend(
        [
            {"role": "user", "content": "Hi"},
            {"role": "assistant", "content": "Hello!"},
        ]
    )
    target = tmp_path / "session.md"
    slash.dispatch(f'/save "{target}"', ctx)
    body = target.read_text(encoding="utf-8")
    assert "用户" in body and "Hi" in body
    assert "助手" in body and "Hello!" in body


# ─── Registry sanity ────────────────────────────────────────────────────────


def test_registry_covers_documented_commands() -> None:
    registry = slash.build_registry()
    required = {
        "help",
        "exit",
        "quit",
        "clear",
        "reset-session",
        "login",
        "logout",
        "whoami",
        "trademark-check",
        "diagnose",
        "assets",
        "generate-application",
        "contract-review",
        "patent-assess",
        "policy-digest",
        "save",
    }
    missing = required - set(registry)
    assert not missing, f"registry missing commands: {missing}"


def test_help_lists_each_command_once() -> None:
    ctx = _make_ctx()
    slash.dispatch("/help", ctx)
    # Table output is rendered as text; every primary command name should appear
    # once (aliases collapsed into parentheses).
    for name in ("help", "exit", "clear", "login", "diagnose", "assets"):
        assert f"/{name}" in ctx.console.text


def test_config_roundtrip(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    from apps.cli import config as cli_config

    monkeypatch.setenv("A1PLUS_CONFIG_DIR", str(tmp_path))
    cli_config.update(token="tok", email="a@b.c", api_url="http://x")
    assert cli_config.load() == {"token": "tok", "email": "a@b.c", "api_url": "http://x"}

    cli_config.clear_token()
    data = cli_config.load()
    assert "token" not in data and "email" not in data
    assert data.get("api_url") == "http://x"


def test_resolve_token_precedence(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    from apps.cli import config as cli_config

    monkeypatch.setenv("A1PLUS_CONFIG_DIR", str(tmp_path))

    cli_config.update(token="from-config")
    monkeypatch.setenv("A1PLUS_TOKEN", "from-env")
    assert cli_config.resolve_token("from-cli") == "from-cli"
    assert cli_config.resolve_token(None) == "from-env"

    monkeypatch.delenv("A1PLUS_TOKEN", raising=False)
    assert cli_config.resolve_token(None) == "from-config"


def test_streaming_collect_sse_parses_events(monkeypatch: pytest.MonkeyPatch) -> None:
    """The SSE parser must cope with multi-event streams and unknown types."""
    from apps.cli import streaming

    async def fake_iter(*_args, **_kwargs):
        events = [
            ("meta", {"traceId": "abc"}),
            ("token", {"content": "Hello"}),
            ("token", {"content": ", world"}),
            ("action_start", {"action": "search"}),
            ("action_result", {"action": "search", "ok": True}),
            ("done", {"followUp": ["q1"], "disclaimer": "d"}),
            ("mystery", {"ignored": True}),
        ]
        for evt in events:
            yield evt

    monkeypatch.setattr(streaming, "_iter_sse_events", fake_iter)
    result = streaming.collect_sse("http://x", {}, {})
    assert result["reply"] == "Hello, world"
    assert result["followUps"] == ["q1"]
    assert result["disclaimer"] == "d"
    assert result["meta"] == {"traceId": "abc"}
    actions = result["actions"]
    assert [a["phase"] for a in actions] == ["start", "result"]


def test_streaming_error_event_short_circuits(monkeypatch: pytest.MonkeyPatch) -> None:
    from apps.cli import streaming

    async def fake_iter(*_args, **_kwargs):
        yield "error", {"code": "UNAUTHORIZED", "message": "nope"}

    monkeypatch.setattr(streaming, "_iter_sse_events", fake_iter)
    result = streaming.collect_sse("http://x", {}, {})
    assert result.get("error") is True
    assert result["code"] == "UNAUTHORIZED"


def test_json_payload_in_kv_args_roundtrips() -> None:
    raw = slash.parse("""/generate-application --name 云梦 --applicant 张三 --categories '["42"]'""")
    assert raw is not None
    _, argv = raw
    spec = {
        "--name": "name",
        "--applicant": "applicant",
        "--categories": "categories",
        "--description": "description",
        "--risk-level": "risk_level",
    }
    opts = slash._kv_args(argv, spec)
    assert opts["name"] == "云梦"
    assert opts["applicant"] == "张三"
    assert json.loads(opts["categories"]) == ["42"]
