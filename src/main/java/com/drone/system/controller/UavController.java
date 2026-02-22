package com.drone.system.controller;

import com.drone.system.domain.AjaxResult;
import com.drone.system.domain.TableDataInfo;
import com.drone.system.domain.Uav;
import com.drone.system.service.IUavService;
import jakarta.annotation.Resource;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/uavInfo/baseInfo")
public class UavController extends BaseController{
    
    @Resource
    private IUavService uavService;
    
    /**
     * 查询无人机列表
     */
    @GetMapping("/selectUavList")
    public TableDataInfo selectUavList(Uav uav) {
        startPage();
        List<Uav> list = uavService.selectUavList(uav);
        return getDataTable(list);
    }
    
    /**
     * 查询无人机详细信息
     */
    @GetMapping("/selectUavByUavId/{uavId}")
    public AjaxResult selectUavByUavId(@PathVariable Integer uavId) {
        return success(uavService.selectUavByUavId(uavId));
    }
    
    /**
     * 新增无人机
     */
    @PostMapping("/insertUav")
    public AjaxResult insertUav(@RequestBody Uav uav) {
        return toAjax(uavService.insertUav(uav));
    }
    
    /**
     * 修改无人机
     */
    @PutMapping("/updateUav")
    public AjaxResult updateUav(@RequestBody Uav uav) {
        return toAjax(uavService.updateUav(uav));
    }
    
    /**
     * 删除无人机
     */
    @DeleteMapping("/deleteUavByUavIds/{uavIds}")
    public AjaxResult deleteUavByUavIds(@PathVariable Integer[] uavIds) {
        return toAjax(uavService.deleteUavByUavIds(uavIds));
    }
}