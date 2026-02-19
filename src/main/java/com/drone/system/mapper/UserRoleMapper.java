package com.drone.system.mapper;

import org.apache.ibatis.annotations.Mapper;

/**
 * 用户角色关联Mapper
 */
@Mapper
public interface UserRoleMapper {

    /**
     * 新增用户和角色关联
     * @param userId
     * @param roleId
     * @return
     */
    int insertUserRole(Long userId, Long roleId);

    /**
     * 根据用户ID删除用户和角色关联
     * @param userId
     * @return
     */
    int deleteUserRoleByUserId(Long userId);

    /**
     * 根据用户ID批量删除用户和角色关联
     * @param userIds
     * @return
     */
    int deleteUserRoles(Long[] userIds);
}
