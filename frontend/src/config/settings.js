/**
 * 前端配置管理
 * 从项目根目录 .env 读取构建时环境变量
 */

// 读取配置文件（在实际部署时，这个文件应该通过构建工具注入）
const config = {
  server: {
    port: 8888
  },
  api: {
    baseURL: (() => {
      const url = import.meta.env.VITE_API_BASE_URL;
      if (!url) {
        throw new Error(
          'VITE_API_BASE_URL 环境变量未设置！请在项目根目录 .env 中配置 API 地址。\n' +
          '示例: VITE_API_BASE_URL=http://127.0.0.1:8889'
        );
      }
      return url;
    })(),
    timeout: 10000
  },
  app: {
    title: "IELTS单词背诵",
    description: "基于配图记忆的雅思单词学习应用"
  }
};

export default config;
