# CampusChain 校园链上失物招领 - 本地环境一键启动
# 用法：右键 → 使用 PowerShell 运行

Set-Location $PSScriptRoot

Write-Host "===========================================" -ForegroundColor Cyan
Write-Host " CampusChain 校园链上失物招领 - 本地环境启动" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 node
try { node -v | Out-Null } catch {
    Write-Host "[错误] 未找到 node，请先安装 Node.js" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}

# 检查依赖
if (-not (Test-Path "node_modules\hardhat\internal\cli\cli.js")) {
    Write-Host "[错误] 未找到 Hardhat，请先运行 npm install" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}

# 如果节点已在运行则跳过
$nodeRunning = netstat -ano | Select-String ":8545" | Select-String "LISTENING"
if ($nodeRunning) {
    Write-Host "[提示] 8545 端口已被占用，节点可能已在运行，跳过启动" -ForegroundColor Yellow
} else {
    Write-Host "[1/4] 启动本地区块链节点..." -ForegroundColor Green
    Start-Process node -ArgumentList 'node_modules\hardhat\internal\cli\cli.js','node','--hostname','0.0.0.0' -WindowStyle Hidden -RedirectStandardOutput "node.log" -RedirectStandardError "node.err.log"
}

$webRunning = netstat -ano | Select-String ":8000" | Select-String "LISTENING"
if (-not $webRunning) {
    Write-Host "[2/4] 启动前端静态服务..." -ForegroundColor Green
    Start-Process node -ArgumentList 'scripts\serve.js' -WindowStyle Hidden -RedirectStandardOutput "serve.log" -RedirectStandardError "serve.err.log"
}

Write-Host "[3/4] 等待节点就绪..." -ForegroundColor Green
Start-Sleep -Seconds 10

Write-Host "[4/4] 部署智能合约..." -ForegroundColor Green
npx hardhat run scripts\deploy.js --network localhost

Write-Host ""
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host " 启动完成！" -ForegroundColor Green
Write-Host " 电脑访问：http://127.0.0.1:8000" -ForegroundColor White
Write-Host " 手机访问：http://电脑IP:8000 （同一 Wi-Fi）" -ForegroundColor White
Write-Host "===========================================" -ForegroundColor Cyan
Read-Host "按回车退出"
