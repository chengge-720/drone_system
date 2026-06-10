"""
Mission-oriented offline trainer for Nanchang UAV routing.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Tuple

import matplotlib.pyplot as plt
import numpy as np

from grid_env_25d import (
    ACTION_DELTAS,
    EnvConfig,
    astar_path_fallback,
    effective_cruise_alt_from_request,
    ensure_start_goal_reachable,
    genetic_path_on_grid,
    infer_path_with_q,
    load_q_table,
    resolve_z_scale_m_per_grid,
    save_q_table,
    snap_to_free_cell,
    train_q_table_offline,
)
from rasterize_buildings import load_or_build_height_map
from mission_rl_cache import save_mission_rl_path_cache
try:
    import shapefile as pyshp
except ImportError:
    pyshp = None

EARTH_R_M = 6378137.0


def _sanitize_task_key(raw: str) -> str:
    s = re.sub(r"[^\w\-]", "_", str(raw or "").strip())[:64]
    return s


def _setup_matplotlib_cn() -> None:
    # Use common Chinese fonts on Windows/Linux/macOS to avoid missing glyph warnings.
    plt.rcParams["font.sans-serif"] = [
        "Microsoft YaHei",
        "SimHei",
        "Noto Sans CJK SC",
        "PingFang SC",
        "WenQuanYi Zen Hei",
        "DejaVu Sans",
    ]
    plt.rcParams["axes.unicode_minus"] = False


@dataclass
class MissionSpec:
    mission_id: int
    name: str
    task_type: str
    start_geo: Tuple[float, float, float]
    goal_geo: Tuple[float, float, float]
    corridor_files: List[str]


def _default_missions() -> List[MissionSpec]:
    # 经纬度为默认近似值，可通过 --mission-config 覆盖为你的实测点位。
    return [
        MissionSpec(
            mission_id=1,
            name="南昌舰主题公园->八一大桥",
            task_type="water_inspection",
            start_geo=(28.717861, 115.865875, 100.0),
            goal_geo=(28.692707, 115.882176, 100.0),
            corridor_files=["南昌市_水系.shp", "nanchang_river_system.geojson"],
        ),
        MissionSpec(
            mission_id=2,
            name="秋水广场->地铁大厦",
            task_type="road_inspection",
            start_geo=(28.684521, 115.858910, 100.0),
            goal_geo=(28.681276, 115.861983, 100.0),
            corridor_files=[
                "南昌市_市区一级道路.shp",
                "南昌市_其它道路.shp",
                "nanchang_urben_road.geojson",
                "nanchang_other_road.geojson",
            ],
        ),
        MissionSpec(
            mission_id=3,
            name="南昌大学->南昌第一医院",
            task_type="rescue",
            start_geo=(28.664729, 115.918957, 110.0),
            goal_geo=(28.675901, 115.899369, 110.0),
            corridor_files=[],
        ),
        MissionSpec(
            mission_id=4,
            name="南昌航空大学->南昌市人民政府",
            task_type="transport",
            start_geo=(28.683899, 115.853558, 105.0),
            goal_geo=(28.683186, 115.857866, 105.0),
            corridor_files=[],
        ),
        MissionSpec(
            mission_id=5,
            name="南昌印象城->南昌航空大学",
            task_type="transport",
            start_geo=(28.658261, 115.833281, 88.0),
            goal_geo=(28.653182, 115.822757, 88.0),
            corridor_files=[],
        ),
    ]


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--episodes", type=int, default=3600)
    p.add_argument("--grid-n", type=int, default=54)
    p.add_argument("--margin", type=int, default=6)
    p.add_argument("--z-scale", type=float, default=2.0)
    p.add_argument("--clearance", type=float, default=45.0)
    p.add_argument("--model-path", type=str, default="models/q_table_25d.npz")
    p.add_argument("--shp-path", type=str, default="")
    p.add_argument("--mission-config", type=str, default="")
    p.add_argument("--mission-id", type=int, default=0, help="0=all tasks; >0 trains only one mission id")
    p.add_argument("--dyna-k", type=int, default=30)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--log-every", type=int, default=50)
    p.add_argument("--print-q-states", type=int, default=12, help="print top-N high-value q states")
    p.add_argument("--enable-apf", action="store_true", help="enable APF obstacle repulsive reward")
    p.add_argument("--apf-repulse-weight", type=float, default=0.65, help="APF repulsive reward weight")
    p.add_argument("--apf-influence-grid", type=float, default=3.8, help="APF influence radius in grid cells")
    p.add_argument("--obstacle-buffer-m", type=float, default=0.0, help="inflate building footprints by meters")
    p.add_argument("--corridor-max-points", type=int, default=45000, help="cap corridor polyline points for speed")
    p.add_argument("--eval-runs", type=int, default=20, help="runs for stability boxplot")
    p.add_argument("--plot-only", action="store_true", help="skip training and regenerate plots from existing model")
    p.add_argument("--java-ga-path-json", type=str, default="images/java_ga_paths.json", help="optional GA path json from Java side")
    p.add_argument("--java-astar-path-json", type=str, default="images/java_astar_paths.json", help="optional A* path json from Java side")
    p.add_argument("--task-key", type=str, default="", help="per-task model key; saves q_table_task_<key>.npz")
    p.add_argument("--start-lat", type=float, default=0.0)
    p.add_argument("--start-lon", type=float, default=0.0)
    p.add_argument("--start-alt", type=float, default=100.0)
    p.add_argument("--goal-lat", type=float, default=0.0)
    p.add_argument("--goal-lon", type=float, default=0.0)
    p.add_argument("--goal-alt", type=float, default=100.0)
    p.add_argument("--task-name", type=str, default="")
    p.add_argument("--task-type", type=str, default="custom")
    return p.parse_args()


def _moving_average_and_std(vals: List[float], window: int) -> Tuple[np.ndarray, np.ndarray]:
    arr = np.array(vals, dtype=np.float64)
    if arr.size == 0:
        return np.array([]), np.array([])
    w = max(1, int(window))
    mean = np.zeros_like(arr)
    std = np.zeros_like(arr)
    for i in range(arr.size):
        lo = max(0, i - w + 1)
        seg = arr[lo : i + 1]
        mean[i] = float(np.mean(seg))
        std[i] = float(np.std(seg))
    return mean, std


def _format_geo_label(lat: float, lon: float, alt: float) -> str:
    return f"({lat:.6f}°N, {lon:.6f}°E, {alt:.0f}m)"


def _task_type_cn(task_type: str) -> str:
    mapping = {
        "water_inspection": "水系巡检",
        "road_inspection": "道路巡检",
        "rescue": "应急救援",
        "transport": "物资运输",
    }
    return mapping.get(task_type, task_type)


def _plot_learning(
    reward_curve: List[float],
    success_curve: List[float],
    steps_curve: List[float],
    path_len_curve: List[float],
    out_path: Path,
    display_max_episode: int = 1000,
    mission_id: int = 0,
    mission_name: str = "",
    task_type: str = "",
    start_geo: Tuple[float, float, float] | None = None,
    goal_geo: Tuple[float, float, float] | None = None,
    total_episodes: int = 0,
) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    n = len(reward_curve)
    n_show = min(max(1, int(display_max_episode)), n)
    reward_curve = reward_curve[:n_show]
    success_curve = success_curve[:n_show]
    steps_curve = steps_curve[:n_show]
    path_len_curve = path_len_curve[:n_show]
    x = np.arange(1, n_show + 1)
    rw_ma, rw_std = _moving_average_and_std(reward_curve, 80)
    st_ma, st_std = _moving_average_and_std(steps_curve, 80)
    pl_ma, pl_std = _moving_average_and_std(path_len_curve, 80)
    sr_ma, sr_std = _moving_average_and_std(success_curve, 120)

    fig, axes = plt.subplots(3, 1, figsize=(11.6, 12.0), sharex=True)
    if mission_id > 0 and mission_name:
        task_label = _task_type_cn(task_type) if task_type else "未知类型"
        start_txt = _format_geo_label(*start_geo) if start_geo else "—"
        goal_txt = _format_geo_label(*goal_geo) if goal_geo else "—"
        total_txt = int(total_episodes) if total_episodes > 0 else n
        fig.suptitle(
            f"任务{mission_id}：{mission_name}（{task_label}）\n"
            f"起点 {start_txt}  →  终点 {goal_txt}  |  总训练回合：{total_txt}",
            fontsize=12,
            fontweight="bold",
            y=0.995,
        )

    axes[0].plot(x, reward_curve, color="#93c5fd", linewidth=0.9, label="reward raw")
    axes[0].plot(x, rw_ma, color="#1d4ed8", linewidth=1.8, label="reward smooth")
    axes[0].fill_between(x, rw_ma - rw_std, rw_ma + rw_std, color="#93c5fd", alpha=0.25, linewidth=0)
    axes[0].set_ylabel("累积奖励")
    axes[0].set_title("训练收敛性：回合累积奖励")
    axes[0].grid(alpha=0.25)
    axes[0].legend(["原始奖励", "平滑奖励"], loc="lower right", fontsize=9)

    axes[1].plot(x, steps_curve, color="#fca5a5", linewidth=0.9, label="steps raw")
    axes[1].plot(x, st_ma, color="#dc2626", linewidth=1.7, label="steps smooth")
    axes[1].fill_between(x, st_ma - st_std, st_ma + st_std, color="#fecaca", alpha=0.25, linewidth=0)
    axes[1].plot(x, pl_ma, color="#7c3aed", linewidth=1.4, label="path length smooth")
    axes[1].fill_between(x, pl_ma - pl_std, pl_ma + pl_std, color="#c4b5fd", alpha=0.18, linewidth=0)
    axes[1].set_ylabel("步数 / 路径长度")
    axes[1].set_title("训练收敛性：步数与路径长度")
    axes[1].grid(alpha=0.25)
    axes[1].legend(["原始步数", "平滑步数", "平滑路径长度"], loc="upper right", fontsize=9)

    axes[2].plot(x, success_curve, color="#86efac", linewidth=1.0, label="success raw")
    axes[2].plot(x, sr_ma, color="#15803d", linewidth=1.8, label="success smooth")
    axes[2].fill_between(x, np.clip(sr_ma - sr_std, 0.0, 1.0), np.clip(sr_ma + sr_std, 0.0, 1.0), color="#86efac", alpha=0.25, linewidth=0)
    axes[2].set_ylabel("成功率")
    axes[2].set_xlabel(f"训练回合（1–{n_show}）")
    show_note = f"（展示前 {n_show} 回合" + (f"，共训练 {int(total_episodes)} 回合）" if total_episodes > n_show else "）")
    axes[2].set_title(f"训练收敛性：成功率{show_note}")
    axes[2].set_ylim(0.0, 1.02)
    axes[2].grid(alpha=0.25)
    axes[2].legend(["原始成功率", "平滑成功率"], loc="lower right", fontsize=9)

    fig.tight_layout(rect=[0, 0, 1, 0.96] if mission_id > 0 else None)
    fig.savefig(out_path, dpi=150)
    plt.close(fig)


def _curves_from_meta(meta: Dict[str, Any]) -> Tuple[List[float], List[float], List[float], List[float]]:
    curves = meta.get("training_curves") or {}

    def _as_floats(key: str) -> List[float]:
        raw = curves.get(key) or []
        return [float(x) for x in raw]

    return _as_floats("reward"), _as_floats("success"), _as_floats("steps"), _as_floats("path_length")


def _write_training_progress_plots(
    *,
    missions: List[Any],
    images_dir: Path,
    task_key: str,
    reward_curve: List[float],
    success_curve: List[float],
    steps_curve: List[float],
    path_len_curve: List[float],
    total_episodes: int,
) -> None:
    if not reward_curve:
        print(
            "[plot] skip training_progress: no curve data "
            "(retrain task Q-table to persist training_curves in npz meta)",
            flush=True,
        )
        return
    m_spec = missions[0]
    plot_kwargs = dict(
        reward_curve=reward_curve,
        success_curve=success_curve,
        steps_curve=steps_curve or [0.0] * len(reward_curve),
        path_len_curve=path_len_curve or [0.0] * len(reward_curve),
        display_max_episode=1000,
        total_episodes=int(total_episodes or len(reward_curve)),
        mission_id=int(m_spec.mission_id if not task_key else 0),
        mission_name=m_spec.name,
        task_type=m_spec.task_type,
        start_geo=m_spec.start_geo,
        goal_geo=m_spec.goal_geo,
    )
    if int(m_spec.mission_id) > 0 or task_key:
        mission_out = _mission_output_dir(images_dir, int(m_spec.mission_id), task_key)
        mission_out.mkdir(parents=True, exist_ok=True)
        _plot_learning(out_path=mission_out / "training_progress.png", **plot_kwargs)
    if not task_key:
        _plot_learning(out_path=images_dir / "training_progress.png", **plot_kwargs)


def _geo_delta_m(lat: float, lon: float, origin_lat: float, origin_lon: float) -> Tuple[float, float]:
    lat0_rad = math.radians(origin_lat)
    dlat_rad = math.radians(lat - origin_lat)
    dlon_rad = math.radians(lon - origin_lon)
    dx_m = dlon_rad * math.cos(lat0_rad) * EARTH_R_M
    dy_m = dlat_rad * EARTH_R_M
    return dx_m, dy_m


def _geo_to_grid_xyz(
    lat: float,
    lon: float,
    alt: float,
    origin_lat: float,
    origin_lon: float,
    center_x: float,
    center_y: float,
    xy_scale_m: float,
    z_scale_m: float,
    grid_n: int,
) -> Tuple[float, float, float]:
    dx_m, dy_m = _geo_delta_m(lat, lon, origin_lat, origin_lon)
    x = center_x + dx_m / max(1e-6, xy_scale_m)
    y = center_y + dy_m / max(1e-6, xy_scale_m)
    z = alt / max(1e-6, z_scale_m)
    return (
        float(max(0.0, min(grid_n - 1.0, x))),
        float(max(0.0, min(grid_n - 1.0, y))),
        float(max(0.0, min(grid_n - 1.0, z))),
    )


def _extract_corridor_points_geojson(file_path: Path) -> List[Tuple[float, float]]:
    if not file_path.exists():
        return []
    with file_path.open("r", encoding="utf-8") as f:
        doc = json.load(f)
    feats = doc.get("features") or []
    out: List[Tuple[float, float]] = []
    for ft in feats:
        geom = (ft or {}).get("geometry") or {}
        gtype = str(geom.get("type") or "")
        coords = geom.get("coordinates")
        if not coords:
            continue
        if gtype == "LineString":
            for c in coords:
                if isinstance(c, list) and len(c) >= 2:
                    out.append((float(c[0]), float(c[1])))
        elif gtype == "MultiLineString":
            for seg in coords:
                if not isinstance(seg, list):
                    continue
                for c in seg:
                    if isinstance(c, list) and len(c) >= 2:
                        out.append((float(c[0]), float(c[1])))
    return out


def _extract_corridor_points_shp(file_path: Path) -> List[Tuple[float, float]]:
    if pyshp is None or not file_path.exists():
        return []
    out: List[Tuple[float, float]] = []
    reader = pyshp.Reader(str(file_path))
    for sh in reader.shapes():
        pts = sh.points
        if not pts:
            continue
        for p in pts:
            if isinstance(p, (list, tuple)) and len(p) >= 2:
                out.append((float(p[0]), float(p[1])))
    return out


def _extract_corridor_points(file_path: Path) -> List[Tuple[float, float]]:
    ext = file_path.suffix.lower()
    if ext in (".json", ".geojson"):
        return _extract_corridor_points_geojson(file_path)
    if ext == ".shp":
        return _extract_corridor_points_shp(file_path)
    return []


def _resolve_data_file(name: str, nanchang_dir: Path, geo_dir: Path) -> Path:
    p = Path(name)
    if p.is_file():
        return p
    cands = [
        nanchang_dir / name,
        geo_dir / name,
    ]
    for c in cands:
        if c.is_file():
            return c
    return cands[0]


def _load_missions(cfg_path: str) -> List[MissionSpec]:
    if not cfg_path.strip():
        return _default_missions()
    p = Path(cfg_path)
    if not p.exists():
        raise FileNotFoundError(f"mission config not found: {p}")
    doc = json.loads(p.read_text(encoding="utf-8"))
    items = doc.get("missions")
    if not isinstance(items, list) or not items:
        raise ValueError("mission config must contain non-empty `missions` array")
    out: List[MissionSpec] = []
    for idx, item in enumerate(items, start=1):
        start_geo = tuple(item["start_geo"])
        goal_geo = tuple(item["goal_geo"])
        out.append(
            MissionSpec(
                mission_id=int(item.get("mission_id", idx)),
                name=str(item["name"]),
                task_type=str(item["task_type"]),
                start_geo=(float(start_geo[0]), float(start_geo[1]), float(start_geo[2])),
                goal_geo=(float(goal_geo[0]), float(goal_geo[1]), float(goal_geo[2])),
                corridor_files=[str(x) for x in (item.get("corridor_files") or [])],
            )
        )
    return out


def _plot_qtable_summary(q: np.ndarray, out_path: Path) -> Dict[str, float]:
    qmax = np.max(q, axis=3)
    qmean = np.mean(q, axis=3)
    qstd = np.std(q, axis=3)
    center_z = q.shape[2] // 2
    q_slice = qmax[:, :, center_z]

    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig, axes = plt.subplots(1, 3, figsize=(13.8, 4.4))
    h0 = axes[0].imshow(q_slice.T, origin="lower", cmap="viridis")
    axes[0].set_title("Max-Q Slice (center z)")
    axes[0].set_xlabel("Grid X")
    axes[0].set_ylabel("Grid Y")
    plt.colorbar(h0, ax=axes[0], fraction=0.046, pad=0.04)

    flat = q.reshape(-1)
    axes[1].hist(flat, bins=55, color="#1d4ed8", alpha=0.85)
    axes[1].set_title("Q Value Distribution")
    axes[1].set_xlabel("Q")
    axes[1].set_ylabel("Count")

    means = np.mean(q, axis=(0, 1, 2))
    axes[2].bar(np.arange(len(means)), means, color="#9333ea")
    axes[2].set_title("Mean Q by Action")
    axes[2].set_xlabel("Action Id")
    axes[2].set_ylabel("Mean Q")
    axes[2].set_xticks(np.arange(len(means)))

    fig.tight_layout()
    fig.savefig(out_path, dpi=140)
    plt.close(fig)
    return {
        "q_min": float(np.min(flat)),
        "q_max": float(np.max(flat)),
        "q_mean": float(np.mean(flat)),
        "q_std": float(np.std(flat)),
        "q_nonzero_ratio": float(np.mean(np.abs(flat) > 1e-7)),
    }


def _apply_obstacle_buffer(hmap: np.ndarray, buffer_cells: int) -> np.ndarray:
    if buffer_cells <= 0:
        return hmap
    g = hmap.shape[0]
    src = hmap
    out = hmap.copy()
    occ = np.argwhere(src > 1.0)
    if occ.size == 0:
        return out
    r2 = buffer_cells * buffer_cells
    for ix, iy in occ:
        top = float(src[ix, iy])
        x0 = max(0, int(ix - buffer_cells))
        x1 = min(g - 1, int(ix + buffer_cells))
        y0 = max(0, int(iy - buffer_cells))
        y1 = min(g - 1, int(iy + buffer_cells))
        for nx in range(x0, x1 + 1):
            dx = nx - int(ix)
            for ny in range(y0, y1 + 1):
                dy = ny - int(iy)
                if dx * dx + dy * dy > r2:
                    continue
                if out[nx, ny] < top:
                    out[nx, ny] = top
    return out


def _downsample_points(
    pts: List[Tuple[float, float, float]],
    max_points: int,
) -> List[Tuple[float, float, float]]:
    if max_points <= 0 or len(pts) <= max_points:
        return pts
    step = max(1, int(math.ceil(len(pts) / max_points)))
    sampled = pts[::step]
    if len(sampled) > max_points:
        sampled = sampled[:max_points]
    return sampled


# 训练结束后写入 mission 目录、且 plot-only 不得删除/覆盖的制品
MISSION_PRESERVE_FILENAMES = frozenset(
    {
        "training_progress.png",
        "path_evolution.gif",
    }
)


def _clear_dir(dir_path: Path, *, preserve_filenames: frozenset[str] | None = None) -> None:
    if not dir_path.exists():
        return
    keep = preserve_filenames or frozenset()
    for old in sorted(dir_path.rglob("*"), reverse=True):
        try:
            if old.is_file():
                if old.name in keep:
                    continue
                old.unlink()
            elif old.is_dir():
                old.rmdir()
        except Exception:
            continue


def _occupancy_at_cruise_alt(hmap: np.ndarray, cfg: EnvConfig, z_idx: float) -> np.ndarray:
    """在指定巡航高度层显示不可通行区域（含建筑净空约束）。"""
    g = int(hmap.shape[0])
    occ = np.zeros((g, g), dtype=np.float64)
    alt_m = float(z_idx) * float(cfg.z_scale_m_per_grid)
    clearance = float(cfg.clearance_m)
    for ix in range(g):
        for iy in range(g):
            top = float(hmap[ix, iy])
            if top > 1.0 and alt_m < top + clearance:
                occ[ix, iy] = 1.0
    return occ


def _snap_to_free_cell(
    xyz: Tuple[float, float, float],
    hmap: np.ndarray,
    cfg: EnvConfig,
) -> Tuple[float, float, float]:
    return snap_to_free_cell(xyz, hmap, cfg)


def _looks_like_geo_coord(lat: float, lon: float, grid_n: int = 54) -> bool:
    """WGS84 经纬度（中国范围）与栅格坐标区分：lat≈28 若仅用 >grid_n 判断会误判为栅格。"""
    if not (math.isfinite(lat) and math.isfinite(lon)):
        return False
    if 3.0 <= lat <= 54.5 and 70.0 <= lon <= 136.0:
        return True
    if abs(lon) > 70.0 and abs(lat) <= float(grid_n) + 5.0:
        return True
    return False


def _is_geo_path(path: List[List[float]] | None, grid_n: int = 54) -> bool:
    if not path:
        return False
    hits = 0
    for p in path:
        if len(p) < 2:
            continue
        if _looks_like_geo_coord(float(p[0]), float(p[1]), grid_n):
            hits += 1
    return hits >= max(1, len(path) // 3)


def _pick_external_mission_doc(
    doc: Dict[str, Any],
    mission_id: int = 0,
    task_key: str = "",
) -> Dict[str, Any] | None:
    missions = doc.get("missions", {})
    if not isinstance(missions, dict):
        return None
    picked = None
    tk = _sanitize_task_key(task_key) if task_key else ""
    if tk:
        picked = missions.get(tk)
    if picked is None and mission_id > 0:
        picked = missions.get(str(mission_id))
        if picked is None:
            picked = missions.get(int(mission_id))
    return picked if isinstance(picked, dict) else None


def _load_external_path(path_json: str, mission_id: int = 0, task_key: str = "") -> List[List[float]] | None:
    p = Path(path_json.strip())
    if not path_json.strip() or not p.exists():
        return None
    try:
        doc = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(doc, dict) and "missions" in doc:
            picked = _pick_external_mission_doc(doc, mission_id=mission_id, task_key=task_key)
            if picked is None:
                return None
            geo_arr = picked.get("path")
            coord_sys = str(picked.get("coordinate_system", "")).strip().lower()
            grid_n_guess = 54
            gt = picked.get("grid_transform")
            if isinstance(gt, dict) and gt.get("gridN") is not None:
                try:
                    grid_n_guess = int(gt.get("gridN"))
                except Exception:
                    grid_n_guess = 54
            if isinstance(geo_arr, list) and geo_arr and (
                coord_sys in ("geo", "wgs84", "wgs-84")
                or _is_geo_path(geo_arr, grid_n_guess)
            ):
                return [
                    [float(x[0]), float(x[1]), float(x[2] if len(x) > 2 else 0.0)]
                    for x in geo_arr
                    if len(x) >= 2
                ]
            grid_arr = picked.get("path_grid")
            if isinstance(grid_arr, list) and grid_arr and isinstance(grid_arr[0], (list, tuple)):
                return [
                    [float(x[0]), float(x[1]), float(x[2] if len(x) > 2 else 0.0)]
                    for x in grid_arr
                    if len(x) >= 2
                ]
            if coord_sys == "grid" and isinstance(geo_arr, list) and geo_arr:
                return [
                    [float(x[0]), float(x[1]), float(x[2] if len(x) > 2 else 0.0)]
                    for x in geo_arr
                    if len(x) >= 2
                ]
            if isinstance(geo_arr, list) and geo_arr:
                return [
                    [float(x[0]), float(x[1]), float(x[2] if len(x) > 2 else 0.0)]
                    for x in geo_arr
                    if len(x) >= 2
                ]
            return None
        arr = doc.get("path", doc)
        if isinstance(arr, list) and arr and isinstance(arr[0], (list, tuple)):
            return [[float(x[0]), float(x[1]), float(x[2] if len(x) > 2 else 0.0)] for x in arr if len(x) >= 2]
    except Exception:
        return None
    return None


def _is_degenerate_grid_path(path: List[List[float]], grid_n: int) -> bool:
    if not path or len(path) < 2:
        return True
    xs = [float(p[0]) for p in path if len(p) >= 2]
    ys = [float(p[1]) for p in path if len(p) >= 2]
    if not xs or not ys:
        return True
    on_boundary = 0
    for x, y in zip(xs, ys):
        if x <= 0.01 or x >= grid_n - 1.01 or y <= 0.01 or y >= grid_n - 1.01:
            on_boundary += 1
    if on_boundary / max(1, len(xs)) >= 0.8:
        return True
    if max(xs) - min(xs) < 0.5 and max(ys) - min(ys) < 0.5:
        return True
    return False


def _normalize_external_path_to_grid(
    path: List[List[float]] | None,
    ctx: Dict[str, Any],
) -> List[List[float]] | None:
    if not path:
        return path
    g = int(ctx["cfg"].grid_n)
    is_geo = _is_geo_path(path, g)
    if not is_geo:
        if _is_degenerate_grid_path(path, g):
            return None
        return path
    center = g / 2.0
    default_alt_m = float(ctx["start"][2]) * float(ctx["cfg"].z_scale_m_per_grid)
    out: List[List[float]] = []
    for p in path:
        if len(p) < 2:
            continue
        lat = float(p[0])
        lon = float(p[1])
        alt = float(p[2]) if len(p) > 2 else default_alt_m
        gx, gy, gz = _geo_to_grid_xyz(
            lat=lat,
            lon=lon,
            alt=alt,
            origin_lat=float(ctx["origin_lat"]),
            origin_lon=float(ctx["origin_lon"]),
            center_x=center,
            center_y=center,
            xy_scale_m=float(ctx["cfg"].xy_scale_m_per_grid),
            z_scale_m=float(ctx["cfg"].z_scale_m_per_grid),
            grid_n=g,
        )
        out.append([gx, gy, gz])
    if not out or _is_degenerate_grid_path(out, g):
        return None
    return out


def _path_length(path: List[List[float]]) -> float:
    if len(path) < 2:
        return 0.0
    s = 0.0
    for i in range(1, len(path)):
        a = np.array(path[i - 1], dtype=np.float64)
        b = np.array(path[i], dtype=np.float64)
        s += float(np.linalg.norm(b - a))
    return s


def _path_turn_sum(path: List[List[float]]) -> float:
    if len(path) < 3:
        return 0.0
    total = 0.0
    for i in range(1, len(path) - 1):
        v1 = np.array(path[i], dtype=np.float64) - np.array(path[i - 1], dtype=np.float64)
        v2 = np.array(path[i + 1], dtype=np.float64) - np.array(path[i], dtype=np.float64)
        n1 = float(np.linalg.norm(v1))
        n2 = float(np.linalg.norm(v2))
        if n1 < 1e-9 or n2 < 1e-9:
            continue
        cosang = float(np.dot(v1, v2) / (n1 * n2))
        cosang = max(-1.0, min(1.0, cosang))
        total += float(np.arccos(cosang))
    return total


def _min_obstacle_distance(path: List[List[float]], hmap: np.ndarray) -> float:
    occ = np.argwhere(hmap > 1.0).astype(np.float64)
    if occ.size == 0 or not path:
        return float("inf")
    best = float("inf")
    for p in path:
        dx = occ[:, 0] - float(p[0])
        dy = occ[:, 1] - float(p[1])
        d2 = dx * dx + dy * dy
        d = float(np.sqrt(np.min(d2)))
        if d < best:
            best = d
    return best


def _plot_state_value_and_policy(
    q: np.ndarray,
    hmap: np.ndarray,
    z_idx: int,
    out_value: Path,
    out_quiver: Path,
) -> None:
    g = q.shape[0]
    z = max(0, min(q.shape[2] - 1, int(z_idx)))
    qz = q[:, :, z, :]
    v = np.max(qz, axis=2)
    policy = np.argmax(qz, axis=2)
    occ = (hmap > 1.0).astype(np.float64)

    fig, ax = plt.subplots(figsize=(7.6, 6.4))
    hm = ax.imshow(v.T, origin="lower", cmap="turbo")
    ax.contour(occ.T, levels=[0.5], colors=["black"], linewidths=0.55, alpha=0.6)
    ax.set_title(f"状态价值热力图 z={z}")
    ax.set_xlabel("网格X")
    ax.set_ylabel("网格Y")
    plt.colorbar(hm, ax=ax, fraction=0.046, pad=0.04)
    fig.tight_layout()
    fig.savefig(out_value, dpi=150)
    plt.close(fig)

    X, Y = np.meshgrid(np.arange(g), np.arange(g), indexing="ij")
    U = np.zeros((g, g), dtype=np.float64)
    Vv = np.zeros((g, g), dtype=np.float64)
    for ix in range(g):
        for iy in range(g):
            a = int(policy[ix, iy])
            dx, dy, _dz = ACTION_DELTAS[a]
            U[ix, iy] = float(dx)
            Vv[ix, iy] = float(dy)
            if occ[ix, iy] > 0.5:
                U[ix, iy] = 0.0
                Vv[ix, iy] = 0.0
    stride = max(1, g // 28)
    fig2, ax2 = plt.subplots(figsize=(7.6, 6.4))
    ax2.imshow(occ.T, origin="lower", cmap="gray_r", alpha=0.8)
    ax2.quiver(
        X[::stride, ::stride],
        Y[::stride, ::stride],
        U[::stride, ::stride],
        Vv[::stride, ::stride],
        color="#ef4444",
        angles="xy",
        scale_units="xy",
        scale=1.0,
        width=0.003,
        alpha=0.85,
    )
    ax2.set_title(f"策略箭头图 z={z}")
    ax2.set_xlabel("网格X")
    ax2.set_ylabel("网格Y")
    fig2.tight_layout()
    fig2.savefig(out_quiver, dpi=150)
    plt.close(fig2)


def _plot_visit_heatmap(visit_xy: np.ndarray, out_path: Path) -> None:
    fig, ax = plt.subplots(figsize=(7.4, 6.2))
    hm = ax.imshow(np.log1p(visit_xy).T, origin="lower", cmap="magma")
    ax.set_title("状态访问热力图（对数）")
    ax.set_xlabel("网格X")
    ax.set_ylabel("网格Y")
    plt.colorbar(hm, ax=ax, fraction=0.046, pad=0.04)
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)


def _plot_algo_compare(
    hmap: np.ndarray,
    cfg: EnvConfig,
    cruise_z: float,
    rl_path: List[List[float]],
    astar_path: List[List[float]] | None,
    ga_path: List[List[float]] | None,
    out_path: Path,
) -> None:
    fig, ax = plt.subplots(figsize=(8.1, 6.8))
    occ = _occupancy_at_cruise_alt(hmap, cfg, cruise_z).T
    ax.imshow(occ, origin="lower", cmap="gray_r", alpha=0.84)
    cruise_alt_m = float(cruise_z) * float(cfg.z_scale_m_per_grid)
    if rl_path:
        ax.plot([p[0] for p in rl_path], [p[1] for p in rl_path], color="#2563eb", linewidth=2.4, label=f"RL 路径 ({_path_length(rl_path):.1f})")
    if astar_path:
        ax.plot([p[0] for p in astar_path], [p[1] for p in astar_path], color="#dc2626", linewidth=1.9, linestyle="--", label=f"A* 路径 ({_path_length(astar_path):.1f})")
    if ga_path:
        ax.plot([p[0] for p in ga_path], [p[1] for p in ga_path], color="#16a34a", linewidth=1.9, linestyle="-.", label=f"GA 路径 ({_path_length(ga_path):.1f})")
    handles, labels = ax.get_legend_handles_labels()
    if handles:
        ax.legend(loc="upper right")
    ax.set_title(f"路径对比：RL vs A* vs GA（巡航高度 {cruise_alt_m:.0f} m）")
    ax.set_xlabel("网格X")
    ax.set_ylabel("网格Y")
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)


_METRIC_META: Dict[str, Dict[str, str]] = {
    "path_length": {"title": "路径总长度", "ylabel": "长度（栅格格）"},
    "steps": {"title": "飞行步数", "ylabel": "步数（步）"},
    "turn_sum": {"title": "累计转角", "ylabel": "转角（弧度）"},
    "min_obs_dist": {"title": "最小障碍距离", "ylabel": "距离（栅格格）"},
}


def _plot_metrics(
    metric_names: List[str],
    algo_to_vals: Dict[str, Dict[str, List[float]]],
    out_bar: Path,
) -> None:
    algos = list(algo_to_vals.keys())
    fig, axes = plt.subplots(2, 2, figsize=(11.5, 8.8))
    axes = axes.reshape(-1)
    for i, m in enumerate(metric_names):
        ax = axes[i]
        means = [float(np.mean(algo_to_vals[a][m])) for a in algos]
        ax.bar(np.arange(len(algos)), means, color=["#2563eb", "#dc2626", "#16a34a"][: len(algos)])
        ax.set_xticks(np.arange(len(algos)))
        ax.set_xticklabels(algos)
        meta = _METRIC_META.get(m, {"title": m, "ylabel": m})
        ax.set_title(meta["title"])
        ax.set_ylabel(meta["ylabel"])
        ax.grid(axis="y", alpha=0.22)
    fig.tight_layout()
    fig.savefig(out_bar, dpi=150)
    plt.close(fig)


def _plot_curvature_compare(
    rl_path: List[List[float]],
    astar_path: List[List[float]] | None,
    ga_path: List[List[float]] | None,
    out_path: Path,
) -> None:
    def curvature_series(path: List[List[float]]) -> np.ndarray:
        if len(path) < 3:
            return np.array([], dtype=np.float64)
        out = []
        for i in range(1, len(path) - 1):
            v1 = np.array(path[i], dtype=np.float64) - np.array(path[i - 1], dtype=np.float64)
            v2 = np.array(path[i + 1], dtype=np.float64) - np.array(path[i], dtype=np.float64)
            n1 = float(np.linalg.norm(v1))
            n2 = float(np.linalg.norm(v2))
            if n1 < 1e-9 or n2 < 1e-9:
                out.append(0.0)
                continue
            c = float(np.dot(v1, v2) / (n1 * n2))
            c = max(-1.0, min(1.0, c))
            out.append(float(np.arccos(c)))
        return np.array(out, dtype=np.float64)

    rl_c = curvature_series(rl_path)
    astar_c = curvature_series(astar_path or [])
    fig, ax = plt.subplots(figsize=(9.2, 4.6))
    if rl_c.size > 0:
        ax.plot(np.arange(rl_c.size), rl_c, color="#2563eb", linewidth=1.7, label="RL 曲率")
    if astar_c.size > 0:
        ax.plot(np.arange(astar_c.size), astar_c, color="#dc2626", linewidth=1.5, linestyle="--", label="A* 曲率")
    ga_c = curvature_series(ga_path or [])
    if ga_c.size > 0:
        ax.plot(np.arange(ga_c.size), ga_c, color="#16a34a", linewidth=1.5, linestyle="-.", label="GA 曲率")
    ax.set_title("路径平滑度（曲率）对比")
    ax.set_xlabel("路径采样点")
    ax.set_ylabel("转角弧度")
    ax.grid(alpha=0.25)
    ax.legend(loc="upper right")
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)


def _mission_output_dir(images_dir: Path, mission_id: int, task_key: str) -> Path:
    if task_key:
        return images_dir / f"task_{task_key}"
    return images_dir / f"mission_{mission_id}"


def _write_path_evolution_gif(
    hmap: np.ndarray,
    cfg: EnvConfig,
    stage_paths: List[List[List[float]]],
    out_path: Path,
    cruise_z: float,
) -> None:
    """将训练阶段采样的路径合成 path_evolution.gif（2x2 静帧拼图，单帧 GIF）。"""
    paths = [p for p in stage_paths if p and len(p) >= 2]
    if not paths:
        return
    panels = paths[:4]
    while len(panels) < 4:
        panels.append(panels[-1])
    fig, axes = plt.subplots(2, 2, figsize=(9.2, 8.4))
    occ = _occupancy_at_cruise_alt(hmap, cfg, cruise_z).T
    titles = ["阶段 1 (约 25%)", "阶段 2 (约 50%)", "阶段 3 (约 75%)", "阶段 4 (训练结束)"]
    for ax, pth, title in zip(axes.ravel(), panels, titles):
        ax.imshow(occ, origin="lower", cmap="gray_r", alpha=0.86)
        ax.plot([x[0] for x in pth], [x[1] for x in pth], color="#2563eb", linewidth=2.0)
        ax.scatter([pth[0][0]], [pth[0][1]], c="#16a34a", s=28, marker="*")
        ax.scatter([pth[-1][0]], [pth[-1][1]], c="#ef4444", s=40, marker="^")
        ax.set_title(title, fontsize=10)
        ax.set_xlabel("网格X")
        ax.set_ylabel("网格Y")
    fig.suptitle("路径演化（训练阶段采样）", fontsize=12)
    fig.tight_layout(rect=[0, 0, 1, 0.96])
    out_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        fig.savefig(out_path, format="gif", dpi=120)
    except Exception:
        fig.savefig(out_path.with_suffix(".png"), dpi=140)
        print(
            f"[plot] path_evolution gif backend unavailable, wrote {out_path.with_suffix('.png')}",
            flush=True,
        )
    plt.close(fig)
    if out_path.exists():
        print(f"[plot] path_evolution -> {out_path}", flush=True)


def _regenerate_compare_plots_only(
    ctx: Dict[str, Any],
    q: np.ndarray,
    demo_path: List[List[float]],
    *,
    images_dir: Path,
    java_ga_path_json: str,
    java_astar_path_json: str,
    mission_id: int,
    task_key: str,
) -> None:
    """Web 三算法对比触发的 plot-only：只更新与 Java 导出路径相关的对比图，保留训练制品。"""
    out_dir = _mission_output_dir(images_dir, mission_id, task_key)
    out_dir.mkdir(parents=True, exist_ok=True)

    cruise_z = float(ctx["start"][2])
    ok_paths = demo_path if demo_path else []
    astar_path = astar_path_fallback(ctx["hmap"], ctx["cfg"], tuple(ctx["start"]), tuple(ctx["goal"]))
    ga_native = genetic_path_on_grid(ctx["hmap"], ctx["cfg"], tuple(ctx["start"]), tuple(ctx["goal"]))
    java_ga_path = _load_external_path(java_ga_path_json, mission_id=mission_id, task_key=task_key)
    java_astar_path = _load_external_path(java_astar_path_json, mission_id=mission_id, task_key=task_key)
    java_ga_path = _normalize_external_path_to_grid(java_ga_path, ctx)
    java_astar_path = _normalize_external_path_to_grid(java_astar_path, ctx)
    astar_for_compare = java_astar_path if java_astar_path else astar_path
    ga_for_compare = java_ga_path if java_ga_path else ga_native
    _plot_algo_compare(
        hmap=ctx["hmap"],
        cfg=ctx["cfg"],
        cruise_z=cruise_z,
        rl_path=ok_paths,
        astar_path=astar_for_compare,
        ga_path=ga_for_compare,
        out_path=out_dir / "path_compare_rl_astar_ga.png",
    )
    _plot_curvature_compare(
        rl_path=ok_paths,
        astar_path=astar_for_compare,
        ga_path=ga_for_compare,
        out_path=out_dir / "path_curvature_compare.png",
    )
    print(f"[plot-only] compare plots updated under {out_dir} (preserved training artifacts)", flush=True)


def main() -> None:
    _setup_matplotlib_cn()
    args = _parse_args()
    root = Path(__file__).resolve().parent
    os.chdir(root)
    task_key = _sanitize_task_key(args.task_key) if str(args.task_key or "").strip() else ""
    if task_key:
        missions = [
            MissionSpec(
                mission_id=9000,
                name=str(args.task_name or f"任务{task_key}"),
                task_type=str(args.task_type or "custom"),
                start_geo=(float(args.start_lat), float(args.start_lon), float(args.start_alt)),
                goal_geo=(float(args.goal_lat), float(args.goal_lon), float(args.goal_alt)),
                corridor_files=[],
            )
        ]
        args.mission_id = 9000
        args.model_path = f"models/q_table_task_{task_key}.npz"
    else:
        missions = _load_missions(args.mission_config)
        if args.mission_id > 0:
            missions = [m for m in missions if m.mission_id == args.mission_id]
            if not missions:
                raise ValueError(f"mission_id={args.mission_id} not found in mission list")

    geo_dir = (root / ".." / "vue" / "public" / "geo" / "nanchang").resolve()
    nanchang_dir = (root / "nanchang").resolve()
    default_building_shp = nanchang_dir / "南昌市_建筑-百度.shp"
    shp_override = args.shp_path.strip() or (str(default_building_shp) if default_building_shp.exists() else None)
    model_path_arg = str(args.model_path or "").strip()
    using_default_model_name = (model_path_arg == "" or model_path_arg == "models/q_table_25d.npz")
    if using_default_model_name:
        if args.mission_id > 0:
            args.model_path = f"models/q_table_mission_{args.mission_id}.npz"
        else:
            args.model_path = "models/q_table_multi_task.npz"
    images_dir = root / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    # plot-only 仅覆盖即将重写的 PNG，勿清空 mission 目录（避免 Web 三算法对比时图表短暂消失且拖慢体验）
    if not args.plot_only:
        if task_key:
            _clear_dir(_mission_output_dir(images_dir, args.mission_id, task_key))
        elif args.mission_id == 0:
            _clear_dir(images_dir)
        else:
            mission_out = images_dir / f"mission_{args.mission_id}"
            _clear_dir(mission_out)
            training_progress = images_dir / "training_progress.png"
            if training_progress.exists():
                try:
                    training_progress.unlink()
                except Exception:
                    pass
    mission_contexts: List[Dict[str, Any]] = []
    model_path = (root / args.model_path).resolve()
    preloaded_meta: Dict[str, Any] = {}
    if model_path.exists():
        try:
            _, preloaded_meta = load_q_table(str(model_path))
        except Exception:
            preloaded_meta = {}

    for m in missions:
        origin_lat = (m.start_geo[0] + m.goal_geo[0]) / 2.0
        origin_lon = (m.start_geo[1] + m.goal_geo[1]) / 2.0
        origin_alt = (m.start_geo[2] + m.goal_geo[2]) / 2.0
        cruise_alt_m = max(float(m.start_geo[2]), float(m.goal_geo[2]))
        if args.plot_only and preloaded_meta:
            mission_z_scale = float(preloaded_meta.get("z_scale_m_per_grid", args.z_scale))
        else:
            mission_z_scale = resolve_z_scale_m_per_grid(cruise_alt_m, args.grid_n, float(args.z_scale))

        dx_m, dy_m = _geo_delta_m(m.goal_geo[0], m.goal_geo[1], origin_lat, origin_lon)
        # Keep both start/goal away from grid boundary to avoid clipping to 0 or N-1.
        half_usable = max(2.0, (args.grid_n / 2.0) - float(args.margin) - 2.0)
        required_scale = max(abs(dx_m), abs(dy_m), 260.0) / half_usable
        base_scale = max(8.0, required_scale * 1.12)
        hmap, shp_used = load_or_build_height_map(
            grid_n=args.grid_n,
            margin=float(args.margin),
            xy_scale_m_per_grid=base_scale,
            z_scale_m_per_grid=mission_z_scale,
            start_lat=origin_lat,
            start_lon=origin_lon,
            start_alt_m=origin_alt,
            obstacle_cubes=None,
            shp_override=shp_override,
        )
        if float(args.obstacle_buffer_m) > 1e-6:
            buffer_cells = int(round(float(args.obstacle_buffer_m) / max(1e-6, base_scale)))
            hmap = _apply_obstacle_buffer(hmap, max(0, buffer_cells))
        cfg = EnvConfig(
            grid_n=args.grid_n,
            margin=args.margin,
            xy_scale_m_per_grid=base_scale,
            z_scale_m_per_grid=mission_z_scale,
            clearance_m=args.clearance,
            goal_threshold_grid=1.65,
            max_steps_rollout=900,
            max_steps_train=520,
        )
        center = args.grid_n / 2.0
        start_grid = _geo_to_grid_xyz(
            m.start_geo[0], m.start_geo[1], m.start_geo[2],
            origin_lat, origin_lon, center, center, base_scale, mission_z_scale, args.grid_n
        )
        goal_grid = _geo_to_grid_xyz(
            m.goal_geo[0], m.goal_geo[1], m.goal_geo[2],
            origin_lat, origin_lon, center, center, base_scale, mission_z_scale, args.grid_n
        )
        start_raw = start_grid
        goal_raw = goal_grid
        start_grid, goal_grid = ensure_start_goal_reachable(hmap, cfg, start_raw, goal_raw)
        if (abs(start_grid[0] - start_raw[0]) + abs(start_grid[1] - start_raw[1]) + abs(start_grid[2] - start_raw[2])) > 1e-6:
            print(f"[mission] start snapped to free cell: {start_raw} -> {start_grid}", flush=True)
        if (abs(goal_grid[0] - goal_raw[0]) + abs(goal_grid[1] - goal_raw[1]) + abs(goal_grid[2] - goal_raw[2])) > 1e-6:
            print(f"[mission] goal snapped to free cell: {goal_raw} -> {goal_grid}", flush=True)

        corridor_pts: List[Tuple[float, float, float]] = []
        for f in m.corridor_files:
            data_path = _resolve_data_file(f, nanchang_dir=nanchang_dir, geo_dir=geo_dir)
            for lon, lat in _extract_corridor_points(data_path):
                x, y, _z = _geo_to_grid_xyz(
                    lat, lon, m.start_geo[2],
                    origin_lat, origin_lon, center, center, base_scale, mission_z_scale, args.grid_n
                )
                corridor_pts.append((x, y, 0.0))
        corridor_pts = _downsample_points(corridor_pts, int(args.corridor_max_points))

        mission_contexts.append(
            {
                "mission_id": m.mission_id,
                "name": m.name,
                "task_type": m.task_type,
                "hmap": hmap,
                "cfg": cfg,
                "start": start_grid,
                "goal": goal_grid,
                "corridor_points": np.array(corridor_pts, dtype=np.float64) if corridor_pts else None,
                "obstacle_xy": np.argwhere(hmap > 1.0).astype(np.float64),
                "origin_lat": origin_lat,
                "origin_lon": origin_lon,
                "shp_used": shp_used,
                "mission_z_scale": mission_z_scale,
                "requested_cruise_alt_m": cruise_alt_m,
            }
        )
        eff_m = float(start_grid[2]) * float(mission_z_scale)
        print(
            f"[mission] {m.mission_id}. {m.name} ({m.task_type}) "
            f"start={start_grid} goal={goal_grid} cruise={cruise_alt_m:.0f}m "
            f"effective={eff_m:.0f}m z_scale={mission_z_scale:.2f} corridor_pts={len(corridor_pts)} shp={shp_used}",
            flush=True,
        )

    def _episode_provider(rng: np.random.Generator, _ep: int) -> Dict[str, Any]:
        ctx = mission_contexts[int(rng.integers(0, len(mission_contexts)))]
        return {
            "mission_id": ctx["mission_id"],
            "mission_type": ctx["task_type"],
            "hmap": ctx["hmap"],
            "cfg": ctx["cfg"],
            "start": ctx["start"],
            "goal": ctx["goal"],
            "corridor_points": ctx["corridor_points"],
            "obstacle_xy": ctx["obstacle_xy"],
            "apf_enabled": bool(args.enable_apf),
            "apf_repel_weight": float(args.apf_repulse_weight),
            "apf_influence_grid": float(args.apf_influence_grid),
        }

    def _progress(info: Dict[str, float]) -> None:
        episode_rewards.append(float(info.get("reward", 0.0)))
        episode_steps.append(float(info.get("steps", 0.0)))
        episode_path_lens.append(float(info.get("path_length", 0.0)))
        episode_success.append(float(info.get("success", 0.0)))
        ep = int(info["episode"])
        if ep == 1 or ep % max(1, args.log_every) == 0 or ep == int(info["episodes"]):
            print(
                f"[train] ep={ep}/{int(info['episodes'])} temp={info['epsilon']:.3f} "
                f"reward={info['reward']:.2f} success={info['success_rate']:.3f}",
                flush=True,
            )

    episode_rewards: List[float] = []
    episode_steps: List[float] = []
    episode_path_lens: List[float] = []
    episode_success: List[float] = []
    visit_counter_xy = np.zeros((args.grid_n, args.grid_n), dtype=np.float64)
    evolution_stage_paths: List[List[List[float]]] = []

    base_cfg = mission_contexts[0]["cfg"]
    plot_ctx0 = mission_contexts[0]
    total_episodes = int(max(200, args.episodes))

    def _checkpoint_evolution(info: Dict[str, Any]) -> None:
        snap_q = info["q"]
        p, _ok, *_rest = infer_path_with_q(
            plot_ctx0["hmap"],
            plot_ctx0["cfg"],
            snap_q,
            tuple(plot_ctx0["start"]),
            tuple(plot_ctx0["goal"]),
            max_rollout_steps=900,
            use_bfs_fallback=True,
        )
        if p:
            evolution_stage_paths.append([list(pt) for pt in p])

    checkpoint_episodes: set[int] | None = None
    if not args.plot_only and len(mission_contexts) == 1:
        checkpoint_episodes = {
            max(1, total_episodes // 4),
            max(1, total_episodes // 2),
            max(1, (3 * total_episodes) // 4),
            int(total_episodes),
        }

    if args.plot_only:
        if not model_path.exists():
            raise FileNotFoundError(f"plot-only 模式需要已有模型: {model_path}")
        q, loaded_meta = load_q_table(str(model_path))
        reward_curve, success_curve, episode_steps, episode_path_lens = _curves_from_meta(loaded_meta)
        total_episodes = int(loaded_meta.get("episodes") or total_episodes)
        print(f"[plot-only] loaded model: {model_path}", flush=True)
    else:
        q, reward_curve, success_curve = train_q_table_offline(
            mission_contexts[0]["hmap"],
            base_cfg,
            episodes=total_episodes,
            seed=int(args.seed),
            dyna_k=max(0, int(args.dyna_k)),
            visit_counter_xy=visit_counter_xy,
            episode_provider=_episode_provider,
            progress_callback=_progress,
            checkpoint_episodes=checkpoint_episodes,
            checkpoint_callback=_checkpoint_evolution if checkpoint_episodes else None,
        )
        plot_z_scale = float(plot_ctx0.get("mission_z_scale", plot_ctx0["cfg"].z_scale_m_per_grid))
        meta = {
            "created_at": datetime.now().isoformat(),
            "algorithm": "Q-Learning + Reward-Shaping + Dyna-Q",
            "episodes": total_episodes,
            "grid_n": int(args.grid_n),
            "margin": int(args.margin),
            "z_scale_m_per_grid": plot_z_scale,
            "xy_scale_m_per_grid": float(plot_ctx0["cfg"].xy_scale_m_per_grid),
            "clearance_m": float(args.clearance),
            "requested_cruise_alt_m": float(plot_ctx0.get("requested_cruise_alt_m", missions[0].start_geo[2])),
            "effective_cruise_alt_m": float(plot_ctx0["start"][2]) * plot_z_scale,
            "effective_start_z": float(plot_ctx0["start"][2]),
            "dyna_k": int(max(0, args.dyna_k)),
            "apf_enabled": bool(args.enable_apf),
            "apf_repel_weight": float(args.apf_repulse_weight),
            "apf_influence_grid": float(args.apf_influence_grid),
            "obstacle_buffer_m": float(args.obstacle_buffer_m),
            "task_key": task_key or None,
            "start_geo": list(missions[0].start_geo),
            "goal_geo": list(missions[0].goal_geo),
            "origin_lat": float(plot_ctx0["origin_lat"]),
            "origin_lon": float(plot_ctx0["origin_lon"]),
            "training_curves": {
                "reward": reward_curve,
                "success": success_curve,
                "steps": episode_steps,
                "path_length": episode_path_lens,
            },
            "missions": [
                {
                    "mission_id": c["mission_id"],
                    "name": c["name"],
                    "task_type": c["task_type"],
                    "origin_lat": c["origin_lat"],
                    "origin_lon": c["origin_lon"],
                    "xy_scale_m_per_grid": c["cfg"].xy_scale_m_per_grid,
                    "building_shp_used": c["shp_used"],
                }
                for c in mission_contexts
            ],
        }
        save_q_table(str(model_path), q, meta)

    target_contexts = mission_contexts if args.mission_id == 0 and not task_key else [mission_contexts[0]]
    mission_by_id = {m.mission_id: m for m in missions}

    if args.plot_only:
        for ctx in target_contexts:
            demo_cached: List[List[float]] = []
            try:
                from mission_rl_cache import load_mission_rl_path_cache

                cached = load_mission_rl_path_cache(int(ctx["mission_id"]))
                if cached and cached.get("path_grid"):
                    demo_cached = [list(p) for p in cached["path_grid"]]
            except Exception:
                demo_cached = []
            if not demo_cached:
                demo_cached, *_ = infer_path_with_q(
                    ctx["hmap"],
                    ctx["cfg"],
                    q,
                    tuple(ctx["start"]),
                    tuple(ctx["goal"]),
                    max_rollout_steps=900,
                    use_bfs_fallback=True,
                )
            _regenerate_compare_plots_only(
                ctx,
                q,
                demo_cached,
                images_dir=images_dir,
                java_ga_path_json=str(args.java_ga_path_json),
                java_astar_path_json=str(args.java_astar_path_json),
                mission_id=int(ctx["mission_id"]),
                task_key=task_key,
            )
        print("=" * 60)
        print("Plot-only refresh done (training_progress / path_evolution preserved)")
        print("=" * 60)
        return

    _write_training_progress_plots(
        missions=missions,
        images_dir=images_dir,
        task_key=task_key,
        reward_curve=reward_curve,
        success_curve=success_curve,
        steps_curve=episode_steps,
        path_len_curve=episode_path_lens,
        total_episodes=total_episodes,
    )

    for ctx in target_contexts:
        out_dir = _mission_output_dir(images_dir, int(ctx["mission_id"]), task_key)
        out_dir.mkdir(parents=True, exist_ok=True)

        demo_path: List[List[float]] = []
        ok = False
        coll = False
        mode = "q_table"
        demo_path, ok, coll, _id, _md, _fd, mode = infer_path_with_q(
                ctx["hmap"],
                ctx["cfg"],
                q,
                tuple(ctx["start"]),
                tuple(ctx["goal"]),
                max_rollout_steps=900,
                use_bfs_fallback=True,
            )

        m_spec = mission_by_id.get(int(ctx["mission_id"]))
        if m_spec is not None and demo_path and not args.plot_only:
            cfg = ctx["cfg"]
            center = float(cfg.grid_n) / 2.0
            cache_path = save_mission_rl_path_cache(
                int(ctx["mission_id"]),
                mission_name=str(ctx["name"]),
                task_type=str(ctx["task_type"]),
                path_grid=[list(p) for p in demo_path],
                training_start_geo=m_spec.start_geo,
                training_goal_geo=m_spec.goal_geo,
                grid_n=int(cfg.grid_n),
                margin=int(cfg.margin),
                xy_scale_m_per_grid=float(cfg.xy_scale_m_per_grid),
                z_scale_m_per_grid=float(cfg.z_scale_m_per_grid),
                origin_lat=float(ctx["origin_lat"]),
                origin_lon=float(ctx["origin_lon"]),
                grid_center=center,
                rl_success=bool(ok),
                planner_mode=str(mode or "q_table"),
                model_path=str(model_path),
            )
            print(f"[cache] mission RL replay path -> {cache_path}", flush=True)

        _plot_state_value_and_policy(
            q=q,
            hmap=ctx["hmap"],
            z_idx=int(round(ctx["start"][2])),
            out_value=out_dir / "state_value_heatmap.png",
            out_quiver=out_dir / "policy_quiver.png",
        )

        cruise_z = float(ctx["start"][2])
        demo_label = f"任务{ctx['mission_id']} ({ctx['task_type']})"
        fig, ax = plt.subplots(figsize=(7.0, 6.0))
        occ = _occupancy_at_cruise_alt(ctx["hmap"], ctx["cfg"], cruise_z).T
        ax.imshow(occ, origin="lower", cmap="gray_r", alpha=0.9)
        if demo_path:
            xs = [p[0] for p in demo_path]
            ys = [p[1] for p in demo_path]
            ax.plot(xs, ys, color="#111827", linewidth=2.0)
            ax.scatter([xs[0]], [ys[0]], c="#16a34a", s=35, marker="*")
            ax.scatter([ctx["goal"][0]], [ctx["goal"][1]], c="#ef4444", marker="^", s=60)
        cruise_alt_m = cruise_z * float(ctx["cfg"].z_scale_m_per_grid)
        ax.set_title(f"{demo_label} 路径结果 (success={ok}, z={cruise_alt_m:.0f}m)")
        ax.set_xlabel("网格X")
        ax.set_ylabel("网格Y")
        fig.tight_layout()
        fig.savefig(out_dir / "current_trajectory.png", dpi=140)
        plt.close(fig)

        astar_path = astar_path_fallback(
            ctx["hmap"],
            ctx["cfg"],
            tuple(ctx["start"]),
            tuple(ctx["goal"]),
        )
        ga_native = genetic_path_on_grid(
            ctx["hmap"],
            ctx["cfg"],
            tuple(ctx["start"]),
            tuple(ctx["goal"]),
        )
        java_ga_path = _load_external_path(args.java_ga_path_json, mission_id=int(ctx["mission_id"]), task_key=task_key)
        java_astar_path = _load_external_path(args.java_astar_path_json, mission_id=int(ctx["mission_id"]), task_key=task_key)
        java_ga_path = _normalize_external_path_to_grid(java_ga_path, ctx)
        java_astar_path = _normalize_external_path_to_grid(java_astar_path, ctx)
        astar_for_compare = java_astar_path if java_astar_path else astar_path
        ga_for_compare = java_ga_path if java_ga_path else ga_native
        _plot_algo_compare(
            hmap=ctx["hmap"],
            cfg=ctx["cfg"],
            cruise_z=cruise_z,
            rl_path=demo_path,
            astar_path=astar_for_compare,
            ga_path=ga_for_compare,
            out_path=out_dir / "path_compare_rl_astar_ga.png",
        )
        _plot_curvature_compare(
            rl_path=demo_path,
            astar_path=astar_for_compare,
            ga_path=ga_for_compare,
            out_path=out_dir / "path_curvature_compare.png",
        )

        if evolution_stage_paths:
            _write_path_evolution_gif(
                ctx["hmap"],
                ctx["cfg"],
                evolution_stage_paths,
                out_dir / "path_evolution.gif",
                cruise_z,
            )
        elif demo_path:
            _write_path_evolution_gif(
                ctx["hmap"],
                ctx["cfg"],
                [demo_path],
                out_dir / "path_evolution.gif",
                cruise_z,
            )

        eval_runs = max(5, int(args.eval_runs))
        algo_vals: Dict[str, Dict[str, List[float]]] = {
            "RL": {"path_length": [], "steps": [], "turn_sum": [], "min_obs_dist": []},
            "A*": {"path_length": [], "steps": [], "turn_sum": [], "min_obs_dist": []},
        }
        if ga_for_compare:
            algo_vals["GA"] = {"path_length": [], "steps": [], "turn_sum": [], "min_obs_dist": []}

        for _ in range(eval_runs):
            p_rl, _ok_rl, _c, _id, _md, _fd, _m = infer_path_with_q(
                ctx["hmap"],
                ctx["cfg"],
                q,
                tuple(ctx["start"]),
                tuple(ctx["goal"]),
                max_rollout_steps=900,
                use_bfs_fallback=True,
                stochastic_inference=True,
                inference_noise_sigma=0.08,
                goal_guidance_strength=0.25,
            )
            if not p_rl:
                p_rl = demo_path
            algo_vals["RL"]["path_length"].append(_path_length(p_rl))
            algo_vals["RL"]["steps"].append(float(max(0, len(p_rl) - 1)))
            algo_vals["RL"]["turn_sum"].append(_path_turn_sum(p_rl))
            algo_vals["RL"]["min_obs_dist"].append(_min_obstacle_distance(p_rl, ctx["hmap"]))

        p_astar = astar_for_compare if astar_for_compare else []
        for _ in range(eval_runs):
            algo_vals["A*"]["path_length"].append(_path_length(p_astar))
            algo_vals["A*"]["steps"].append(float(max(0, len(p_astar) - 1)))
            algo_vals["A*"]["turn_sum"].append(_path_turn_sum(p_astar))
            algo_vals["A*"]["min_obs_dist"].append(_min_obstacle_distance(p_astar, ctx["hmap"]))
        if ga_for_compare:
            for _ in range(eval_runs):
                algo_vals["GA"]["path_length"].append(_path_length(ga_for_compare))
                algo_vals["GA"]["steps"].append(float(max(0, len(ga_for_compare) - 1)))
                algo_vals["GA"]["turn_sum"].append(_path_turn_sum(ga_for_compare))
                algo_vals["GA"]["min_obs_dist"].append(_min_obstacle_distance(ga_for_compare, ctx["hmap"]))
        _plot_metrics(
            metric_names=["path_length", "steps", "turn_sum", "min_obs_dist"],
            algo_to_vals=algo_vals,
            out_bar=out_dir / "metrics_bar.png",
        )

    if args.print_q_states > 0:
        qmax = np.max(q, axis=3)
        flat_idx = np.argpartition(qmax.ravel(), -args.print_q_states)[-args.print_q_states:]
        flat_idx = flat_idx[np.argsort(qmax.ravel()[flat_idx])[::-1]]
        print("[qtable] top states by max-Q:")
        for rank, idx in enumerate(flat_idx, start=1):
            ix, iy, iz = np.unravel_index(int(idx), qmax.shape)
            best_a = int(np.argmax(q[ix, iy, iz]))
            best_q = float(q[ix, iy, iz, best_a])
            print(f"  #{rank:02d} state=({ix},{iy},{iz}) best_action={best_a} q={best_q:.4f}")

    print("=" * 60)
    print("Offline mission training done")
    print(f"model: {model_path}")
    print(f"training plot: {images_dir / 'training_progress.png'}")
    for ctx in target_contexts:
        out_dir = images_dir / f"mission_{ctx['mission_id']}"
        print(f"mission_{ctx['mission_id']} images: {out_dir}")
    print("=" * 60)


if __name__ == "__main__":
    main()
