CREATE TABLE uav_task_info (
    task_id INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '任务ID' PRIMARY KEY,
    task_name VARCHAR(255) NOT NULL COMMENT '任务名称',
    task_type VARCHAR(50) NOT NULL COMMENT '任务类型',
    start_location VARCHAR(255) NOT NULL COMMENT '起始地点',
    end_location VARCHAR(255) NOT NULL COMMENT '终点',
    description TEXT COMMENT '任务描述',
    uav_id INT UNSIGNED COMMENT '无人机ID',
    uav_model VARCHAR(100) COMMENT '无人机型号',
    status TINYINT NOT NULL DEFAULT 1 COMMENT '任务状态：1-待执行，2-执行中，3-已完成，4-已取消',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
) COMMENT '无人机任务信息表';