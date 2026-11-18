@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

title CTI Pro CRM - Servidor Local

echo ====================================================================
echo   CTI PRO CRM - OFICINA DE PRECISAO OPTICA E CUTELARIA
echo   Inicializador Local-First (Servidor LAN + SQLite)
echo ====================================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado no PATH do sistema.
  echo Instale o Node.js v20+ e tente novamente.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [INFO] Instalando dependencias iniciais...
  call npm install
  if errorlevel 1 (
    echo [ERRO] Falha ao instalar dependencias npm.
    pause
    exit /b 1
  )
)

echo [INFO] Iniciando servidor na porta 3000...
echo [INFO] Navegador local abrira em http://localhost:3000
echo [INFO] Para conectar o celular, clique em "Conexao Mobile" no topo da tela.
echo.

start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"

node server.js
if errorlevel 1 (
  echo.
  echo [ERRO] O servidor foi encerrado com falha.
  pause
  exit /b 1
)

endlocal
