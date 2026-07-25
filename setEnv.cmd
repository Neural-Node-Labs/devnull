@echo off
REM devnull: loads variables from .env into the CURRENT shell session.
REM
REM IMPORTANT: you must run this by typing `setEnv.cmd` (or `call setEnv.cmd`) directly into
REM an already-open Command Prompt window. Double-clicking this file from Explorer launches a
REM brand-new cmd.exe process just to run it, which then closes -- any variables it sets die
REM with that process and never reach the terminal you actually wanted them in.
REM
REM Previously this script used `setlocal`, which has the same effect even when run correctly:
REM it creates a scoped environment that's automatically discarded the moment the script ends
REM (an implicit `endlocal` fires for any unclosed `setlocal`), so the variables never actually
REM persisted in the calling shell -- the script silently failed at its own stated purpose.
REM Removed here so `set` calls apply directly to the session you ran this from.

if not exist .env (
    echo Error: .env file not found!
    pause
    exit /b 1
)

REM Read the .env file line by line and set each KEY=VALUE pair in this shell.
REM Values themselves are NOT echoed to the console -- only the variable names -- so secrets
REM in .env don't end up printed to the terminal / any transcript or log of this session.
for /f "usebackq tokens=1* delims==" %%A in (".env") do (
    if not "%%A"=="" if not "%%A:~0,1%"=="#" (
        set "%%A=%%B"
        echo Loaded: %%A
    )
)

echo.
echo All variables from .env loaded into this shell session.
pause
