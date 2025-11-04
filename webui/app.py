"""Flask web application providing a dashboard for Liars Bar LLM."""

from __future__ import annotations

import base64
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List

from flask import Flask, abort, jsonify, render_template

# 项目根目录
BASE_DIR = Path(__file__).resolve().parent.parent

# 允许访问的对局记录目录
RECORD_DIRECTORIES = [
    BASE_DIR / "game_records",
    BASE_DIR / "demo_records" / "game_records",
]


def _encode_path(relative_path: Path) -> str:
    """将记录的相对路径编码为 URL 安全的字符串。"""
    return base64.urlsafe_b64encode(str(relative_path).encode("utf-8")).decode("ascii").rstrip("=")


def _decode_path(identifier: str) -> Path:
    """从编码字符串解码出记录的相对路径。"""
    padding = "=" * (-len(identifier) % 4)
    decoded = base64.urlsafe_b64decode((identifier + padding).encode("ascii")).decode("utf-8")
    return Path(decoded)


def _is_allowed_path(path: Path) -> bool:
    """确保访问的记录在允许的目录之内。"""
    try:
        resolved = path.resolve(strict=True)
    except FileNotFoundError:
        return False

    for directory in RECORD_DIRECTORIES:
        try:
            if resolved.is_relative_to(directory.resolve()):
                return True
        except AttributeError:
            # Python < 3.9 没有 Path.is_relative_to
            try:
                resolved.relative_to(directory.resolve())
            except ValueError:
                continue
            else:
                return True
    return False


def _collect_records() -> List[Dict]:
    """读取所有可用记录的简要信息。"""
    records: List[Dict] = []
    for directory in RECORD_DIRECTORIES:
        if not directory.exists():
            continue
        for record_path in sorted(directory.glob("*.json")):
            try:
                data = json.loads(record_path.read_text(encoding="utf-8"))
            except Exception:
                continue

            record_info = {
                "id": _encode_path(record_path.relative_to(BASE_DIR)),
                "name": record_path.name,
                "source": str(record_path.parent.relative_to(BASE_DIR)),
                "game_id": data.get("game_id"),
                "players": data.get("player_names", []),
                "winner": data.get("winner"),
                "round_count": len(data.get("rounds", [])),
                "updated_timestamp": record_path.stat().st_mtime,
                "updated_at": datetime.fromtimestamp(record_path.stat().st_mtime).isoformat(timespec="seconds"),
            }
            records.append(record_info)

    # 最近修改的记录排在最前
    records.sort(key=lambda item: item["updated_timestamp"], reverse=True)
    for record in records:
        record.pop("updated_timestamp", None)

    return records


def _build_summary(records: List[Dict]) -> Dict:
    """根据记录列表生成统计信息。"""
    total = len(records)
    winners: Dict[str, int] = {}
    for record in records:
        winner = record.get("winner") or "未知"
        winners[winner] = winners.get(winner, 0) + 1

    winner_breakdown = [
        {"name": name, "count": count}
        for name, count in sorted(winners.items(), key=lambda item: item[1], reverse=True)
    ]

    return {
        "total_records": total,
        "unique_players": sorted({player for record in records for player in record.get("players", [])}),
        "winner_breakdown": winner_breakdown,
    }


def _load_record_detail(record_path: Path) -> Dict:
    """读取单场对局的详细信息并清洗结构。"""
    data = json.loads(record_path.read_text(encoding="utf-8"))
    rounds = []
    for round_data in data.get("rounds", []):
        history = []
        for event in round_data.get("play_history", []):
            history.append({
                "player": event.get("player_name"),
                "played_cards": event.get("played_cards", []),
                "behavior": event.get("behavior"),
                "play_reason": event.get("play_reason"),
                "was_challenged": event.get("was_challenged"),
                "challenge_reason": event.get("challenge_reason"),
                "challenge_result": event.get("challenge_result"),
                "next_player": event.get("next_player"),
            })

        rounds.append({
            "round_id": round_data.get("round_id"),
            "target_card": round_data.get("target_card"),
            "starting_player": round_data.get("starting_player"),
            "round_result": round_data.get("round_result"),
            "history": history,
        })

    return {
        "game_id": data.get("game_id"),
        "players": data.get("player_names", []),
        "winner": data.get("winner"),
        "rounds": rounds,
    }


def create_app() -> Flask:
    """创建并返回 Flask 应用。"""
    app = Flask(__name__, template_folder="templates", static_folder="static")

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/showcase")
    def showcase():
        return render_template("showcase.html")

    @app.get("/api/records")
    def api_records():
        records = _collect_records()
        summary = _build_summary(records)
        return jsonify({"records": records, "summary": summary})

    @app.get("/api/records/<string:record_id>")
    def api_record_detail(record_id: str):
        relative_path = _decode_path(record_id)
        full_path = (BASE_DIR / relative_path)
        if not _is_allowed_path(full_path):
            abort(404)
        try:
            detail = _load_record_detail(full_path)
        except FileNotFoundError:
            abort(404)
        return jsonify(detail)

    return app


if __name__ == "__main__":
    application = create_app()
    application.run(host="0.0.0.0", port=8000, debug=True)
