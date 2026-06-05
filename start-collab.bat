@echo off
chcp 65001 > nul
setlocal

cd /d "%~dp0"

echo ================================================
echo  避難所レイアウトツール - マルチ操作（コラボ）起動
echo  ※ インストール不要。配布版と同じ挙動を確認できます。
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

echo [INFO] コラボ用にビルドして Electron アプリ（ホスト）を起動します。
echo [INFO] 初回や変更後はビルドに少し時間がかかります（十数秒）。
echo.
echo  使い方:
echo   1. 起動したウィンドウ上部の「参加者を招待（URL・QR）」を押す
echo   2. 表示された URL を、同じ Wi-Fi の別端末（またはこの PC の別ブラウザ）で開く
echo   3. 区画の移動・追加・削除、施設画像・サンプル読込などが同期します
echo.
echo   ※ 初回起動時にファイアウォール確認が出たら「プライベートネットワーク」で許可してください。
echo   ※ 停止する場合はウィンドウを閉じてください。
echo.

call npm run electron:dev

if errorlevel 1 (
    echo.
    echo [ERROR] 起動に失敗しました。上のログを確認してください。
    pause
    exit /b 1
)

endlocal
