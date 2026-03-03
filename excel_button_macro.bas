Attribute VB_Name = "ScanRunner"
Option Explicit


' Mac用の外部コマンド実行用関数宣言 (execShell用)
#If Mac Then
    Private Declare PtrSafe Function popen Lib "libc.dylib" (ByVal command As String, ByVal mode As String) As LongPtr
    Private Declare PtrSafe Function pclose Lib "libc.dylib" (ByVal file As LongPtr) As Long
    Private Declare PtrSafe Function fread Lib "libc.dylib" (ByVal buffer As String, ByVal size As Long, ByVal size2 As Long, ByVal file As LongPtr) As Long
    Private Declare PtrSafe Function feof Lib "libc.dylib" (ByVal file As LongPtr) As Long
#End If

Public Function execShell(command As String, Optional ByRef exitCode As Long) As String
#If Mac Then
    Dim file As LongPtr
    Dim readBuffer As String
    Dim result As String
    Dim bytesRead As Long
    
    ' popenでコマンドを実行 ("r"はreadモード)
    ' コマンドの最後に 2>&1 を追加して標準エラー出力も取得するのが一般的
    file = popen(command, "r")
    
    If file = 0 Then
        execShell = "Error: Failed to execute command."
        Exit Function
    End If
    
    ' 出力を読み取る
    readBuffer = Space(128)
    Do While feof(file) = 0
        bytesRead = fread(readBuffer, 1, 128, file)
        If bytesRead > 0 Then
            result = result & Left(readBuffer, bytesRead)
        Else
            Exit Do
        End If
    Loop
    
    ' ファイルを閉じて終了コードを取得
    exitCode = pclose(file)
    execShell = result
#Else
    execShell = "Error: execShell is for Mac only."
#End If
End Function

Public Sub RunScanWithPopup()
    RunPythonProcess "scan"
End Sub

Public Sub RunExecuteWithPopup()
    RunPythonProcess "execute"
End Sub

Public Function RunAppleScript(script As String) As String
    ' MacScriptが使えないケース（Excel 2016以降のサンドボックス問題）への対応として、
    ' VBAのMacScript関数をラップしてエラーハンドリング強化
    
    Dim s As String
    s = script
    
    ' 古いMacScript関数を使用
    ' Excel 2016以降では、do shell scriptを含むAppleScriptの実行には許可が必要な場合があります
    ' または、AppleScriptTaskを使用することが推奨されますが、外部ファイルが必要になるため
    ' まずはMacScriptで試みます。
    
    On Error Resume Next
    Dim result As String
    result = MacScript(s)
    
    If Err.Number <> 0 Then
        ' エラー発生時
        RunAppleScript = "Error: " & Err.Description & " (Number: " & Err.Number & ")"
        Err.Clear
    Else
        RunAppleScript = result
    End If
End Function

Private Sub RunPythonProcess(ByVal mode As String)
    Dim wbPath As String
    Dim pyExe As String
    Dim scriptPath As String
    Dim cmd As String
    Dim result As String
    
    ' パス情報を取得
    wbPath = ThisWorkbook.FullName
    scriptPath = ThisWorkbook.Path & PathSep() & "split_pdf.py"
    pyExe = ResolvePythonExe()
    
    ' コマンドライン組立て
    cmd = Quote(pyExe) & " " & _
          Quote(scriptPath) & " " & _
          "--mode " & mode & " --popup --excel " & Quote(wbPath)
    
    ' On Error GoTo ErrorHandler ' エラーハンドラは一時無効化して詳細を確認
    
#If Mac Then
    ' Macの場合
    ' MacScriptは古いので不安定な場合があります。
    ' まずMacScriptを試み、エラーになったらexecShell (popen) を試みます。
    
    Dim appleScriptStr As String
    appleScriptStr = "do shell script " & QuoteForAppleScript(cmd & " 2>&1")
    
    On Error Resume Next
    result = MacScript(appleScriptStr)
    
    If Err.Number <> 0 Then
        ' MacScriptが失敗した場合、execShellを試行
        Dim macScriptErr As String
        macScriptErr = Err.Description
        Err.Clear
        
        Dim exitCode As Long
        ' execShellにはシェルコマンドを直接渡す (AppleScriptではない)
        Dim shellCmd As String
        shellCmd = cmd & " 2>&1"
        result = execShell(shellCmd, exitCode)
        
        If Left(result, 5) = "Error" Then
             result = "MacScript Error: " & macScriptErr & vbCrLf & "execShell Result: " & result
        End If
    End If
    
    On Error GoTo ErrorHandler
#Else
    ' Windowsの場合
    Dim sh As Object
    Dim exec As Object
    Set sh = CreateObject("WScript.Shell")
    
    ' 完了まで待機して出力を取得
    Set exec = sh.Exec(cmd)
    
    ' プロセス終了まで待つループ
    Do While exec.Status = 0
        DoEvents
    Loop
    
    ' 出力を読み取る
    result = exec.StdOut.ReadAll()
    If Len(result) = 0 Then result = exec.StdErr.ReadAll()
#End If

    ' 結果を表示
    MsgBox "処理が完了しました。" & vbCrLf & vbCrLf & "[出力結果]" & vbCrLf & result, vbInformation
    Exit Sub

ErrorHandler:
    MsgBox "エラーが発生しました。" & vbCrLf & "詳細: " & Err.Description & vbCrLf & "Comamnd: " & cmd, vbCritical
End Sub

Private Function ResolvePythonExe() As String
#If Mac Then
    ' このワークブックのフォルダ/.venv/bin/python を指す
    ResolvePythonExe = ThisWorkbook.Path & PathSep() & ".venv" & PathSep() & "bin" & PathSep() & "python"
#Else
    ' Windowsの場合: ワークブックと同じフォルダにある 'python\python.exe' または 'python-3.x.x\python.exe' を指す想定
    ' ポータブルPython環境のフォルダ名に合わせて変更してください
    ' 例: ThisWorkbook.Path & PathSep() & "win_python" & PathSep() & "python.exe"
    
    Dim standardPath As String
    standardPath = ThisWorkbook.Path & PathSep() & "python" & PathSep() & "python.exe"
    
    ' もし別のフォルダ構成ならここで指定
    ' standardPath = ThisWorkbook.Path & PathSep() & "python-3.11.5-embed-amd64" & PathSep() & "python.exe"
    
    ResolvePythonExe = standardPath
#End If
End Function

Private Function PathSep() As String
#If Mac Then
    PathSep = "/"
#Else
    PathSep = "\"
#End If
End Function

' 通常のシェル用クォート関数
' 文字列全体を " で囲むだけです
Private Function Quote(ByVal s As String) As String
    Quote = """" & s & """"
End Function

' AppleScript用に厳密なエスケープ関数
' バックスラッシュとダブルクォートをエスケープします
Private Function QuoteForAppleScript(ByVal s As String) As String
    Dim res As String
    res = s
    ' バックスラッシュを2つに
    res = Replace(res, "\", "\\")
    ' ダブルクォートを \" に（VBAでの表記は "\"""）
    res = Replace(res, """", "\""")
    
    ' 全体を " で囲む
    QuoteForAppleScript = """" & res & """"
End Function
