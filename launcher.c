#define UNICODE
#define _UNICODE
#include <windows.h>
#include <stdio.h>
#include <shlwapi.h>

void LogLaunchError(const wchar_t* dir, const wchar_t* msg) {
    wchar_t logPath[MAX_PATH];
    wsprintfW(logPath, L"%s\\logs", dir);
    CreateDirectoryW(logPath, NULL);
    wsprintfW(logPath, L"%s\\logs\\launch_error.log", dir);

    FILE* fp = _wfopen(logPath, L"a, ccs=UTF-8");
    if (fp) {
        SYSTEMTIME st;
        GetLocalTime(&st);
        fwprintf(fp, L"[%04d-%02d-%02d %02d:%02d:%02d] %s\n",
                 st.wYear, st.wMonth, st.wDay, st.wHour, st.wMinute, st.wSecond, msg);
        fclose(fp);
    }
}

int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nCmdShow) {
    wchar_t appDir[MAX_PATH];
    GetModuleFileNameW(NULL, appDir, MAX_PATH);
    
    // Remove file name to get directory
    wchar_t* lastSlash = wcsrchr(appDir, L'\\');
    if (lastSlash) {
        *lastSlash = L'\0';
    }

    // Set working directory to app directory
    SetCurrentDirectoryW(appDir);

    // Ensure logs directory exists
    wchar_t logsDir[MAX_PATH];
    wsprintfW(logsDir, L"%s\\logs", appDir);
    CreateDirectoryW(logsDir, NULL);

    // 1. Check local node_modules\electron\dist\electron.exe
    wchar_t localElectron[MAX_PATH];
    wsprintfW(localElectron, L"%s\\node_modules\\electron\\dist\\electron.exe", appDir);

    wchar_t cmdLine[MAX_PATH * 2];
    BOOL launched = FALSE;

    if (GetFileAttributesW(localElectron) != INVALID_FILE_ATTRIBUTES) {
        // Run local electron with current directory "."
        wsprintfW(cmdLine, L"\"%s\" .", localElectron);

        STARTUPINFOW si;
        PROCESS_INFORMATION pi;
        ZeroMemory(&si, sizeof(si));
        si.cb = sizeof(si);
        ZeroMemory(&pi, sizeof(pi));

        if (CreateProcessW(NULL, cmdLine, NULL, NULL, FALSE, 0, NULL, appDir, &si, &pi)) {
            CloseHandle(pi.hProcess);
            CloseHandle(pi.hThread);
            return 0; // Success!
        } else {
            wchar_t errBuf[256];
            wsprintfW(errBuf, L"Failed to spawn local electron.exe (Error code: %lu)", GetLastError());
            LogLaunchError(appDir, errBuf);
        }
    }

    // 2. Fallback: Try npx electron . without console window
    wsprintfW(cmdLine, L"cmd.exe /c npx electron .");
    STARTUPINFOW si2;
    PROCESS_INFORMATION pi2;
    ZeroMemory(&si2, sizeof(si2));
    si2.cb = sizeof(si2);
    si2.dwFlags = STARTF_USESHOWWINDOW;
    si2.wShowWindow = SW_HIDE;
    ZeroMemory(&pi2, sizeof(pi2));

    if (CreateProcessW(NULL, cmdLine, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, appDir, &si2, &pi2)) {
        CloseHandle(pi2.hProcess);
        CloseHandle(pi2.hThread);
        return 0;
    }

    // If both failed, alert user
    LogLaunchError(appDir, L"Failed to start WorldBuilding: electron.exe not found and npx failed.");
    MessageBoxW(NULL,
                L"세계관 빌더를 시작할 수 없습니다.\n\n"
                L"node_modules\\electron\\dist\\electron.exe를 찾을 수 없습니다.\n"
                L"logs\\launch_error.log를 확인해주세요.",
                L"실행 오류",
                MB_OK | MB_ICONERROR);

    return 1;
}
