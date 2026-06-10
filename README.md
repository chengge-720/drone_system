# 无人机智能路径规划系统 (UAV Path Planning System)

基于 **Vue 3 + Spring Boot + Flask + MySQL** 四层架构的无人机路径规划管理系统，集成 **Q-Learning（强化学习）、A\*（启发式搜索）、遗传算法（GA）** 三种路径规划算法，提供二维/三维地图可视化与 AI 智能助手。

---

## 目录

- [系统架构](#系统架构)
- [技术栈](#技术栈)
- [功能模块](#功能模块)
- [前置环境](#前置环境)
- [快速启动](#快速启动)
  - [1. 数据库初始化](#1-数据库初始化)
  - [2. 启动后端 (Spring Boot)](#2-启动后端-spring-boot)
  - [3. 启动前端 (Vue 3)](#3-启动前端-vue-3)
  - [4. 启动算法服务 (Python Flask)](#4-启动算法服务-python-flask)
- [访问与使用](#访问与使用)
- [项目结构](#项目结构)
- [配置说明](#配置说明)
- [分享到 GitHub](#分享到-github)

---

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    浏览器 (Chrome)                        │
│   Vue 3 + Element Plus + 百度地图/Cesium + ECharts       │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP (Axios)
                       ▼
┌─────────────────────────────────────────────────────────┐
│              Nginx / Vite Dev Server (端口 90)            │
│              代理 /base → http://localhost:8081           │
└──────────────────────┬──────────────────────────────────┘
                       │ RESTful API
                       ▼
┌─────────────────────────────────────────────────────────┐
│          Spring Boot 3.5 后端 (端口 8081)                 │
│   ┌──────────┐  ┌──────────┐  ┌──────────────────┐      │
│   │ 控制层    │  │ 业务层    │  │ Spring Security   │      │
│   │Controller│→│ Service  │→│ + JWT 认证        │      │
│   └──────────┘  └──────────┘  └──────────────────┘      │
│   ┌──────────────────────────────────────────────────┐  │
│   │          MyBatis + Druid 连接池                   │  │
│   └──────────────────────┬───────────────────────────┘  │
└──────────────────────┬──────────────────────────────────┘
          │                            │
          ▼                            ▼
┌─────────────────┐    ┌──────────────────────────────┐
│    MySQL 数据库   │    │  Python Flask 算法服务(5000)   │
│  drone_system    │    │  ┌────────────────────────┐  │
│  ┌─ sys_user    │    │  │ Q-Learning (强化学习)    │  │
│  ├─ sys_role    │    │  ├─ A* 算法 (启发式搜索)     │  │
│  ├─ sys_menu    │    │  ├─ 遗传算法 (GA)           │  │
│  ├─ uav_info    │    │  └─ 2.5D 栅格环境建模       │  │
│  └─ uav_task    │    └────────────────────────────┘  │
└─────────────────┘                                     │
```

### 数据流

```
用户操作 → Vue 前端 → Axios HTTP → Vite 代理 (/base)
→ Spring Boot 后端 (/api/*) → MyBatis → MySQL
                           → RestTemplate → Python Flask (/api/plan)
→ 路径结果返回 → 前端百度地图/Cesium 渲染
```

---

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| **前端** | Vue 3 (Composition API) | 3.5+ |
| | Vite | 7.x |
| | Element Plus | 2.13+ |
| | Vue Router 4 / Pinia | 最新 |
| | 百度地图 (v3-baidu-map) | 0.0.25 |
| | Cesium (3D 地球) | 1.125+ |
| | ECharts | 6.x |
| | Axios | 1.x |
| **后端** | Spring Boot | 3.5.10 |
| | JDK | 21 |
| | MyBatis | 3.0.5 |
| | Spring Security + JWT | — |
| | Druid 连接池 | 1.2.23 |
| | PageHelper 分页 | 2.1.0 |
| | FastJSON2 | 2.0.43 |
| **算法服务** | Python | 3.11+ |
| | Flask | 3.x |
| | NumPy | — |
| **数据库** | MySQL | 8.x |

---

## 功能模块

### 1. 系统管理
- **用户管理**：用户注册、登录、JWT 令牌鉴权
- **角色管理**：RBAC 权限控制，支持多角色
- **菜单管理**：动态路由菜单，按角色加载

### 2. 无人机管理
- **无人机基础信息**：管理无人机编号、型号、续航、载重等档案
- **任务信息**：创建/编辑/删除飞行任务，支持地图选点
- **飞行信息**：查看飞行记录与统计

### 3. 路径规划
- **三种算法对比**：
  - **Q-Learning（强化学习）**：离线训练 Q-table → 在线推理
  - **A\* 算法**：启发式搜索，作为回退方案
  - **遗传算法 (GA)**：进化优化路径
- **2.5D 栅格环境**：结合建筑高度数据的海拔感知路径规划
- **离线/在线模式**：支持 mission Q-table 切换

### 4. 地图可视化
- **二维地图**：百度地图展示路径与轨迹
- **三维地球**：Cesium 3D 可视化飞行航线
- **指标对比**：ECharts 展示路径长度、耗时、碰撞率等

### 5. AI 规划助手
集成大语言模型（通义千问 / 豆包 Ark），支持自然语言交互：
- 解答系统使用问题
- 辅助创建任务
- 解释路径规划参数

---

## 系统功能展示

### 🏠 系统首页

![系统首页](file/%E7%B3%BB%E7%BB%9F%E9%A6%96%E9%A1%B5.png)

### 🛸 无人机管理

<table>
  <tr>
    <td align="center"><b>无人机基础信息管理</b></td>
    <td align="center"><b>无人机任务管理</b></td>
  </tr>
  <tr>
    <td><img src="file/%E6%97%A0%E4%BA%BA%E6%9C%BA%E5%9F%BA%E7%A1%80%E4%BF%A1%E6%81%AF%E7%AE%A1%E7%90%86.png" alt="无人机基础信息管理"/></td>
    <td><img src="file/%E6%97%A0%E4%BA%BA%E6%9C%BA%E4%BB%BB%E5%8A%A1%E7%AE%A1%E7%90%86.png" alt="无人机任务管理"/></td>
  </tr>
</table>

### 🗺️ 路径规划

<table>
  <tr>
    <td align="center"><b>任务路径规划</b></td>
    <td align="center"><b>不同算法下路径对比</b></td>
  </tr>
  <tr>
    <td><img src="file/%E4%BB%BB%E5%8A%A1%E8%B7%AF%E5%BE%84%E8%A7%84%E5%88%92.png" alt="任务路径规划"/></td>
    <td><img src="file/%E4%B8%8D%E5%90%8C%E7%AE%97%E6%B3%95%E4%B8%8B%E8%B7%AF%E5%BE%84%E5%AF%B9%E6%AF%94.png" alt="不同算法下路径对比"/></td>
  </tr>
  <tr>
    <td align="center" colspan="2"><b>不同算法基本信息展示</b></td>
  </tr>
  <tr>
    <td colspan="2"><img src="file/%E4%B8%8D%E5%90%8C%E7%AE%97%E6%B3%95%E5%9F%BA%E6%9C%AC%E4%BF%A1%E6%81%AF%E5%B1%95%E7%A4%BA.png" alt="不同算法基本信息展示"/></td>
  </tr>
</table>

### 🌍 三维地图仿真

![Cesium 3D 仿真](file/cesium3D%E4%BB%BF%E7%9C%9F.png)

---

## 前置环境

| 依赖 | 版本要求 | 获取方式 |
|------|---------|---------|
| JDK | 21+ | [Oracle JDK](https://www.oracle.com/java/technologies/downloads/) 或 [OpenJDK](https://openjdk.org/) |
| Maven | 3.8+ | 项目自带 `mvnw` (Windows: `mvnw.cmd`) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org/) |
| Python | 3.11+ | [python.org](https://www.python.org/) |
| MySQL | 8.x | [MySQL Community](https://dev.mysql.com/downloads/mysql/) |
| IDE 推荐 | — | IntelliJ IDEA / VS Code |

---

## 快速启动

### 1. 数据库初始化

创建数据库及用户相关表（系统启动时会自动建表，或手动执行 SQL）：

```sql
CREATE DATABASE IF NOT EXISTS drone_system
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE drone_system;

-- 用户表（系统启动时 MyBatis 会自动建表，也可手动执行下方语句）
-- 实际表结构请参考项目 mapper 文件
```

> **注意**：数据库连接配置在 [application.yml](src/main/resources/application.yml) 中：
> - 地址：`jdbc:mysql://localhost:3306/drone_system`
> - 用户名：`root`
> - 密码：`123456`
>
> 请根据你的本地 MySQL 配置修改上述信息。

### 2. 启动后端 (Spring Boot)

```bash
# 进入项目根目录
cd drone

# 使用 Maven 打包并启动（Windows 使用 mvnw.cmd）
./mvnw spring-boot:run

# 或者先打包为 JAR 再运行
./mvnw clean package -DskipTests
java -jar target/drone-0.0.1-SNAPSHOT.jar
```

启动成功后，终端会打印：
```
后端启动成功！
```

后端服务地址：**http://localhost:8081**

#### 可选：配置大模型 API 密钥

系统内置 AI 助手功能，支持通义千问和豆包 Ark。推荐使用环境变量配置密钥（避免将密钥提交到 Git）：

```bash
# 通义千问
setx DASHSCOPE_API_KEY "sk-your-api-key"

# 豆包 Ark（可选备选）
setx ARK_API_KEY "sk-your-ark-key"

# 设置后需完全重启 IDE / 终端
```

也可在 `src/main/resources/application-local.yml` 中直接填写（该文件已加入 `.gitignore`）：

```yaml
llm:
  primary:
    api-key: sk-your-dashscope-key
```

### 3. 启动前端 (Vue 3)

```bash
# 进入前端目录
cd vue

# 安装依赖（首次启动时执行）
npm install

# 启动开发服务器
npm run dev
```

启动成功后，终端会显示：
```
  ➜  Local:   http://localhost:90/
  ➜  Network: http://192.168.x.x:90/
```

浏览器自动打开 **http://localhost:90/** 访问系统。

> **注意**：前端开发服务器端口固定为 `90`，Vite 代理配置会将 `/base` 开头的请求转发到后端 `http://localhost:8081`。

### 4. 启动算法服务 (Python Flask)

```bash
# 进入 Python 服务目录
cd python_service

# 创建虚拟环境（如已有 .venv 可跳过）
python -m venv .venv

# 激活虚拟环境
# Windows:
.venv\Scripts\activate
# Linux/Mac:
source .venv/bin/activate

# 安装依赖
pip install flask flask-cors numpy

# 启动 Flask 服务
python app.py
```

启动成功后，终端会显示：
```
UAV RL path planning — offline Q-table + online inference
http://0.0.0.0:5000  /health  /api/model/train  /api/plan
```

算法服务地址：**http://localhost:5000**

#### 离线训练 Q-table

第一次使用路径规划前，需要先训练 Q-table 模型：

```bash
# 确保已激活虚拟环境
cd python_service
python offline_train.py
```

训练完成后，模型文件保存在 `python_service/models/q_table_25d.npz`。

---

## 访问与使用

启动所有服务后，按以下顺序体验系统：

### 1. 登录系统

访问 **http://localhost:90/** → 使用注册账号登录（或通过 `/register` 注册新用户）。

### 2. 管理无人机档案

导航至 **无人机管理 → 无人机基础信息**，添加无人机（型号、续航、载重等）。

### 3. 创建任务

导航至 **无人机管理 → 任务信息**，点击「新增」：
- 填写任务名称、类型（水域巡检/道路巡检/城市）
- 选择起点和终点（支持地图选点）
- 指派无人机

### 4. 路径规划

导航至 **路径规划 → 任务规划**：
- 选择已创建的任务
- 设置规划参数（离线/在线模式）
- 点击「开始规划」
- 地图上同时展示 **RL（强化学习）/ A\* / 遗传算法** 三条路径
- 下方 ECharts 展示长度、耗时、碰撞率等指标对比

### 5. 使用 AI 助手

导航至 **AI 助手**：
- 输入自然语言问题，如 "如何创建任务？"
- 或描述起点终点让系统自动创建任务草稿

---

## 项目结构

```
drone/
├── src/main/java/com/drone/       # Java 后端源码
│   ├── DroneApplication.java      # Spring Boot 启动类
│   └── system/
│       ├── config/                # 配置类（Security、CORS、JWT 等）
│       ├── configure/             # JWT 过滤器与异常处理
│       ├── constants/             # 常量定义
│       ├── controller/            # RESTful 控制器
│       ├── domain/                # 实体类、VO、DTO
│       ├── exception/             # 全局异常处理
│       ├── mapper/                # MyBatis 数据访问层
│       ├── service/               # 业务逻辑层
│       └── util/                  # 工具类
├── src/main/resources/            # 配置文件
│   ├── application.yml            # 主配置（数据源、端口、JWT 等）
│   ├── application-local.yml      # 本机密钥（已 .gitignore）
│   ├── mapper/                    # MyBatis XML 映射文件
│   ├── sql/                       # SQL 建表脚本
│   └── ai/                        # AI 助手指引文档
├── vue/                           # Vue 3 前端
│   ├── src/                       # 前端源码
│   ├── vite.config.js             # Vite 配置文件（含代理）
│   ├── .env.development           # 开发环境变量
│   └── .env.production            # 生产环境变量
├── python_service/                # Python 算法服务
│   ├── app.py                     # Flask API 主文件
│   ├── grid_env_25d.py            # 2.5D 栅格环境与算法实现
│   ├── offline_train.py           # Q-Learning 离线训练
│   ├── rasterize_buildings.py     # 建筑数据栅格化
│   ├── mission_rl_cache.py        # Mission Q-table 缓存
│   └── models/                    # 训练产出的 Q-table 模型
├── docs/                          # 文档（ER 图等）
├── file/                          # 用户上传文件目录
├── pom.xml                        # Maven 构建配置
└── README.md                      # 项目说明（本文件）
```

---

## 配置说明

### 核心配置 (application.yml)

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `server.port` | Spring Boot 启动端口 | `8081` |
| `spring.datasource.url` | MySQL 连接地址 | `jdbc:mysql://localhost:3306/drone_system` |
| `spring.datasource.username` | 数据库用户名 | `root` |
| `spring.datasource.password` | 数据库密码 | `123456` |
| `token.secret` | JWT 签名密钥 | （随机字符串） |
| `token.expireTime` | JWT 过期时间（分钟） | `300` |
| `python.path-planning.url` | Python Flask 服务地址 | `http://localhost:5000` |
| `llm.primary.api-key` | 大模型 API 密钥 | 通过环境变量 `DASHSCOPE_API_KEY` 注入 |

### 前端环境变量 (vue/.env.development)

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VITE_APP_BASE_API` | API 请求前缀 | `/base` |
| `VITE_CESIUM_ION_TOKEN` | Cesium Ion 访问令牌 | （需自行申请） |

---

## 分享到 GitHub

将项目推送到 GitHub 的步骤：

```bash
# 1. 在 GitHub 上创建一个空仓库（不要勾选 README / .gitignore）

# 2. 在本地项目根目录执行
git init
git add .
git commit -m "Initial commit: 无人机智能路径规划系统"

# 3. 添加远程仓库
git remote add origin https://github.com/你的用户名/你的仓库名.git

# 4. 推送到 GitHub
git push -u origin main
```

### 已配置的 .gitignore 保护

以下内容已被 `.gitignore` 排除，不会上传到 GitHub：

- `application-local.yml`（本机 API 密钥）
- `node_modules/`（前端依赖）
- `target/`（Maven 构建产物）
- `python_service/.venv/`（Python 虚拟环境）
- `file/avatar/`（用户上传文件）
- IDE 配置（`.idea/`, `.vscode/` 等）

---

## 许可证

本项目仅供学习交流使用。