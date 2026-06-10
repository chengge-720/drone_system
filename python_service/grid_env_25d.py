"""
2.5D grid RL core:
- offline train Q-table
- save/load Q-table
- online inference only
"""
from __future__ import annotations

import json
import heapq
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple, Any

import numpy as np

# 8 headings + hover + up/down
ACTION_DELTAS: List[Tuple[int, int, int]] = [
    (1, 0, 0),
    (1, 1, 0),
    (0, 1, 0),
    (-1, 1, 0),
    (-1, 0, 0),
    (-1, -1, 0),
    (0, -1, 0),
    (1, -1, 0),
    (0, 0, 0),
    (0, 0, 1),
    (0, 0, -1),
]
N_ACTIONS = len(ACTION_DELTAS)


@dataclass
class EnvConfig:
    grid_n: int = 50
    margin: int = 5
    xy_scale_m_per_grid: float = 1.0
    z_scale_m_per_grid: float = 1.0
    clearance_m: float = 50.0
    goal_threshold_grid: float = 1.75
    max_steps_rollout: int = 900
    max_steps_train: int = 500


def resolve_z_scale_m_per_grid(
    cruise_alt_m: float,
    grid_n: int,
    default_z_scale: float = 2.0,
) -> float:
    """
    选择 z 方向米/格比例，使巡航高度能映射到 [0, grid_n-1] 而不被截断。
    例：grid_n=54、140m 巡航时 z_scale≈2.64；默认 2.0m/格时原生上限约 106m。
    """
    top_z = max(1.0, float(grid_n - 1))
    req = float(cruise_alt_m) / top_z if cruise_alt_m > 0 else float(default_z_scale)
    return max(float(default_z_scale), req * 1.01)


def effective_cruise_alt_from_request(
    cruise_alt_m: float,
    grid_n: int,
    z_scale_m_per_grid: float,
) -> float:
    """将请求高度量化到栅格 Z 索引后再还原为米（与 _geo_to_grid_xyz 截断一致）。"""
    top_z = max(0.0, float(grid_n - 1))
    z_idx = min(top_z, max(0.0, float(cruise_alt_m) / max(1e-6, float(z_scale_m_per_grid))))
    return z_idx * float(z_scale_m_per_grid)


def _collision_at(x: float, y: float, z: float, hmap: np.ndarray, cfg: EnvConfig) -> bool:
    gn = cfg.grid_n
    if x < 0 or y < 0 or z < 0 or x >= gn or y >= gn or z >= gn:
        return True
    ix = int(max(0, min(gn - 1, round(x))))
    iy = int(max(0, min(gn - 1, round(y))))
    top = float(hmap[ix, iy])
    alt = float(z) * cfg.z_scale_m_per_grid
    if top > 1.0:
        return alt < top + cfg.clearance_m
    return False


def _dist(a: Tuple[float, float, float], b: Tuple[float, float, float]) -> float:
    return float(np.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2))


def lift_z_to_clearance(x: float, y: float, z: float, hmap: np.ndarray, cfg: EnvConfig) -> float:
    gn = cfg.grid_n
    zz = float(max(0.0, min(gn - 1.0, z)))
    ix = int(max(0, min(gn - 1, round(x))))
    iy = int(max(0, min(gn - 1, round(y))))
    top = float(hmap[ix, iy])
    if top <= 1.0:
        return zz
    for _ in range(gn + 5):
        if zz * cfg.z_scale_m_per_grid >= top + cfg.clearance_m:
            return zz
        zz = min(gn - 1.0, zz + 1.0)
    return zz


def sanitize_start_goal_z(
    hmap: np.ndarray,
    cfg: EnvConfig,
    start_xyz: Tuple[float, float, float],
    goal_xyz: Tuple[float, float, float],
) -> Tuple[Tuple[float, float, float], Tuple[float, float, float]]:
    sx, sy, sz = start_xyz
    gx, gy, gz = goal_xyz
    return (
        sx,
        sy,
        lift_z_to_clearance(sx, sy, sz, hmap, cfg),
    ), (
        gx,
        gy,
        lift_z_to_clearance(gx, gy, gz, hmap, cfg),
    )


def random_free_state(hmap: np.ndarray, cfg: EnvConfig, rng: np.random.Generator) -> Tuple[int, int, int]:
    gn = cfg.grid_n
    for _ in range(3000):
        x = int(rng.integers(cfg.margin, gn - cfg.margin))
        y = int(rng.integers(cfg.margin, gn - cfg.margin))
        z = int(rng.integers(cfg.margin, gn - cfg.margin))
        z = int(round(lift_z_to_clearance(x, y, z, hmap, cfg)))
        if not _collision_at(float(x), float(y), float(z), hmap, cfg):
            return x, y, z
    return cfg.margin, cfg.margin, max(cfg.margin + 1, 10)


def snap_to_free_cell(
    xyz: Tuple[float, float, float],
    hmap: np.ndarray,
    cfg: EnvConfig,
    *,
    z_preference: float | None = None,
) -> Tuple[float, float, float]:
    """
    将栅格坐标吸附到最近的可通行格点。
    若原位置处于建筑包络内或所需高度超出栅格上限，则在 XY 平面搜索邻近自由格。
    """
    g = int(cfg.grid_n)
    x0 = int(max(0, min(g - 1, round(float(xyz[0])))))
    y0 = int(max(0, min(g - 1, round(float(xyz[1])))))
    z_pref = float(z_preference if z_preference is not None else xyz[2])
    z_pref = float(max(0.0, min(g - 1.0, z_pref)))

    best: Tuple[float, float, float] | None = None
    best_score = float("inf")

    def _try_cell(ix: int, iy: int, ring: int) -> None:
        nonlocal best, best_score
        z = lift_z_to_clearance(float(ix), float(iy), z_pref, hmap, cfg)
        if _collision_at(float(ix), float(iy), z, hmap, cfg):
            return
        score = ring * 1000.0 + abs(z - z_pref) * 2.0 + abs(ix - x0) + abs(iy - y0)
        if score < best_score:
            best_score = score
            best = (float(ix), float(iy), float(z))

    for r in range(0, g):
        ring_found = False
        x_lo = max(0, x0 - r)
        x_hi = min(g - 1, x0 + r)
        y_lo = max(0, y0 - r)
        y_hi = min(g - 1, y0 + r)
        for ix in range(x_lo, x_hi + 1):
            for iy in range(y_lo, y_hi + 1):
                if max(abs(ix - x0), abs(iy - y0)) != r:
                    continue
                before = best_score
                _try_cell(ix, iy, r)
                if best_score < before:
                    ring_found = True
        if ring_found and r <= 3:
            break

    if best is not None:
        return best

    for ix in range(int(cfg.margin), g - int(cfg.margin)):
        for iy in range(int(cfg.margin), g - int(cfg.margin)):
            _try_cell(ix, iy, abs(ix - x0) + abs(iy - y0))

    if best is not None:
        return best

    sx, sy, sz = random_free_state(hmap, cfg, np.random.default_rng(0))
    return float(sx), float(sy), float(sz)


def ensure_start_goal_reachable(
    hmap: np.ndarray,
    cfg: EnvConfig,
    start_xyz: Tuple[float, float, float],
    goal_xyz: Tuple[float, float, float],
) -> Tuple[Tuple[float, float, float], Tuple[float, float, float]]:
    """
    吸附起终点到可通行栅格；若终点从起点不可达，则在附近搜索最近可达自由格作为训练/推理目标。
    """
    start = snap_to_free_cell(start_xyz, hmap, cfg)
    goal = snap_to_free_cell(goal_xyz, hmap, cfg, z_preference=start[2])
    start, goal = sanitize_start_goal_z(hmap, cfg, start, goal)

    if not _collision_at(goal[0], goal[1], goal[2], hmap, cfg):
        if astar_path_fallback(hmap, cfg, start, goal) is not None:
            return start, goal

    gx0, gy0, _gz0 = goal_xyz
    g = int(cfg.grid_n)
    x0 = int(max(0, min(g - 1, round(float(gx0)))))
    y0 = int(max(0, min(g - 1, round(float(gy0)))))
    z_pref = float(start[2])

    best_goal: Tuple[float, float, float] | None = None
    best_score = float("inf")

    for r in range(0, g):
        x_lo = max(int(cfg.margin), x0 - r)
        x_hi = min(g - 1 - int(cfg.margin), x0 + r)
        y_lo = max(int(cfg.margin), y0 - r)
        y_hi = min(g - 1 - int(cfg.margin), y0 + r)
        for ix in range(x_lo, x_hi + 1):
            for iy in range(y_lo, y_hi + 1):
                if max(abs(ix - x0), abs(iy - y0)) != r:
                    continue
                z = lift_z_to_clearance(float(ix), float(iy), z_pref, hmap, cfg)
                if _collision_at(float(ix), float(iy), z, hmap, cfg):
                    continue
                cand = (float(ix), float(iy), float(z))
                if astar_path_fallback(hmap, cfg, start, cand) is None:
                    continue
                score = r * 1000.0 + _dist(cand, goal_xyz) + abs(z - z_pref)
                if score < best_score:
                    best_score = score
                    best_goal = cand
        if best_goal is not None:
            return start, best_goal

    if best_goal is not None:
        return start, best_goal
    return start, goal


def _choose_action_boltzmann(
    q_row: np.ndarray,
    temperature: float,
    rng: np.random.Generator,
) -> int:
    t = max(1e-4, float(temperature))
    centered = q_row - float(np.max(q_row))
    logits = np.clip(centered / t, -40.0, 40.0)
    probs = np.exp(logits)
    denom = float(np.sum(probs))
    if denom <= 0.0 or not np.isfinite(denom):
        return int(rng.integers(0, len(q_row)))
    probs = probs / denom
    return int(rng.choice(len(q_row), p=probs))


def _corridor_distance_xy(
    pos: np.ndarray,
    corridor_points: Optional[np.ndarray],
) -> Optional[float]:
    if corridor_points is None or corridor_points.size == 0:
        return None
    dx = corridor_points[:, 0] - float(pos[0])
    dy = corridor_points[:, 1] - float(pos[1])
    d2 = dx * dx + dy * dy
    return float(np.sqrt(np.min(d2)))


def _nearest_obstacle_distance_xy(
    pos: np.ndarray,
    obstacle_xy: Optional[np.ndarray],
) -> Optional[float]:
    if obstacle_xy is None or obstacle_xy.size == 0:
        return None
    dx = obstacle_xy[:, 0] - float(pos[0])
    dy = obstacle_xy[:, 1] - float(pos[1])
    d2 = dx * dx + dy * dy
    return float(np.sqrt(np.min(d2)))


def train_q_table_offline(
    hmap: np.ndarray,
    cfg: EnvConfig,
    episodes: int = 3000,
    learning_rate: float = 0.2,
    gamma: float = 0.98,
    eps_start: float = 1.25,
    eps_end: float = 0.12,
    seed: int = 42,
    start_goal_mode: str = "random",
    fixed_ratio: float = 0.6,
    fixed_start_xyz: Optional[Tuple[float, float, float]] = None,
    fixed_goal_xyz: Optional[Tuple[float, float, float]] = None,
    dyna_k: int = 30,
    optimistic_init: float = 4.0,
    shaping_scale: float = 2.6,
    corridor_tolerance_grid: float = 2.4,
    visit_counter_xy: Optional[np.ndarray] = None,
    checkpoint_episodes: Optional[set[int]] = None,
    checkpoint_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
    episode_provider: Optional[Callable[[np.random.Generator, int], Dict[str, Any]]] = None,
    progress_callback: Optional[Callable[[Dict[str, float]], None]] = None,
) -> Tuple[np.ndarray, List[float], List[float]]:
    rng = np.random.default_rng(seed)
    gn = cfg.grid_n
    q = np.full((gn, gn, gn, N_ACTIONS), float(optimistic_init), dtype=np.float32)
    reward_curve: List[float] = []
    success_curve: List[float] = []
    success_count = 0
    model_memory: Dict[int, Dict[Tuple[int, int, int, int], Tuple[Tuple[int, int, int], float, float]]] = {}

    for ep in range(episodes):
        # Softmax temperature annealing (Boltzmann exploration).
        temperature = eps_start + (eps_end - eps_start) * (ep / max(1, episodes - 1))
        corridor_points: Optional[np.ndarray] = None
        obstacle_xy: Optional[np.ndarray] = None
        apf_enabled = False
        apf_repel_weight = 0.0
        apf_influence_grid = 3.5
        mission_type = "generic"
        mission_id = 0
        if episode_provider is not None:
            payload = episode_provider(rng, ep)
            hmap_ep = payload.get("hmap", hmap)
            cfg_ep = payload.get("cfg", cfg)
            start = tuple(payload["start"])
            goal = tuple(payload["goal"])
            mission_type = str(payload.get("mission_type", "generic"))
            mission_id = int(payload.get("mission_id", 0))
            cp = payload.get("corridor_points")
            if isinstance(cp, np.ndarray):
                corridor_points = cp.astype(np.float64, copy=False)
            elif isinstance(cp, list) and cp:
                corridor_points = np.array(cp, dtype=np.float64)
            ox = payload.get("obstacle_xy")
            if isinstance(ox, np.ndarray):
                obstacle_xy = ox.astype(np.float64, copy=False)
            elif isinstance(ox, list) and ox:
                obstacle_xy = np.array(ox, dtype=np.float64)
            apf_enabled = bool(payload.get("apf_enabled", False))
            apf_repel_weight = float(payload.get("apf_repel_weight", 0.0))
            apf_influence_grid = float(payload.get("apf_influence_grid", 3.5))
        else:
            hmap_ep = hmap
            cfg_ep = cfg
            use_fixed_pair = (
                start_goal_mode == "fixed"
                or (
                    start_goal_mode == "mixed"
                    and fixed_start_xyz is not None
                    and fixed_goal_xyz is not None
                    and rng.random() < max(0.0, min(1.0, fixed_ratio))
                )
            )
            if use_fixed_pair and fixed_start_xyz is not None and fixed_goal_xyz is not None:
                start = fixed_start_xyz
                goal = fixed_goal_xyz
            else:
                sx, sy, sz = random_free_state(hmap_ep, cfg_ep, rng)
                gx, gy, gz = random_free_state(hmap_ep, cfg_ep, rng)
                start = (float(sx), float(sy), float(sz))
                goal = (float(gx), float(gy), float(gz))
        start, goal = sanitize_start_goal_z(hmap_ep, cfg_ep, start, goal)

        pos = np.array(start, dtype=np.float64)
        total_r = 0.0
        ok = False
        prev_action: Optional[int] = None
        steps_used = 0
        path_length = 0.0
        model = model_memory.setdefault(mission_id, {})
        for step_idx in range(cfg_ep.max_steps_train):
            ix, iy, iz = int(round(pos[0])), int(round(pos[1])), int(round(pos[2]))
            ix = max(0, min(gn - 1, ix))
            iy = max(0, min(gn - 1, iy))
            iz = max(0, min(gn - 1, iz))
            steps_used = step_idx + 1
            if visit_counter_xy is not None and visit_counter_xy.shape == (gn, gn):
                visit_counter_xy[ix, iy] += 1.0

            a = _choose_action_boltzmann(q[ix, iy, iz].astype(np.float64, copy=False), temperature, rng)

            dx, dy, dz = ACTION_DELTAS[a]
            nx, ny, nz = pos[0] + dx, pos[1] + dy, pos[2] + dz
            done = False
            old_dist = _dist((float(pos[0]), float(pos[1]), float(pos[2])), goal)
            if _collision_at(nx, ny, nz, hmap_ep, cfg_ep):
                r = -120.0
                done = True
            else:
                prev_pos = pos.copy()
                pos = np.array([nx, ny, nz], dtype=np.float64)
                path_length += float(np.linalg.norm(pos - prev_pos))
                dist = _dist(tuple(pos), goal)
                # Potential-based reward shaping to mitigate sparse reward.
                phi_s = -old_dist
                phi_s_next = -dist
                shaping = shaping_scale * (gamma * phi_s_next - phi_s)
                # Keep "reach goal" as primary objective:
                # - per-step/time penalty
                # - absolute distance penalty
                r = -0.55 + shaping - 0.10 * dist
                if dist >= old_dist - 1e-9:
                    r -= 0.35
                if prev_action is not None and prev_action != a:
                    r -= 0.06
                # Avoid learning to hover in place far from goal.
                if a == 8 and dist > cfg_ep.goal_threshold_grid * 1.2:
                    r -= 0.25
                if mission_type in ("water_inspection", "road_inspection"):
                    d_line = _corridor_distance_xy(pos, corridor_points)
                    if d_line is not None:
                        tol = max(0.5, float(corridor_tolerance_grid))
                        if d_line <= tol:
                            r += 0.22 * (1.0 - d_line / tol)
                        else:
                            r -= min(0.8, 0.35 * (d_line - tol))
                # APF is only used for generic city-air tasks (e.g. rescue/transport),
                # not for water/road inspection corridor-following tasks.
                if (
                    apf_enabled
                    and mission_type not in ("water_inspection", "road_inspection")
                    and apf_repel_weight > 1e-9
                ):
                    d_obs = _nearest_obstacle_distance_xy(pos, obstacle_xy)
                    if d_obs is not None:
                        d0 = max(0.5, float(apf_influence_grid))
                        if d_obs < d0:
                            rep = apf_repel_weight * ((1.0 / max(0.08, d_obs)) - (1.0 / d0)) ** 2
                            r -= min(6.0, rep)
                if dist <= cfg_ep.goal_threshold_grid:
                    r += 520.0
                    done = True
                    ok = True

            nx_i, ny_i, nz_i = int(round(pos[0])), int(round(pos[1])), int(round(pos[2]))
            nx_i = max(0, min(gn - 1, nx_i))
            ny_i = max(0, min(gn - 1, ny_i))
            nz_i = max(0, min(gn - 1, nz_i))
            td_target = r + gamma * float(np.max(q[nx_i, ny_i, nz_i])) * (0.0 if done else 1.0)
            q[ix, iy, iz, a] += learning_rate * (td_target - q[ix, iy, iz, a])
            prev_action = a

            # Dyna-Q model learning and planning updates.
            model[(ix, iy, iz, a)] = ((nx_i, ny_i, nz_i), float(r), 1.0 if done else 0.0)
            if dyna_k > 0 and model:
                keys = list(model.keys())
                plan_n = min(int(max(0, dyna_k)), len(keys))
                for _k in range(plan_n):
                    sk = keys[int(rng.integers(0, len(keys)))]
                    (sx_i, sy_i, sz_i, sa) = sk
                    (s_next, sim_r, sim_done) = model[sk]
                    snx, sny, snz = s_next
                    sim_td = sim_r + gamma * float(np.max(q[snx, sny, snz])) * (0.0 if sim_done > 0.5 else 1.0)
                    q[sx_i, sy_i, sz_i, sa] += learning_rate * (sim_td - q[sx_i, sy_i, sz_i, sa])

            total_r += r
            if done:
                break

        reward_curve.append(float(total_r))
        if ok:
            success_count += 1
        success_curve.append(success_count / float(ep + 1))
        if progress_callback is not None:
            progress_callback(
                {
                    "episode": float(ep + 1),
                    "episodes": float(episodes),
                    "epsilon": float(temperature),
                    "reward": float(total_r),
                    "success_rate": float(success_curve[-1]),
                    "steps": float(steps_used),
                    "path_length": float(path_length),
                    "success": 1.0 if ok else 0.0,
                }
            )
        if (
            checkpoint_callback is not None
            and checkpoint_episodes is not None
            and int(ep + 1) in checkpoint_episodes
        ):
            checkpoint_callback(
                {
                    "episode": int(ep + 1),
                    "mission_id": int(mission_id),
                    "q": q.copy(),
                }
            )

    return q, reward_curve, success_curve


def bfs_path_fallback(
    hmap: np.ndarray,
    cfg: EnvConfig,
    start_xyz: Tuple[float, float, float],
    goal_xyz: Tuple[float, float, float],
) -> Optional[List[List[float]]]:
    start_xyz, goal_xyz = sanitize_start_goal_z(hmap, cfg, start_xyz, goal_xyz)
    gn = cfg.grid_n
    sx, sy, sz = [int(round(v)) for v in start_xyz]
    gx, gy, gz = [int(round(v)) for v in goal_xyz]
    sx, sy, sz = max(0, min(gn - 1, sx)), max(0, min(gn - 1, sy)), max(0, min(gn - 1, sz))
    gx, gy, gz = max(0, min(gn - 1, gx)), max(0, min(gn - 1, gy)), max(0, min(gn - 1, gz))
    start = (sx, sy, sz)
    goal = (float(gx), float(gy), float(gz))
    if _collision_at(float(sx), float(sy), float(sz), hmap, cfg):
        return None

    qd: deque = deque([start])
    parent: Dict[Tuple[int, int, int], Optional[Tuple[int, int, int]]] = {start: None}
    while qd:
        cx, cy, cz = qd.popleft()
        if _dist((float(cx), float(cy), float(cz)), goal) <= cfg.goal_threshold_grid:
            rev: List[List[float]] = []
            node: Optional[Tuple[int, int, int]] = (cx, cy, cz)
            while node is not None:
                rev.append([float(node[0]), float(node[1]), float(node[2])])
                node = parent[node]
            return list(reversed(rev))
        for dx, dy, dz in ACTION_DELTAS:
            nx, ny, nz = cx + dx, cy + dy, cz + dz
            if nx < 0 or ny < 0 or nz < 0 or nx >= gn or ny >= gn or nz >= gn:
                continue
            if _collision_at(float(nx), float(ny), float(nz), hmap, cfg):
                continue
            nb = (nx, ny, nz)
            if nb not in parent:
                parent[nb] = (cx, cy, cz)
                qd.append(nb)
    return None


def astar_path_fallback(
    hmap: np.ndarray,
    cfg: EnvConfig,
    start_xyz: Tuple[float, float, float],
    goal_xyz: Tuple[float, float, float],
    *,
    heuristic_weight: float = 1.15,
    vertical_penalty: float = 0.25,
    clearance_soft_penalty: float = 0.12,
) -> Optional[List[List[float]]]:
    start_xyz, goal_xyz = sanitize_start_goal_z(hmap, cfg, start_xyz, goal_xyz)
    gn = cfg.grid_n
    sx, sy, sz = [int(round(v)) for v in start_xyz]
    gx, gy, gz = [int(round(v)) for v in goal_xyz]
    sx, sy, sz = max(0, min(gn - 1, sx)), max(0, min(gn - 1, sy)), max(0, min(gn - 1, sz))
    gx, gy, gz = max(0, min(gn - 1, gx)), max(0, min(gn - 1, gy)), max(0, min(gn - 1, gz))
    start = (sx, sy, sz)
    goal = (float(gx), float(gy), float(gz))
    if _collision_at(float(sx), float(sy), float(sz), hmap, cfg):
        return None

    w = max(1.0, float(heuristic_weight))
    v_pen = max(0.0, float(vertical_penalty))
    c_pen = max(0.0, float(clearance_soft_penalty))

    def _h(node: Tuple[int, int, int]) -> float:
        return _dist((float(node[0]), float(node[1]), float(node[2])), goal)

    def _step_cost(cur: Tuple[int, int, int], nxt: Tuple[int, int, int]) -> float:
        dx = nxt[0] - cur[0]
        dy = nxt[1] - cur[1]
        dz = nxt[2] - cur[2]
        base = float(np.sqrt(dx * dx + dy * dy + dz * dz))
        cost = base + v_pen * abs(float(dz))
        ix, iy = nxt[0], nxt[1]
        top = float(hmap[ix, iy])
        if top > 1.0:
            alt = float(nxt[2]) * cfg.z_scale_m_per_grid
            # 软惩罚：贴着障碍顶面走会增加代价，但不会强制不可行。
            slack = alt - (top + cfg.clearance_m)
            if slack < 6.0:
                cost += c_pen * (6.0 - slack)
        return cost

    open_heap: List[Tuple[float, float, Tuple[int, int, int]]] = []
    g_score: Dict[Tuple[int, int, int], float] = {start: 0.0}
    parent: Dict[Tuple[int, int, int], Optional[Tuple[int, int, int]]] = {start: None}
    heapq.heappush(open_heap, (w * _h(start), 0.0, start))
    closed: set[Tuple[int, int, int]] = set()

    while open_heap:
        _f, cur_g, cur = heapq.heappop(open_heap)
        if cur in closed:
            continue
        closed.add(cur)
        if cur_g > g_score.get(cur, float("inf")) + 1e-9:
            continue

        cx, cy, cz = cur
        if _dist((float(cx), float(cy), float(cz)), goal) <= cfg.goal_threshold_grid:
            rev: List[List[float]] = []
            node: Optional[Tuple[int, int, int]] = cur
            while node is not None:
                rev.append([float(node[0]), float(node[1]), float(node[2])])
                node = parent[node]
            return list(reversed(rev))

        for dx, dy, dz in ACTION_DELTAS:
            nx, ny, nz = cx + dx, cy + dy, cz + dz
            if nx < 0 or ny < 0 or nz < 0 or nx >= gn or ny >= gn or nz >= gn:
                continue
            if _collision_at(float(nx), float(ny), float(nz), hmap, cfg):
                continue
            nb = (nx, ny, nz)
            tentative_g = cur_g + _step_cost(cur, nb)
            if tentative_g + 1e-9 >= g_score.get(nb, float("inf")):
                continue
            g_score[nb] = tentative_g
            parent[nb] = cur
            heapq.heappush(open_heap, (tentative_g + w * _h(nb), tentative_g, nb))
    return None


_GA_XY_DIRS: List[Tuple[int, int]] = [
    (1, 0),
    (1, 1),
    (0, 1),
    (-1, 1),
    (-1, 0),
    (-1, -1),
    (0, -1),
    (1, -1),
]


def genetic_path_on_grid(
    hmap: np.ndarray,
    cfg: EnvConfig,
    start_xyz: Tuple[float, float, float],
    goal_xyz: Tuple[float, float, float],
    *,
    population_size: int = 56,
    generations: int = 110,
    seed: int = 42,
) -> Optional[List[List[float]]]:
    """在 2.5D 建筑栅格上用遗传算法搜索避障路径（巡航高度与 RL 一致）。"""
    start_xyz, goal_xyz = ensure_start_goal_reachable(hmap, cfg, start_xyz, goal_xyz)
    rng = np.random.default_rng(int(seed))
    gn = cfg.grid_n
    sx, sy, sz = [int(round(v)) for v in start_xyz]
    gx, gy, gz = [int(round(v)) for v in goal_xyz]
    sx = max(0, min(gn - 1, sx))
    sy = max(0, min(gn - 1, sy))
    sz = max(0, min(gn - 1, sz))
    goal = (float(gx), float(gy), float(gz))
    chromo_len = int(min(420, max(36, gn * 4)))

    def _simulate(chromo: List[int]) -> Tuple[List[List[float]], bool, float]:
        cx, cy, cz = sx, sy, sz
        path: List[List[float]] = [[float(cx), float(cy), float(cz)]]
        for gene in chromo:
            if _dist((float(cx), float(cy), float(cz)), goal) <= cfg.goal_threshold_grid:
                break
            dx, dy = _GA_XY_DIRS[int(gene) % len(_GA_XY_DIRS)]
            nx, ny = cx + dx, cy + dy
            if nx < 0 or ny < 0 or nx >= gn or ny >= gn:
                continue
            nz = float(lift_z_to_clearance(float(nx), float(ny), float(cz), hmap, cfg))
            if _collision_at(float(nx), float(ny), nz, hmap, cfg):
                continue
            cx, cy, cz = nx, ny, int(round(nz))
            if path and path[-1] == [float(cx), float(cy), float(cz)]:
                continue
            path.append([float(cx), float(cy), float(cz)])
        reached = _dist((float(cx), float(cy), float(cz)), goal) <= cfg.goal_threshold_grid
        length = sum(
            _dist(tuple(path[i - 1]), tuple(path[i]))
            for i in range(1, len(path))
        )
        miss = _dist((float(cx), float(cy), float(cz)), goal)
        cost = length + (80.0 * miss if not reached else 0.0)
        return path, reached, cost

    def _path_from_astar_seed() -> Optional[List[int]]:
        seed_path = astar_path_fallback(hmap, cfg, start_xyz, goal_xyz)
        if not seed_path or len(seed_path) < 2:
            return None
        chromo: List[int] = []
        cx, cy = sx, sy
        for pt in seed_path[1:]:
            tx, ty = int(round(pt[0])), int(round(pt[1]))
            best_dir = 0
            best_d = float("inf")
            for i, (dx, dy) in enumerate(_GA_XY_DIRS):
                if cx + dx == tx and cy + dy == ty:
                    best_dir = i
                    best_d = 0.0
                    break
                d = abs(cx + dx - tx) + abs(cy + dy - ty)
                if d < best_d:
                    best_d = d
                    best_dir = i
            chromo.append(best_dir)
            cx += _GA_XY_DIRS[best_dir][0]
            cy += _GA_XY_DIRS[best_dir][1]
            if len(chromo) >= chromo_len:
                break
        while len(chromo) < chromo_len:
            chromo.append(int(rng.integers(0, len(_GA_XY_DIRS))))
        return chromo

    population: List[List[int]] = []
    seed_chromo = _path_from_astar_seed()
    if seed_chromo:
        population.append(seed_chromo)
        for _ in range(max(0, population_size // 4 - 1)):
            mutant = list(seed_chromo)
            for _m in range(max(1, chromo_len // 10)):
                mutant[int(rng.integers(0, chromo_len))] = int(rng.integers(0, len(_GA_XY_DIRS)))
            population.append(mutant)
    while len(population) < population_size:
        population.append([int(rng.integers(0, len(_GA_XY_DIRS))) for _ in range(chromo_len)])

    best_path: Optional[List[List[float]]] = None
    best_cost = float("inf")
    for _gen in range(max(20, int(generations))):
        scored = []
        for chromo in population:
            path, reached, cost = _simulate(chromo)
            scored.append((cost, reached, chromo, path))
            if reached and cost < best_cost:
                best_cost = cost
                best_path = path
        scored.sort(key=lambda x: (0 if x[1] else 1, x[0]))
        if scored[0][1] and best_path is not None:
            break
        elites = [list(x[2]) for x in scored[: max(2, population_size // 5)]]
        next_pop = elites[:]
        while len(next_pop) < population_size:
            a = elites[int(rng.integers(0, len(elites)))]
            b = elites[int(rng.integers(0, len(elites)))]
            cut = int(rng.integers(1, chromo_len))
            child = a[:cut] + b[cut:]
            for i in range(chromo_len):
                if rng.random() < 0.12:
                    child[i] = int(rng.integers(0, len(_GA_XY_DIRS)))
            next_pop.append(child)
        population = next_pop

    if best_path:
        return best_path
    fallback = astar_path_fallback(hmap, cfg, start_xyz, goal_xyz)
    return fallback


def infer_path_with_q(
    hmap: np.ndarray,
    cfg: EnvConfig,
    q: np.ndarray,
    start_xyz: Tuple[float, float, float],
    goal_xyz: Tuple[float, float, float],
    max_rollout_steps: int = 900,
    use_bfs_fallback: bool = True,
    infer_goal_scale: float = 1.0,
    stochastic_inference: bool = False,
    inference_noise_sigma: float = 0.0,
    goal_guidance_strength: float = 0.0,
    early_switch_patience_steps: int = 40,
    early_switch_min_progress_grid: float = 0.75,
    astar_heuristic_weight: float = 1.15,
    astar_vertical_penalty: float = 0.25,
    astar_clearance_soft_penalty: float = 0.12,
) -> Tuple[List[List[float]], bool, bool, float, float, float, str]:
    start_xyz, goal_xyz = ensure_start_goal_reachable(hmap, cfg, start_xyz, goal_xyz)
    gn = cfg.grid_n
    pos = np.array(start_xyz, dtype=np.float64)
    path: List[List[float]] = [pos.tolist()]
    collision = False
    init_d = _dist(tuple(pos), goal_xyz)
    min_d = init_d

    goal_scale = max(0.1, float(infer_goal_scale))
    goal_threshold = float(cfg.goal_threshold_grid) * goal_scale
    eps_raw = max(0.0, min(1.0, float(inference_noise_sigma)))
    # 在线随机探索开启后，给一个最小探索率，避免“看起来开了但几乎不变”
    eps = max(0.08, eps_raw) if stochastic_inference else 0.0
    guide = max(0.0, min(1.0, float(goal_guidance_strength)))
    patience = max(1, int(early_switch_patience_steps))
    min_progress_grid = max(0.0, float(early_switch_min_progress_grid))
    rng = np.random.default_rng()
    last_improve_step = 0

    for step_idx in range(max_rollout_steps):
        ix, iy, iz = int(round(pos[0])), int(round(pos[1])), int(round(pos[2]))
        ix = max(0, min(gn - 1, ix))
        iy = max(0, min(gn - 1, iy))
        iz = max(0, min(gn - 1, iz))
        if stochastic_inference and rng.random() < eps:
            a = int(rng.integers(0, N_ACTIONS))
        else:
            if guide > 1e-6:
                qvals = q[ix, iy, iz].astype(np.float64, copy=False)
                hvals = np.full((N_ACTIONS,), -1e9, dtype=np.float64)
                for ai, (dx, dy, dz) in enumerate(ACTION_DELTAS):
                    nx, ny, nz = pos[0] + dx, pos[1] + dy, pos[2] + dz
                    if _collision_at(nx, ny, nz, hmap, cfg):
                        continue
                    hvals[ai] = -_dist((float(nx), float(ny), float(nz)), goal_xyz)
                finite = hvals > -1e8
                if np.any(finite):
                    mn = float(np.min(hvals[finite]))
                    mx = float(np.max(hvals[finite]))
                    if mx - mn > 1e-9:
                        hvals[finite] = (hvals[finite] - mn) / (mx - mn)
                    else:
                        hvals[finite] = 0.0
                    score = (1.0 - guide) * qvals + guide * hvals
                    if stochastic_inference:
                        # 轻度噪声 + Top-K 采样，确保多次推理有可观察差异
                        score = score + rng.normal(0.0, max(1e-6, eps_raw), size=score.shape)
                        k = min(3, len(score))
                        top_idx = np.argpartition(score, -k)[-k:]
                        w = np.exp(score[top_idx] - np.max(score[top_idx]))
                        w = w / np.sum(w)
                        a = int(rng.choice(top_idx, p=w))
                    else:
                        # 对并列最优随机打破，避免固定 tie-break
                        mx = float(np.max(score))
                        best = np.where(np.isclose(score, mx))[0]
                        a = int(rng.choice(best)) if len(best) > 1 else int(np.argmax(score))
                else:
                    a = int(np.argmax(q[ix, iy, iz]))
            else:
                qrow = q[ix, iy, iz].astype(np.float64, copy=False)
                if stochastic_inference:
                    s = qrow + rng.normal(0.0, max(1e-6, eps_raw), size=qrow.shape)
                    k = min(3, len(s))
                    top_idx = np.argpartition(s, -k)[-k:]
                    w = np.exp(s[top_idx] - np.max(s[top_idx]))
                    w = w / np.sum(w)
                    a = int(rng.choice(top_idx, p=w))
                else:
                    mx = float(np.max(qrow))
                    best = np.where(np.isclose(qrow, mx))[0]
                    a = int(rng.choice(best)) if len(best) > 1 else int(np.argmax(qrow))
        dx, dy, dz = ACTION_DELTAS[a]
        nx, ny, nz = pos[0] + dx, pos[1] + dy, pos[2] + dz
        if _collision_at(nx, ny, nz, hmap, cfg):
            collision = True
            break
        pos = np.array([nx, ny, nz], dtype=np.float64)
        path.append(pos.tolist())
        d = _dist(tuple(pos), goal_xyz)
        prev_min_d = min_d
        min_d = min(min_d, d)
        if d < prev_min_d - 1e-9:
            last_improve_step = step_idx + 1
        if d <= goal_threshold:
            return (
                path,
                True,
                False,
                init_d * cfg.xy_scale_m_per_grid,
                min_d * cfg.xy_scale_m_per_grid,
                d * cfg.xy_scale_m_per_grid,
                "q_table",
            )

        # RL 长时间无明显进展时，提前切换到 A* 回退，减少无效 rollout 代价。
        if use_bfs_fallback and (step_idx + 1 - last_improve_step) >= patience:
            progress = init_d - min_d
            if progress < min_progress_grid:
                fb = astar_path_fallback(
                    hmap,
                    cfg,
                    tuple(path[-1]),
                    goal_xyz,
                    heuristic_weight=astar_heuristic_weight,
                    vertical_penalty=astar_vertical_penalty,
                    clearance_soft_penalty=astar_clearance_soft_penalty,
                )
                if fb is not None and len(fb) > 1:
                    merged = path + fb[1:]
                    final_d = _dist(tuple(merged[-1]), goal_xyz)
                    return (
                        merged,
                        True,
                        False,
                        init_d * cfg.xy_scale_m_per_grid,
                        min(min_d, final_d) * cfg.xy_scale_m_per_grid,
                        final_d * cfg.xy_scale_m_per_grid,
                        "astar_fallback_early",
                    )

    if use_bfs_fallback:
        fb = astar_path_fallback(
            hmap,
            cfg,
            start_xyz,
            goal_xyz,
            heuristic_weight=astar_heuristic_weight,
            vertical_penalty=astar_vertical_penalty,
            clearance_soft_penalty=astar_clearance_soft_penalty,
        )
        if fb is not None and len(fb) > 1:
            d = _dist(tuple(fb[-1]), goal_xyz)
            return (
                fb,
                True,
                False,
                init_d * cfg.xy_scale_m_per_grid,
                min_d * cfg.xy_scale_m_per_grid,
                d * cfg.xy_scale_m_per_grid,
                "astar_fallback",
            )

    final_d = _dist(tuple(path[-1]), goal_xyz)
    return (
        path,
        False,
        collision,
        init_d * cfg.xy_scale_m_per_grid,
        min_d * cfg.xy_scale_m_per_grid,
        final_d * cfg.xy_scale_m_per_grid,
        "q_table",
    )


def save_q_table(path: str, q: np.ndarray, meta: Dict[str, object]) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(str(p), q=q, meta=json.dumps(meta, ensure_ascii=False))


def load_q_table(path: str) -> Tuple[np.ndarray, Dict[str, object]]:
    with np.load(path, allow_pickle=False) as z:
        q = z["q"].astype(np.float32, copy=False)
        meta = json.loads(str(z["meta"].tolist())) if "meta" in z else {}
    return q, meta
