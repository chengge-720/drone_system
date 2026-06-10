package com.drone.system.service.impl;

import com.drone.system.domain.UavTask;
import com.drone.system.service.PathPlanningIntentService;
import org.springframework.stereotype.Service;

import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class PathPlanningIntentServiceImpl implements PathPlanningIntentService {

    private static final Pattern P_START_END = Pattern.compile(
            "起点\\s*[:：]?\\s*(.+?)\\s*(?:终点|目的地)\\s*[:：]?\\s*(.+?)(?:[。；;\\n]|$)",
            Pattern.DOTALL);
    private static final Pattern P_DEST_FIRST = Pattern.compile(
            "目的地\\s*[:：]?\\s*(.+?)\\s*起点\\s*[:：]?\\s*(.+?)(?:[。；;\\n]|$)",
            Pattern.DOTALL);
    private static final Pattern P_FROM_TO = Pattern.compile(
            "从\\s*(.+?)\\s*到\\s*(.+?)(?:[。；;\\n]|$)",
            Pattern.DOTALL);
    private static final Pattern P_FROM_TO_EXT = Pattern.compile(
            "(?:从|由)\\s*(.+?)\\s*(?:到|至|去往|前往|飞往|飞到|送到|运送到)\\s*(.+?)(?:[。；;\\n]|$)",
            Pattern.DOTALL);
    private static final Pattern P_LOAD_KG = Pattern.compile(
            "(?:载重|负载|货重|重量)\\s*[:：]?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:kg|KG|公斤|千克)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern P_EST_MIN = Pattern.compile(
            "(\\d+)\\s*分钟(?:内)?");
    private static final Pattern P_LOAD_GOODS = Pattern.compile(
            "(\\d+(?:\\.\\d+)?)\\s*(?:kg|KG|公斤|千克)\\s*(?:货物|物资|包裹)?",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern P_DISTANCE_KM = Pattern.compile(
            "(?:距离|里程|航程)?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:km|KM|公里)",
            Pattern.CASE_INSENSITIVE);

    @Override
    public Optional<UavTask> tryBuildTaskDraft(String userMessage) {
        return buildTaskFromMessage(userMessage, true);
    }

    @Override
    public Optional<UavTask> tryBuildTaskIntent(String userMessage) {
        return buildTaskFromMessage(userMessage, false);
    }

    private Optional<UavTask> buildTaskFromMessage(String userMessage, boolean requireEndpoints) {
        if (userMessage == null || userMessage.isBlank()) {
            return Optional.empty();
        }
        String m = userMessage.trim();
        if (!hasTaskIntent(m)) {
            return Optional.empty();
        }
        String start = null;
        String end = null;

        Matcher me = P_START_END.matcher(m);
        if (me.find()) {
            start = cleanPlace(me.group(1));
            end = cleanPlace(me.group(2));
        }
        if ((start == null || end == null) || start.isEmpty() || end.isEmpty()) {
            Matcher md = P_DEST_FIRST.matcher(m);
            if (md.find()) {
                end = cleanPlace(md.group(1));
                start = cleanPlace(md.group(2));
            }
        }
        if ((start == null || end == null) || start.isEmpty() || end.isEmpty()) {
            Matcher mf = P_FROM_TO.matcher(m);
            if (mf.find()) {
                start = cleanPlace(mf.group(1));
                end = cleanPlace(mf.group(2));
            }
        }
        if ((start == null || end == null) || start.isEmpty() || end.isEmpty()) {
            Matcher mx = P_FROM_TO_EXT.matcher(m);
            if (mx.find()) {
                start = cleanPlace(mx.group(1));
                end = cleanPlace(mx.group(2));
            }
        }
        if (requireEndpoints && (start == null || end == null || start.isEmpty() || end.isEmpty())) {
            return Optional.empty();
        }
        if (start != null && start.equals(end)) {
            return Optional.empty();
        }
        start = sanitizeEndpoint(start);
        end = sanitizeEndpoint(end);
        if (requireEndpoints && (start.isEmpty() || end.isEmpty() || start.equals(end))) {
            return Optional.empty();
        }

        UavTask task = new UavTask();
        String taskType = detectTaskType(m);
        task.setTaskType(taskType);
        String taskName = (start.isEmpty() || end.isEmpty())
                ? (taskType + "任务（待补全地点）")
                : (taskType + "：" + start + " → " + end);
        task.setTaskName(truncate(taskName, 120));
        if (!start.isEmpty()) {
            task.setStartLocation(start);
        }
        if (!end.isEmpty()) {
            task.setEndLocation(end);
        }
        task.setDescription("由 AI 助手根据对话自动创建：" + truncate(m, 500));
        task.setStatus(1);
        task.setUrgency(detectUrgency(m));
        extractOptionalFields(task, m);
        return Optional.of(task);
    }

    private static boolean hasTaskIntent(String m) {
        if (looksLikeHelpQuestion(m)) {
            return false;
        }
        boolean hasEndWord = containsAny(m, "终点", "目的地", "飞到", "飞往", "去往", "到达", "至", "送到", "运送到");
        boolean hasStartWord = containsAny(m, "起点", "出发", "从", "由", "起始", "起飞");
        boolean pathLike = containsAny(m, "路径", "航线", "规划", "无人机", "飞行", "任务", "运送", "配送", "运输", "巡检", "巡查", "航拍", "测绘");
        boolean startEndPair = (containsAny(m, "起点") && hasEndWord) || P_FROM_TO.matcher(m).find();
        boolean typeLike = containsAny(m, "运送", "配送", "运输", "货运", "货物", "巡检", "巡查", "航拍", "测绘");
        return startEndPair || P_FROM_TO_EXT.matcher(m).find() || (pathLike && hasStartWord && hasEndWord) || (pathLike && typeLike);
    }

    private static boolean looksLikeHelpQuestion(String m) {
        return containsAny(m, "怎么", "如何", "怎样", "在哪", "哪里", "步骤", "教程", "说明", "help", "?", "？");
    }

    private static boolean containsAny(String hay, String... needles) {
        for (String n : needles) {
            if (hay.contains(n)) {
                return true;
            }
        }
        return false;
    }

    private static String cleanPlace(String raw) {
        if (raw == null) {
            return "";
        }
        String s = raw.replaceAll("[\"'「」]", "").trim();
        s = s.replaceAll("^(?:我有|我想|请帮我|帮我|需要)(?:一个|一条|一项|一次)?\\s*", "");
        s = s.replaceAll("^(?:是|为|在)\\s*", "");
        s = s.replaceAll("\\s+", " ");
        return s.trim();
    }

    private static String sanitizeEndpoint(String raw) {
        if (raw == null) {
            return "";
        }
        String s = raw.trim();
        // 去除“一个/一条”等量词前缀
        s = s.replaceAll("^(?:一个|一条|一项|一次)\\s*", "");
        // 去掉尾部常见任务描述，避免被并入地点名
        s = s.replaceAll("(?:的)?(?:货物运送|货运|配送|运输|飞行|路径规划|巡检|巡查|航拍|测绘)?(?:任务|需求)?(?:需要)?(?:解决|处理|安排|执行|完成)?$", "");
        s = s.replaceAll("(?:并)?(?:创建|新建|生成|安排|执行|处理).*$", "");
        s = s.replaceAll("[，。；;\\s]+$", "");
        return s.trim();
    }

    private static String detectTaskType(String m) {
        if (containsAny(m, "货物", "货运", "运送", "配送", "运输")) {
            return "运送";
        }
        if (containsAny(m, "巡检", "巡查")) {
            return "巡检";
        }
        if (containsAny(m, "航拍", "拍摄", "测绘")) {
            return "航拍测绘";
        }
        return "路径规划";
    }

    private static int detectUrgency(String m) {
        if (containsAny(m, "立刻", "马上", "立即", "尽快", "紧急", "加急", "火急")) {
            if (containsAny(m, "立刻", "马上", "立即", "火急")) {
                return 3;
            }
            return 2;
        }
        return 1;
    }

    private static void extractOptionalFields(UavTask task, String m) {
        Matcher load = P_LOAD_KG.matcher(m);
        Matcher loadGoods = P_LOAD_GOODS.matcher(m);
        if (load.find()) {
            try {
                task.setRequiredLoad(Double.parseDouble(load.group(1)));
            } catch (Exception ignored) {
                // ignore malformed numeric value
            }
        } else if (loadGoods.find()) {
            try {
                task.setRequiredLoad(Double.parseDouble(loadGoods.group(1)));
            } catch (Exception ignored) {
                // ignore malformed numeric value
            }
        }
        Matcher estMin = P_EST_MIN.matcher(m);
        if (estMin.find()) {
            try {
                task.setEstimatedTime(Integer.parseInt(estMin.group(1)));
            } catch (Exception ignored) {
                // ignore malformed numeric value
            }
        }
        Matcher dist = P_DISTANCE_KM.matcher(m);
        if (dist.find()) {
            try {
                task.setMaxDistance(Double.parseDouble(dist.group(1)));
            } catch (Exception ignored) {
                // ignore malformed numeric value
            }
        }
    }

    private static String truncate(String s, int max) {
        if (s == null) {
            return "";
        }
        return s.length() <= max ? s : s.substring(0, max) + "…";
    }
}
