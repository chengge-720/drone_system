package com.drone.system.service;
import com.drone.system.domain.Uav;

import java.util.List;

public interface IUavService {
    
    /**
     * 查询无人机列表
     * 
     * @param uav 无人机信息
     * @return 无人机集合
     */
    public List<Uav> selectUavList(Uav uav);
    
    /**
     * 通过无人机ID查询无人机信息
     * 
     * @param uavId 无人机ID
     * @return 无人机对象信息
     */
    public Uav selectUavByUavId(Integer uavId);
    
    /**
     * 新增无人机
     * 
     * @param uav 无人机信息
     * @return 结果
     */
    public int insertUav(Uav uav);
    
    /**
     * 修改无人机
     * 
     * @param uav 无人机信息
     * @return 结果
     */
    public int updateUav(Uav uav);
    
    /**
     * 批量删除无人机
     * 
     * @param uavIds 需要删除的无人机ID
     * @return 结果
     */
    public int deleteUavByUavIds(Integer[] uavIds);
}