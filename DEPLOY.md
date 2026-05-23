# IELTSWORDS 部署指南

本文档说明如何以较稳妥的方式，将 IELTSWORDS 部署到生产环境。

推荐的部署结构如下：

- 使用 Nginx 提供 `frontend/dist` 静态文件
- 使用 Nginx 将 `/api`、`/health`、`/docs` 反向代理到 FastAPI
- 使用 `systemd` 托管 FastAPI 进程
- 使用 SQLite 在线备份命令备份数据库
- 以项目根目录的 `.env` 作为唯一运行时配置来源

## 1. 准备服务器

安装系统依赖：

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nodejs npm nginx sqlite3
```

创建应用目录：

```bash
sudo mkdir -p /opt/ieltswords
sudo chown "$USER":"$USER" /opt/ieltswords
```

将项目复制到 `/opt/ieltswords`。

## 2. 创建统一的 `.env`

创建项目环境文件：

```bash
cd /opt/ieltswords
cp .env.example .env
```

生成高强度 `SECRET_KEY`：

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

生成高强度 `FERNET_KEY`：

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

编辑 `/opt/ieltswords/.env`，至少更新以下配置：

- `ENVIRONMENT=production`
- `SERVER_HOST=127.0.0.1`
- `SERVER_PORT=8889`
- `SERVER_RELOAD=false`
- `FRONTEND_PORT=8888`
- `SECRET_KEY=<generated-secret>`
- `FERNET_KEY=<generated-fernet-key>`
- `CORS_ORIGINS=http://<公网IP>:8888` 或 `https://<你的域名>`
- `VITE_API_BASE_URL=http://<公网IP>:8888` 或 `https://<你的域名>`

除非你明确要调整文件位置，否则以下配置应保持不变：

- `DATABASE_URL`
- `SOURCE_DATABASE_URL`

可选的 AI 默认配置：

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `OPENAI_DISPLAY_MODEL_NAME`
- `OPENAI_ENABLE_THINKING`
- `AI_REQUEST_TIMEOUT_SECONDS`

## 3. 后端环境

创建 Python 虚拟环境：

```bash
cd /opt/ieltswords
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
```

如有需要，初始化应用数据库：

```bash
cd /opt/ieltswords
.venv/bin/python backend/scripts/init_db.py
```

## 4. 构建前端

执行构建：

```bash
cd /opt/ieltswords/frontend
npm install
npm run build
```

`VITE_API_BASE_URL` 会从项目根目录的 `.env` 中读取。

## 5. 使用 systemd 托管后端服务

安装服务模板：

```bash
sudo cp /opt/ieltswords/deploy/systemd/ieltswords-backend.service.example /etc/systemd/system/ieltswords-backend.service
sudo systemctl daemon-reload
sudo systemctl enable --now ieltswords-backend
sudo systemctl status ieltswords-backend
```

查看日志：

```bash
journalctl -u ieltswords-backend -f
```

## 6. 配置 Nginx

安装 Nginx 配置模板：

```bash
sudo cp /opt/ieltswords/deploy/nginx/ieltswords.conf.example /etc/nginx/sites-available/ieltswords
sudo ln -s /etc/nginx/sites-available/ieltswords /etc/nginx/sites-enabled/ieltswords
```

编辑 `/etc/nginx/sites-available/ieltswords`，替换以下内容：

- `example.com`
- `/opt/ieltswords`

如果你准备按当前项目约定对外提供：

- 前端端口：`8888`
- 后端端口：`8889`

那么 Nginx 应监听 `8888`，并把 `/api` 反向代理到 `127.0.0.1:8889`。

然后测试并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

如果你当前先用公网 IP 访问，并且希望前端直接走 `8888` 端口，那么可以先不配 HTTPS，
直接使用 `http://<公网IP>:8888`。后续如果切域名，再补 Certbot 和 443。

## 7. 备份

手动执行一次 SQLite 备份：

```bash
cd /opt/ieltswords
bash deploy/scripts/backup_sqlite.sh
```

每日定时任务示例：

```cron
15 3 * * * cd /opt/ieltswords && bash deploy/scripts/backup_sqlite.sh >> /var/log/ieltswords-backup.log 2>&1
```

正式对外开放前，至少完整测试一次恢复流程。

## 8. 部署前检查

发布前执行：

```bash
cd /opt/ieltswords
bash deploy/scripts/predeploy_check.sh
```

该脚本会检查前端 lint / build、Python 语法、必要文件，以及一些常见部署错误。

## 9. 上线检查清单

- `/opt/ieltswords/.env` 已存在，并且应用运行用户有读取权限
- `.env` 中已设置高强度 `SECRET_KEY` 和 `FERNET_KEY`
- `.env` 中的 `SERVER_PORT` 已设置为 `8889`
- `.env` 中的 `FRONTEND_PORT` 已设置为 `8888`
- `.env` 中的 `CORS_ORIGINS` 已配置为公网访问地址
- `.env` 中的 `VITE_API_BASE_URL` 已指向公网前端地址（例如 `http://<公网IP>:8888`）
- `npm run build` 能成功通过
- `deploy/scripts/predeploy_check.sh` 能成功通过
- SQLite 备份可正常执行
- Nginx 能正常提供前端页面
- 通过公网地址访问 `/health` 能返回 healthy
- 登录、学习、看图、复习、测验、错词本、打卡等核心流程均已测试
