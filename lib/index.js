// dsh-plugin-desk — 宿主半区。
//
// 只做三件事，全部是只读/代理，不写 profile、不碰 pnpm：
//   1. GET /api/plugin-desk/catalog    把社区索引（jsDelivr 的 dsh-plugin-catalog）
//      拉下来缓存 6 小时，压成前端能直接用的扁平结构；
//   2. GET /api/plugin-desk/heat       代理 npm 周下载量（批量逗号接口不支持 scoped 包，
//      所以逐条请求，6 小时内存缓存）；
//   3. GET /api/plugin-desk/installed  扫 ~/.dsh/profiles/*/package.json，
//      找出这个 profile 里已经装了的包名，前端据此显示「已安装」。
//
// 真正的安装/卸载交给 DSH 自己的插件页（install() 走官方安装流程），
// 所以这里没有任何写操作。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

export const name = 'dsh-plugin-desk'
export const inject = ['webServer']

// 索引优先走 GitHub 仓库生成的那份（awesome-dsh-plugin.com 是仓库的 Pages），
// 拿不到再退 jsDelivr 的 npm 镜像。
const SOURCES = [
  'https://awesome-dsh-plugin.com/index.json',
  'https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json'
]
const CACHE_TTL = 6 * 60 * 60 * 1000
const HEAT_TTL = 6 * 60 * 60 * 1000

let catalog = null          // { source, fetchedAt, items: [...] }
let catalogLoadedAt = 0
let catalogError = null
const heatCache = new Map() // name -> { weekly, at }
const customCache = new Map() // 自定义索引源 url -> { at, items }

function dshHome() {
  const env = process.env.DSH_HOME && String(process.env.DSH_HOME).trim()
  return env || path.join(os.homedir(), '.dsh')
}

function cacheDir() {
  const dir = path.join(dshHome(), 'storages', 'plugin-desk')
  try { fs.mkdirSync(dir, { recursive: true }) } catch { /* ignore */ }
  return dir
}

function sendJson(res, status, body) {
  const data = Buffer.from(JSON.stringify(body), 'utf8')
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': String(data.length)
  })
  res.end(data)
}

function isLoopback(req) {
  const ra = (req.socket && req.socket.remoteAddress) || ''
  return ra === '127.0.0.1' || ra === '::1' || ra === '::ffff:127.0.0.1'
}

function textOf(value) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') return String(value.zh || value.en || '')
  return ''
}

function textEn(value) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') return String(value.en || value.zh || '')
  return ''
}

function clip(text, max) {
  const s = String(text || '').replace(/\s+/g, ' ').trim()
  return s.length > max ? s.slice(0, max) + '…' : s
}

function compact(index) {
  const plugins = (index && index.plugins) || (Array.isArray(index) ? index : [])
  const items = []
  for (const entry of plugins) {
    if (!entry || typeof entry.name !== 'string') continue
    const versions = Array.isArray(entry.versions) ? entry.versions : []
    const version = versions.length ? String(versions[0].version || '') : ''
    const repo = entry.repository && typeof entry.repository.url === 'string' ? entry.repository.url : ''
    const category = entry.metadata && typeof entry.metadata.category === 'string' ? entry.metadata.category : ''
    items.push({
      name: entry.name,
      title: typeof entry.title === 'string' ? entry.title : entry.name,
      zh: clip(textOf(entry.description), 220),
      en: clip(textEn(entry.description), 220),
      repo: clip(repo, 160),
      home: typeof entry.homepage === 'string' ? entry.homepage : '',
      category,
      version
    })
  }
  return items
}

// 真正的「全量」：GitHub 仓库 awesome-dsh-plugin/awesome-dsh-plugin 里
// data/plugins/*.yml 一个文件一个插件（约 1.3 万条），data/*.json 是星标/下载/截图。
// 一条条拉 raw 会撞 GitHub 限流（实测单文件 20s+），所以整仓 tarball 一次下载（约 9MB），
// 在内存里解 tar.gz 自己抽——一次同步 3 秒左右，落盘缓存 12h。
const GH_REPO = 'awesome-dsh-plugin/awesome-dsh-plugin'
const GH_TARBALL = 'https://codeload.github.com/' + GH_REPO + '/tar.gz/HEAD'
const REPO_TTL = 12 * 60 * 60 * 1000

let repoIndex = null       // { builtAt, items: [...] }
let repoError = ''

function repoKey(url) {
  return String(url || '').trim().toLowerCase()
    .replace(/^git\+/i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')
}

function unquoteYaml(value) {
  let s = String(value || '').trim()
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) s = s.slice(1, -1)
  return s.replace(/''/g, "'").replace(/\\"/g, '"').trim()
}

// 这些 yml 结构很简单（url / name / category / description{en,zh} / icon / tarball），
// 不为了它们引入 yaml 依赖，按上面的形状自己扫。
function parsePluginYml(text) {
  const out = { url: '', name: '', category: '', icon: '', tarball: '', zh: '', en: '' }
  let section = ''
  let buf = ''
  const flush = () => {
    if (section && buf) {
      const value = unquoteYaml(buf)
      if (value && !out[section]) out[section] = value
    }
    section = ''
    buf = ''
  }
  for (const line of text.split('\n')) {
    const simple = /^(url|name|category|icon|tarball):\s*(.*)$/.exec(line)
    if (simple) { flush(); out[simple[1]] = unquoteYaml(simple[2]); continue }
    if (/^description:/.test(line)) { flush(); continue }
    const sub = /^\s{1,4}(en|zh):\s*(.*)$/.exec(line)
    if (sub) { flush(); section = sub[1]; buf = sub[2]; continue }
    if (section && line.trim() && /^\s{5,}/.test(line)) { buf += ' ' + line.trim(); continue }
    if (section && line.trim()) flush()
  }
  flush()
  return out
}

function gunzipTarEntries(buffer, visit) {
  const raw = zlib.gunzipSync(buffer)
  const readStr = (start, len) => {
    const slice = raw.subarray(start, start + len)
    const end = slice.indexOf(0)
    return slice.subarray(0, end < 0 ? slice.length : end).toString('utf8')
  }
  let offset = 0
  while (offset + 512 <= raw.length) {
    const name = readStr(offset, 100)
    if (!name) { offset += 512; continue }
    const size = parseInt(readStr(offset + 124, 12).trim(), 8) || 0
    const type = readStr(offset + 156, 1)
    const dataStart = offset + 512
    const clean = name.replace(/^[^/]+\//, '')
    if (!type || type === '0') visit(clean, raw.subarray(dataStart, dataStart + size))
    offset = dataStart + Math.ceil(size / 512) * 512
  }
}

function buildRepoIndex(buffer) {
  const ymls = []
  const data = {}
  gunzipTarEntries(buffer, (name, bytes) => {
    if (/^data\/plugins\/.*\.yml$/.test(name)) ymls.push(bytes.toString('utf8'))
    else if (/^data\/(stars|downloads|screenshots|added-dates)\.json$/.test(name)) {
      try { data[name.split('/')[1].replace('.json', '')] = JSON.parse(bytes.toString('utf8')) } catch { /* 单个文件坏了忽略 */ }
    }
  })

  const items = []
  for (const text of ymls) {
    const y = parsePluginYml(text)
    if (!y.url) continue
    const keyed = repoKey(y.url)
    const item = {
      name: y.name || keyed.replace(/^https?:\/\/(www\.)?github\.com\//, ''),
      repo: y.url,
      zh: (y.zh || y.en || '').slice(0, 260),
      en: (y.en || '').slice(0, 260),
      category: y.category || '',
      icon: y.icon || '',
      tarball: y.tarball || ''
    }
    const stars = data.stars && data.stars[keyed]
    if (stars && typeof stars.stars === 'number') item.stars = stars.stars
    const dl = data.downloads && data.downloads[keyed]
    if (dl && typeof dl.downloads === 'number') item.ghDownloads = dl.downloads
    const added = data['added-dates'] && data['added-dates'][keyed]
    if (added) item.added = String(added).slice(0, 10)
    const shots = data.screenshots && data.screenshots[keyed]
    if (Array.isArray(shots) && shots.length) item.shots = shots.slice(0, 6)
    items.push(item)
  }
  return { builtAt: Date.now(), items }
}

async function loadRepoIndex(force) {
  const file = path.join(cacheDir(), 'repo-index.json')
  if (!force && repoIndex && Date.now() - (repoIndex.builtAt || 0) < REPO_TTL) return repoIndex
  if (!force && !repoIndex) {
    try {
      const stat = fs.statSync(file)
      if (Date.now() - stat.mtimeMs < REPO_TTL) {
        repoIndex = JSON.parse(fs.readFileSync(file, 'utf8'))
        return repoIndex
      }
    } catch { /* 没缓存，走网络 */ }
  }
  const response = await fetch(GH_TARBALL, { headers: { accept: 'application/octet-stream' } })
  if (!response.ok) throw new Error('仓库下载失败 HTTP ' + response.status)
  const buffer = Buffer.from(await response.arrayBuffer())
  const built = buildRepoIndex(buffer)
  if (!built.items.length) throw new Error('仓库里没解析出插件')
  repoIndex = built
  repoError = ''
  try { fs.writeFileSync(file, JSON.stringify(built)) } catch { /* 缓存写失败不影响本次结果 */ }
  return repoIndex
}

// npm 目录（6885 条）只用来补「npm 包名 + 版本」，仓库里那 1.3 万条才是全量。
function mergeNpm(repoItems, npmItems) {
  if (!npmItems || !npmItems.length) return repoItems
  const byRepo = new Map()
  for (const item of npmItems) {
    const key = repoKey(item.repo)
    if (key) byRepo.set(key, item)
  }
  for (const item of repoItems) {
    const hit = byRepo.get(repoKey(item.repo))
    if (!hit) continue
    item.npm = hit.name
    if (hit.version) item.version = hit.version
  }
  return repoItems
}


// ---- GitHub 仓库直装：这台机器不一定装了 git（pnpm 的 git+https 会直接 ERR_PNPM_GIT_RESOLVE_FAILED），
// 所以改成自己用 HTTPS 把仓库 tarball 拉下来、解开到本地目录，再把目录路径交给官方 install()（它支持本地目录）。
const PREPARE_LIMIT = 40 * 1024 * 1024

function parseRepoUrl(raw) {
  const text = String(raw || '').trim()
  const m = /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.*))?)?$/i.exec(text)
  if (!m) throw new Error('只认 GitHub 仓库地址：https://github.com/<owner>/<repo>')
  return { owner: m[1], repo: m[2], branch: m[3] || '', sub: m[4] || '' }
}

function safeName(text) {
  return String(text || '').replace(/[^\w.-]+/g, '_').slice(0, 80)
}

function extractTarballTo(buffer, destDir, subPath) {
  const raw = zlib.gunzipSync(buffer)
  const readStr = (start, len) => {
    const slice = raw.subarray(start, start + len)
    const end = slice.indexOf(0)
    return slice.subarray(0, end < 0 ? slice.length : end).toString('utf8')
  }
  fs.mkdirSync(destDir, { recursive: true })
  let wrote = 0
  let total = 0
  let offset = 0
  while (offset + 512 <= raw.length) {
    const name = readStr(offset, 100)
    if (!name) { offset += 512; continue }
    const size = parseInt(readStr(offset + 124, 12).trim(), 8) || 0
    const type = readStr(offset + 156, 1)
    const dataStart = offset + 512
    let clean = name.replace(/^[^/]+\//, '')
    if (subPath) {
      const prefix = subPath.replace(/\/+$/, '') + '/'
      if (!clean.startsWith(prefix)) { offset = dataStart + Math.ceil(size / 512) * 512; continue }
      clean = clean.slice(prefix.length)
    }
    if (clean && (!type || type === '0') && size) {
      const target = path.join(destDir, clean)
      if (target.startsWith(destDir) && size <= 8 * 1024 * 1024) {
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, raw.subarray(dataStart, dataStart + size))
        wrote++
        total += size
        if (total > PREPARE_LIMIT) throw new Error('仓库太大（超过 40MB），不自动解包')
      }
    }
    offset = dataStart + Math.ceil(size / 512) * 512
  }
  return { wrote, total }
}

async function prepareRepo(repoUrl, refresh) {
  const info = parseRepoUrl(repoUrl)
  const slug = safeName(info.owner + '__' + info.repo + (info.sub ? '__' + info.sub.replace(/\//g, '-') : ''))
  const destDir = path.join(cacheDir(), 'repos', slug)
  const manifest = path.join(destDir, 'package.json')
  if (!refresh && fs.existsSync(manifest)) {
    return { dir: destDir, cached: true }
  }
  const tarball = 'https://codeload.github.com/' + info.owner + '/' + info.repo + '/tar.gz/' + (info.branch || 'HEAD')
  const response = await fetch(tarball, { headers: { accept: 'application/octet-stream' } })
  if (!response.ok) throw new Error('仓库下载失败 HTTP ' + response.status)
  const buffer = Buffer.from(await response.arrayBuffer())
  try { fs.rmSync(destDir, { recursive: true, force: true }) } catch { /* 旧目录删不掉也没关系 */ }
  extractTarballTo(buffer, destDir, info.sub)
  if (!fs.existsSync(manifest)) {
    throw new Error('这个仓库目录里没有 package.json（' + (info.sub || '根目录') + '），不是标准的 DSH 插件仓库')
  }
  return { dir: destDir, cached: false }
}


const ALLOWED_HOSTS = new Set([
  'raw.githubusercontent.com',
  'gist.githubusercontent.com',
  'cdn.jsdelivr.net',
  'awesome-dsh-plugin.com',
  'github.com'
])

function sanitizeSource(raw) {
  const text = String(raw || '').trim()
  if (!text) return null
  let url
  try { url = new URL(text) } catch { throw new Error('索引源不是合法 URL') }
  if (url.protocol !== 'https:') throw new Error('索引源必须是 https 地址')
  if (url.username || url.password) throw new Error('索引源不能带账号信息')
  if (url.search || url.hash) throw new Error('索引源不能带查询串或片段')
  if (!ALLOWED_HOSTS.has(url.hostname)) throw new Error('不支持的索引源主机：' + url.hostname)
  if (!/\.json$/i.test(url.pathname)) throw new Error('索引源要指向一个 .json 文件')
  return url.href
}

async function fetchIndex(source) {
  const response = await fetch(source, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error('HTTP ' + response.status)
  const index = await response.json()
  const items = compact(index)
  if (!items.length) throw new Error('索引里没有插件条目')
  return items
}

async function loadCatalog(force, customSource) {
  if (customSource) {
    const url = sanitizeSource(customSource)
    const hit = customCache.get(url)
    if (!force && hit && Date.now() - hit.at < CACHE_TTL) {
      catalog = { source: url, fetchedAt: hit.at, items: hit.items }
      return catalog
    }
    const items = await fetchIndex(url)
    customCache.set(url, { at: Date.now(), items })
    catalog = { source: url, fetchedAt: Date.now(), items }
    return catalog
  }
  if (!force && catalog && Date.now() - catalogLoadedAt < CACHE_TTL) return catalog
  const file = path.join(cacheDir(), 'catalog.json')
  if (!force) {
    try {
      const stat = fs.statSync(file)
      if (Date.now() - stat.mtimeMs < CACHE_TTL) {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
        catalog = { source: raw.source || SOURCES[0], fetchedAt: raw.fetchedAt || stat.mtimeMs, items: raw.items || [] }
        if (catalog.items.length) { catalogLoadedAt = Date.now() - 1; return catalog }
      }
    } catch { /* 没有缓存或坏了，往下走网络 */ }
  }

  let lastError = null
  for (const source of SOURCES) {
    try {
      const response = await fetch(source, { headers: { 'accept': 'application/json' } })
      if (!response.ok) throw new Error('HTTP ' + response.status)
      const index = await response.json()
      const items = compact(index)
      if (!items.length) throw new Error('索引里没有插件条目')
      catalog = { source, fetchedAt: Date.now(), items }
      catalogLoadedAt = Date.now()
      catalogError = null
      try {
        fs.writeFileSync(file, JSON.stringify({ source, fetchedAt: catalog.fetchedAt, items }))
      } catch { /* 缓存写失败不影响这次请求 */ }
      return catalog
    } catch (error) {
      lastError = error
    }
  }
  catalogError = String((lastError && lastError.message) || lastError || '索引拉取失败')
  throw new Error(catalogError)
}

function npmName(name) {
  // npm 下载量接口要原样的 @ 与 /，只编码其余字符
  return name.split('/').map(part => encodeURIComponent(part)).join('/')
}

// 下载量接口：国外 api.npmjs.org 在国内经常被 Cloudflare 限流（429 / error 1015），
// 所以先问 npmmirror（同一份 npm 数据，国内直连快），失败再回落到官方。
const HEAT_SOURCES = [
  'https://registry.npmmirror.com/downloads/point/last-week/',
  'https://api.npmjs.org/downloads/point/last-week/'
]

async function weeklyDownloads(name) {
  const hit = heatCache.get(name)
  if (hit && Date.now() - hit.at < (hit.weekly >= 0 ? HEAT_TTL : 10 * 60 * 1000)) return hit.weekly
  let weekly = -1
  let missing = false
  for (const base of HEAT_SOURCES) {
    try {
      const response = await fetch(base + npmName(name), {
        headers: { accept: 'application/json', 'user-agent': 'dsh-plugin-desk' }
      })
      if (response.status === 404) { missing = true; continue }
      if (!response.ok) continue
      const body = await response.json()
      if (typeof body.downloads === 'number') { weekly = body.downloads; missing = false; break }
    } catch { /* 换下一个源 */ }
  }
  if (weekly < 0 && missing) weekly = -2 // 所有源都说查不到：这个包没有发布到 npm
  heatCache.set(name, { weekly, at: Date.now() })
  return weekly
}

function findProfileWith(pkgName) {
  const profilesRoot = path.join(dshHome(), 'profiles')
  let names = []
  try {
    names = fs.readdirSync(profilesRoot, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
  } catch { return null }
  for (const dir of names) {
    const manifest = path.join(profilesRoot, dir, 'package.json')
    try {
      const json = JSON.parse(fs.readFileSync(manifest, 'utf8'))
      const deps = json.dependencies || {}
      if (Object.hasOwn(deps, pkgName)) return { profile: dir, deps }
    } catch { /* 跳过坏 profile */ }
  }
  return null
}

function installedList() {
  const found = findProfileWith('dsh-plugin-desk')
  if (!found) return { profile: null, names: [] }
  return { profile: found.profile, names: Object.keys(found.deps) }
}

export function apply(ctx) {
  ctx.inject(['webServer'], (webCtx) => {
    const routes = [
      ['/api/plugin-desk/catalog', async (req, res, url) => {
        try {
          const force = url && url.searchParams.get('refresh') === '1'
          const source = (url && url.searchParams.get('source')) || ''
          if (source) {
            // 自定义索引源：就当普通索引读，不再叠 GitHub 全量
            const loaded = await loadCatalog(force, source)
            sendJson(res, 200, {
              ok: true,
              source: loaded.source,
              fetchedAt: loaded.fetchedAt,
              count: loaded.items.length,
              github: null,
              items: loaded.items
            })
            return
          }
          let repo
          try {
            repo = await loadRepoIndex(force)
          } catch (error) {
            repoError = String((error && error.message) || error)
            repo = repoIndex
            if (!repo) throw error
          }
          const npm = await loadCatalog(force).catch(() => null)
          const items = mergeNpm(repo.items, npm && npm.items)
          sendJson(res, 200, {
            ok: true,
            source: 'github:' + GH_REPO,
            fetchedAt: repo.builtAt,
            count: items.length,
            github: { repo: GH_REPO, syncedAt: repo.builtAt, error: repoError || undefined },
            items
          })
        } catch (error) {
          sendJson(res, 502, { ok: false, message: String((error && error.message) || error) })
        }
      }],
      ['/api/plugin-desk/prepare', async (req, res, url) => {
        try {
          const repo = (url && url.searchParams.get('repo')) || ''
          const refresh = url && url.searchParams.get('refresh') === '1'
          const prepared = await prepareRepo(repo, refresh)
          sendJson(res, 200, { ok: true, dir: prepared.dir, cached: prepared.cached })
        } catch (error) {
          sendJson(res, 502, { ok: false, message: String((error && error.message) || error) })
        }
      }],
      ['/api/plugin-desk/heat', async (req, res, url) => {
        const raw = (url && url.searchParams.get('names')) || ''
        const names = raw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 120)
        const heat = {}
        await Promise.all(names.map(async (n) => { heat[n] = await weeklyDownloads(n) }))
        sendJson(res, 200, { ok: true, heat })
      }],
      ['/api/plugin-desk/installed', async (req, res) => {
        sendJson(res, 200, { ok: true, ...installedList() })
      }]
    ]

    for (const [route, handler] of routes) {
      webCtx.effect(() => webCtx.webServer.register({
        kind: 'exact',
        path: route,
        handler: async (req, res) => {
          if (!isLoopback(req)) { res.writeHead(403); res.end('forbidden'); return }
          const url = new URL(req.url || route, 'http://127.0.0.1')
          if (req.method !== 'GET') { res.writeHead(405, { allow: 'GET' }); res.end(); return }
          try {
            await handler(req, res, url)
          } catch (error) {
            sendJson(res, 500, { ok: false, message: String((error && error.message) || error) })
          }
        }
      }), 'dsh-plugin-desk: route ' + route)
    }
  })
}
