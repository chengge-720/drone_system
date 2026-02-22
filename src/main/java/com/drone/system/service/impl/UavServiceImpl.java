package com.drone.system.service.impl;

import com.drone.system.domain.Uav;
import com.drone.system.mapper.UavMapper;
import com.drone.system.service.IUavService;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class UavServiceImpl implements IUavService {
    @Resource
    private UavMapper uavMapper;
    
    /**
     * 查询无人机列表
     * 
     * @param uav 无人机信息
     * @return 无人机集合
     */
    @Override
    public List<Uav> selectUavList(Uav uav) {
        return uavMapper.selectUavList(uav);
    }
    
    /**
     * 通过无人机ID查询无人机信息
     * 
     * @param uavId 无人机ID
     * @return 无人机对象信息
     */
    @Override
    public Uav selectUavByUavId(Integer uavId) {
        return uavMapper.selectUavByUavId(uavId);
    }
    
    /**
     * 新增无人机
     * 
     * @param uav 无人机信息
     * @return 结果
     */
    @Override
    public int insertUav(Uav uav) {
        return uavMapper.insertUav(uav);
    }
    
    /**
     * 修改无人机
     * 
     * @param uav 无人机信息
     * @return 结果
     */
    @Override
    public int updateUav(Uav uav) {
        return uavMapper.updateUav(uav);
    }
    
    /**
     * 批量删除无人机
     * 
     * @param uavIds 需要删除的无人机ID
     * @return 结果
     */
    @Override
    public int deleteUavByUavIds(Integer[] uavIds) {
        return uavMapper.deleteUavByUavIds(uavIds);
    }
}