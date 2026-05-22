/**
 * Axios客户端配置
 * 包含JWT拦截器和错误处理
 */

import axios from 'axios';
import { message } from 'antd';
import config from '../config/settings';

let _navigate = null;
let lastAuthExpiredMessageAt = 0;

const AUTH_ERROR_MESSAGE_COOLDOWN_MS = 2000;
const AUTH_PAGES = ['/login', '/register'];

export const setNavigate = (navigate) => {
  _navigate = navigate;
};

const isAuthPage = () => AUTH_PAGES.includes(window.location.pathname);

const isLoginRequest = (requestConfig) => requestConfig?.url?.includes('/api/auth/login');

const showAuthExpiredMessage = () => {
  if (isAuthPage()) {
    return;
  }

  const now = Date.now();
  if (now - lastAuthExpiredMessageAt < AUTH_ERROR_MESSAGE_COOLDOWN_MS) {
    return;
  }

  lastAuthExpiredMessageAt = now;
  message.error('登录已过期，请重新登录');
};

const redirectToLogin = () => {
  if (isAuthPage()) {
    return;
  }

  if (_navigate) {
    _navigate('/login');
  } else {
    window.location.href = '/login';
  }
};

// 创建axios实例
const apiClient = axios.create({
  baseURL: config.api.baseURL,
  timeout: config.api.timeout,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器：添加JWT token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器：统一错误处理
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    if (error.config?.skipErrorHandler) {
      return Promise.reject(error);
    }

    // 网络错误或 5xx 自动重试（最多 3 次，指数退避）。默认只重试幂等请求。
    const requestMethod = (error.config?.method || 'get').toLowerCase();
    const isIdempotentRequest = requestMethod === 'get' || requestMethod === 'head';
    const shouldRetry = isIdempotentRequest && (!error.response || error.response.status >= 500);
    if (shouldRetry) {
      const config = error.config || {};
      config._retryCount = config._retryCount || 0;
      if (config._retryCount < 3) {
        config._retryCount += 1;
        const delay = Math.pow(2, config._retryCount) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return apiClient(config);
      }
    }

    if (error.response) {
      const { status, data } = error.response;

      switch (status) {
        case 401:
          if (isLoginRequest(error.config)) {
            message.error(data.detail || '用户名或密码错误');
            break;
          }

          // 未授权，清除token并跳转到登录页
          localStorage.removeItem('access_token');
          localStorage.removeItem('user');
          showAuthExpiredMessage();
          redirectToLogin();
          break;
        case 403:
          message.error(data.detail || '没有权限访问');
          break;
        case 404:
          message.error(data.detail || '请求的资源不存在');
          break;
        case 429:
          message.error(data.detail || '请求过于频繁，请稍后再试');
          break;
        case 500:
          message.error('服务器错误，请稍后重试');
          break;
        default:
          message.error(data.detail || '请求失败，请稍后重试');
      }
    } else if (error.request) {
      message.error('网络错误，请检查网络连接');
    } else {
      message.error('请求配置错误');
    }

    return Promise.reject(error);
  }
);

export default apiClient;
