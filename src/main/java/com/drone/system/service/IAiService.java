package com.drone.system.service;

/**
 * AI 服务接口
 */
public interface IAiService {
    
    /**
     * 调用已配置的大模型（OpenAI 兼容 Chat Completions）进行对话。
     *
     * @param message 用户输入的消息（可含系统侧追加的上下文）
     * @return 模型回复正文
     */
    String chat(String message);
}
