# split_pdf.py 使い方

## 概要
`split_pdf.py` は、Excel（`.xlsm`）の設定を使ってPDFを解析し、ページごとの判定結果をExcelへ書き戻すツールです。

現時点の実装状況:
- `scan` モード: 実装済み
- `execute` モード: 未実装（メッセージ表示のみ）

---

## 動作環境
- 開発: macOS
- 本番想定: Windows（ポータブルPython）
- Pythonライブラリ:
  - `openpyxl`
  - `pdfplumber`
  - `pymupdf`
  - `pytesseract`

インストール例:

```bash
pip install openpyxl pdfplumber pymupdf pytesseract
```

OCRを使う場合は、別途 `tesseract` 本体が必要です。
- macOS例: `brew install tesseract`
- Windows例: Tesseract OCR をインストールして `PATH` を通す

---

## 実行方法
基本コマンド:

```bash
python split_pdf.py --mode scan --excel "<Excelファイルのフルパス>"
```

処理中ポップアップを表示する場合:

```bash
python split_pdf.py --mode scan --excel "<Excelファイルのフルパス>" --popup
```

macOS例:

```bash
python split_pdf.py --mode scan --excel "/Users/.../請求書分割.xlsm"
```

Windows例:

```bat
python split_pdf.py --mode scan --excel "C:\path\to\請求書分割.xlsm"
```

引数:
- `--mode`
  - `scan`: 解析モード（実装済み）
  - `execute`: 将来用（未実装）
- `--excel`
  - 対象Excelファイル（`.xlsm`）のフルパス
- `--popup`
  - 処理中ポップアップを表示（ボタン実行時に推奨）

---

## Scanモードの処理内容
1. Excelの `設定` シートを読み込む
2. `入力ファイル置き場(フォルダ名)` から入力フォルダを決定
3. 入力フォルダ内の先頭PDF（`*.pdf` / `*.PDF`）を対象に全ページ解析
4. 各ページで以下を実施
   - レイアウト判定（設定の座標＋判定キーワード）
   - 宛名抽出（設定の座標）
   - `キーワード` と `出力ファイル名` のマスタ照合
   - 直前ページと「レイアウト＋宛名」が同じなら `結合`、異なれば `新規`
5. 結果を `ワークシート`（存在しない場合は `実行シート`）へ書き込み

---

## Excel設定の見方（現在の実装）
`設定` シートの読み取り列:
- A列: 判断エリア(座標)（例: `(20,20,40,40)`）
- B列: 判断テキスト（レイアウト判定キーワード）
- C列: レイアウト名
- D列: キーワード位置（宛名抽出座標）
- F列: キーワード（リネーム照合用）
- G列: 出力ファイル名（候補）
- I列: 設定項目
- J列: 設定内容

座標の扱い:
- 原点: 左上
- 単位: pt（PDFポイント）
- 入力形式: `(x, y, w, h)`

---

## 出力先シート
書き込み先:
- 優先: `ワークシート`
- なければ: `実行シート`

書き込み前に 5行目以降（B〜F列）をクリアしてから出力します。

出力列:
- B列: ページ数
- C列: レイアウト判断
- D列: キーワード（宛名抽出結果。空なら判定テキスト）
- E列: 出力ファイル名
- F列: 結合フラグ（`新規` / `結合`）

---

## エラー時の挙動
以下はエラーメッセージを出して終了します。
- Excelファイルが存在しない
- `設定` シートがない
- 入力フォルダにPDFがない
- Excelが使用中/読み取り専用で保存できない

---

## よくある確認ポイント
- `設定` シートのI/J列に `入力ファイル置き場(フォルダ名)` があるか
- 入力フォルダにPDFがあるか
- 座標文字列が4値（x, y, w, h）になっているか
- Excelを閉じてから実行しているか

---

## 補足
- 文字化け対策として、標準出力/標準エラーは `utf-8-sig` を考慮して出力します。
- 判定エリア/宛名エリアで `pdfplumber` 抽出文字に `(cid:...)` が含まれる場合は、OCRへ自動フォールバックします。
- OCR言語は環境変数 `OCR_LANG` で指定できます（既定: `jpn`、未導入時は利用可能言語へ自動フォールバック）。
- `execute` モードは今後の実装対象です。

---

## 運用手順（Scan→確認→Execute）

`execute` モード実装後は、以下の流れで運用する想定です。

### 1) Scan（解析）
まず `scan` を実行して、PDF全ページの判定結果をExcelへ反映します。

```bash
python split_pdf.py --mode scan --excel "<Excelファイルのフルパス>"
```

### 2) 確認（Excel）
`ワークシート`（または `実行シート`）の結果を確認します。

確認ポイント:
- レイアウト判断が意図どおりか
- キーワード（宛名抽出結果）が正しいか
- 出力ファイル名に問題がないか
- 結合フラグ（`新規` / `結合`）が想定どおりか

必要に応じて `設定` シートの座標・キーワード・リネームマスタを修正し、`scan` を再実行します。

### 3) Execute（分割・出力）
確認完了後に `execute` を実行して、確定した結果に基づき分割・出力します（実装予定）。

```bash
python split_pdf.py --mode execute --excel "<Excelファイルのフルパス>"
```

> 現在の `execute` モードは未実装のため、実行しても処理は行われません。

### 現在の運用（暫定）
現時点では `scan` までを運用対象とし、判定結果の確認・調整を先行してください。

---

## Excelボタン連携（VBA）

Excelのボタンから `scan + popup` を呼び出す例です。

重要:
- ボタンは **フォームコントロール** か **図形** を使ってください（ActiveXボタンは使わない）。
- Mac版ExcelでActiveXを使うと「このコンポーネントのライセンス情報が見つかりません」エラーになることがあります。

1. Excelで `Alt + F11` を開く
2. 標準モジュールを追加
3. [excel_button_macro.bas](excel_button_macro.bas) の内容を貼り付け
4. `PYTHON_EXE` を実行環境に合わせて修正
5. ボタンに `RunScanWithPopup` を割り当て

ポイント:
- `ThisWorkbook.FullName` を使うため、開いているブックを自動で `--excel` に渡せます。
- `WScript.Shell` の `Run` を `0, False` で実行して、Excel UIをブロックしません。
- Python側の `--popup` で処理中/完了ダイアログを表示します。
- Macでは `MacScript`、Windowsでは `WScript.Shell` で非同期起動します。
