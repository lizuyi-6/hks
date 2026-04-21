"""R2 regression — chat service's confidence-based auto handoff."""
from __future__ import annotations

from apps.api.app.services.chat_service import (
    _score_turn_confidence,
    needs_human_handoff,
)


def test_handoff_keywords_force_low_confidence():
    # Any drop keyword in the user message collapses confidence below 0.45.
    conf, reason = _score_turn_confidence("对方发了律师函，我被起诉了怎么办", "")
    assert conf < 0.45
    assert reason is not None


def test_neutral_message_stays_confident():
    conf, reason = _score_turn_confidence(
        "帮我看看商标注册前需要准备哪些材料", "当然，第一步是准备主体资料…"
    )
    assert conf >= 0.45
    assert reason is None


def test_assistant_self_doubt_triggers_handoff():
    conf, reason = _score_turn_confidence(
        "这个合同能签吗", "我无法确定，建议咨询律师"
    )
    # Base 0.85 - 0.25 (assistant self-doubt) = 0.60.
    assert conf <= 0.6
    assert reason is not None


def test_needs_human_handoff_keyword():
    assert needs_human_handoff("我要转人工")[0] is True
    assert needs_human_handoff("天气怎么样")[0] is False
