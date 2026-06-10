-- ============================================================
-- 无人机智能路径规划系统 - 数据库初始化脚本
-- 数据库：MySQL 8.x
-- 使用方法：mysql -u root -p < drone_system_init.sql
-- 或直接在 MySQL 客户端 / IDE 中粘贴执行
-- ============================================================

-- 创建数据库（如已存在请跳过）
CREATE DATABASE IF NOT EXISTS `drone_system`
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci;

USE `drone_system`;

-- ============================================================
-- 1. 用户表
-- ============================================================
DROP TABLE IF EXISTS `user`;
CREATE TABLE `user` (
    `user_id`     BIGINT       NOT NULL AUTO_INCREMENT COMMENT '用户ID',
    `user_name`   VARCHAR(50)  NOT NULL COMMENT '用户名',
    `sex`         TINYINT               DEFAULT NULL COMMENT '用户性别（0-未知 1-男 2-女）',
    `avatar`      VARCHAR(255)          DEFAULT NULL COMMENT '用户头像地址',
    `password`    VARCHAR(255)          DEFAULT NULL COMMENT '用户密码',
    `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- ============================================================
-- 2. 角色表
-- ============================================================
DROP TABLE IF EXISTS `role`;
CREATE TABLE `role` (
    `role_id`     BIGINT      NOT NULL AUTO_INCREMENT COMMENT '角色ID',
    `role_name`   VARCHAR(50) NOT NULL COMMENT '角色名称',
    `role_sort`   INT                  DEFAULT NULL COMMENT '显示顺序',
    `create_time` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`role_id`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='角色表';

-- ============================================================
-- 3. 菜单表
-- ============================================================
DROP TABLE IF EXISTS `menu`;
CREATE TABLE `menu` (
    `menu_id`     BIGINT       NOT NULL AUTO_INCREMENT COMMENT '菜单ID',
    `menu_name`   VARCHAR(50)  NOT NULL COMMENT '菜单名称',
    `parent_id`   BIGINT                DEFAULT '0' COMMENT '父菜单ID',
    `menu_sort`   INT                   DEFAULT '0' COMMENT '显示顺序',
    `path`        VARCHAR(200)          DEFAULT NULL COMMENT '路由地址',
    `component`   VARCHAR(255)          DEFAULT NULL COMMENT '组件路径',
    `menu_type`   CHAR(1)               DEFAULT '' COMMENT '菜单类型（M目录 C菜单 F按钮）',
    `icon`        VARCHAR(100)          DEFAULT '#' COMMENT '菜单图标',
    `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`menu_id`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='菜单表';

-- ============================================================
-- 4. 用户角色关联表
-- ============================================================
DROP TABLE IF EXISTS `user_role`;
CREATE TABLE `user_role` (
    `user_id` BIGINT NOT NULL COMMENT '用户ID',
    `role_id` BIGINT NOT NULL COMMENT '角色ID',
    PRIMARY KEY (`user_id`, `role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户和角色关联表';

-- ============================================================
-- 5. 角色菜单关联表
-- ============================================================
DROP TABLE IF EXISTS `role_menu`;
CREATE TABLE `role_menu` (
    `role_id` BIGINT NOT NULL COMMENT '角色ID',
    `menu_id` BIGINT NOT NULL COMMENT '菜单ID',
    PRIMARY KEY (`role_id`, `menu_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色和菜单关联表';

-- ============================================================
-- 6. 无人机基础信息表
-- ============================================================
DROP TABLE IF EXISTS `uav_base_info`;
CREATE TABLE `uav_base_info` (
    `uav_id`             INT UNSIGNED    NOT NULL AUTO_INCREMENT COMMENT '无人机ID',
    `uav_code`           VARCHAR(50)     NOT NULL COMMENT '无人机编号',
    `uav_model`          VARCHAR(100)    NOT NULL COMMENT '无人机型号',
    `uav_type`           VARCHAR(50)              DEFAULT NULL COMMENT '无人机类型',
    `max_flight_time`    INT                      DEFAULT NULL COMMENT '最大续航时长（分钟）',
    `max_load`           DECIMAL(10,2)            DEFAULT NULL COMMENT '最大载重（kg）',
    `max_speed`          DECIMAL(10,2)            DEFAULT NULL COMMENT '最大速度（m/s）',
    `remaining_battery`  DECIMAL(5,2)             DEFAULT NULL COMMENT '剩余电量（%）',
    `battery_type`       VARCHAR(50)              DEFAULT NULL COMMENT '电池类型',
    `battery_capacity`   DECIMAL(10,2)            DEFAULT NULL COMMENT '电池容量（mAh）',
    `manufacturer`       VARCHAR(100)             DEFAULT NULL COMMENT '生产厂商',
    `status`             TINYINT        NOT NULL   DEFAULT '1' COMMENT '状态（1-正常 2-任务中 3-维修中 4-停用）',
    `remark`             VARCHAR(500)             DEFAULT NULL COMMENT '备注',
    `create_time`        DATETIME       NOT NULL   DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`uav_id`),
    UNIQUE KEY `uk_uav_code` (`uav_code`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='无人机基础信息表';

-- ============================================================
-- 7. 无人机任务信息表
-- ============================================================
DROP TABLE IF EXISTS `uav_task_info`;
CREATE TABLE `uav_task_info` (
    `task_id`        INT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '任务ID',
    `task_name`      VARCHAR(255)  NOT NULL COMMENT '任务名称',
    `task_type`      VARCHAR(50)   NOT NULL COMMENT '任务类型',
    `start_location` VARCHAR(255)  NOT NULL COMMENT '起始地点',
    `end_location`   VARCHAR(255)  NOT NULL COMMENT '终点',
    `description`    TEXT COMMENT '任务描述',
    `uav_id`         INT UNSIGNED           DEFAULT NULL COMMENT '无人机ID',
    `uav_model`      VARCHAR(100)           DEFAULT NULL COMMENT '无人机型号',
    `status`         TINYINT       NOT NULL DEFAULT '1' COMMENT '状态（1-待执行 2-执行中 3-已完成 4-已取消）',
    `max_distance`   DOUBLE                 DEFAULT NULL COMMENT '最大飞行距离（km）',
    `estimated_time` INT                    DEFAULT NULL COMMENT '预计飞行时间（分钟）',
    `required_load`  DOUBLE                 DEFAULT NULL COMMENT '所需载重（kg）',
    `urgency`        TINYINT                DEFAULT NULL COMMENT '紧急程度（1-普通 2-紧急 3-非常紧急）',
    `create_time`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`task_id`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COMMENT='无人机任务信息表';

-- ============================================================
-- 8. 初始种子数据
-- ============================================================

-- 8.1 默认角色
INSERT INTO `role` (`role_name`, `role_sort`) VALUES
('管理员', 1),
('普通用户', 2);

-- 8.2 默认管理员账户（密码：123456）
INSERT INTO `user` (`user_name`, `sex`, `password`, `create_time`) VALUES
('admin', 1, '123456', NOW());

-- 8.3 分配管理员角色
INSERT INTO `user_role` (`user_id`, `role_id`) VALUES
(1, 1);

-- 8.4 菜单数据（系统菜单树）
INSERT INTO `menu` (`menu_id`, `menu_name`, `parent_id`, `menu_sort`, `path`, `component`, `menu_type`, `icon`, `create_time`) VALUES
-- 一级菜单
(1,   '系统管理',       0, 1, 'system',            NULL,                              'M', 'Setting',       NOW()),
(2,   '无人机管理',     0, 2, 'uavInfo',           NULL,                              'M', 'Aim',           NOW()),
(3,   '路径规划',       0, 3, 'uavNavigation',     NULL,                              'M', 'MapLocation',   NOW()),
(4,   'AI 助手',        0, 4, 'aiAssistant',       'aiAssistant/index',               'C', 'ChatDotSquare', NOW()),
-- 系统管理子菜单
(5,   '用户管理',       1, 1, 'user',              'system/user/index',               'C', 'User',          NOW()),
(6,   '角色管理',       1, 2, 'role',              'system/role/index',               'C', 'UserFilled',    NOW()),
(7,   '菜单管理',       1, 3, 'menu',              'system/menu/index',               'C', 'Menu',          NOW()),
-- 无人机管理子菜单
(8,   '无人机基础信息', 2, 1, 'baseInfo',          'uavInfo/baseInfo/index',          'C', 'InfoFilled',    NOW()),
(9,   '飞行信息',       2, 2, 'flightInfo',        'uavInfo/flightInfo/index',        'C', 'TrendCharts',   NOW()),
(10,  '任务信息',       2, 3, 'taskInfo',          'uavInfo/taskInfo/index',          'C', 'List',          NOW()),
(11,  '任务规划',       2, 4, 'taskPlanning',      'uavInfo/taskPlanning/index',      'C', 'SetUp',         NOW()),
-- 路径规划子菜单
(12,  '地图展示',       3, 1, 'mapShow',           'uavNavigation/mapShow/index',     'C', 'MapLocation',   NOW()),
(13,  '航线信息',       3, 2, 'routeInfo',         'uavNavigation/routeInfo/index',   'C', 'Paperclip',     NOW()),
(14,  '算法对比',       3, 3, 'algorithmCompare',  'uavNavigation/algorithmCompare/index', 'C', 'Histogram', NOW());

-- 8.5 管理员角色关联所有菜单
INSERT INTO `role_menu` (`role_id`, `menu_id`)
SELECT 1, `menu_id` FROM `menu`;