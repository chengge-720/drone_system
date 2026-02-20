package com.drone.system.service;

import com.drone.system.domain.AjaxResult;
import com.drone.system.domain.Menu;

import java.util.List;

/**
 * 菜单Service接口
 */
public interface IMenuService {
    /**
     * 获取菜单列表
     */
    List<Menu> selectMenuList(Menu menu ,Long userId);
}
