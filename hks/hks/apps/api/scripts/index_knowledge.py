from __future__ import annotations

import json
from pathlib import Path

from apps.api.app.core.config import get_settings


def main() -> None:
    settings = get_settings()
    catalog = {"documents": []}

    for path in sorted((settings.knowledge_base_dir / "sources").rglob("*.md")):
        relative = path.relative_to(settings.knowledge_base_dir).as_posix()
        priority = relative.split("/")[1]
        catalog["documents"].append(
            {
                "title": path.stem,
                "kind": "markdown",
                "priority": priority.upper(),
                "path": relative,
                "topics": ["trademark"] if "商标" in path.stem else ["general"],
                "source_url": None,
            }
        )

    output = settings.knowledge_base_dir / "metadata" / "catalog.json"
    output.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

