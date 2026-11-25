#!/usr/bin/env pwsh
# 把本目录作为一个 commit 发布到 GitHub（不需要本机安装 git）。
# 用法：
#   .\publish.ps1 -Token $env:GITHUB_TOKEN              # 新建/更新 dsh-plugin-desk 仓库
#   .\publish.ps1 -Token xxx -RepoName my-desk -Private  # 自定义名字、私有仓库
#   .\publish.ps1 -DryRun                                # 只看会传哪些文件，不联网
#
# Token 需要 repo 权限（fine-grained: Contents + Administration 读写）。

param(
  [string]$Token = $env:GITHUB_TOKEN,
  [string]$RepoName = 'dsh-plugin-desk',
  [string]$Description = 'DSH 插件台：在 DSH 插件页里全量同步 GitHub 上的 12,928 个插件，支持搜索、预览截图、一键安装（npm / release tgz / 纯 GitHub 仓库）。',
  [string]$Homepage = '',
  [switch]$Private,
  [switch]$DryRun,
  [string[]]$Topics = @('dsh', 'deepseek-harness', 'plugin-market', 'plugin-manager')
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Api = 'https://api.github.com'

function CollectFiles([string]$dir) {
  $out = @()
  Get-ChildItem $dir -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($dir.Length + 1).Replace('\', '/')
    if ($rel -like 'node_modules/*' -or $rel -like '.git/*' -or $rel -like '.cache/*') { return }
    $out += [pscustomobject]@{ Path = $rel; Full = $_.FullName; Size = $_.Length }
  }
  return $out
}

$files = CollectFiles $Root
Write-Host ("准备发布 {0} 个文件：" -f $files.Count)
$files | Sort-Object Path | ForEach-Object { Write-Host ("  {0,-42} {1,8:N0} B" -f $_.Path, $_.Size) }

if ($DryRun) {
  Write-Host "`n[DryRun] 不联网，只核对文件清单。"
  $vis = if ($Private) { '私有' } else { '公开' }
  Write-Host "[DryRun] 目标仓库：{owner}/$RepoName（$vis）"
  exit 0
}

if (-not $Token) {
  # 交互式运行（双击 .cmd）时问一次；token 只存在内存里，不落盘
  if ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
    Write-Host ''
    Write-Host '需要一个 GitHub Token（权限：repo / Contents + Administration 读写）。'
    Write-Host '生成地址：https://github.com/settings/tokens  → Generate new token (classic) → 勾 repo'
    $secure = Read-Host -AsSecureString 'Token'
    $Token = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
      [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    ).Trim()
  }
}
if (-not $Token) { throw '缺少 GitHub Token（-Token 或环境变量 GITHUB_TOKEN）' }

$headers = @{
  Authorization          = "Bearer $Token"
  Accept                 = 'application/vnd.github+json'
  'X-GitHub-Api-Version' = '2022-11-28'
  'User-Agent'           = 'dsh-plugin-desk-publisher'
}

function InvokeApi([string]$method, [string]$url, $body, [string]$acceptJson = 'application/vnd.github+json') {
  $params = @{
    Method  = $method
    Uri     = $url
    Headers = @{ Authorization = "Bearer $Token"; Accept = $acceptJson; 'X-GitHub-Api-Version' = '2022-11-28'; 'User-Agent' = 'dsh-plugin-desk-publisher' }
  }
  if ($body) { $params.Body = ($body | ConvertTo-Json -Depth 12 -Compress); $params.ContentType = 'application/json; charset=utf-8' }
  Invoke-RestMethod @params
}

$me = InvokeApi 'GET' "$Api/user"
$owner = $me.login
Write-Host "`n登录身份：$owner"

$repoUrl = "$Api/repos/$owner/$RepoName"
$exists = $false
try { $existing = InvokeApi 'GET' $repoUrl; $exists = $true } catch { $exists = $false }

if (-not $exists) {
  Write-Host "创建仓库 $owner/$RepoName …"
  $payload = @{
    name        = $RepoName
    description = $Description
    private     = [bool]$Private
    has_issues  = $true
    has_wiki    = $false
    auto_init   = $false
  }
  if ($Homepage) { $payload.homepage = $Homepage }
  $created = InvokeApi 'POST' "$Api/user/repos" $payload
  Start-Sleep -Milliseconds 400
} else {
  Write-Host "仓库已存在，作为新 commit 更新（默认分支 $($existing.default_branch)）"
}

# ---- 先看仓库里到底有没有 commit（空仓库不能直接写 blobs/tree，得先用 Contents API 打一个）
$baseTree = $null
$parents = @()
$branch = if ($exists) { $existing.default_branch } else { 'main' }
if ($exists) {
  try {
    $ref = InvokeApi 'GET' "$repoUrl/git/ref/heads/$branch"
    $parents = @($ref.object.sha)
    $commit = InvokeApi 'GET' "$repoUrl/git/commits/$($ref.object.sha)"
    $branch = $existing.default_branch
    $baseTree = $commit.tree.sha
  } catch {
    $branch = 'main'
    Write-Host '（空仓库：先用 Contents API 打第一个 commit，再按正常流程覆盖）'
    $seedPath = 'README.md'
    $seedText = Get-Content -LiteralPath (Join-Path $Root 'README.md') -Raw -Encoding UTF8
    $seed = InvokeApi 'PUT' "$repoUrl/contents/$seedPath" @{
      message = 'chore: init'
      content = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($seedText))
    }
    Start-Sleep -Milliseconds 500
    $ref = InvokeApi 'GET' "$repoUrl/git/ref/heads/$branch"
    $parents = @($ref.object.sha)
    $commit = InvokeApi 'GET' "$repoUrl/git/commits/$($ref.object.sha)"
    $baseTree = $commit.tree.sha
  }
}

# ---- 生成 tree：文本用内联 content，二进制走 blobs（base64）
$tree = @()
foreach ($f in $files) {
  $ext = [IO.Path]::GetExtension($f.Full).ToLowerInvariant()
  if ($ext -in @('.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.zip', '.gz')) {
    $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($f.Full))
    $blob = InvokeApi 'POST' "$repoUrl/git/blobs" @{ content = $b64; encoding = 'base64' }
    $tree += @{ path = $f.Path; mode = '100644'; type = 'blob'; sha = $blob.sha }
  } else {
    $text = Get-Content -LiteralPath $f.Full -Raw -Encoding UTF8
    if ($null -eq $text) { $text = '' }
    $tree += @{ path = $f.Path; mode = '100644'; type = 'blob'; content = $text }
  }
}

$treeBody = @{ tree = $tree }
if ($baseTree) { $treeBody.base_tree = $baseTree }
$newTree = InvokeApi 'POST' "$repoUrl/git/trees" $treeBody

$commitBody = @{
  message = "chore: publish dsh-plugin-desk $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
  tree    = $newTree.sha
}
if ($parents.Count) { $commitBody.parents = $parents }
$newCommit = InvokeApi 'POST' "$repoUrl/git/commits" $commitBody

if ($parents.Count) {
  InvokeApi 'PATCH' "$repoUrl/git/refs/heads/$branch" @{ sha = $newCommit.sha; force = $false } | Out-Null
} else {
  InvokeApi 'POST' "$repoUrl/git/refs" @{ ref = "refs/heads/$branch"; sha = $newCommit.sha } | Out-Null
}

# 可选：打 topics（失败不影响结果）
try {
  InvokeApi 'PUT' "$repoUrl/topics" @{ names = $Topics } 'application/vnd.github+json' | Out-Null
} catch { Write-Host '（topics 设置被跳过）' }

Write-Host "`n完成：https://github.com/$owner/$RepoName"
Write-Host "commit：$($newCommit.sha.Substring(0,7))  文件：$($files.Count)"
