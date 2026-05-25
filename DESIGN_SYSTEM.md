# デザインシステム & UIガイドライン - 京豊DX Tool開発

このドキュメントは、今後のツール開発において一貫した高品質なデザインとUIを実現するためのガイドラインです。新たなプロジェクトを開始する際、AIアシスタントにこのファイルを読み込ませることで、既存のツール（請求書分割ツール）と同じトーン＆マナーで効率的にUIを構築できます。

## 1. デザイン原則 (Design Principles)

*   **Clean & Modern**: 余白を十分に取った、フラットで現代的なデザイン。
*   **Professional Trust**: 業務ツールとしての信頼感を醸成する、落ち着いた配色と堅実なコンポーネント。
*   **Interactive & Responsive**: ユーザーの操作に対する明確なフィードバック（ホバー効果、ローディング、完了通知）の実装。
*   **Tailwind CSS First**: すべてのスタイリングは `Tailwind CSS` のユーティリティクラスで行う。

## 2. カラーパレット (Color Palette)

### Primary Colors (Indigo)
メインのアクションボタン、アクティブなタブ、強調表示に使用。
*   `bg-indigo-600` (Main Actions)
*   `text-indigo-600` (Active Text)
*   `bg-indigo-50` (Light Backgrounds, Active List Items)
*   `border-indigo-200` (Subtle Borders)

### Neutral Colors (Slate)
テキスト、背景、境界線などのベースカラー。
*   `bg-slate-50` (App Background)
*   `text-slate-900` (Headings)
*   `text-slate-700` (Body Text)
*   `text-slate-500` (Secondary Text, Hints)
*   `border-slate-200` (Separators, Cards)

### Feedback Colors
*   **Success**: `text-emerald-600`, `bg-emerald-50` (完了、成功、Check Icon)
*   **Error/Danger**: `text-red-600`, `bg-red-50` (エラー、削除、Staging環境表示)
*   **Warning**: `text-amber-600` (注意)

## 3. コンポーネント (Components)

### カード (Cards)
コンテンツをまとめる基本単位。
```jsx
<div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
  {/* Content */}
</div>
```

### ボタン (Buttons)
#### Primary Button
```jsx
<button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg shadow-sm shadow-indigo-200 transition-all flex items-center gap-2">
  <Icon className="w-4 h-4" />
  <span>実行する</span>
</button>
```

#### Secondary / Ghost Button
```jsx
<button className="text-slate-500 hover:text-slate-700 px-4 py-2 text-sm font-medium flex items-center gap-2 hover:bg-slate-100 rounded-lg transition-colors">
  キャンセル
</button>
```

### ナビゲーションバー (Navbar)
```jsx
<nav className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between shadow-sm sticky top-0 z-10">
  <div className="flex items-center gap-2">
    <div className="bg-indigo-600 text-white p-1.5 rounded-lg">
      <AppIcon className="w-5 h-5" />
    </div>
    <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 to-indigo-500">
      アプリタイトル
    </span>
  </div>
</nav>
```

### タブ (Tabs)
`@radix-ui/react-tabs` を使用し、下線アニメーションを伴うスタイル。
```jsx
<Tabs.Trigger 
  className={cn(
    "pb-3 px-1 text-sm font-medium transition-all duration-200 border-b-2 flex items-center gap-2 outline-none",
    isActive ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-800"
  )}
>
  タブ名
</Tabs.Trigger>
```

## 4. テクニカルスタック (Tech Stack)

以下のライブラリ構成を標準とします。

*   **Framework**: React (Vite)
*   **Styling**: Tailwind CSS, `clsx`, `tailwind-merge` (for dynamic class handling)
*   **Icons**: `lucide-react` (統一された細いラインのアイコンセット)
*   **UI Primitives**: `@radix-ui` (Tabs, Dialogs等、アクセシビリティ対応のヘッドレスUI)
*   **Drag & Drop**: 標準HTML5 API または `dnd-kit` (軽量なライブラリ)
*   **HTTP Client**: Axios

## 5. 開発時の指示プロンプト例

新しいアプリを開発する際、AIに対して以下のプロンプトを使用してください。

> 「既存の『DESIGN_SYSTEM.md』に従ってデザインとフロントエンドの実装を行ってください。
> スタイリングはTailwind CSSを使用し、配色はIndigo/Slateをベースにします。
> UIコンポーネントはカードとシャドウを活用したモダンなデザインで、アイコンにはLucide Reactを使用してください。」

このガイドラインに従うことで、統一感のある洗練されたDXツール群を効率的に開発できます。
