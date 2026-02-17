package com.drone.system.domain;

import lombok.Data;

import java.util.List;

/**
 * 表格分页数据对象
 */
@Data
public class TableDataInfo {
    //数据总集
    private Long total;
    //列表数据
    private List<?> rows;
    //消息状态码
    private int code;
    //消息内容
    private String msg;
}
