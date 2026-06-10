"""
离线训练结束后缓存 Mission RL 演示路径（WGS84 + 栅格），供 Web 端 /api/plan/replay 直接复现，无需再次 Q 表推理。
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

BASE_DIR = Path(__file__).resolve().parent
EARTH_R_M = 6378137.0


def mission_rl_path_file(mission_id: int) -> Path:
    return BASE_DIR / "models" / f"mission_{int(mission_id)}_rl_path.json"


def grid_xyz_path_to_wgs84(
    path: List[List[float]] | None,
    origin_lat: float,
    origin_lon: float,
    center: float,
    xy_scale_m_per_grid: float,
    z_scale_m_per_grid: float,
) -> List[List[float]]:
    if not path:
        return []
    lat0_rad = math.radians(origin_lat)
    cos_lat = max(1e-6, math.cos(lat0_rad))
    out: List[List[float]] = []
    for raw in path:
        if not raw or len(raw) < 3:
            continue
        x, y, z = float(raw[0]), float(raw[1]), float(raw[2])
        dx_m = (x - center) * xy_scale_m_per_grid
        dy_m = (y - center) * xy_scale_m_per_grid
        lat = origin_lat + math.degrees(dy_m / EARTH_R_M)
        lon = origin_lon + math.degrees(dx_m / (EARTH_R_M * cos_lat))
        alt = z * z_scale_m_per_grid
        out.append([lat, lon, alt])
    return out


def save_mission_rl_path_cache(
    mission_id: int,
    *,
    mission_name: str,
    task_type: str,
    path_grid: List[List[float]],
    training_start_geo: Tuple[float, float, float],
    training_goal_geo: Tuple[float, float, float],
    grid_n: int,
    margin: int,
    xy_scale_m_per_grid: float,
    z_scale_m_per_grid: float,
    origin_lat: float,
    origin_lon: float,
    grid_center: float,
    rl_success: bool,
    planner_mode: str,
    model_path: str = "",
) -> Path:
    path_wgs84 = grid_xyz_path_to_wgs84(
        path_grid,
        origin_lat,
        origin_lon,
        grid_center,
        xy_scale_m_per_grid,
        z_scale_m_per_grid,
    )
    doc: Dict[str, Any] = {
        "mission_id": int(mission_id),
        "mission_name": mission_name,
        "task_type": task_type,
        "coordinate_system": "wgs84",
        "training_start_geo": list(training_start_geo),
        "training_goal_geo": list(training_goal_geo),
        "grid_n": int(grid_n),
        "margin": int(margin),
        "xy_scale_m_per_grid": float(xy_scale_m_per_grid),
        "z_scale_m_per_grid": float(z_scale_m_per_grid),
        "origin_lat": float(origin_lat),
        "origin_lon": float(origin_lon),
        "grid_center": float(grid_center),
        "path_grid": path_grid,
        "path_wgs84": path_wgs84,
        "rl_success": bool(rl_success),
        "planner_mode": str(planner_mode or "q_table"),
        "model_path": model_path,
        "cached_at": datetime.now(timezone.utc).isoformat(),
    }
    out = mission_rl_path_file(mission_id)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    return out


def load_mission_rl_path_cache(mission_id: int) -> Optional[Dict[str, Any]]:
    p = mission_rl_path_file(mission_id)
    if not p.exists():
        return None
    try:
        doc = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(doc, dict):
            return doc
    except Exception:
        return None
    return None
