# 桌面壳一键发布：打包完成后运行（版本号需先改 client/src-tauri/tauri.conf.json 的 version）
# 用法：powershell -File scripts/desktop-release.ps1 -Version 1.0.1 -Notes "新增托盘图标"
# 完成后 git push，Vercel 部署即上线更新；老师端下次启动自动弹更新框
param(
  [Parameter(Mandatory=$true)][string]$Version,
  [string]$Notes = "体验优化与问题修复"
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$nsis = "$root\client\src-tauri\target\release\bundle\nsis"
$dst  = "$root\client\public\desktop"
New-Item -ItemType Directory -Force $dst | Out-Null

# 安装包（用 ASCII 文件名托管，避免 URL 中文编码问题）
# 取最新一次构建的安装包与签名（目录里可能残留历史版本）
$exe  = Get-ChildItem $nsis -Filter "*-setup.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$sig  = Get-ChildItem $nsis -Filter "*-setup.exe.sig" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $exe -or -not $sig) { throw "未找到安装包或签名文件，请先运行 npm run desktop" }

Copy-Item $exe.FullName "$dst\teacher-workbench-setup.exe" -Force
$signature = (Get-Content $sig.FullName -Raw).Trim()

$manifest = @{
  version  = $Version
  notes    = $Notes
  pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  platforms = @{
    "windows-x86_64" = @{
      signature = $signature
      url       = "https://teach.rayzo.cn/desktop/teacher-workbench-setup.exe"
    }
  }
} | ConvertTo-Json -Depth 5

[System.IO.File]::WriteAllText("$dst\latest.json", $manifest, (New-Object System.Text.UTF8Encoding $false))
Write-Host "已生成更新清单：$dst\latest.json （v$Version）"
Write-Host "下一步：git add -A; git commit; git push（Vercel 部署后老师端自动收到更新）"
