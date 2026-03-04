-- 创建无人机信息表
CREATE TABLE IF NOT EXISTS `uav_info` (
  `uav_id` bigint NOT NULL AUTO_INCREMENT COMMENT '无人机ID',
  `uav_code` varchar(50) NOT NULL COMMENT '无人机编号',
  `uav_model` varchar(100) NOT NULL COMMENT '无人机型号',
  `uav_type` varchar(50) NOT NULL COMMENT '无人机类型',
  `max_flight_time` int DEFAULT NULL COMMENT '最大续航时长(分钟)',
  `max_load` decimal(10,2) DEFAULT NULL COMMENT '最大载重(kg)',
  `battery_type` varchar(50) DEFAULT NULL COMMENT '电池类型',
  `battery_capacity` decimal(10,2) DEFAULT NULL COMMENT '电池容量(mAh)',
  `manufacturer` varchar(100) DEFAULT NULL COMMENT '生产厂商',
  `status` varchar(20) NOT NULL DEFAULT '正常' COMMENT '状态',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`uav_id`),
  UNIQUE KEY `uav_code` (`uav_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='无人机信息表';

-- 插入一些示例数据
INSERT INTO `uav_info` (`uav_code`, `uav_model`, `uav_type`, `max_flight_time`, `max_load`, `battery_type`, `battery_capacity`, `manufacturer`, `status`, `remark`) VALUES
('UAV001', 'DJI Mavic 3', '消费级', 46, 1.20, '锂电池', 5000.00, '大疆创新', '正常', '高性能航拍无人机'),
('UAV002', 'Inspire 3', '工业级', 28, 5.50, '智能电池', 9720.00, '大疆创新', '正常', '专业影视拍摄无人机'),
('UAV003', 'Matrice 300 RTK', '工业级', 55, 2.70, 'TB60智能飞行电池', 5930.00, '大疆创新', '维修中', '行业应用无人机'),
('UAV004', 'Phantom 4 Pro', '消费级', 30, 1.30, '智能电池', 5870.00, '大疆创新', '正常', '经典航拍无人机'),
('UAV005', 'Air 3', '消费级', 46, 1.00, '智能飞行电池', 4200.00, '大疆创新', '停用', '轻便易用航拍无人机');