"""B1 regression — dual-path recall in matching_engine.

Exercises the pure helper ``_rrf_merge`` so we can refactor the recall layer
without regressing fusion behaviour.
"""
from __future__ import annotations

from apps.api.app.services.matching_engine import _rrf_merge


def _cand(pid: str, **extra):
    return {"provider_id": pid, **extra}


def test_rrf_merge_ranks_item_in_both_paths_highest():
    tag_path = [_cand("a"), _cand("b"), _cand("c")]
    emb_path = [_cand("a"), _cand("b"), _cand("d")]
    merged = _rrf_merge([tag_path, emb_path])
    # "a" appears rank 0 on both paths so should win.
    assert merged[0]["provider_id"] == "a"
    assert "tag" in merged[0]["_source_paths"]
    assert "embedding" in merged[0]["_source_paths"]


def test_rrf_merge_union():
    merged = _rrf_merge([[_cand("a"), _cand("b")], [_cand("c"), _cand("d")]])
    assert {c["provider_id"] for c in merged} == {"a", "b", "c", "d"}


def test_rrf_merge_single_path_does_not_crash():
    merged = _rrf_merge([[_cand("a"), _cand("b")], []])
    assert [c["provider_id"] for c in merged] == ["a", "b"]


def test_rrf_merge_empty_inputs():
    assert _rrf_merge([[], []]) == []


def test_rrf_merge_respects_top_n():
    tags = [_cand(f"p{i}") for i in range(10)]
    merged = _rrf_merge([tags], top_n=3)
    assert len(merged) == 3
