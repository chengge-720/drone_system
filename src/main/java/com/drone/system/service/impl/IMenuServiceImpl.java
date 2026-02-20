package com.drone.system.service.impl;

import com.drone.system.mapper.MenuMapper;
import com.drone.system.service.IMenuService;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

/**
 * 菜单Service业务层处理
 */
@Service
public class IMenuServiceImpl implements IMenuService {
    @Resource
    private MenuMapper menuMapper;


}
