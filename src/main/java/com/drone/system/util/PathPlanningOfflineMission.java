package com.drone.system.util;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

/**
 * 与 python_service/offline_train.py 默认任务对齐的离线 Q 表训练锚点。
 */
public final class PathPlanningOfflineMission {

    public static final class Anchor {
        public final int missionId;
        public final String name;
        public final double startLat;
        public final double startLon;
        public final double startAlt;
        public final double goalLat;
        public final double goalLon;
        public final double goalAlt;

        public Anchor(int missionId, String name,
                      double startLat, double startLon, double startAlt,
                      double goalLat, double goalLon, double goalAlt) {
            this.missionId = missionId;
            this.name = name;
            this.startLat = startLat;
            this.startLon = startLon;
            this.startAlt = startAlt;
            this.goalLat = goalLat;
            this.goalLon = goalLon;
            this.goalAlt = goalAlt;
        }
    }

    /** 与 offline_train 默认 --grid-n / --margin / --z-scale 一致（54 格 Z 原生上限约 106m @2m/格） */
    public static final int OFFLINE_GRID_N = 54;
    public static final int OFFLINE_MARGIN = 6;
    public static final double OFFLINE_Z_SCALE = 2.0;

    private static final Map<Integer, Anchor> BY_ID;

    static {
        Map<Integer, Anchor> m = new HashMap<>();
        m.put(1, new Anchor(1, "南昌舰主题公园->八一大桥",
                28.717861, 115.865875, 100.0,
                28.692707, 115.882176, 100.0));
        m.put(2, new Anchor(2, "秋水广场->地铁大厦",
                28.684521, 115.858910, 100.0,
                28.681276, 115.861983, 100.0));
        m.put(3, new Anchor(3, "南昌大学->南昌第一医院",
                28.664729, 115.918957, 110.0,
                28.675901, 115.899369, 110.0));
        m.put(4, new Anchor(4, "南昌航空大学->南昌市人民政府",
                28.683899, 115.853558, 105.0,
                28.683186, 115.857866, 105.0));
        m.put(5, new Anchor(5, "南昌印象城->南昌航空大学",
                28.658261, 115.833281, 88.0,
                28.653182, 115.822757, 88.0));
        BY_ID = Collections.unmodifiableMap(m);
    }

    public static Anchor get(int missionId) {
        return BY_ID.get(missionId);
    }
}
