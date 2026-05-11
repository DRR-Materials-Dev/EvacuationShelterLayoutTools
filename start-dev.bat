@echo off
chcp 65001 > nul
setlocal

cd /d "%~dp0"

echo ================================================
echo  避難所レイアウトツール - 開発サーバー起動
echo ================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js が見つかりません。Node.js をインストールしてください。
    echo         https://nodejs.org/
    pause
    exit /b 1
)

if not exist node_modules (
    echo [INFO] 依存パッケージをインストールしています...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install に失敗しました。
        pause
        exit /b 1
    )
    echo.
)

echo [INFO] ブラウザを開きます: http://localhost:5173/EvacuationShelterLayoutTools/
echo [INFO] サーバーを停止する場合は Ctrl+C を押してください。
echo.

start "" http://localhost:5173/EvacuationShelterLayoutTools/

call npm run dev

endlocal
