package com.drone.system.service;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

/**
 * Spring Boot 启动时自动拉起 Python Flask 服务，并在 JVM 退出时停止。
 *
 * 约定：Python 项目目录下存在 app.py，且提供 GET /health
 */
@Component
public class PythonFlaskServiceManager {
    private static final Logger log = LoggerFactory.getLogger(PythonFlaskServiceManager.class);

    @Value("${python.path-planning.enabled:true}")
    private boolean enabled;

    @Value("${python.path-planning.url:http://localhost:5000}")
    private String baseUrl;

    @Value("${python.path-planning.health-path:/health}")
    private String healthPath;

    @Value("${python.path-planning.project-dir:E:/pythonProject}")
    private String projectDir;

    @Value("${python.path-planning.command:python app.py}")
    private String command;

    @Value("${python.path-planning.startup-timeout-ms:30000}")
    private long startupTimeoutMs;

    private final RestTemplate restTemplate = new RestTemplate();
    private Process process;

    @PostConstruct
    public void startIfNeeded() {
        if (!enabled) {
            log.info("Python Flask 自启动已关闭");
            return;
        }

        if (isHealthy()) {
            log.info("Python Flask 已在运行，跳过拉起: {}", healthUrl());
            return;
        }

        try {
            log.info("拉起 Python Flask 服务，工作目录: {}, 命令: {}", projectDir, command);
            java.io.File dir = new java.io.File(projectDir);
            String[] cmd = buildCommand(parseCommand(command), dir);
            ProcessBuilder pb = new ProcessBuilder(cmd);
            pb.directory(dir);
            pb.redirectErrorStream(true);
            process = pb.start();

            // 异步打印 Python 输出
            Thread t = new Thread(() -> {
                try (BufferedReader br = new BufferedReader(
                        new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = br.readLine()) != null) {
                        log.info("[python] {}", line);
                    }
                } catch (Exception e) {
                    log.warn("读取 Python 输出失败: {}", e.getMessage());
                }
            }, "python-flask-log");
            t.setDaemon(true);
            t.start();

            // 等待健康检查
            long deadline = System.currentTimeMillis() + startupTimeoutMs;
            while (System.currentTimeMillis() < deadline) {
                if (isHealthy()) {
                    log.info("Python Flask 启动成功: {}", healthUrl());
                    return;
                }
                Thread.sleep(500);
            }

            log.error("Python Flask 启动超时（{}ms），health 仍不可用: {}", startupTimeoutMs, healthUrl());
        } catch (Exception e) {
            log.error("拉起 Python Flask 失败", e);
        }
    }

    @PreDestroy
    public void stop() {
        if (process != null && process.isAlive()) {
            log.info("停止 Python Flask 服务");
            process.destroy();
            try {
                process.waitFor(5, TimeUnit.SECONDS);
            } catch (Exception ignored) { }
            if (process.isAlive()) {
                process.destroyForcibly();
            }
        }
    }

    private String healthUrl() {
        String h = (healthPath == null || healthPath.isBlank()) ? "/health" : healthPath.trim();
        if (!h.startsWith("/")) h = "/" + h;
        return baseUrl.replaceAll("/+$", "") + h;
    }

    private boolean isHealthy() {
        try {
            String body = restTemplate.getForObject(healthUrl(), String.class);
            if (body == null) return false;
            JSONObject json = JSON.parseObject(body);
            return "ok".equalsIgnoreCase(json.getString("status"));
        } catch (Exception e) {
            return false;
        }
    }

    private static String[] parseCommand(String cmd) {
        // 简单分割，满足默认 "python app.py"
        // 如需带引号/复杂参数，可改为在 yml 里配置为数组或自行扩展解析器
        return cmd.trim().split("\\s+");
    }

    private static String[] buildCommand(String[] parsed, java.io.File workingDir) {
        if (parsed == null || parsed.length == 0) return parsed;
        // 若脚本使用相对路径（例如 app.py），自动拼成 workingDir 绝对路径，避免进程 cwd 不一致导致跑错脚本
        for (int i = 0; i < parsed.length; i++) {
            String token = parsed[i];
            if (token == null) continue;
            String lower = token.toLowerCase();
            if (lower.endsWith("app.py") && !token.contains(":") && !token.contains("/") && !token.contains("\\")) {
                parsed[i] = new java.io.File(workingDir, token).getAbsolutePath();
            }
        }
        return parsed;
    }
}

