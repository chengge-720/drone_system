# UAV Path Planning (Python Service)

本目录已精简为任务驱动版强化学习训练与推理服务，配合 Java Web 端进行无人机路径规划。

## 当前训练机制

- `Q-learning` 表格法
- 势函数奖励塑形（Potential-based shaping）
- `Dyna-Q` 规划更新（默认 `k=30`）
- Boltzmann 探索退火
- 任务约束奖励：
  - `water_inspection`：沿水系走廊飞行
  - `road_inspection`：沿道路走廊飞行

> 说明：默认经纬度为可运行的近似点位。若你有精确起终点，建议使用 `--mission-config` 覆盖。

## 依赖数据

- `python_service/nanchang`（优先）：
  - `南昌市_建筑-百度.shp`
  - `南昌市_其它道路.shp`
  - `南昌市_市区一级道路.shp`
  - `南昌市_水系.shp`
- 若 `nanchang` 下缺少走廊文件，会回退读取：
  - `../vue/public/geo/nanchang/nanchang_river_system.geojson`
  - `../vue/public/geo/nanchang/nanchang_urben_road.geojson`
  - `../vue/public/geo/nanchang/nanchang_other_road.geojson`

## 离线训练

```bash
python offline_train.py --episodes 3600 --dyna-k 30 --model-path models/q_table_25d.npz --shp-path "E:/java/drone/python_service/nanchang/your_building.shp"
```

常用参数：

- `--episodes`：训练轮数
- `--dyna-k`：每步 Dyna 规划更新次数
- `--mission-id`：训练单个任务（`0` 表示五任务混合）
- `--grid-n`、`--margin`：栅格规模
- `--z-scale`、`--clearance`：高度缩放与净空约束
- `--mission-config`：自定义任务配置 JSON
- `--print-q-states`：训练结束打印 top-N 高价值 Q 状态
- `--enable-apf`：启用 APF 障碍排斥奖励
- `--apf-repulse-weight`、`--apf-influence-grid`：APF 排斥强度与影响范围
- `--obstacle-buffer-m`：建筑面要素水平膨胀（米）
- `--gif-checkpoints`：路径演化四阶段图采样回合
- `--eval-runs`：稳定性统计运行次数（用于箱线图）
- `--java-ga-path-json` / `--java-astar-path-json`：可选导入 Java 路径做同图对比

> 说明：Java 端已支持写入 `python_service/images/java_ga_paths.json` 与
> `python_service/images/java_astar_paths.json`（按 `mission_id` 分组）；本训练脚本会自动识别
> `[[x,y,z], ...]` 或 `[[lat,lon,alt], ...]` 两种格式并转换到当前任务栅格。

输出文件：

- `models/q_table_*.npz`
- `models/mission_<id>_rl_path.json`（训练结束时的 RL 演示路径，WGS84；Web 端 `/api/plan/replay` 直接复现，无需在线 Q 推理）
- `images/training_progress.png`
- `images/mission_<id>/state_value_heatmap.png`
- `images/mission_<id>/policy_quiver.png`
- `images/mission_<id>/current_trajectory.png`
- `images/mission_<id>/path_evolution.gif`（静态四分图）
- `images/mission_<id>/path_compare_rl_astar_ga.png`
- `images/mission_<id>/metrics_bar.png`
- `images/mission_<id>/path_curvature_compare.png`

单任务训练（`--mission-id 1..5`）时，**完整训练**会清空并覆盖对应 `mission_<id>` 子目录；
`--plot-only`（Web 端 `regenerate-rl-plots`）**不会**清空 `mission_<id>` 目录；仅更新 `path_compare_rl_astar_ga.png` 与 `path_curvature_compare.png`，并**保留** `training_progress.png`、`path_evolution.gif` 等训练制品。

## 默认任务列表（5个）

由 `offline_train.py` 内置：

- 南昌舰主题公园 -> 八一大桥（`water_inspection`）
- 秋水广场 -> 地铁大厦（`road_inspection`）
- 南昌大学 -> 南昌第一医院（`rescue`）
- 南昌航空大学 -> 南昌市人民政府（`transport`）
- 南昌印象城 -> 南昌航空大学（`transport`，巡航 88m）

## 五条任务训练命令（可直接运行）

> 默认都使用 `python_service/nanchang/南昌市_建筑-百度.shp` 作为建筑数据。


```bash
python offline_train.py --mission-id 1 --episodes 2800 --dyna-k 30 --print-q-states 15 --shp-path "E:/java/drone/python_service/nanchang/南昌市_建筑-百度.shp"
```

```bash
python offline_train.py --mission-id 2 --episodes 3200 --dyna-k 30 --print-q-states 15 --shp-path "E:/java/drone/python_service/nanchang/南昌市_建筑-百度.shp"
```

```bash
python offline_train.py --mission-id 3 --episodes 2800 --dyna-k 30 --print-q-states 15 --shp-path "E:/java/drone/python_service/nanchang/南昌市_建筑-百度.shp"
```

```bash
python offline_train.py --mission-id 4 --episodes 2800 --dyna-k 30 --print-q-states 15 --shp-path "E:/java/drone/python_service/nanchang/南昌市_建筑-百度.shp"
```

```bash
python offline_train.py --mission-id 5 --episodes 2800 --dyna-k 30 --print-q-states 15 --shp-path "E:/java/drone/python_service/nanchang/南昌市_建筑-百度.shp"
```

五任务联合训练（更推荐做线上泛化）：

```bash
python offline_train.py --mission-id 0 --episodes 4200 --dyna-k 30 --print-q-states 20 --shp-path "E:/java/drone/python_service/nanchang/南昌市_建筑-百度.shp"
```

启用面要素建筑 Buffer + APF（示例）：

```bash
python offline_train.py --mission-id 2 --episodes 3200 --dyna-k 30 --enable-apf --apf-repulse-weight 0.65 --apf-influence-grid 3.8 --obstacle-buffer-m 18 --print-q-states 20 --shp-path "E:/java/drone/python_service/nanchang/南昌市_建筑-百度.shp"
```

说明：

- APF 只会对 `rescue` / `transport` 等城市上空飞行任务生效。
- `water_inspection` / `road_inspection` 任务不叠加 APF，只使用走廊约束奖励。

## Q-table 结果展示

每次训练结束都会输出：

- 控制台统计：`min/max/mean/std/nonzero_ratio`
- 控制台 top-N 状态：`state=(x,y,z), best_action, q`
- 关键图：
  - `training_progress.png`
  - `mission_<id>/state_value_heatmap.png`
  - `mission_<id>/policy_quiver.png`
  - `mission_<id>/current_trajectory.png`
  - `mission_<id>/path_evolution.gif`
  - `mission_<id>/path_compare_rl_astar_ga.png`
  - `mission_<id>/metrics_bar.png`
  - `mission_<id>/path_curvature_compare.png`

## 自定义任务配置

示例 `mission_config.json`：

```json
{
  "missions": [
    {
      "mission_id": 1,
      "name": "南昌舰主题公园->八一大桥",
      "task_type": "water_inspection",
      "start_geo": [28.717861, 115.865875, 100.0],
      "goal_geo": [28.692707, 115.882176, 100.0],
      "corridor_files": ["nanchang_river_system.geojson"]
    }
  ]
}
```

执行：

```bash
python offline_train.py --mission-config mission_config.json
```

## 在线服务

启动：

```bash
python app.py
```

接口：

- `GET /health`
- `POST /api/model/train`
- `POST /api/plan`
- `POST /api/eval_batch`

### 多任务模型与覆盖说明

- 训练 `--mission-id 1..5` 且未显式传 `--model-path` 时，会自动保存为：
  - `models/q_table_mission_1.npz`
  - `models/q_table_mission_2.npz`
  - ...
- 训练 `--mission-id 0`（五任务混合）默认保存为：
  - `models/q_table_multi_task.npz`
- Flask 推理支持按任务选模型：
  - 请求体带 `mission_id`（如 `2`）会自动加载 `q_table_mission_2.npz`
  - 或直接传 `model_path`
