@echo off
title Bhaktivedanta VedaBase 2019
cd /d "c:\Users\anura\OneDrive\Desktop\vedabase"
echo Starting Bhaktivedanta VedaBase...
python main.py
if errorlevel 1 (
    echo.
    echo ERROR: App failed to start. See message above.
    pause
)
