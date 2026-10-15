# A tray balloon, because a finished sweep should reach you even when the panel is
# behind something else. Zero dependencies: WinForms ships with Windows, and a missing
# notification must never be the reason a run looks broken.
param([string]$Title = "Funnel checks", [string]$Body = "Finished")
try {
  Add-Type -AssemblyName System.Windows.Forms
  $icon = New-Object System.Windows.Forms.NotifyIcon
  $icon.Icon = [System.Drawing.SystemIcons]::Information
  $icon.BalloonTipTitle = $Title
  $icon.BalloonTipText = $Body
  $icon.Visible = $true
  $icon.ShowBalloonTip(8000)
  Start-Sleep -Seconds 9
  $icon.Dispose()
} catch { }
