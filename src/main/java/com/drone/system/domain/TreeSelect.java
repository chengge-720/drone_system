package com.drone.system.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;

import java.util.List;
import java.util.stream.Collectors;

@Data
public class TreeSelect {
    //节点ID
    private Long id;

    //节点名称
    private String label;

    //子节点列表
    //加上该注解，表示该字段在JSON序列化时，如果为空，则不包含该字段
    //翻译过来就是如果children为空，则不包含该字段，最后一级节点（菜单）没有children，就没有该字段
    @JsonInclude(JsonInclude.Include.NON_EMPTY)
    private List<TreeSelect> children;

    /**
     * 构造函数
     * 进行数据转换
     * @param menu 菜单对象转化为树结构TreeSelect
     */
    public TreeSelect(Menu menu) {
        //设置节点ID和节点名称
        this.id = menu.getMenuId();
        this.label = menu.getMenuName();

        //处理子菜单，递归调用构造函数，将子菜单转换为树结构
        this.children = menu.getChildren().stream()
                .map(TreeSelect::new)
                .collect(Collectors.toList());
    }
}
