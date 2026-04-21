"""A1+ IP Coworker CLI — `python -m apps.cli`.

Two modes share this entry point:

1. Agent / scripting mode (JSON in, JSON out) — kept unchanged for backwards
   compatibility. Explicit subcommand, e.g.:

      python -m apps.cli chat --message "我想注册商标云梦"
      python -m apps.cli trademark-check --name 云梦 --categories '["42"]'
      python -m apps.cli diagnose --description "做软件的"
      python -m apps.cli generate-application --name 云梦 --applicant 张三 --categories '["42"]'
      python -m apps.cli contract-review --text "..."
      python -m apps.cli patent-assess --description "..."
      python -m apps.cli policy-digest --industry 软件
      python -m apps.cli list-assets
      python -m apps.cli login --email user@example.com --password xxx

2. Interactive REPL mode (for humans) — launched when stdin is a TTY and no
   subcommand is given, or explicitly via `python -m apps.cli repl`. See
   `apps/cli/repl.py`.

Token resolution: `--token` > `A1PLUS_TOKEN` env > `~/.a1plus/config.json`.
Add `--json` to any invocation to force JSON mode (useful when stdin is a TTY
but you still want machine-readable output).
"""
from __future__ import annotations

import argparse
import asyncio  # noqa: F401 — kept for backwards-compat imports
import json
import os
import sys

import httpx

from apps.cli import config as cli_config
from apps.cli.streaming import collect_sse as _collect_sse_impl

API_BASE = os.getenv("A1PLUS_API_URL", "http://localhost:8000")


def _json_out(data: object) -> None:
    json.dump(data, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


def _json_err(code: str, message: str) -> None:
    json.dump(
        {"error": True, "code": code, "message": message},
        sys.stderr,
        ensure_ascii=False,
        indent=2,
    )
    sys.stderr.write("\n")
    sys.exit(1)


def _make_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ─── Auth ────────────────────────────────────────────────────────────────────


def cmd_login(args: argparse.Namespace) -> None:
    with httpx.Client(timeout=10) as client:
        resp = client.post(
            f"{args.api_url}/auth/login",
            json={"email": args.email, "password": args.password},
        )
    if resp.status_code != 200:
        _json_err("AUTH_FAILED", resp.text)
    data = resp.json()
    token = data.get("accessToken") or data.get("access_token")
    if getattr(args, "save", False) and token:
        cli_config.update(token=token, email=args.email, api_url=args.api_url)
    _json_out({"accessToken": token})


# ─── Chat (SSE → JSON) ──────────────────────────────────────────────────────


def cmd_chat(args: argparse.Namespace) -> None:
    message = args.message
    if not message:
        if not sys.stdin.isatty():
            message = sys.stdin.read().strip()
    if not message:
        _json_err("MISSING_INPUT", "No message provided via --message or stdin")

    history = []
    if args.history:
        try:
            history = json.loads(args.history)
        except json.JSONDecodeError:
            _json_err("INVALID_HISTORY", "--history must be a JSON array")

    headers = _make_headers(args.token)
    body = {
        "message": message,
        "history": history,
        "context": json.loads(args.context) if args.context else {},
        "sessionId": args.session or "cli-agent",
    }
    result = _collect_sse(args.api_url, headers, body)
    _json_out(result)


def _collect_sse(api_url: str, headers: dict, body: dict) -> dict:
    """Backwards-compatible sync wrapper around the SSE collector.

    Kept so external callers that imported `apps.cli.main._collect_sse`
    continue to work.
    """
    return _collect_sse_impl(api_url, headers, body)


# ─── Direct actions ──────────────────────────────────────────────────────────


def cmd_trademark_check(args: argparse.Namespace) -> None:
    categories = json.loads(args.categories) if args.categories else ["35"]
    headers = _make_headers(args.token)
    with httpx.Client(timeout=30) as client:
        resp = client.post(
            f"{args.api_url}/trademarks/check",
            headers=headers,
            json={
                "trademarkName": args.name,
                "businessDescription": args.description or "",
                "applicantName": args.applicant or "",
                "applicantType": args.applicant_type or "company",
                "categories": categories,
            },
        )
    _handle_response(resp)


def cmd_diagnose(args: argparse.Namespace) -> None:
    headers = _make_headers(args.token)
    with httpx.Client(timeout=60) as client:
        resp = client.post(
            f"{args.api_url}/diagnosis",
            headers=headers,
            json={
                "businessDescription": args.description,
                "businessName": args.business_name or None,
                "industry": args.industry or None,
                "stage": args.stage or None,
            },
        )
    _handle_response(resp)


def cmd_list_assets(args: argparse.Namespace) -> None:
    headers = _make_headers(args.token)
    with httpx.Client(timeout=15) as client:
        resp = client.get(f"{args.api_url}/assets", headers=headers)
    _handle_response(resp)


def cmd_generate_application(args: argparse.Namespace) -> None:
    categories = json.loads(args.categories) if args.categories else ["35"]
    headers = _make_headers(args.token)
    with httpx.Client(timeout=60) as client:
        resp = client.post(
            f"{args.api_url}/trademarks/application/jobs",
            headers=headers,
            json={
                "trademarkName": args.name,
                "applicantName": args.applicant or "",
                "businessDescription": args.description or "",
                "categories": categories,
                "riskLevel": args.risk_level or "yellow",
            },
        )
    _handle_response(resp)


def cmd_contract_review(args: argparse.Namespace) -> None:
    text = args.text
    if not text and not sys.stdin.isatty():
        text = sys.stdin.read().strip()
    if not text:
        _json_err("MISSING_INPUT", "No contract text via --text or stdin")

    headers = _make_headers(args.token)
    with httpx.Client(timeout=60) as client:
        resp = client.post(
            f"{args.api_url}/stream/contracts/review",
            headers=headers,
            json={"contract_text": text},
        )
    _handle_response(resp)


def cmd_patent_assess(args: argparse.Namespace) -> None:
    headers = _make_headers(args.token)
    with httpx.Client(timeout=60) as client:
        resp = client.post(
            f"{args.api_url}/stream/patents/assess",
            headers=headers,
            json={"description": args.description},
        )
    _handle_response(resp)


def cmd_policy_digest(args: argparse.Namespace) -> None:
    headers = _make_headers(args.token)
    with httpx.Client(timeout=60) as client:
        resp = client.post(
            f"{args.api_url}/stream/policies/digest",
            headers=headers,
            json={"industry": args.industry},
        )
    _handle_response(resp)


def cmd_repl(args: argparse.Namespace) -> None:
    """Launch the interactive REPL. Imported lazily so agent mode stays fast."""
    from apps.cli.repl import run

    sys.exit(run(api_url=args.api_url, token=args.token))


def _handle_response(resp: httpx.Response) -> None:
    if resp.status_code >= 400:
        try:
            body = resp.json()
        except Exception:
            body = {"detail": resp.text}
        _json_err(
            f"HTTP_{resp.status_code}",
            body.get("detail", str(body)) if isinstance(body, dict) else str(body),
        )
    _json_out(resp.json())


# ─── Argparse ────────────────────────────────────────────────────────────────


def _add_common_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--api-url", default=API_BASE)
    p.add_argument(
        "--token",
        default=None,
        help="JWT token (or set A1PLUS_TOKEN env, or use `login --save` / REPL /login)",
    )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="apps.cli",
        description="A1+ IP Coworker CLI — agent JSON mode + interactive REPL",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Force JSON output mode (skip interactive REPL even on TTY).",
    )

    sub = parser.add_subparsers(dest="command", required=False)

    p_repl = sub.add_parser("repl", help="Start interactive REPL (default on TTY).")
    _add_common_args(p_repl)

    p_login = sub.add_parser("login", help="Authenticate and print token.")
    p_login.add_argument("--api-url", default=API_BASE)
    p_login.add_argument("--email", required=True)
    p_login.add_argument("--password", required=True)
    p_login.add_argument(
        "--save",
        action="store_true",
        help="Persist token to ~/.a1plus/config.json for future invocations.",
    )

    p_chat = sub.add_parser("chat", help="Chat with AI coworker (SSE → JSON).")
    _add_common_args(p_chat)
    p_chat.add_argument("--message", "-m", help="Message (or read from stdin).")
    p_chat.add_argument("--history", help='JSON array of {"role","content"}')
    p_chat.add_argument("--context", help="JSON dict of session context")
    p_chat.add_argument("--session", help="Session ID")

    p_tc = sub.add_parser("trademark-check", help="Check trademark similarity.")
    _add_common_args(p_tc)
    p_tc.add_argument("--name", required=True)
    p_tc.add_argument("--description", default="")
    p_tc.add_argument("--applicant", default="")
    p_tc.add_argument("--applicant-type", default="company")
    p_tc.add_argument("--categories", help='JSON array, e.g. \'["42"]\'')

    p_diag = sub.add_parser("diagnose", help="IP diagnosis.")
    _add_common_args(p_diag)
    p_diag.add_argument("--description", "-d", required=True)
    p_diag.add_argument("--business-name")
    p_diag.add_argument("--industry")
    p_diag.add_argument("--stage")

    p_la = sub.add_parser("list-assets", help="List IP assets.")
    _add_common_args(p_la)

    p_ga = sub.add_parser("generate-application", help="Generate trademark application.")
    _add_common_args(p_ga)
    p_ga.add_argument("--name", required=True)
    p_ga.add_argument("--applicant", default="")
    p_ga.add_argument("--description", default="")
    p_ga.add_argument("--categories", help="JSON array")
    p_ga.add_argument("--risk-level", default="yellow")

    p_cr = sub.add_parser("contract-review", help="Review contract IP clauses.")
    _add_common_args(p_cr)
    p_cr.add_argument("--text", help="Contract text (or read from stdin).")

    p_pa = sub.add_parser("patent-assess", help="Assess patent feasibility.")
    _add_common_args(p_pa)
    p_pa.add_argument("--description", "-d", required=True)

    p_pd = sub.add_parser("policy-digest", help="Get industry IP policy digest.")
    _add_common_args(p_pd)
    p_pd.add_argument("--industry", "-i", required=True)

    return parser


_DISPATCH = {
    "login": cmd_login,
    "chat": cmd_chat,
    "trademark-check": cmd_trademark_check,
    "diagnose": cmd_diagnose,
    "list-assets": cmd_list_assets,
    "generate-application": cmd_generate_application,
    "contract-review": cmd_contract_review,
    "patent-assess": cmd_patent_assess,
    "policy-digest": cmd_policy_digest,
    "repl": cmd_repl,
}


def _should_launch_repl(args: argparse.Namespace) -> bool:
    if args.json:
        return False
    if args.command is not None:
        return False
    return sys.stdin.isatty()


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()

    # Auto-launch the REPL when the user runs `python -m apps.cli` on a TTY
    # with no subcommand (and did not pass --json).
    if _should_launch_repl(args):
        args.command = "repl"
        args.api_url = getattr(args, "api_url", API_BASE) or API_BASE
        args.token = getattr(args, "token", None)

    if args.command is None:
        parser.print_help(sys.stderr)
        sys.exit(1)

    # Resolve api_url / token with env + persisted config fallback.
    if hasattr(args, "api_url"):
        args.api_url = cli_config.resolve_api_url(args.api_url, API_BASE)
    if args.command != "login" and hasattr(args, "token"):
        args.token = cli_config.resolve_token(args.token)
        if args.command != "repl" and not args.token:
            _json_err(
                "MISSING_TOKEN",
                "No token found. Pass --token, set A1PLUS_TOKEN, or run `login --save`.",
            )

    _DISPATCH[args.command](args)


if __name__ == "__main__":
    main()
