package com.drone.system.controller;

import com.drone.system.domain.AjaxResult;
import com.drone.system.service.IAiService;
import org.springframework.web.bind.annotation.*;

import jakarta.annotation.Resource;
import java.util.HashMap;
import java.util.Map;

/**
 * AI 助手控制器
 */
@RestController
@RequestMapping("/api/ai")
@CrossOrigin
public class AiController extends BaseController {
    
    @Resource
    private IAiService aiService;
    
    /**
     * AI 对话接口
     * @param params 请求参数（包含 message 字段）
     * @return AI 回复结果
     */
    @PostMapping("/chat")
    public AjaxResult chat(@RequestBody Map<String, String> params) {
        String message = params.get("message");
        if (message == null || message.trim().isEmpty()) {
            return error("请输入消息内容");
        }
        
        // 调用 AI 服务
        String reply = aiService.chat(message);
        
        return success(reply);
    }
    
    /**
     * 获取聊天历史
     * @return 聊天历史
     */
    @GetMapping("/history")
    public AjaxResult getHistory() {
        // TODO: 实现聊天历史存储和查询
        return success(new Object());
    }
    
    /**
     * 清空聊天历史
     * @return 操作结果
     */
    @DeleteMapping("/clear")
    public AjaxResult clearHistory() {
        // TODO: 实现清空聊天历史
        return success();
    }
}
