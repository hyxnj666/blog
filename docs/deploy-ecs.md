# 阿里云 ECS 部署：Astro 博客静态站

适用：Ubuntu 24.04、2C2G，和 resume 同一台 ECS，域名 `blog.conorliu.com`。

> 博客是 Astro 纯静态输出（`dist/` 全是 HTML/CSS/JS），不需要 PM2，Nginx 直接托管。

## 一、服务器拉取代码

服务器上 Node.js / pnpm 已经装好（resume 部署时装过）。

```bash
cd /var/www
git clone https://github.com/hyxnj666/blog.git
cd blog
pnpm install
pnpm build
```

构建产物在 `dist/` 目录，约 3 秒完成。

## 二、Nginx 配置

新建站点配置：

```bash
nano /etc/nginx/sites-available/blog.conorliu.com
```

写入：

```nginx
server {
    listen 80;
    server_name blog.conorliu.com;

    root /var/www/blog/dist;
    index index.html;

    # 静态资源长缓存（Astro 带 hash 文件名，可安全缓存）
    location /_astro/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # SPA 风格路由回退
    location / {
        try_files $uri $uri/ $uri/index.html =404;
    }

    # 自定义 404 页面（可选，后续可加）
    error_page 404 /404.html;

    # gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
    gzip_min_length 1024;
    gzip_vary on;
}
```

启用站点并重载：

```bash
ln -sf /etc/nginx/sites-available/blog.conorliu.com /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

## 三、DNS 解析

在你的域名服务商添加记录：

| 类型 | 主机记录 | 记录值 |
|------|---------|--------|
| A | blog | ECS 公网 IP（如 8.135.49.32） |

## 四、HTTPS

DNS 生效后：

```bash
certbot --nginx -d blog.conorliu.com
```

certbot 会自动修改 Nginx 配置，加上 443 监听和证书路径。

## 五、更新发布

每次写了新文章或改了代码，在服务器执行：

```bash
cd /var/www/blog
git pull
pnpm install
pnpm build
# 不需要重启任何服务，Nginx 直接读 dist/ 新文件
```

或者用下面的一键脚本：

```bash
bash deploy.sh
```

## 六、和 resume 的关系

同一台 ECS 上两个站点并存：

| 站点 | 域名 | 运行方式 | 端口/目录 |
|------|------|---------|-----------|
| resume | conorliu.com | PM2 + Next.js | 127.0.0.1:3000 (Nginx 反代) |
| blog | blog.conorliu.com | Nginx 静态托管 | /var/www/blog/dist/ |

两个 Nginx server 块各管各的，互不影响。
