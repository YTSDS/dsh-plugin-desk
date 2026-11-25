# 0.2.0

- 目录改为 GitHub 全量同步：整仓 tarball 解析 `data/plugins/*.yml`，**12,928 条**（原网页索引 6,885 条）。
- 新增星标、GitHub 下载量、收录日期、仓库图标、截图预览（全屏浮层 + 缩略图）。
- 新增自动同步：每 30 分钟静默刷新，头部可关闭。
- 新增第 3 种安装链路：纯 GitHub 仓库用 HTTPS 下载 + 本地解包目录交给官方 install()，
  解决本机无 git 时 `git+https` 报 `ERR_PNPM_GIT_RESOLVE_FAILED` 的问题。
- 新增 `GET /api/plugin-desk/prepare` 与「GitHub 直装」「索引源」入口。

# 0.1.0

- 首个版本：`plugins.tab` 标签页、搜索（多词 AND）、分类 chips、收藏、周下载热度、
  一键安装（官方 `install()`）、多选批量安装（排队弹官方框）。
- 宿主四条只读路由前三条：`catalog` / `heat` / `installed`。
