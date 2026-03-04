package com.drone.system.service;

/**
 * AI 服务接口
 */
public interface IAiService {
    
    /**
     * 调用豆包 AI 接口进行对话
     * @param message 用户输入的消息
     * @return AI 回复的内容
     */
    String chat(String message);
}
