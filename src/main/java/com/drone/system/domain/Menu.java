package com.drone.system.domain;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;

/**
 * 菜单
 */
@Data
public class Menu {
    //菜单ID
    private Long menuId;

    //菜单名称
    private String menuName;

    //父菜单ID
    private Long parentId;

    //菜单排序
    private Integer menuSort;

    //路由地址
    private String path;

    //组件路径
    private String component;

    //菜单类型（M目录 C菜单 F按钮）
    private String menuType;

    //菜单图标
    private String icon;

    //创建时间
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private Date createTime;

    //子菜单
    private List<Menu> children = new ArrayList<Menu>();

}
