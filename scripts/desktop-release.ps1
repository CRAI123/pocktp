﻿# 桌面壳一键发布：打包完成后运行（版本号需先改 client/src-tauri/tauri.conf.json 的 version）
# 安装包上传到 Supabase Storage（不进 git，也不会被下一版安装包内嵌），
# 只把体积很小的 latest.json 放进 client/public/desktop，随 Vercel 部署供客户端检查更新。
# 用法：powershell -File scripts/desktop-release.ps1 -Version 2.0.5 -Notes "修复某问题"
param(
  [Parameter(Mandatory=$true)][string]$Version,
  [string]$Notes = "体验优化与问题修复"
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$nsis = "$root\client\src-tauri\target\release\bundle\nsis"
$dst  = "$root\client\public\desktop"
New-Item -ItemType Directory -Force $dst | Out-Null

# 取最新一次构建的安装包与签名（目录里可能残留历史版本）
$exe = Get-ChildItem $nsis -Filter "*-setup.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$sig = Get-ChildItem $nsis -Filter "*-setup.exe.sig" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $exe -or -not $sig) { throw "未找到安装包或签名文件，请先运行 npm run tauri build（需设置 TAURI_SIGNING_PRIVATE_KEY）" }

# 读取 Supabase 配置（server/.env）
$envFile = "$root\server\.env"
function ReadEnv($name) {
  $m = Select-String -Path $envFile -Pattern "^$name=(.+)$"
  if ($m) { return $m.Matches[0].Groups[1].Value.Trim() }
  return ''
}
$sbUrl = (ReadEnv 'SUPABASE_URL').TrimEnd('/')
$sbKey = ReadEnv 'SUPABASE_SERVICE_ROLE_KEY'
if (-not $sbUrl -or -not $sbKey) { throw "server/.env 缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }

# 复制到 ASCII 文件名再上传，避免 curl 处理中文路径
$tmp = Join-Path $env:TEMP 'tw-setup-upload.exe'
Copy-Item $exe.FullName $tmp -Force
Write-Host "上传安装包（$([math]::Round($exe.Length/1MB,2)) MB）..."

$obj = 'desktop/teacher-workbench-setup.exe'
$up = & curl.exe -s -X POST "$sbUrl/storage/v1/object/materials/$obj" `
  -H "Authorization: Bearer $sbKey" -H "apikey: $sbKey" `
  -H "Content-Type: application/octet-stream" -H "x-upsert: true" `
  --data-binary "@$tmp"
Remove-Item $tmp -Force -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) { throw "上传安装包失败：$up" }

# 生成长效签名下载链接（10 年有效）
$sign = Invoke-RestMethod -Uri "$sbUrl/storage/v1/object/sign/materials/$obj" -Method Post `
  -Headers @{ Authorization = "Bearer $sbKey"; apikey = $sbKey; 'Content-Type' = 'application/json' } `
  -Body (@{ expiresIn = 315360000 } | ConvertTo-Json)
$url = "$sbUrl/storage/v1$($sign.signedURL)"

$signature = (Get-Content $sig.FullName -Raw).Trim()
$manifest = @{
  version   = $Version
  notes     = $Notes
  pub_date  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  platforms = @{
    "windows-x86_64" = @{
      signature = $signature
      url       = $url
    }
  }
} | ConvertTo-Json -Depth 5

[System.IO.File]::WriteAllText("$dst\latest.json", $manifest, (New-Object System.Text.UTF8Encoding $false))
Write-Host "已生成更新清单：$dst\latest.json （v$Version）"
Write-Host "下载地址：$url"
Write-Host "下一步：git add client/public/desktop/latest.json client/src-tauri/tauri.conf.json; git commit; git push"
