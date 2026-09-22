@echo off
set "PATH=C:\Users\xgl\AppData\Roaming\TRAE SOLO CN\ModularData\ai-agent\vm\tools\node;%PATH%"
cd /d "%~dp0"

echo ===========================================
echo  CampusChain - Ganache Local Environment
echo ===========================================
echo.

node -v >nul 2>&1
if errorlevel 1 (
  echo [ERROR] node not found.
  pause
  exit /b 1
)

if not exist "node_modules\hardhat\internal\cli\cli.js" (
  echo [ERROR] Hardhat toolchain not found. Run: npm install
  pause
  exit /b 1
)

echo [1/3] Checking Ganache on port 7545...
netstat -ano | findstr ":7545" | findstr "LISTENING" >nul
if errorlevel 1 (
  echo [ERROR] Ganache is NOT running.
  echo         Please open the Ganache app first, then run this script again.
  pause
  exit /b 1
)
echo        Ganache OK.

echo [2/3] Starting web server on port 8000...
netstat -ano | findstr ":8000" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo        Web server already running, skip.
) else (
  powershell -Command "Start-Process node -ArgumentList 'scripts\serve.js' -WorkingDirectory '%CD%' -WindowStyle Hidden"
  timeout /t 2 /nobreak >nul
)

echo [3/3] Deploying contract to Ganache...
if not exist "scripts\.ganache.json" (
  echo [ERROR] scripts\.ganache.json not found.
  echo         Create it with your Ganache account private key:
  echo           { "privateKey": "0xYourGanacheAccountPrivateKey" }
  pause
  exit /b 1
)
call npx hardhat run scripts\deploy.js --network ganache
if errorlevel 1 (
  echo [ERROR] Deploy failed.
  pause
  exit /b 1
)

echo.
echo ===========================================
echo  Done! Open http://127.0.0.1:8000
echo  Note: Ganache keeps chain data across
echo  restarts - no need to redeploy every time.
echo ===========================================
pause
