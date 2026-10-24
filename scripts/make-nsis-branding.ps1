# 生成 NSIS 安装向导品牌位图：sidebar.bmp 164×314（左栏）、header.bmp 150×57（顶部右角）
# 品牌蓝→绿渐变底 + 恐龙 LOGO；输出 BMP（NSIS 只认 BMP）
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root  = Split-Path $PSScriptRoot -Parent
$logo  = [System.Drawing.Image]::FromFile("$root\client\public\rayzo-logo.png")
$outDir = "$root\client\src-tauri\nsis"
New-Item -ItemType Directory -Force $outDir | Out-Null

function New-GradientBmp([int]$w, [int]$h, [scriptblock]$draw) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.InterpolationMode = 'HighQualityBicubic'
  $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect,
    ([System.Drawing.Color]::FromArgb(0, 113, 227)),
    ([System.Drawing.Color]::FromArgb(40, 205, 65)),
    ([System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
  $g.FillRectangle($brush, $rect)
  & $draw $g $w $h
  $g.Dispose(); $brush.Dispose()
  return $bmp
}

# 左栏：渐变底 + 居中 LOGO + 产品名
$sidebar = New-GradientBmp 164 314 { param($g, $w, $h)
  $size = 96
  $g.DrawImage($logo, [int](($w - $size) / 2), 84, $size, $size)
  $font = New-Object System.Drawing.Font('Microsoft YaHei', 13, [System.Drawing.FontStyle]::Bold)
  $sf = New-Object System.Drawing.StringFormat; $sf.Alignment = 'Center'
  $g.DrawString('教师工作台', $font, [System.Drawing.Brushes]::White, ($w / 2), 196, $sf)
  $font2 = New-Object System.Drawing.Font('Microsoft YaHei', 8)
  $g.DrawString('连接创意与未来教育', $font2, ([System.Drawing.Brushes]::White), ($w / 2), 224, $sf)
}
$sidebar.Save("$outDir\sidebar.bmp", [System.Drawing.Imaging.ImageFormat]::Bmp)

# 顶部右角横幅：白底 + 右侧 LOGO
$header = New-Object System.Drawing.Bitmap 150, 57
$g = [System.Drawing.Graphics]::FromImage($header)
$g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'
$g.Clear([System.Drawing.Color]::White)
$g.DrawImage($logo, 106, 6, 44, 44)
$g.Dispose()
$header.Save("$outDir\header.bmp", [System.Drawing.Imaging.ImageFormat]::Bmp)

$logo.Dispose(); $sidebar.Dispose(); $header.Dispose()
Write-Host "已生成：$outDir\sidebar.bmp / header.bmp"
