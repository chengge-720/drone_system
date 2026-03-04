package com.drone.system.service.impl;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import com.drone.system.service.IAiService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;

/**
 * AI 服务实现类 - 接入豆包 AI
 */
@Service
public class AiServiceImpl implements IAiService {
    
    private static final Logger log = LoggerFactory.getLogger(AiServiceImpl.class);
    
    // 豆包 API 配置
    @Value("${doubao.api.key:48045617-a77e-495d-998a-770c408a1a3e}")
    private String apiKey;
    
    @Value("${doubao.api.url:https://ark.cn-beijing.volces.com/api/v3/chat/completions}")
    private String apiUrl;
    
    @Value("${doubao.api.model:ep-20260304201511-km522}")
    private String modelId;
    
    @Override
    public String chat(String message) {
        try {
            // 创建 RestTemplate
            RestTemplate restTemplate = new RestTemplate();
            
            // 构建请求头
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("Authorization", "Bearer " + apiKey);
            
            // 构建请求体
            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("model", modelId); // 豆包模型 ID
            
            // 构建消息列表
            Map<String, String> userMessage = new HashMap<>();
            userMessage.put("role", "user");
            userMessage.put("content", message);
            
            requestBody.put("messages", new Map[]{userMessage});
            requestBody.put("temperature", 0.7);
            requestBody.put("max_tokens", 1024);
            
            // 创建 HTTP 实体
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
            
            // 发送 POST 请求
            ResponseEntity<String> response = restTemplate.postForEntity(apiUrl, entity, String.class);
            
            if (response.getStatusCode() == HttpStatus.OK && response.getBody() != null) {
                JSONObject jsonResponse = JSON.parseObject(response.getBody());
                
                // 解析豆包 API 响应
                if (jsonResponse.containsKey("choices") && !jsonResponse.getJSONArray("choices").isEmpty()) {
                    JSONObject choice = jsonResponse.getJSONArray("choices").getJSONObject(0);
                    if (choice.containsKey("message")) {
                        JSONObject aiMessage = choice.getJSONObject("message");
                        return aiMessage.getString("content");
                    }
                }
                return "抱歉，我暂时无法回答您的问题。";
            } else {
                log.error("调用豆包 AI 失败，状态码：{}", response.getStatusCode());
                return "抱歉，AI 服务暂时不可用。";
            }
            
        } catch (Exception e) {
            log.error("调用豆包 AI 异常", e);
            return "抱歉，网络开小差了，请稍后再试。";
        }
    }
}
