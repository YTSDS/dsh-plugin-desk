// dsh-plugin-desk — 浏览器半区。
//
// 往「插件」页注册一个标签页「插件台」（plugins.tab），内容是社区目录浏览器：
// 搜索、分类、热度、收藏、单个安装（走官方 install()）、多选批量安装（排队触发官方安装）。
// 目录与热度由宿主半区的 /api/plugin-desk/* 提供，本文件不含任何写操作。
window.__ModuleLoader__.load({
  id: 'dsh-plugin-desk',
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    const react = require('react');
    const { jsx, jsxs, Fragment } = require('react/jsx-runtime');

    const NS = 'pluginDesk';
    const CAT_NAMES = {
      agi: 'AGI 架构探索', ui: 'UI 增强', browser: '浏览器与网页', dev: '开发与运行时',
      docs: '文档与渲染', fun: '娱乐', review: 'Git 与评审', identity: '身份与通信',
      market: '插件市场', memory: '记忆', model: '模型接入', notify: '通知与集成',
      remote: '远程与移动', security: '安全与权限', session: '会话与消息',
      skill: '技能包', theme: '主题外观', tools: '工具与能力', ux: '界面增强',
      usage: '用量与计费', multimodal: '多模态', voice: '语音音频', workflow: '工作流自动化',
      ws: 'WSI 互操作'
    };
    const catName = (id) => CAT_NAMES[id] || id || '未分类';

    const CSS = `
.dpd-root{display:flex;flex-direction:column;gap:12px;font-size:13px;line-height:1.5;min-height:0}
.dpd-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.dpd-input{flex:1 1 260px;min-width:180px;height:34px;padding:0 12px;border-radius:9px;border:1px solid rgba(127,127,127,.32);background:transparent;color:inherit;font:inherit;outline:none}
.dpd-input:focus{border-color:#5b8cff;box-shadow:0 0 0 3px rgba(91,140,255,.16)}
.dpd-btn{height:32px;padding:0 12px;border-radius:8px;border:1px solid rgba(127,127,127,.32);background:transparent;color:inherit;font:inherit;cursor:pointer;white-space:nowrap}
.dpd-btn:hover{background:rgba(127,127,127,.12)}
.dpd-btn[disabled]{opacity:.5;cursor:default}
.dpd-btn.primary{background:#5b8cff;border-color:#5b8cff;color:#fff}
.dpd-btn.primary:hover{background:#4b7cf0}
.dpd-btn.ghost{border-color:transparent;background:rgba(127,127,127,.12)}
.dpd-chips{display:flex;flex-wrap:wrap;gap:6px;max-height:96px;overflow:auto;padding:2px 0}
.dpd-chip{height:26px;padding:0 10px;border-radius:999px;border:1px solid rgba(127,127,127,.26);background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer}
.dpd-chip.on{background:rgba(91,140,255,.16);border-color:#5b8cff;color:#2f6be0}
.dpd-chip .n{opacity:.6;margin-left:4px}
.dpd-meta{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12px;opacity:.72}
.dpd-list{display:flex;flex-direction:column;gap:8px;min-height:0;overflow:auto;padding-right:2px}
.dpd-row{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid rgba(127,127,127,.2);border-radius:10px;background:rgba(127,127,127,.045)}
.dpd-row.sel{border-color:#5b8cff;background:rgba(91,140,255,.09)}
.dpd-row .main{flex:1;min-width:0}
.dpd-name{font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dpd-desc{font-size:12px;opacity:.72;margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.dpd-tags{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:5px;font-size:11px;opacity:.85}
.dpd-tag{padding:1px 7px;border-radius:6px;background:rgba(127,127,127,.14)}
.dpd-tag.hot{color:#e2670f;background:rgba(226,103,15,.12)}
.dpd-tag.ok{color:#1f9d55;background:rgba(31,157,85,.12)}
.dpd-tag.star{color:#d98a0b;background:rgba(240,160,32,.14)}
.dpd-tag.gh{color:#6a4bd8;background:rgba(106,75,216,.12)}
.dpd-tag.shot{color:#2f6be0;background:rgba(91,140,255,.14)}
.dpd-auto{display:flex;gap:6px;align-items:center;font-size:12px}
.dpd-auto input{accent-color:#5b8cff}
.dpd-pv{position:fixed;inset:0;z-index:9000;background:rgba(10,12,20,.78);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px}
.dpd-pv img{max-width:86vw;max-height:70vh;border-radius:12px;box-shadow:0 18px 60px rgba(0,0,0,.5);background:#111}
.dpd-pv .cap{color:#fff;font-size:13px;opacity:.85;display:flex;gap:10px;align-items:center}
.dpd-pv .thumbs{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;max-width:90vw}
.dpd-pv .thumbs img{width:76px;height:48px;object-fit:cover;cursor:pointer;opacity:.6;border-radius:6px}
.dpd-pv .thumbs img.on{opacity:1;outline:2px solid #5b8cff}
.dpd-side{display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex:0 0 auto}
.dpd-star{border:0;background:transparent;font-size:14px;cursor:pointer;opacity:.55;padding:0 2px}
.dpd-star.on{opacity:1;color:#f0a020}
.dpd-ck{width:14px;height:14px;margin-top:6px;accent-color:#5b8cff}
.dpd-ico{width:34px;height:34px;border-radius:8px;object-fit:cover;background:rgba(127,127,127,.12);flex:0 0 auto}
.dpd-empty{padding:40px 12px;text-align:center;opacity:.6;font-size:13px}
.dpd-queue{display:flex;flex-direction:column;gap:4px;font-size:12px;border:1px solid rgba(127,127,127,.2);border-radius:10px;padding:8px 10px}
.dpd-qrow{display:flex;gap:8px;align-items:center}
.dpd-qdot{width:7px;height:7px;border-radius:50%;background:#bbb}
.dpd-qdot.run{background:#5b8cff}
.dpd-qdot.ok{background:#1f9d55}
.dpd-qdot.bad{background:#e5484d}
.dpd-foot{display:flex;gap:8px;align-items:center;justify-content:space-between;font-size:12px}
`;

    function readJson(key, fallback) {
      try {
        const raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch { return fallback }
    }
    function writeJson(key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
    }

    const FAV_KEY = 'dsh-plugin-desk:favs';
    const Q_KEY = 'dsh-plugin-desk:lastq';
    const SRC_KEY = 'dsh-plugin-desk:source';

    // 把用户填的 GitHub 地址规整成官方 install() 认识的 spec：
    //   官方只认 `name@version` 或 `git+https://…`，所以一律拼成 git+https，
    //   仓库子目录用 `#path:packages/xxx` 这种 pnpm 片段。
    function toSpec(input) {
      const raw = String(input || '').trim();
      if (!raw) return '';
      if (/^https?:\/\/(?:www\.)?github\.com\//i.test(raw)) {
        const body = raw.replace(/^https?:\/\/(?:www\.)?github\.com\//i, '');
        const [pathPart, frag] = body.split('#');
        const pathPart2 = pathPart.replace(/\.git$/i, '').replace(/\/+$/, '');
        return 'git+https://github.com/' + pathPart2 + '.git' + (frag ? '#path:' + frag.replace(/^path:/, '') : '');
      }
      if (/^git\+/i.test(raw)) return raw;
      if (/^[\w.-]+\/[\w.-]+/.test(raw)) {
        const [pathPart, frag] = raw.split('#');
        const slash = pathPart.indexOf('/');
        const repoPart = pathPart.indexOf('/', slash + 1);
        const owner = pathPart.slice(0, slash);
        const repo = (repoPart < 0 ? pathPart.slice(slash + 1) : pathPart.slice(slash + 1, repoPart)).replace(/\.git$/, '');
        const sub = repoPart < 0 ? '' : pathPart.slice(repoPart + 1);
        const subPath = sub || frag || '';
        return 'git+https://github.com/' + owner + '/' + repo + '.git' + (subPath ? '#path:' + subPath.replace(/^path:/, '') : '');
      }
      return raw;
    }

    function specLabel(spec) {
      return spec.replace(/^github:/i, '').replace(/^git\+/i, '').replace(/\.git#?/, '#').replace(/#+$/, '');
    }

    function tokens(text) {
      return String(text || '').toLowerCase().split(/[\s\u3000]+/).filter(Boolean);
    }

    function matches(item, kws) {
      if (!kws.length) return true;
      const hay = [item.name, item.title, item.zh, item.en, item.repo, item.category, catName(item.category)]
        .join(' ').toLowerCase();
      return kws.every((kw) => hay.includes(kw));
    }

    function heatLabel(weekly) {
      if (weekly === undefined) return '…';
      if (weekly === -1) return '待拉取';
      if (weekly === -2) return '无下载数据';
      if (weekly >= 1000) return '周下载 ' + (weekly / 1000 >= 100 ? Math.round(weekly / 1000) : (weekly / 1000).toFixed(1)) + 'k';
      return '周下载 ' + weekly;
    }

    async function getJson(url) {
      const response = await fetch(url, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    }

    function DeskSection(props) {
      const { t, install, openPackage } = props;
      const base = () => document.baseURI || location.href;

      const [status, setStatus] = react.useState('loading');
      const [error, setError] = react.useState('');
      const [items, setItems] = react.useState([]);
      const [source, setSource] = react.useState({ url: '', count: 0, fetchedAt: 0 });
      const [ghMeta, setGhMeta] = react.useState(null);
      const [autoSync, setAutoSync] = react.useState(true);
      const [preview, setPreview] = react.useState(null);
      const [installed, setInstalled] = react.useState([]);
      const [heat, setHeat] = react.useState({});
      const [loadingHeat, setLoadingHeat] = react.useState({});
      const [q, setQ] = react.useState(() => readJson(Q_KEY, ''));
      const [cat, setCat] = react.useState('');
      const [sort, setSort] = react.useState('name');
      const [limit, setLimit] = react.useState(40);
      const [favs, setFavs] = react.useState(() => readJson(FAV_KEY, {}));
      const [selected, setSelected] = react.useState(() => new Set());
      const [queue, setQueue] = react.useState([]);
      const [busy, setBusy] = react.useState(false);
      const [ghOpen, setGhOpen] = react.useState(false);
      const [gh, setGh] = react.useState('');
      const [srcUrl, setSrcUrl] = react.useState(() => readJson(SRC_KEY, ''));
      const [srcOpen, setSrcOpen] = react.useState(false);
      const [srcDraft, setSrcDraft] = react.useState(() => readJson(SRC_KEY, ''));
      const [notice, setNotice] = react.useState('');

      // ---- 目录
      const loadCatalog = react.useCallback(async (force, silent) => {
        if (!silent) setStatus('loading');
        setError('');
        try {
          const params = [];
          if (force) params.push('refresh=1');
          if (srcUrl) params.push('source=' + encodeURIComponent(srcUrl));
          const data = await getJson(new URL('api/plugin-desk/catalog' + (params.length ? '?' + params.join('&') : ''), base()).href);
          if (!data || data.ok !== true) throw new Error((data && data.message) || '目录读取失败');
          setItems(data.items || []);
          setGhMeta(data.github || null);
          setSource({ url: data.source || '', count: data.count || (data.items || []).length, fetchedAt: data.fetchedAt || 0 });
          setStatus('ready');
        } catch (err) {
          setError(String((err && err.message) || err));
          setStatus('error');
        }
      }, [srcUrl]);

      const loadInstalled = react.useCallback(async () => {
        try {
          const data = await getJson(new URL('api/plugin-desk/installed', base()).href);
          if (data && data.ok === true) setInstalled(data.names || []);
        } catch { /* 读取失败就保持上一次结果 */ }
      }, []);

      react.useEffect(() => { loadCatalog(false); loadInstalled(); }, [loadCatalog, loadInstalled]);

      // 自动同步 GitHub：每 30 分钟静默拉一次（页面不可见时跳过），手动「同步目录」也可随时拉
      react.useEffect(() => {
        if (!autoSync) return undefined;
        const timer = setInterval(() => {
          if (!document.hidden) loadCatalog(true, true);
        }, 30 * 60 * 1000);
        return () => clearInterval(timer);
      }, [autoSync, loadCatalog]);

      react.useEffect(() => {
        const timer = setInterval(() => { if (!document.hidden) loadInstalled(); }, 4000);
        return () => clearInterval(timer);
      }, [loadInstalled]);

      react.useEffect(() => { writeJson(Q_KEY, q); }, [q]);
      react.useEffect(() => { writeJson(FAV_KEY, favs); }, [favs]);

      // ---- 过滤 + 排序
      const kw = react.useMemo(() => tokens(q), [q]);
      const cats = react.useMemo(() => {
        const map = new Map();
        for (const item of items) map.set(item.category, (map.get(item.category) || 0) + 1);
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
      }, [items]);

      const filtered = react.useMemo(() => {
        const favMode = cat === '__fav';
        const list = items.filter((item) => {
          if (favMode) { if (!favs[item.name]) return false; }
          else if (cat && item.category !== cat) return false;
          return matches(item, kw);
        });
        if (sort === 'heat') {
          list.sort((a, b) => ((heat[b.name] ?? -3) - (heat[a.name] ?? -3)) || a.name.localeCompare(b.name));
        } else if (sort === 'fav') {
          list.sort((a, b) => (favs[b.name] ? 1 : 0) - (favs[a.name] ? 1 : 0) || a.name.localeCompare(b.name));
        } else {
          list.sort((a, b) => a.name.localeCompare(b.name));
        }
        return list;
      }, [items, kw, cat, sort, heat, favs]);

      const pageItems = react.useMemo(() => filtered.slice(0, limit), [filtered, limit]);

      // ---- 热度：分批拉当前页
      react.useEffect(() => {
        const need = pageItems.filter((it) => it.npm && heat[it.npm] === undefined).map((it) => it.npm).slice(0, 40);
        if (!need.length) return;
        let cancelled = false;
        setLoadingHeat((prev) => { const next = { ...prev }; for (const n of need) next[n] = true; return next });
        const url = new URL('api/plugin-desk/heat?names=' + encodeURIComponent(need.join(',')), base()).href;
        getJson(url).then((data) => {
          if (cancelled || !data || data.ok !== true) return;
          setHeat((prev) => ({ ...prev, ...(data.heat || {}) }));
        }).catch(() => { /* 失败留待拉取 */ })
          .finally(() => {
            if (cancelled) return;
            setLoadingHeat((prev) => { const next = { ...prev }; for (const n of need) delete next[n]; return next });
          });
        return () => { cancelled = true };
      }, [pageItems, heat]);

      const installedSet = react.useMemo(() => new Set(installed), [installed]);

      // ---- 安装：不管是 npm 包还是纯 GitHub 仓库，最后都交给官方 install()
      //   有 npm 包名 → 包名@版本
      //   仓库里有 release .tgz → 直接给它 tgz 的 https 地址
      //   其余 → 宿主先用 HTTPS 把仓库 tarball 拉下来解到本地，再把目录交给官方（这台机器没装 git，git+https 装不了）
      const prepareRepoDir = react.useCallback(async (repoUrl) => {
        const data = await getJson(new URL('api/plugin-desk/prepare?repo=' + encodeURIComponent(repoUrl), base()).href);
        if (!data || data.ok !== true) throw new Error((data && data.message) || '仓库准备失败');
        return data.dir;
      }, []);

      const installOne = react.useCallback(async (item) => {
        if (!item || typeof install !== 'function') return;
        if (item.npm) {
          install({ spec: item.npm + '@' + (item.version || 'latest'), title: item.title || item.npm, version: item.version || '' });
          return;
        }
        if (item.tarball) {
          install({ spec: item.tarball, title: item.title || item.name, version: item.version || '' });
          return;
        }
        if (!item.repo) { setNotice('这条没有可安装地址'); return; }
        setNotice('正在从 GitHub 拉取 ' + item.name + ' …');
        try {
          const dir = await prepareRepoDir(item.repo);
          setNotice('已解包到本地，交给官方安装：' + item.name);
          install({ spec: dir, title: item.title || item.name, version: '' });
        } catch (err) {
          setNotice('仓库拉取失败：' + String((err && err.message) || err));
        }
      }, [install, prepareRepoDir]);

      const batchNames = react.useMemo(() => Array.from(selected), [selected]);

      // 从 GitHub 仓库装：这台机器没有 git，所以先让宿主把仓库拉成本地目录，再交给官方
      const installFromGh = react.useCallback(async (text) => {
        const raw = String(text || '').trim();
        if (!raw) { setNotice('先填 owner/repo 或者完整仓库地址'); return false; }
        if (typeof install !== 'function') return false;
        const repoUrl = /^https?:\/\//i.test(raw) ? raw : 'https://github.com/' + raw;
        setNotice('正在拉取 ' + repoUrl + ' …');
        try {
          const dir = await prepareRepoDir(repoUrl);
          install({ spec: dir, title: raw, version: '' });
          setNotice('已提交：' + raw);
          return true;
        } catch (err) {
          setNotice('拉取失败：' + String((err && err.message) || err));
          return false;
        }
      }, [install, prepareRepoDir]);

      // 目录里那一条有仓库地址时，也可以直接按仓库装（目录的 npm 版本缺了就靠这个）
      const installFromRepo = react.useCallback(async (item) => {
        if (!item || !item.repo) { setNotice('这条没有仓库地址'); return; }
        setNotice('正在从 GitHub 拉取 ' + item.name + ' …');
        try {
          const dir = await prepareRepoDir(item.repo);
          install({ spec: dir, title: item.title || item.name, version: '' });
          setNotice('已提交仓库安装：' + item.repo);
        } catch (err) {
          setNotice('拉取失败：' + String((err && err.message) || err));
        }
      }, [install, prepareRepoDir]);


      const startBatch = react.useCallback(() => {
        if (!batchNames.length) return;
        const rows = batchNames.map((name) => ({ name, state: 'wait' }));
        setQueue(rows);
        setBusy(true);
      }, [batchNames]);

      // 队列推进：当前一条提交给官方安装，等到「已安装」清单出现它再进下一条
      react.useEffect(() => {
        if (!queue.length) { setBusy(false); return; }
        const index = queue.findIndex((row) => row.state === 'run' || row.state === 'wait');
        if (index < 0) { setBusy(false); return; }
        if (queue[index].state === 'wait') {
          const item = items.find((it) => it.name === queue[index].name);
          setQueue((prev) => prev.map((row, i) => (i === index ? { ...row, state: 'run', started: Date.now() } : row)));
          if (item) installOne(item);
        }
      }, [queue, items, installOne]);

      react.useEffect(() => {
        if (!queue.length) return;
        const timer = setInterval(() => {
          setQueue((prev) => {
            let changed = false;
            const next = prev.map((row) => {
              if (row.state !== 'run') return row;
              if (installedSet.has(row.name)) { changed = true; return { ...row, state: 'ok' }; }
              if (row.started && Date.now() - row.started > 90000) { changed = true; return { ...row, state: 'bad' }; }
              return row;
            });
            return changed ? next : prev;
          });
        }, 1500);
        return () => clearInterval(timer);
      }, [queue.length, installedSet]);

      const toggleFav = (name) => setFavs((prev) => {
        const next = { ...prev };
        if (next[name]) delete next[name]; else next[name] = 1;
        return next;
      });

      const toggleSel = (name) => setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(name)) next.delete(name); else next.add(name);
        return next;
      });

      const sourceHost = react.useMemo(() => {
        if (String(source.url || '').startsWith('github:')) return String(source.url).slice(7);
        try { return new URL(source.url).host } catch { return source.url || '内置索引' }
      }, [source.url]);

      const doneCount = queue.filter((row) => row.state === 'ok').length;
      const badCount = queue.filter((row) => row.state === 'bad').length;

      const list = pageItems.map((item) => {
        const pkg = item.npm || item.name;
        const isInstalled = installedSet.has(pkg);
        const isSel = selected.has(item.name);
        const weekly = item.npm ? heat[item.npm] : undefined;
        return jsx('div', {
          className: 'dpd-row' + (isSel ? ' sel' : ''),
          children: [
            jsx('input', {
              key: 'ck', type: 'checkbox', className: 'dpd-ck', checked: isSel,
              onChange: () => toggleSel(item.name)
            }),
            item.icon
              ? jsx('img', {
                key: 'icon', src: item.icon, className: 'dpd-ico',
                onError: (e) => { e.target.style.display = 'none' }
              })
              : null,
            jsxs('div', {
              key: 'main', className: 'main', children: [
                jsx('div', { className: 'dpd-name', children: pkg }),
                jsxs('div', {
                  className: 'dpd-desc',
                  children: [item.zh || item.en || '（仓库没写描述）']
                }),
                jsxs('div', {
                  className: 'dpd-tags', children: [
                    jsx('span', { className: 'dpd-tag', children: catName(item.category) }),
                    item.version ? jsx('span', { className: 'dpd-tag', children: 'v' + item.version }) : null,
                    item.npm ? null : jsx('span', { className: 'dpd-tag gh', children: '仅 GitHub' }),
                    item.stars !== undefined ? jsx('span', { className: 'dpd-tag star', children: '★ ' + item.stars }) : null,
                    item.ghDownloads !== undefined ? jsx('span', { className: 'dpd-tag gh', children: '下载 ' + item.ghDownloads }) : null,
                    item.added ? jsx('span', { className: 'dpd-tag', children: '收录 ' + item.added }) : null,
                    item.npm ? jsx('span', {
                      className: 'dpd-tag hot',
                      children: loadingHeat[item.npm] ? '热度拉取中…' : heatLabel(weekly)
                    }) : null,
                    isInstalled ? jsx('span', { className: 'dpd-tag ok', children: '已安装' }) : null,
                    item.shots
                      ? jsx('button', {
                        className: 'dpd-tag shot', style: { cursor: 'pointer', border: 0, font: 'inherit' },
                        onClick: () => setPreview({ item, index: 0 }),
                        children: '预览 ' + item.shots.length + ' 图'
                      })
                      : null,
                    item.repo ? jsx('button', {
                      className: 'dpd-tag', style: { cursor: 'pointer', border: 0, font: 'inherit' },
                      onClick: () => { setNotice(item.repo); if (typeof navigator !== 'undefined' && navigator.clipboard) navigator.clipboard.writeText(item.repo).catch(() => {}) },
                      children: '仓库 ↗'
                    }) : null
                  ].filter(Boolean)
                })
              ]
            }),
            jsxs('div', {
              key: 'side', className: 'dpd-side', children: [
                jsx('button', {
                  className: 'dpd-star' + (favs[item.name] ? ' on' : ''),
                  title: favs[item.name] ? '取消收藏' : '收藏',
                  onClick: () => toggleFav(item.name),
                  children: favs[item.name] ? '★' : '☆'
                }),
                isInstalled
                  ? jsx('button', { className: 'dpd-btn ghost', children: '已安装' })
                  : jsx('button', { className: 'dpd-btn primary', onClick: () => installOne(item), children: '安装' }),
                item.repo
                  ? jsx('button', {
                    className: 'dpd-btn ghost',
                    style: { fontSize: 11, height: 24, padding: '0 8px', opacity: .78 },
                    title: '直接从这个 GitHub 仓库装（' + item.repo + '）',
                    onClick: () => installFromRepo(item),
                    children: '仓库装'
                  })
                  : null
              ].filter(Boolean)
            })
          ]
        });
      });

      const body = status === 'loading'
        ? jsx('div', { className: 'dpd-empty', children: '正在读取插件目录…' })
        : status === 'error'
          ? jsxs('div', { className: 'dpd-empty', children: [
            jsx('div', { children: '目录读取失败：' + (error || '未知原因') }),
            jsx('button', { className: 'dpd-btn', style: { marginTop: 10 }, onClick: () => loadCatalog(true), children: '重试' })
          ] })
          : filtered.length === 0
            ? jsxs('div', { className: 'dpd-empty', children: [
              jsx('div', { children: q ? '没有匹配「' + q + '」的插件' + (cat ? '（已限定分类：' + (cat === '__fav' ? '收藏' : catName(cat)) + '）' : '') : '这个分类下没有条目' }),
              jsxs('div', {
                style: { marginTop: 10, display: 'flex', gap: 8, justifyContent: 'center' }, children: [
                  q ? jsx('button', { className: 'dpd-btn', onClick: () => setQ(''), children: '清除关键词' }) : null,
                  cat ? jsx('button', { className: 'dpd-btn', onClick: () => setCat(''), children: '清除分类筛选' }) : null
                ].filter(Boolean)
              })
            ] })
            : jsx('div', { className: 'dpd-list', children: list });

      return jsxs('div', { className: 'dpd-root', children: [
        jsx('style', { children: CSS }),
        jsxs('div', { className: 'dpd-bar', children: [
          jsx('input', {
            className: 'dpd-input', value: q, placeholder: t('search'),
            onChange: (e) => { setQ(e.target.value); setLimit(40) }
          }),
          jsx('button', {
            className: 'dpd-btn', onClick: () => setSort(sort === 'name' ? 'heat' : 'name'),
            children: '排序：' + (sort === 'name' ? '名称' : '热度')
          }),
          jsx('button', {
            className: 'dpd-btn', onClick: () => loadCatalog(true), disabled: status === 'loading',
            children: '同步目录'
          }),
          jsx('button', {
            className: 'dpd-btn primary', disabled: !selected.size || busy, onClick: startBatch,
            children: busy ? '安装中 ' + doneCount + '/' + queue.length : '批量安装（' + selected.size + '）'
          }),
          selected.size ? jsx('button', {
            className: 'dpd-btn ghost', onClick: () => setSelected(new Set()), children: '清空选择'
          }) : null,
          jsx('button', {
            className: 'dpd-btn' + (ghOpen ? ' primary' : ''), onClick: () => { setGhOpen(!ghOpen); setSrcOpen(false) },
            children: 'GitHub 直装'
          }),
          jsx('button', {
            className: 'dpd-btn' + (srcOpen ? ' primary' : ''), onClick: () => { setSrcOpen(!srcOpen); setGhOpen(false); setSrcDraft(srcUrl) },
            children: '索引源'
          })
        ].filter(Boolean) }),
        ghOpen ? jsxs('div', {
          className: 'dpd-queue', style: { background: 'rgba(91,140,255,.07)' }, children: [
            jsx('div', { className: 'dpd-qrow', children: [
              jsx('b', { children: '从 GitHub 仓库直接装' }),
              jsx('span', { style: { opacity: .65 }, children: 'owner/repo 或完整地址，可带 #子目录' })
            ] }),
            jsxs('div', { className: 'dpd-qrow', children: [
              jsx('input', {
                className: 'dpd-input', value: gh, placeholder: 'wxing2008666/dsh-leetcode-notebook',
                onChange: (e) => setGh(e.target.value),
                onKeyDown: (e) => { if (e.key === 'Enter') installFromGh(gh) }
              }),
              jsx('button', {
                className: 'dpd-btn primary', onClick: () => installFromGh(gh), children: '安装'
              })
            ] })
          ] })
        : null,
        srcOpen ? jsxs('div', {
          className: 'dpd-queue', style: { background: 'rgba(91,140,255,.07)' }, children: [
            jsx('div', { className: 'dpd-qrow', children: [
              jsx('b', { children: '插件索引源' }),
              jsx('span', { style: { opacity: .65 }, children: '留空恢复默认（jsDelivr dsh-plugin-catalog）' })
            ] }),
            jsxs('div', { className: 'dpd-qrow', children: [
              jsx('input', {
                className: 'dpd-input', value: srcDraft,
                placeholder: 'https://raw.githubusercontent.com/<owner>/<repo>/<branch>/index.json',
                onChange: (e) => setSrcDraft(e.target.value)
              }),
              jsx('button', {
                className: 'dpd-btn primary',
                onClick: () => {
                  const next = srcDraft.trim();
                  if (next && !/^https:\/\//i.test(next)) { setNotice('索引源要是 https 地址'); return }
                  setSrcUrl(next); writeJson(SRC_KEY, next); setSrcOpen(false);
                  setNotice(next ? '索引源已切换，正在重读' : '已恢复默认索引源');
                },
                children: '应用'
              }),
              jsx('button', {
                className: 'dpd-btn ghost',
                onClick: () => { setSrcUrl(''); writeJson(SRC_KEY, ''); setSrcOpen(false); setNotice('已恢复默认索引源') },
                children: '恢复默认'
              })
            ] })
          ] })
        : null,
        notice ? jsx('div', { className: 'dpd-meta', style: { color: '#4b7cf0' }, children: notice }) : null,
        jsxs('div', { className: 'dpd-meta', children: [
          jsx('span', { children: '共 ' + filtered.length.toLocaleString() + ' 条 / 目录 ' + (source.count || items.length).toLocaleString() }),
          jsx('span', { children: '索引：' + sourceHost }),
          ghMeta
            ? jsx('span', {
              children: 'GitHub 同步：' + new Date(ghMeta.syncedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
                + (ghMeta.error ? '（部分失败）' : '')
            })
            : null,
          jsxs('label', {
            className: 'dpd-auto', children: [
              jsx('input', { type: 'checkbox', checked: autoSync, onChange: (e) => setAutoSync(e.target.checked) }),
              jsx('span', { children: '自动同步（30 分钟）' })
            ]
          }),
          jsx('span', { children: '收藏 ' + Object.keys(favs).length })
        ].filter(Boolean) }),
        jsxs('div', { className: 'dpd-chips', children: [
          jsxs('button', {
            className: 'dpd-chip' + (cat === '' ? ' on' : ''), onClick: () => setCat(''),
            children: ['全部', jsx('span', { className: 'n', children: items.length })]
          }),
          jsxs('button', {
            className: 'dpd-chip' + (cat === '__fav' ? ' on' : ''), onClick: () => setCat('__fav'),
            children: ['★ 收藏', jsx('span', { className: 'n', children: Object.keys(favs).length })]
          }),
          ...cats.map(([id, n]) => jsxs('button', {
            key: id, className: 'dpd-chip' + (cat === id ? ' on' : ''),
            onClick: () => setCat(id),
            children: [catName(id), jsx('span', { className: 'n', children: n })]
          }))
        ] }),
        queue.length ? jsxs('div', { className: 'dpd-queue', children: [
          jsxs('div', { className: 'dpd-qrow', children: [
            jsx('b', { children: '安装队列' }),
            jsx('span', { style: { opacity: .7 }, children: '成功 ' + doneCount + (badCount ? ' · 未确认 ' + badCount : '') }),
            jsx('span', {
              style: { marginLeft: 'auto', cursor: 'pointer', opacity: .7 },
              onClick: () => { setQueue([]); setBusy(false) },
              children: '收起'
            })
          ] }),
          ...queue.slice(0, 8).map((row, i) => jsxs('div', {
            key: row.name + i, className: 'dpd-qrow', children: [
              jsx('span', { className: 'dpd-qdot ' + (row.state === 'ok' ? 'ok' : row.state === 'bad' ? 'bad' : row.state === 'run' ? 'run' : '') }),
              jsx('span', {
                style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                children: row.name + (row.state === 'wait' ? '（排队中）' : row.state === 'run' ? '（等你在安装框确认）' : row.state === 'ok' ? ' 已完成' : ' 未确认')
              })
            ]
          }))
        ] }) : null,
        body,
        jsxs('div', { className: 'dpd-foot', children: [
          jsx('span', { children: '点「安装」会打开 DSH 官方安装框；批量安装会排队依次弹出，装完一个自动进下一个。' }),
          jsx('button', {
            className: 'dpd-btn ghost', onClick: () => typeof openPackage === 'function' && openPackage('dsh-plugin-desk'),
            children: '看本插件'
          })
        ] }),
        preview ? jsxs('div', {
          className: 'dpd-pv',
          onClick: () => setPreview(null),
          children: [
            jsxs('div', { className: 'cap', children: [
              jsx('b', { children: preview.item.title || preview.item.name }),
              jsx('span', { children: '截图 ' + (preview.index + 1) + ' / ' + preview.item.shots.length }),
              jsx('span', { children: '点空白处关闭' })
            ] }),
            jsx('img', { src: preview.item.shots[preview.index] }),
            jsx('div', {
              className: 'thumbs',
              children: preview.item.shots.map((u, i) => jsx('img', {
                key: u, src: u, className: i === preview.index ? 'on' : '',
                onClick: (e) => { e.stopPropagation(); setPreview({ item: preview.item, index: i }) }
              }))
            })
          ]
        }) : null
      ] });
    }

    const zh = {
      tabTitle: '插件台',
      search: '搜插件名 / 描述 / 仓库（空格可多词）',
      install: '安装',
      installed: '已安装'
    };
    const en = {
      tabTitle: 'Plugin Desk',
      search: 'Search name / description / repo (space separates words)',
      install: 'Install',
      installed: 'Installed'
    };

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'plugin-desk: dictionaries');
      const t = ctx.locale.bind(NS);
      ctx.slots.inject('plugins.tab', () => ctx.slots.register({
        name: 'plugins.tab',
        id: 'desk',
        label: () => t('tabTitle'),
        locale: NS,
        order: 30
      }, DeskSection));
    }

    exports.apply = apply;
    exports.inject = ['slots', 'locale'];
    return module.exports;
  }
});
