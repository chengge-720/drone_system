package com.drone.system.service.impl;

import com.drone.system.constants.RoleIdConstants;
import com.drone.system.domain.Menu;
import com.drone.system.domain.TreeSelect;
import com.drone.system.domain.vo.MetaVo;
import com.drone.system.domain.vo.RouterVo;
import com.drone.system.mapper.MenuMapper;
import com.drone.system.mapper.UserRoleMapper;
import com.drone.system.service.IMenuService;
import jakarta.annotation.Resource;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 菜单Service业务层处理
 */
@Service
public class IMenuServiceImpl implements IMenuService {
    @Resource
    private MenuMapper menuMapper;

    @Resource
    private UserRoleMapper userRoleMapper;

    @Override
    public List<Menu> selectMenuList(Menu menu ,Long userId) {
        //根据用户ID查询对应的用户角色
        Long roleId = userRoleMapper.selectRoleIdByUserId(userId);
        //根据用户角色查询对应的菜单
        //管理员显示所有菜单
        if(roleId.equals(RoleIdConstants.ADMIN_ROLE_ID)) {
            return menuMapper.selectMenuListByUserId(menu);
        }else {//普通用户显示对应角色的菜单
            //设置用户ID
            menu.setUserId(userId);
            return menuMapper.selectMenuListByUserId(menu);
        }
    }

    @Override
    public int insertMenu(Menu menu) {
        return menuMapper.insertMenu(menu);
    }

    @Override
    public Menu selectMenuByMenuId(Long menuId) {
        return menuMapper.selectMenuByMenuId(menuId);
    }

    @Override
    public int updateMenu(Menu menu) {
        return menuMapper.updateMenu(menu);
    }

    @Override
    public int deleteMenuByMenuId(Long menuId) {
        return menuMapper.deleteMenuByMenuId(menuId);
    }

    @Override
    public List<Long> selectMenuListByRoleId(Long roleId) {
        return menuMapper.selectMenuListByRoleId(roleId);
    }

    @Override
    public List<TreeSelect> buildMenuTreeSelect(List<Menu> menus) {
        //将顺序的菜单转换为树形结构
        List<Menu> menuTrees = buildMenuTree(menus);
        //将树形Menu对象转换为TreeSelect对象
        return menuTrees.stream()
                .map(TreeSelect::new)
                .collect(Collectors.toList());
    }

    /**
     * 构建菜单树
     * @param menus 菜单列表
     * @return 构建后的菜单树
     */
    public List<Menu> buildMenuTree(List<Menu> menus) {
        //去除重复的菜单，以menuId为key
        LinkedHashMap<Long, Menu> uniqueMenusMap = new LinkedHashMap<>();
        for(Menu menu: menus){
            //去重
            if(!uniqueMenusMap.containsKey(menu.getMenuId())){
                uniqueMenusMap.put(menu.getMenuId(), menu);
            }
        }
        //转化为去重的菜单列表
        ArrayList<Menu> uniqueMenus = new ArrayList<>(uniqueMenusMap.values());
        //定义最终菜单列表
        ArrayList<Menu> returnlist = new ArrayList<>();
        //将菜单列表转换为MAP，快速查找
        HashMap<Long, Menu> menuMap = new HashMap<>();
        for(Menu menu: uniqueMenus){
            menuMap.put(menu.getMenuId(), menu);
            //确保每个菜单都有初始化children列表
            if(menu.getChildren() == null){
                menu.setChildren(new ArrayList<>());
            }else {
                //清空列表现有的children列表，避免重复添加
                menu.getChildren().clear();
            }
        }
        //查找顶级菜单
        HashSet<Long> addedTopMenuIds = new HashSet<>();
        for(Menu menu: uniqueMenus){
            if(menu.getParentId() == 0 || menu.getParentId() == null){
                //添加顶级菜单
                if(!addedTopMenuIds.contains(menu.getMenuId())){
                    returnlist.add(menu);
                    addedTopMenuIds.add(menu.getMenuId());
                }
            }else {
                //不是顶级菜单
                Menu parentMenu = menuMap.get(menu.getParentId());
                if(parentMenu != null){
                    //添加子菜单
                    parentMenu.getChildren().add(menu);
                }else {
                    //父菜单不存在
                    //添加为顶级菜单
                    if(!addedTopMenuIds.contains(menu.getMenuId())){
                        returnlist.add(menu);
                        addedTopMenuIds.add(menu.getMenuId());
                    }
                }
            }
        }
        return returnlist;
    }

    /**
     * 构建菜单路由树
     * @param userId 用户ID
     * @return 路由列表
     */
    @Override
    public List<RouterVo> selectMenuTreeRoutersByUserId(Long userId) {
        //创建菜单查询条件对象
        Menu menu = new Menu();
        List<Menu> menus;

        //1.判断用户身份，获取对应平铺的菜单列表数据
        //根据用户ID查询对应的用户角色
        Long roleId = userRoleMapper.selectRoleIdByUserId(userId);
        //根据用户角色查询对应的菜单
        //管理员显示所有菜单
        if(roleId.equals(RoleIdConstants.ADMIN_ROLE_ID)) {
            menus = menuMapper.selectMenuListByUserId(menu);
        }else {//普通用户显示对应角色的菜单
            //设置用户ID
            menu.setUserId(userId);
            menus = menuMapper.selectMenuListByUserId(menu);
        }

        //2.把菜单列表变为map,方便根据ID快速查找
        HashMap<Long, Menu> menuMap = new HashMap<>();
        for(Menu m: menus){
            menuMap.put(m.getMenuId(), m);//key=菜单ID，value=菜单对象
        }

        //3.构建树形结构（父子关系）
        List<Menu> rootMenus = new ArrayList<>();//存储根节点菜单
        for(Menu m: menus){
            //清空children列表,避免数据重复添加
            m.setChildren(new ArrayList<>());
            //判断是否是根结点菜单（parentId=0）
            if(m.getParentId() == 0){
                //直接添加到根节点菜单列表中
                rootMenus.add(m);
            }else{
                //不是根结点菜单：找到父菜单，把自己添加到父菜单的children列表中
                Menu parent = menuMap.get(m.getParentId());
                if(parent != null){
                    parent.getChildren().add(m);
                }
            }
        }
        //4.构建好的树形结构转化为前端需要的格式路由
        return buildMenu(rootMenus);
    }

    /**
     * 构建前端需要的路由样式
     */
    private List<RouterVo> buildMenu(List<Menu> menus){
        //创建一个空的LinkedList来存放所有转换好的路由
        LinkedList<RouterVo> routers = new LinkedList<>();

        //开始处理菜单列表，使用for循环遍历每一个菜单项
        for(Menu menu : menus){
            //1.创建一个新的前端路由对象
            RouterVo router = new RouterVo();

            //2.设置路由名称（name属性）
            String routerName = menu.getPath();
            if(menu.getMenuId() != null && menu.getParentId() == 0){
                //顶级菜单，名称确保唯一，添加菜单ID后缀
                routerName = menu.getPath() + '_' + menu.getMenuId();
            }
            router.setName(routerName);

            //3.设置路由访问路径（path属性）
            //先获取菜单再数据库中的原始数据字符串
            String routerPath = menu.getPath();
            //情况1.判断菜单类型是否为目录（M目录）
            if(menu.getParentId().intValue() == 0 && menu.getMenuType().equals("M")){
                //一级目录类型，路径添加斜杠前缀
                //转换前："system" -> 转换后："/system"
                routerPath = "/" + menu.getPath();
            }

            //情况2.如果这个菜单式一级菜单（不是目录，是具体的页面）
            else if(menu.getParentId().intValue() == 0 && menu.getMenuType().equals("C")){
                //一级菜单的路径设置为根路径
                routerPath = "/";
            }

            //情况3.二级菜单及以下菜单
            router.setPath(routerPath);

            //4.设置路由组件（component属性）
            //情况1.如果菜单配置了组件并且不是一级C类型菜单
            String component = "Layout";
            if(menu.getComponent() != null && !menu.getComponent().isEmpty() &&
                    !(menu.getParentId().intValue() == 0 && "C".equals(menu.getMenuType()))){
                //使用菜单配置的组件路径
                component = menu.getComponent();
            }

            //情况2.如果菜单没有配置组件，但它是二级或以上目录
            else if((menu.getComponent() == null || menu.getComponent().isEmpty()) &&
                    (menu.getParentId().intValue() != 0 && "M".equals(menu.getMenuType()))){
                component = "ParentView";
            }

            //情况3.一级目录包括没有组件的一级菜单等等
            router.setComponent(component);

            //5.设置路由元信息（meta属性）
            router.setMeta(new MetaVo(menu.getMenuName(), menu.getIcon()));

            //6.处理子菜单（children属性）
            List<Menu> cMenus = menu.getChildren();

            //情况1.如果当前菜单有子菜单，并且它是目录（M目录）
            if(!cMenus.isEmpty() &&  "M".equals(menu.getMenuType())){
                router.setAlwaysShow(true);
                router.setChildren(buildMenu(cMenus));
            }

            //情况2.一级菜单（C页面）
            else if(menu.getParentId().intValue() == 0 && "C".equals(menu.getMenuType())){
                //1.清空当前路由的meta
                router.setMeta(null);
                //2.创建一个子路由列表
                ArrayList<RouterVo> childrenList = new ArrayList<RouterVo>();
                //3.创建一个子路由对象
                RouterVo children = new RouterVo();
                //4.设置路由的各个属性
                children.setPath(menu.getPath());
                children.setComponent(menu.getComponent());
                children.setName(menu.getPath());
                //5.创建子路由的meta
                children.setMeta(new MetaVo(menu.getMenuName(), menu.getIcon(), menu.getPath()));
                //6.添加子路由到列表中
                childrenList.add(children);
                //7.将子路由列表添加到父路由中
                router.setChildren(childrenList);
            }

            //情况3.没有子菜单的C类型页面
            routers.add(router);
        }
        //返回所有转换好的路由
        return routers;
    }
}
