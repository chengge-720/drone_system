package com.drone.system.domain.vo;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.util.List;

/**
 * 路由配置信息
 * 这个类用于封装路由信息
 * @author ruoyi
 */
@Data
@JsonInclude(JsonInclude.Include.NON_EMPTY)// 属性值为空的时候，不进行序列化
public class RouterVo {
    //路由名称
    private String name;

    //路由访问路径
    private String path;

    //路由对应的前端组件路径
    private String component;

    //是否总是显示为嵌套模式
    private Boolean alwaysShow;

    //路由的额外配置信息
    private MetaVo meta;

    //子路由
    private List<RouterVo> children;
}
