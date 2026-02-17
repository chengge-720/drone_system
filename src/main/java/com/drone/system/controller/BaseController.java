package com.drone.system.controller;

import com.drone.system.domain.AjaxResult;
import com.drone.system.domain.TableDataInfo;
import com.github.pagehelper.PageHelper;
import com.github.pagehelper.PageInfo;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.List;

/**
 * web层通用数据处理，把常用的方法写进这里
 * 这是基类，其他的控制器都可以继承
 */
public class BaseController {
    //返回成功（无数据）
    public AjaxResult success(){
        return AjaxResult.success();
    }
    //返回错误(无数据)
    public AjaxResult error(){
        return AjaxResult.error();
    }
    //返回成功（带消息）
    public AjaxResult success(String msg){
        return AjaxResult.success(msg);
    }
    //返回成功（带数据）
    public AjaxResult success(Object data){
        return AjaxResult.success(data);
    }
    //返回错误（带消息）
    public AjaxResult error(String msg){
        return AjaxResult.error(msg);
    }
    //根据受到影响的行数判断操作是否成功
    protected AjaxResult toAjax(int rows){
        return rows > 0 ? AjaxResult.success() : AjaxResult.error();
    }

    //根据Web层设置请求分页参数
    protected void startPage(){
        //获取当前HTTP请求
        HttpServletRequest req = ((ServletRequestAttributes) RequestContextHolder.currentRequestAttributes()).getRequest();

        //获取并转化参数
        int pageNum = Integer.parseInt(req.getParameter("pageNum"));
        int pageSize = Integer.parseInt(req.getParameter("pageSize"));

        //在第一次的查询sql中加上limit语句，规格化查询
        PageHelper.startPage(pageNum,pageSize).setReasonable(true);
    }

    /**
     * 插入分页数据
     */
    protected <T>TableDataInfo getDataTable(List<T> list){
        TableDataInfo dataInfo = new TableDataInfo();
        dataInfo.setCode(200);
        dataInfo.setMsg("查询成功");
        dataInfo.setRows(list);
        dataInfo.setTotal(new PageInfo<>(list).getTotal());
        return dataInfo;
    }

}
