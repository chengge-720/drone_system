package com.drone.system.controller;

import com.drone.system.domain.AjaxResult;
import com.drone.system.domain.Uav;
import com.drone.system.domain.UavTask;
import com.drone.system.service.IAiService;
import com.drone.system.service.IUavTaskService;
import com.drone.system.service.PathPlanningIntentService;
import com.drone.system.utils.SecurityUtils;
import org.springframework.web.bind.annotation.*;

import jakarta.annotation.Resource;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;
import java.util.regex.Matcher;

/**
 * AI 助手控制器
 */
@RestController
@RequestMapping("/api/ai")
@CrossOrigin
public class AiController extends BaseController {
    private static final long CONFIRM_TTL_MS = 10 * 60 * 1000L;
    private static final ConcurrentHashMap<String, PendingDraft> PENDING_DRAFTS = new ConcurrentHashMap<>();
    private static final ConcurrentHashMap<String, IncompleteDraft> INCOMPLETE_DRAFTS = new ConcurrentHashMap<>();
    private static final Pattern ROUTE_HINT_PAREN = Pattern.compile("[（(]\\s*路径\\s*[:：]\\s*`?/?[^`）)]+`?\\s*[）)]");
    private static final Pattern ROUTE_HINT_BRACKET = Pattern.compile("【\\s*路径\\s*[:：]\\s*`?/?[^`】]+`?\\s*】");
    private static final Pattern P_LOAD = Pattern.compile("(\\d+(?:\\.\\d+)?)\\s*(?:kg|KG|公斤|千克)");
    private static final Pattern P_EST_MIN = Pattern.compile("(\\d+)\\s*分钟(?:内)?");
    private static final Pattern P_DISTANCE_KM = Pattern.compile("(\\d+(?:\\.\\d+)?)\\s*(?:km|KM|公里)");

    @Resource
    private IAiService aiService;

    @Resource
    private PathPlanningIntentService pathPlanningIntentService;

    @Resource
    private IUavTaskService uavTaskService;

    /**
     * AI 对话：返回 data 对象，含 reply、是否自动建任务及任务摘要，前端请优先使用 data.reply。
     */
    @PostMapping("/chat")
    public AjaxResult chat(@RequestBody Map<String, Object> params) {
        cleanupExpiredDrafts();
        String message = String.valueOf(params.getOrDefault("message", ""));
        String action = String.valueOf(params.getOrDefault("action", "chat"));
        String confirmToken = String.valueOf(params.getOrDefault("confirmToken", ""));
        if ("confirm".equalsIgnoreCase(action) || "cancel".equalsIgnoreCase(action) || !confirmToken.isBlank()) {
            return handleConfirmAction(action, confirmToken);
        }
        if (message == null || message.trim().isEmpty()) {
            return error("请输入消息内容");
        }

        String userKey = currentUserKey();
        Optional<UavTask> draft = pathPlanningIntentService.tryBuildTaskDraft(message.trim());
        UavTask working = null;
        if (draft.isPresent()) {
            working = draft.get();
        } else {
            IncompleteDraft inc = INCOMPLETE_DRAFTS.get(userKey);
            if (inc != null && inc.expiresAt > System.currentTimeMillis()) {
                working = cloneTask(inc.draft);
                mergeTaskFromIntent(working, pathPlanningIntentService.tryBuildTaskIntent(message.trim()));
                applyIncrementalTaskInfo(working, message.trim());
            } else {
                Optional<UavTask> intentOnly = pathPlanningIntentService.tryBuildTaskIntent(message.trim());
                if (intentOnly.isPresent()) {
                    working = intentOnly.get();
                    applyIncrementalTaskInfo(working, message.trim());
                }
            }
        }

        if (working != null) {
            List<String> locationIssues = validateLocations(working);
            if (!locationIssues.isEmpty()) {
                INCOMPLETE_DRAFTS.put(userKey, new IncompleteDraft(cloneTask(working), System.currentTimeMillis() + CONFIRM_TTL_MS));
                Map<String, Object> data = new LinkedHashMap<>();
                data.put("reply", "我识别到了任务意图，但地点信息还不够可靠：" + String.join("；", locationIssues) + "。请按“由A至B”或“起点: A 终点: B”补充更精确地点。");
                data.put("taskCreated", false);
                data.put("confirmRequired", false);
                data.put("locationValidated", false);
                data.put("locationIssues", locationIssues);
                return AjaxResult.success(data);
            }
            List<String> businessMissing = validateBusinessRequiredFields(working);
            if (!businessMissing.isEmpty()) {
                INCOMPLETE_DRAFTS.put(userKey, new IncompleteDraft(cloneTask(working), System.currentTimeMillis() + CONFIRM_TTL_MS));
                String followUpQuestion = buildMissingFieldFollowUpQuestion(working, businessMissing);
                Map<String, Object> data = new LinkedHashMap<>();
                data.put("reply", "我已经记住你前面的任务需求了。当前还缺少关键字段：" + String.join("；", businessMissing) + "。"
                        + followUpQuestion + "补全后我会先给你确认单，再由你决定是否创建任务。");
                data.put("taskCreated", false);
                data.put("confirmRequired", false);
                data.put("locationValidated", true);
                data.put("businessValidated", false);
                data.put("missingFields", businessMissing);
                data.put("taskDraft", buildTaskDraftSummary(working));
                data.put("nextActions", buildNextActionTips(working, false, false));
                return AjaxResult.success(data);
            }

            INCOMPLETE_DRAFTS.remove(userKey);
            PendingDraft pending = new PendingDraft();
            pending.token = UUID.randomUUID().toString().replace("-", "");
            pending.owner = userKey;
            pending.expiresAt = System.currentTimeMillis() + CONFIRM_TTL_MS;
            pending.draft = working;
            PENDING_DRAFTS.put(pending.token, pending);

            String reply = "我已识别任务草稿，请确认后创建：\n"
                    + "任务类型：" + working.getTaskType() + "\n"
                    + "起点：" + working.getStartLocation() + "\n"
                    + "终点：" + working.getEndLocation() + "\n"
                    + "紧急程度：" + urgencyText(working.getUrgency()) + "\n"
                    + "说明：确认后将写入“任务信息”列表。";
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("reply", reply);
            data.put("taskCreated", false);
            data.put("confirmRequired", true);
            data.put("confirmToken", pending.token);
            data.put("confirmExpireSec", CONFIRM_TTL_MS / 1000);
            data.put("locationValidated", true);
            data.put("businessValidated", true);
            data.put("taskDraft", buildTaskDraftSummary(working));
            data.put("nextActions", buildNextActionTips(working, true, false));
            return AjaxResult.success(data);
        }

        String reply = sanitizeReplyForUser(aiService.chat(message.trim()));

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("reply", reply);
        data.put("taskCreated", false);
        data.put("confirmRequired", false);
        return AjaxResult.success(data);
    }

    @GetMapping("/history")
    public AjaxResult getHistory() {
        return success(new Object());
    }

    @DeleteMapping("/clear")
    public AjaxResult clearHistory() {
        return success();
    }

    private AjaxResult handleConfirmAction(String actionRaw, String confirmTokenRaw) {
        String action = actionRaw == null ? "" : actionRaw.trim().toLowerCase();
        String token = confirmTokenRaw == null ? "" : confirmTokenRaw.trim();
        if (token.isEmpty()) {
            return error("缺少 confirmToken");
        }
        PendingDraft pending = PENDING_DRAFTS.get(token);
        if (pending == null) {
            return error("确认请求已失效，请重新描述任务");
        }
        if (System.currentTimeMillis() > pending.expiresAt) {
            PENDING_DRAFTS.remove(token);
            return error("确认超时，请重新描述任务");
        }
        String currentUser = currentUserKey();
        if (!pending.owner.equals(currentUser)) {
            return error("该确认任务不属于当前用户");
        }

        if ("cancel".equals(action)) {
            PENDING_DRAFTS.remove(token);
            INCOMPLETE_DRAFTS.remove(currentUser);
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("reply", "已取消本次任务创建。你可以重新描述任务需求。");
            data.put("taskCreated", false);
            data.put("confirmRequired", false);
            return AjaxResult.success(data);
        }

        UavTask draft = pending.draft;
        boolean autoAssignedUav = tryAutoAssignUav(draft);
        int n = uavTaskService.insertUavTask(draft);
        PENDING_DRAFTS.remove(token);
        if (n <= 0) {
            return error("任务创建失败，请稍后重试");
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put(
                "reply",
                autoAssignedUav
                        ? ("已为你创建任务，编号 " + draft.getTaskId() + "，并自动匹配无人机。")
                        : ("已为你创建任务，编号 " + draft.getTaskId() + "。请到「任务信息」列表计算路径并指派无人机。")
        );
        data.put("taskCreated", true);
        data.put("confirmRequired", false);
        data.put("taskId", draft.getTaskId());
        data.put("taskName", draft.getTaskName());
        data.put("startLocation", draft.getStartLocation());
        data.put("endLocation", draft.getEndLocation());
        data.put("taskType", draft.getTaskType());
        data.put("urgency", draft.getUrgency());
        data.put("autoAssignedUav", autoAssignedUav);
        data.put("uavId", draft.getUavId());
        data.put("nextActions", buildNextActionTips(draft, true, autoAssignedUav));
        return AjaxResult.success(data);
    }

    private static Map<String, Object> buildTaskDraftSummary(UavTask t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("taskName", t.getTaskName());
        m.put("taskType", t.getTaskType());
        m.put("startLocation", t.getStartLocation());
        m.put("endLocation", t.getEndLocation());
        m.put("urgency", t.getUrgency());
        m.put("requiredLoad", t.getRequiredLoad());
        m.put("estimatedTime", t.getEstimatedTime());
        return m;
    }

    private static List<String> validateBusinessRequiredFields(UavTask task) {
        List<String> missing = new ArrayList<>();
        String type = task.getTaskType() == null ? "" : task.getTaskType().trim();
        if (task.getTaskName() == null || task.getTaskName().isBlank()) {
            missing.add("任务名称");
        }
        if (type.isEmpty()) {
            missing.add("任务类型");
        }
        if (task.getStartLocation() == null || task.getStartLocation().isBlank()) {
            missing.add("起点");
        }
        if (task.getEndLocation() == null || task.getEndLocation().isBlank()) {
            missing.add("终点");
        }
        boolean transport = containsAny(type, "运送", "货运", "配送", "运输");
        if (transport) {
            Double load = task.getRequiredLoad();
            if (load == null || load <= 0.0) {
                missing.add("货物重量(kg)");
            }
        }
        return missing;
    }

    private static UavTask cloneTask(UavTask src) {
        UavTask t = new UavTask();
        t.setTaskId(src.getTaskId());
        t.setTaskName(src.getTaskName());
        t.setTaskType(src.getTaskType());
        t.setStartLocation(src.getStartLocation());
        t.setEndLocation(src.getEndLocation());
        t.setDescription(src.getDescription());
        t.setUavId(src.getUavId());
        t.setUavModel(src.getUavModel());
        t.setStatus(src.getStatus());
        t.setMaxDistance(src.getMaxDistance());
        t.setEstimatedTime(src.getEstimatedTime());
        t.setRequiredLoad(src.getRequiredLoad());
        t.setUrgency(src.getUrgency());
        return t;
    }

    private static void applyIncrementalTaskInfo(UavTask t, String m) {
        if (m == null || m.isBlank()) {
            return;
        }
        Matcher load = P_LOAD.matcher(m);
        if (load.find()) {
            try {
                t.setRequiredLoad(Double.parseDouble(load.group(1)));
            } catch (Exception ignored) {
                // ignore bad number
            }
        }
        Matcher est = P_EST_MIN.matcher(m);
        if (est.find()) {
            try {
                t.setEstimatedTime(Integer.parseInt(est.group(1)));
            } catch (Exception ignored) {
                // ignore bad number
            }
        }
        Matcher dist = P_DISTANCE_KM.matcher(m);
        if (dist.find()) {
            try {
                t.setMaxDistance(Double.parseDouble(dist.group(1)));
            } catch (Exception ignored) {
                // ignore bad number
            }
        }
        if (containsAny(m, "非常紧急", "立刻", "马上", "立即")) {
            t.setUrgency(3);
        } else if (containsAny(m, "紧急", "加急", "尽快")) {
            t.setUrgency(2);
        }
        if ((t.getTaskType() == null || t.getTaskType().isBlank())
                && containsAny(m, "运送", "运输", "货物", "配送", "货运")) {
            t.setTaskType("运送");
        }
    }

    private static void mergeTaskFromIntent(UavTask target, Optional<UavTask> fromIntent) {
        if (target == null || fromIntent == null || fromIntent.isEmpty()) {
            return;
        }
        UavTask parsed = fromIntent.get();
        if ((target.getTaskType() == null || target.getTaskType().isBlank())
                && parsed.getTaskType() != null && !parsed.getTaskType().isBlank()) {
            target.setTaskType(parsed.getTaskType());
        }
        if ((target.getStartLocation() == null || target.getStartLocation().isBlank())
                && parsed.getStartLocation() != null && !parsed.getStartLocation().isBlank()) {
            target.setStartLocation(parsed.getStartLocation());
        }
        if ((target.getEndLocation() == null || target.getEndLocation().isBlank())
                && parsed.getEndLocation() != null && !parsed.getEndLocation().isBlank()) {
            target.setEndLocation(parsed.getEndLocation());
        }
        if ((target.getTaskName() == null || target.getTaskName().isBlank())
                && parsed.getTaskName() != null && !parsed.getTaskName().isBlank()) {
            target.setTaskName(parsed.getTaskName());
        }
        if (target.getRequiredLoad() == null && parsed.getRequiredLoad() != null && parsed.getRequiredLoad() > 0.0) {
            target.setRequiredLoad(parsed.getRequiredLoad());
        }
        if (target.getEstimatedTime() == null && parsed.getEstimatedTime() != null && parsed.getEstimatedTime() > 0) {
            target.setEstimatedTime(parsed.getEstimatedTime());
        }
        if (target.getMaxDistance() == null && parsed.getMaxDistance() != null && parsed.getMaxDistance() > 0.0) {
            target.setMaxDistance(parsed.getMaxDistance());
        }
        if (target.getUrgency() == null && parsed.getUrgency() != null) {
            target.setUrgency(parsed.getUrgency());
        }
    }

    private static String buildMissingFieldFollowUpQuestion(UavTask task, List<String> missingFields) {
        String type = task.getTaskType() == null ? "" : task.getTaskType().trim();
        if (containsAny(type, "运送", "货运", "配送", "运输") && missingFields.contains("货物重量(kg)")) {
            return "请告诉我这次运送的货物重量（例如：8kg）。";
        }
        if (missingFields.contains("起点") && missingFields.contains("终点")) {
            return "请按“由A到B”或“起点:A 终点:B”提供地点。";
        }
        if (missingFields.contains("起点")) {
            return "请补充起点位置。";
        }
        if (missingFields.contains("终点")) {
            return "请补充终点位置。";
        }
        if (missingFields.contains("任务类型")) {
            return "请补充任务类型（运送/巡检/航拍测绘等）。";
        }
        return "请继续补充上述字段。";
    }

    private boolean tryAutoAssignUav(UavTask task) {
        if (task.getUavId() != null) {
            return true;
        }
        if (task.getMaxDistance() == null || task.getMaxDistance() <= 0.0) {
            return false;
        }
        try {
            List<Uav> rec = uavTaskService.recommendUavsForTask(task);
            if (rec != null && !rec.isEmpty() && rec.get(0).getUavId() != null) {
                task.setUavId(rec.get(0).getUavId());
                task.setUavModel(rec.get(0).getUavModel());
                return true;
            }
        } catch (Exception ignored) {
            // ignored
        }
        return false;
    }

    private static List<String> buildNextActionTips(UavTask task, boolean createdOrReady, boolean autoAssignedUav) {
        List<String> tips = new ArrayList<>();
        if (!createdOrReady) {
            tips.add("请先补全缺失字段，我再生成确认单");
            return tips;
        }
        if (task.getMaxDistance() == null || task.getMaxDistance() <= 0.0) {
            tips.add("到「任务信息」点击“计算路径并获取可用无人机”，自动计算距离/时间");
        }
        if (!autoAssignedUav && task.getUavId() == null) {
            tips.add("计算路径后请在任务列表指派无人机");
        } else {
            tips.add("无人机已自动匹配，可直接进入任务规划页面");
        }
        tips.add("进入「任务规划」完成航线与执行参数设置");
        return tips;
    }

    private static List<String> validateLocations(UavTask task) {
        List<String> issues = new ArrayList<>();
        String s = task.getStartLocation() == null ? "" : task.getStartLocation().trim();
        String e = task.getEndLocation() == null ? "" : task.getEndLocation().trim();
        if (s.length() < 2) {
            issues.add("起点过短");
        }
        if (e.length() < 2) {
            issues.add("终点过短");
        }
        if (s.length() > 60) {
            issues.add("起点过长");
        }
        if (e.length() > 60) {
            issues.add("终点过长");
        }
        if (s.equals(e)) {
            issues.add("起点与终点相同");
        }
        if (containsAny(s, "这里", "那里", "附近", "某地", "起点", "终点")) {
            issues.add("起点不够具体");
        }
        if (containsAny(e, "这里", "那里", "附近", "某地", "起点", "终点")) {
            issues.add("终点不够具体");
        }
        if (containsAny(s, "创建", "任务", "帮我", "运送", "配送")) {
            issues.add("起点包含非地点描述");
        }
        if (containsAny(e, "创建", "任务", "帮我", "运送", "配送")) {
            issues.add("终点包含非地点描述");
        }
        return issues;
    }

    private static boolean containsAny(String text, String... parts) {
        if (text == null) {
            return false;
        }
        for (String p : parts) {
            if (text.contains(p)) {
                return true;
            }
        }
        return false;
    }

    private static void cleanupExpiredDrafts() {
        long now = System.currentTimeMillis();
        PENDING_DRAFTS.entrySet().removeIf(e -> e.getValue().expiresAt < now);
        INCOMPLETE_DRAFTS.entrySet().removeIf(e -> e.getValue().expiresAt < now);
    }

    private static String urgencyText(Integer urgency) {
        if (urgency == null) {
            return "普通";
        }
        if (urgency == 3) {
            return "非常紧急";
        }
        if (urgency == 2) {
            return "紧急";
        }
        return "普通";
    }

    private static String currentUserKey() {
        try {
            Long uid = SecurityUtils.getUserId();
            return uid == null ? "anonymous" : "uid:" + uid;
        } catch (Exception ignored) {
            return "anonymous";
        }
    }

    private static String sanitizeReplyForUser(String raw) {
        if (raw == null || raw.isBlank()) {
            return raw;
        }
        String s = raw;
        // 清理模型给出的内部路由提示，避免在用户视图暴露技术路径。
        s = ROUTE_HINT_PAREN.matcher(s).replaceAll("");
        s = ROUTE_HINT_BRACKET.matcher(s).replaceAll("");
        // 兜底：去除“路径：`/xxx`”片段（不在括号内也会清理）。
        s = s.replaceAll("路径\\s*[:：]\\s*`/?[^`\\s]+`", "");
        s = s.replaceAll("\\s{2,}", " ");
        s = s.replaceAll("[ \\t]+\\n", "\n");
        s = s.replaceAll("\\n{3,}", "\n\n");
        return s.trim();
    }

    private static final class PendingDraft {
        private String token;
        private String owner;
        private long expiresAt;
        private UavTask draft;
    }

    private static final class IncompleteDraft {
        private final UavTask draft;
        private final long expiresAt;

        private IncompleteDraft(UavTask draft, long expiresAt) {
            this.draft = draft;
            this.expiresAt = expiresAt;
        }
    }
}
