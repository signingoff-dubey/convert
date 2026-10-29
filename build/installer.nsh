; Uninstall removes the start-with-Windows entry and leaves the user's files alone (docs/06 phase 6).
!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Convert"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "Convert"
!macroend
