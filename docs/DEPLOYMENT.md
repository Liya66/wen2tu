# Deploying to Cloudflare Pages · 部署到 Cloudflare Pages

wen2tu is a static site: no server, database or environment variables are needed. 文兔兔是纯静态站点，不需要服务器、数据库或环境变量。

## 1. Push the repository to GitHub · 推送到 GitHub

```bash
git remote add origin https://github.com/<your-user>/wen2tu.git
git push -u origin main
```

CI (`.github/workflows/ci.yml`) runs lint, unit tests, type-check, build and end-to-end tests on every push and pull request.

## 2. Create the Pages project · 创建 Pages 项目

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Authorize GitHub and pick the `wen2tu` repository.
3. Build settings · 构建设置:

| Setting | Value |
| --- | --- |
| Framework preset | `Vite` (or `None`) |
| Production branch | `main` |
| Build command | `npm run build` |
| Build output directory | `dist` |

The Node.js version comes from `.node-version` (22) in the repository. Node 版本由仓库中的 `.node-version` 指定（22）。

4. **Save and Deploy**. The site is published at `https://<project>.pages.dev`; every push to `main` deploys again, and pull requests get preview URLs.

### Or as a Worker · 或者部署为 Worker

If the project was created under **Workers** (build command `npm run build`, deploy command `npx wrangler deploy`), the repository's `wrangler.jsonc` tells Wrangler to upload `dist/` as static assets. Without it, Wrangler tries to set the project up by installing extra packages, which can fail with `npm error Cannot read properties of null (reading 'edgesOut')`.

如果在 **Workers** 下创建了项目（构建命令 `npm run build`，部署命令 `npx wrangler deploy`），仓库里的 `wrangler.jsonc` 会让 Wrangler 直接上传 `dist/` 静态文件。没有这个文件时，Wrangler 会尝试自动配置并安装额外的包，可能报 `npm error Cannot read properties of null (reading 'edgesOut')`。

## 3. Enable Web Analytics (optional) · 开启访问统计（可选）

Pages project → **Metrics** → **Web Analytics** → **Enable**. Cloudflare injects its cookieless beacon automatically; no code change is needed. `public/_headers` already allows the beacon in the Content-Security-Policy (`static.cloudflareinsights.com` and `cloudflareinsights.com`), and nothing else from third parties.

在 Pages 项目的 **Metrics → Web Analytics** 中点击启用即可，Cloudflare 会自动注入不使用 Cookie 的统计脚本。`public/_headers` 中的 CSP 已经放行了这个脚本，除此之外不允许任何第三方资源。

If you do not want analytics, leave it disabled. 如果不需要统计，保持关闭即可。

## 4. Check the deployment · 部署后检查

- The page loads over HTTPS and the browser console shows no errors (including CSP violations).
- `/en/` opens in English and `/` in Chinese; switching the language changes the address.
- Create a map, reload: the content is restored.
- In Chrome/Edge: Save writes a `.mind.json` file; Open reads it back.
- In Firefox/Safari: Save downloads a copy and the notice explains it.
- Response headers include `Content-Security-Policy` (check in DevTools → Network).

## Custom domain · 自定义域名

Pages project → **Custom domains** → **Set up a domain**. No app changes are needed.

## Routing

The app has two static pages and no client-side routes: `/` (Chinese) and `/en/` (English), built from `index.html` and `en/index.html`. Both share the same browser storage, so maps are the same in either language. No SPA fallback configuration is needed. Do not add a top-level `404.html` to `public/`; it would change Cloudflare Pages' default handling.
