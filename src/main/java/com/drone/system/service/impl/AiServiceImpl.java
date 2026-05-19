package com.drone.system.service.impl;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.drone.system.config.LlmChainProperties;
import com.drone.system.config.LlmChainProperties.Endpoint;
import com.drone.system.service.IAiService;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StreamUtils;
import org.springframework.web.client.RestTemplate;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 大模型对话：OpenAI 兼容协议；默认通义千问，豆包 Ark / DeepSeek 等为备用链路。
 */
@Service
public class AiServiceImpl implements IAiService {

    private static final Logger log = LoggerFactory.getLogger(AiServiceImpl.class);

    private static final String DEFAULT_QWEN_BASE = "https://dashscope.aliyuncs.com/compatible-mode/v1";
    private static final String DEFAULT_QWEN_MODEL = "qwen-flash";
    private static final String DEFAULT_CHAT_PATH = "/chat/completions";

    private final LlmChainProperties llmChainProperties;

    private RestTemplate restTemplate;
    private String systemPromptPrefix = "";

    public AiServiceImpl(LlmChainProperties llmChainProperties) {
        this.llmChainProperties = llmChainProperties;
    }

    @PostConstruct
    public void init() {
        SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
        f.setConnectTimeout(llmChainProperties.getConnectTimeoutMs());
        f.setReadTimeout(llmChainProperties.getReadTimeoutMs());
        this.restTemplate = new RestTemplate(f);
        try {
            ClassPathResource res = new ClassPathResource("ai/system-guide.md");
            if (res.exists()) {
                String guide = StreamUtils.copyToString(res.getInputStream(), StandardCharsets.UTF_8);
                this.systemPromptPrefix = "你是无人机管理系统的智能助手。以下《系统说明》为权威功能介绍，请优先依据它回答操作与菜单类问题；不要编造不存在的按钮或接口路径。\n\n"
                        + guide + "\n\n请用简体中文回答。";
            } else {
                this.systemPromptPrefix = "你是无人机管理系统的智能助手，请用简体中文简洁回答。";
            }
        } catch (Exception e) {
            log.warn("未加载 ai/system-guide.md，使用简短系统提示: {}", e.getMessage());
            this.systemPromptPrefix = "你是无人机管理系统的智能助手，请用简体中文简洁回答。";
        }
        int n = buildChain().size();
        log.info("大模型调用链已加载，当前可用线路数={}（0 表示未配置密钥或模型；请检查环境变量或 llm.api-key / llm.primary.api-key）", n);
    }

    @Override
    public String chat(String message) {
        List<Endpoint> chain = buildChain();
        if (chain.isEmpty()) {
            return "未配置任何可用大模型，常见原因与解决办法：\n"
                    + "1）环境变量：已执行 setx DASHSCOPE_API_KEY 后，必须完全重启 Cursor / IDEA 再启动后端，否则进程读不到新变量。\n"
                    + "2）任选一种配置方式：在 application.yml 的 llm.primary.api-key 中直接填写 sk-…（仅本机调试）；"
                    + "或在 llm 根下使用扁平项 llm.api-key、llm.base-url、llm.model（与旧版一致）。\n"
                    + "3）豆包备用：除 ARK_API_KEY 外还须配置 DOUBAO_MODEL（ep-…）。\n"
                    + "官方通义 OpenAI 兼容说明：https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope";
        }

        List<String> errors = new ArrayList<>();
        for (Endpoint ep : chain) {
            try {
                Optional<String> content = tryChat(ep, message);
                if (content.isPresent() && !content.get().isBlank()) {
                    log.info("大模型调用成功: provider={}", ep.getName());
                    return content.get();
                }
                errors.add(ep.getName() + ": 返回内容为空或无法解析");
            } catch (Exception e) {
                log.warn("大模型调用失败，将尝试下一备用: provider={}, error={}", ep.getName(), e.getMessage());
                errors.add(ep.getName() + ": " + e.getMessage());
            }
        }
        return "抱歉，所有已配置的大模型线路均不可用。\n" + String.join("\n", errors);
    }

    private List<Endpoint> buildChain() {
        List<Endpoint> list = new ArrayList<>();
        Endpoint primary = resolvePrimaryEndpoint();
        if (isRunnable(primary)) {
            list.add(primary);
        }
        if (llmChainProperties.getFallbacks() != null) {
            for (Endpoint fb : llmChainProperties.getFallbacks()) {
                if (isRunnable(fb)) {
                    list.add(fb);
                }
            }
        }
        return list;
    }

    /**
     * 合并 llm.primary 与旧版扁平 llm.api-key 等；仅在缺省时补全通义默认 base-url / model。
     */
    private Endpoint resolvePrimaryEndpoint() {
        Endpoint p = llmChainProperties.getPrimary();
        if (p == null) {
            p = new Endpoint();
        }
        if (notBlank(llmChainProperties.getApiKey())) {
            p.setApiKey(llmChainProperties.getApiKey().trim());
        }
        if (notBlank(llmChainProperties.getBaseUrl())) {
            p.setBaseUrl(llmChainProperties.getBaseUrl().trim());
        }
        if (notBlank(llmChainProperties.getModel())) {
            p.setModel(llmChainProperties.getModel().trim());
        }
        if (notBlank(llmChainProperties.getChatPath())) {
            p.setChatPath(llmChainProperties.getChatPath().trim());
        }
        if (notBlank(p.getApiKey())) {
            if (!notBlank(p.getBaseUrl())) {
                p.setBaseUrl(DEFAULT_QWEN_BASE);
            }
            if (!notBlank(p.getModel())) {
                p.setModel(DEFAULT_QWEN_MODEL);
            }
            if (!notBlank(p.getChatPath())) {
                p.setChatPath(DEFAULT_CHAT_PATH);
            }
            if (!notBlank(p.getName())) {
                p.setName("通义千问");
            }
        }
        return p;
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    private static boolean isRunnable(Endpoint e) {
        if (e == null) {
            return false;
        }
        return e.getApiKey() != null && !e.getApiKey().isBlank()
                && e.getBaseUrl() != null && !e.getBaseUrl().isBlank()
                && e.getModel() != null && !e.getModel().isBlank();
    }

    private Optional<String> tryChat(Endpoint ep, String message) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(ep.getApiKey().trim());

        List<Map<String, String>> messages = new ArrayList<>();
        Map<String, String> sys = new HashMap<>();
        sys.put("role", "system");
        sys.put("content", systemPromptPrefix);
        messages.add(sys);
        Map<String, String> user = new HashMap<>();
        user.put("role", "user");
        user.put("content", message);
        messages.add(user);

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", ep.getModel());
        requestBody.put("messages", messages);
        requestBody.put("temperature", llmChainProperties.getTemperature());
        requestBody.put("max_tokens", llmChainProperties.getMaxTokens());

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
        String url = resolveChatUrl(ep);
        ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);

        if (response.getStatusCode() != HttpStatus.OK || response.getBody() == null) {
            throw new IllegalStateException("HTTP " + response.getStatusCode());
        }
        JSONObject jsonResponse = JSON.parseObject(response.getBody());
        if (jsonResponse.containsKey("error")) {
            JSONObject err = jsonResponse.getJSONObject("error");
            String msg = err != null ? err.getString("message") : jsonResponse.getString("message");
            throw new IllegalStateException(msg != null ? msg : "error");
        }
        JSONArray choices = jsonResponse.getJSONArray("choices");
        if (choices == null || choices.isEmpty()) {
            return Optional.empty();
        }
        JSONObject choice = choices.getJSONObject(0);
        JSONObject aiMessage = choice.getJSONObject("message");
        if (aiMessage == null) {
            return Optional.empty();
        }
        String content = aiMessage.getString("content");
        return Optional.ofNullable(content);
    }

    private static String resolveChatUrl(Endpoint ep) {
        String b = ep.getBaseUrl() == null ? "" : ep.getBaseUrl().trim();
        if (b.contains("chat/completions")) {
            return b;
        }
        if (b.endsWith("/")) {
            b = b.substring(0, b.length() - 1);
        }
        String p = ep.getChatPath() == null ? "/chat/completions" : ep.getChatPath().trim();
        if (!p.startsWith("/")) {
            p = "/" + p;
        }
        return b + p;
    }
}
