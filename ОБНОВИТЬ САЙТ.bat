@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Отправка изменений на GitHub...
echo.
git add -A
git commit -m "Обновление сайта %date% %time%"
git push
echo.
echo Готово! Можно закрыть окно.
pause
