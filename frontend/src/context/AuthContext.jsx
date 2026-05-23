/**
 * 认证状态管理Context
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import apiClient from '../api/client';
import { message } from 'antd';
import { DEFAULT_BUILTIN_AVATAR_KEY, normalizeBuiltinAvatarKey } from '../utils/avatars';

const AuthContext = createContext(null);

const normalizeUser = (user) => {
  if (!user) {
    return null;
  }

  const nextUser = {
    role: 'user',
    is_active: true,
    avatar_type: 'builtin',
    ...user,
  };

  const normalizedAvatarValue = nextUser.avatar_type === 'upload'
    ? nextUser.avatar_value
    : normalizeBuiltinAvatarKey(nextUser.avatar_value || DEFAULT_BUILTIN_AVATAR_KEY);

  return {
    ...nextUser,
    avatar_value: normalizedAvatarValue,
  };
};

const getStoredUser = () => {
  const storedUser = localStorage.getItem('user');
  const token = localStorage.getItem('access_token');

  if (!storedUser || !token) {
    return null;
  }

  try {
    return normalizeUser(JSON.parse(storedUser));
  } catch (error) {
    console.error('恢复本地用户信息失败:', error);
    localStorage.removeItem('user');
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(getStoredUser);
  const loading = false;

  const syncUserState = useCallback((nextUser) => {
    const normalizedUser = normalizeUser(nextUser);
    localStorage.setItem('user', JSON.stringify(normalizedUser));
    setUser(normalizedUser);
    return normalizedUser;
  }, []);

  // 页面加载时从服务端刷新用户数据（确保 uid 等新字段同步）
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token || !getStoredUser()) return;
    apiClient.get('/api/auth/me')
      .then((res) => syncUserState(res.data))
      .catch(() => {});  // token 过期等情况静默处理
  }, [syncUserState]);

  // 登录
  const login = useCallback(async (username, password) => {
    try {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const response = await apiClient.post('/api/auth/login', formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const { access_token, user: userData } = response.data;

      // 保存token和用户信息
      localStorage.setItem('access_token', access_token);
      syncUserState(userData);

      message.success('登录成功！');
      return true;
    } catch (error) {
      console.error('登录失败:', error);
      return false;
    }
  }, [syncUserState]);

  // 注册
  const register = useCallback(async (username, email, password) => {
    try {
      await apiClient.post('/api/auth/register', {
        username,
        email,
        password,
      });

      message.success('注册成功！请登录');
      return true;
    } catch (error) {
      console.error('注册失败:', error);
      return false;
    }
  }, []);

  // 验证重置密码邮箱
  const verifyResetEmail = useCallback(async (email) => {
    try {
      const response = await apiClient.post('/api/auth/password-reset/verify-email', { email });
      message.success(response.data.message || '验证码已发送');
      return response.data;
    } catch (error) {
      console.error('验证邮箱失败:', error);
      return null;
    }
  }, []);

  // 重置密码
  const resetPassword = useCallback(async (email, code, password) => {
    try {
      await apiClient.post('/api/auth/password-reset', { email, code, password });
      message.success('密码已更新，请使用新密码登录');
      return true;
    } catch (error) {
      console.error('重置密码失败:', error);
      return false;
    }
  }, []);

  const updateProfile = useCallback(async (profile) => {
    try {
      const response = await apiClient.patch('/api/auth/me', profile);
      const normalizedUser = syncUserState(response.data);
      message.success('资料已更新');
      return normalizedUser;
    } catch (error) {
      console.error('更新资料失败:', error);
      return null;
    }
  }, [syncUserState]);

  const setBuiltinAvatar = useCallback(async (avatarKey) => {
    try {
      const response = await apiClient.patch('/api/auth/me/avatar/builtin', {
        avatar_key: avatarKey,
      });
      const normalizedUser = syncUserState(response.data);
      message.success('头像已更新');
      return normalizedUser;
    } catch (error) {
      console.error('更新内置头像失败:', error);
      return null;
    }
  }, [syncUserState]);

  const uploadAvatar = useCallback(async (file) => {
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const response = await apiClient.post('/api/auth/me/avatar/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      const normalizedUser = syncUserState(response.data);
      message.success('头像已上传');
      return normalizedUser;
    } catch (error) {
      console.error('上传头像失败:', error);
      return null;
    }
  }, [syncUserState]);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    try {
      await apiClient.patch('/api/auth/me/password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      message.success('密码已更新');
      return true;
    } catch (error) {
      console.error('修改密码失败:', error);
      return false;
    }
  }, []);

  // 登出
  const logout = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    setUser(null);
    message.success('已退出登录');
  }, []);

  // 获取当前用户信息
  const getCurrentUser = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/auth/me');
      const userData = response.data;
      return syncUserState(userData);
    } catch (error) {
      console.error('获取用户信息失败:', error);
      return null;
    }
  }, [syncUserState]);

  const value = useMemo(() => ({
    user,
    loading,
    login,
    register,
    verifyResetEmail,
    resetPassword,
    updateProfile,
    setBuiltinAvatar,
    uploadAvatar,
    changePassword,
    logout,
    getCurrentUser,
    isAuthenticated: !!user,
  }), [changePassword, getCurrentUser, loading, login, logout, register, resetPassword, setBuiltinAvatar, updateProfile, uploadAvatar, user, verifyResetEmail]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// 自定义Hook
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth必须在AuthProvider内部使用');
  }
  return context;
};

export default AuthContext;
