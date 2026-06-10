package com.drone.system.service;

import com.drone.system.domain.UavTask;

import java.util.Optional;

/**
 * 从用户自然语言中识别路径规划意图并生成可入库的 {@link UavTask} 草稿（不含 taskId）。
 */
public interface PathPlanningIntentService {

    /**
     * 当消息同时体现「路径/飞行/规划」等语境且能解析出起点与终点时返回草稿任务，否则 empty。
     */
    Optional<UavTask> tryBuildTaskDraft(String userMessage);

    /**
     * 尝试识别任务意图并尽可能提取字段；允许起点/终点等字段暂时缺失，用于多轮补问。
     */
    Optional<UavTask> tryBuildTaskIntent(String userMessage);
}
