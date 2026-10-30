@echo off
chcp 65001 >nul
cd /d "%~dp0"

if exist backend\web\index.html goto built
echo 未检测到前端构建产物，开始构建（需要 node/pnpm）...
pushd frontend
call pnpm install --frozen-lockfile
if errorlevel 1 goto buildfail
call pnpm build
if errorlevel 1 goto buildfail
popd
if exist backend\web rmdir /s /q backend\web
xcopy frontend\dist backend\web\ /e /i /q >nul
goto built

:buildfail
popd
echo 前端构建失败
pause
exit /b 1

:built
cd backend
where poetry >nul 2>&1
if %errorlevel%==0 (
  call poetry run python app_launcher.py
) else (
  python app_launcher.py
)
if errorlevel 1 pause
