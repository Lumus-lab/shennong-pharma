#!/usr/bin/env python3
"""Bundle《太虛神農紀：雙極靈樞》into a self-contained single HTML file for offline play."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent

JS_ORDER = [
    "js/rng.js",
    "js/state.js",
    "js/pulseMonitor.js",
    "js/codex.js",
    "js/engine.js",
    "js/main.js",
]


def load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def build_embedded_data() -> dict:
    expansions_path = ROOT_DIR / "data" / "expansions.json"
    expansions = load_json(expansions_path) if expansions_path.exists() else None

    active_modules = (
        [m for m in expansions.get("modules", []) if m.get("status") == "active"]
        if isinstance(expansions, dict)
        else [
            {
                "id": "vol1_vol2",
                "nodesFile": "data/vol1_vol2_nodes.json",
                "deckFile": "data/vol1_vol2_deck.json",
            }
        ]
    )

    merged_nodes: dict = {"events": {}}
    merged_deck: dict | None = None

    for mod in active_modules:
        n_data = load_json(ROOT_DIR / mod["nodesFile"])
        d_data = load_json(ROOT_DIR / mod["deckFile"])
        if isinstance(n_data, dict) and isinstance(n_data.get("events"), dict):
            merged_nodes["events"].update(n_data["events"])
        if merged_deck is None:
            merged_deck = d_data if isinstance(d_data, dict) else {}
        elif isinstance(d_data, dict):
            extra_ch = d_data.get("story", {}).get("chapters", [])
            if extra_ch:
                merged_deck.setdefault("story", {}).setdefault("chapters", []).extend(extra_ch)

    return {
        "nodes": merged_nodes,
        "deck": merged_deck or {},
        "codex": load_json(ROOT_DIR / "data" / "codex_entries.json"),
        "endings": load_json(ROOT_DIR / "data" / "endings.json"),
        "expansions": expansions,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Bundle Shennong Pharma into a single offline HTML file.")
    parser.add_argument(
        "--out",
        default=str(ROOT_DIR / "dist" / "index_standalone.html"),
        help="Output path for standalone HTML (default: dist/index_standalone.html)",
    )
    args = parser.parse_args()

    html = (ROOT_DIR / "index.html").read_text(encoding="utf-8")
    css = (ROOT_DIR / "styles" / "theme.css").read_text(encoding="utf-8")
    embedded = build_embedded_data()

    # Inline stylesheet
    style_tag = f"<style>\n{css}\n</style>"
    html = re.sub(
        r'<link\s+rel="stylesheet"\s+href="styles/theme\.css"\s*/?>',
        lambda _m: style_tag,
        html,
        count=1,
    )

    # Strip individual <script src="js/..."></script> tags and replace with embedded data + scripts
    for js_rel in JS_ORDER:
        pattern = rf'\s*<script\s+src="{re.escape(js_rel)}"\s*></script>'
        html = re.sub(pattern, "", html, count=1)

    safe_json = json.dumps(embedded, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    data_script = f"<script>\nwindow.__TAIXU_EMBEDDED_DATA__ = {safe_json};\n</script>"

    js_blocks = []
    for js_rel in JS_ORDER:
        src = (ROOT_DIR / js_rel).read_text(encoding="utf-8")
        safe_src = src.replace("</script>", "<\\/script>")
        js_blocks.append(f"<script>\n/* === {js_rel} === */\n{safe_src}\n</script>")

    bundle_payload = "\n  ".join([data_script, *js_blocks]) + "\n</body>"
    html = html.replace("</body>", bundle_payload, 1)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
    print(f"Bundled standalone HTML -> {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
