package com.drone.system.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.NestedConfigurationProperty;

import java.util.ArrayList;
import java.util.List;

/**
 * 大模型调用链：{@link #primary} 为默认首选，{@link #fallbacks} 按顺序在首选失败时尝试。
 * <p>
 * 兼容旧版「扁平」配置：{@code llm.api-key}、{@code llm.base-url}、{@code llm.model}、{@code llm.chat-path}（与
 * {@code llm.primary.*} 可同时存在；若 {@code primary} 中密钥未解析到，会用扁平项补全首选线路）。
 */
@Data
@ConfigurationProperties(prefix = "llm")
public class LlmChainProperties {

    private double temperature = 0.6;
    private int maxTokens = 900;
    private int connectTimeoutMs = 15000;
    private int readTimeoutMs = 120000;

    /** 兼容：对应 {@code llm.api-key} */
    private String apiKey = "";
    /** 兼容：对应 {@code llm.base-url} */
    private String baseUrl = "";
    /** 兼容：对应 {@code llm.chat-path} */
    private String chatPath = "/chat/completions";
    /** 兼容：对应 {@code llm.model} */
    private String model = "";

    /** 默认：通义千问（DashScope OpenAI 兼容） */
    @NestedConfigurationProperty
    private Endpoint primary = new Endpoint();

    /** 备用：豆包 Ark、DeepSeek 等；未配置 api-key 或 model 的项会自动跳过 */
    @NestedConfigurationProperty
    private List<Endpoint> fallbacks = new ArrayList<>();

    @Data
    public static class Endpoint {
        /** 日志展示用 */
        private String name = "default";
        private String apiKey = "";
        private String baseUrl = "";
        private String chatPath = "/chat/completions";
        private String model = "";
    }
}
