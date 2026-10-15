# Raise the test browser above other windows while a watched run is driving.
#
# Always-on-top rather than stealing focus: Windows deliberately stops a background
# process taking your keyboard, so SetForegroundWindow is unreliable, while TOPMOST is
# not. The window is found by the browser's own process id, so this can never grab a
# Chrome window of yours.
param([int]$ProcessId, [switch]$Release)
$sig = @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class QaWin {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
  public delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
}
'@
try { Add-Type -TypeDefinition $sig -ErrorAction SilentlyContinue } catch { }
$TOPMOST = [IntPtr](-1); $NOTOPMOST = [IntPtr](-2)
$flags = 0x0003 # SWP_NOSIZE | SWP_NOMOVE
$target = if ($Release) { $NOTOPMOST } else { $TOPMOST }
# The visible window may belong to the browser process or one of its children.
$pids = @($ProcessId)
try { Get-CimInstance Win32_Process -Filter "ParentProcessId=$ProcessId" | ForEach-Object { $pids += $_.ProcessId } } catch { }
$cb = [QaWin+EnumWindowsProc]{
  param($h, $l)
  $pid = 0
  [void][QaWin]::GetWindowThreadProcessId($h, [ref]$pid)
  if ($pids -contains $pid -and [QaWin]::IsWindowVisible($h) -and [QaWin]::GetWindowTextLength($h) -gt 0) {
    [void][QaWin]::SetWindowPos($h, $target, 0, 0, 0, 0, $flags)
  }
  return $true
}
[void][QaWin]::EnumWindows($cb, [IntPtr]::Zero)
