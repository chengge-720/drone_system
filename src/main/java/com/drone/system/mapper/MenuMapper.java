package com.drone.system.mapper;

import com.drone.system.domain.Menu;
import org.apache.ibatis.annotations.Mapper;

import java.util.List;

/**
 * 菜单Mapper
 */
@Mapper
public interface MenuMapper {

    /**
     * 根据用户ID查询对应的菜单
     * @param menu
     * @param userId
     * @return
     */
    List<Menu> selectMenuListByUserId(Menu menu);

    int insertMenu(Menu menu);

    Menu selectMenuByMenuId(Long menuId);

    int updateMenu(Menu menu);

    int deleteMenuByMenuId(Long menuId);

    List<Long> selectMenuListByRoleId(Long roleId);
}
