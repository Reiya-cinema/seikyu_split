# Railwayへのデプロイ手順

このプロジェクトはRailwayにデプロイする準備が整っています。以下の手順でデプロイを行ってください。

## 1. GitHubリポジトリの作成とプッシュ

まず、端末で以下のコマンドを実行してGitHubに認証します（まだの場合）。
```bash
gh auth login
```

認証が完了したら、以下のコマンドでリポジトリを作成し、コードをプッシュします。
```bash
# リポジトリを新規作成（publicまたはprivateを選択）
gh repo create seikyu_split --public --source=. --remote=origin

# コードをプッシュ
git push -u origin main
```

## 2. Railwayでプロジェクトを作成

1. [Railway Dashboard](https://railway.app/dashboard) にアクセスします。
2. 「New Project」をクリックし、「Deploy from GitHub repo」を選択します。
3. 先ほど作成した `seikyu_split` リポジトリを選択します。
4. "Variables" (環境変数) の設定は特に不要ですが、以下を設定すると便利です：
   - `PORT`: 8000 (通常は自動設定されます)
   - `DATABASE_URL`: （PostgreSQLアドオンを追加する場合）

## 3. 動作確認

デプロイが完了すると、RailwayからURLが発行されます。
そのURLにアクセスして、アプリケーションが表示されるか確認してください。

## 注意事項

- **データベース**: 現在の設定ではSQLiteを使用しています。Railwayの再デプロイ時にデータ（保存したレイアウト設定）がリセットされる可能性があります。永続化したい場合はRailwayでVolumeを追加し、保存先を変更する必要があります。
- **ビルド時間**: 初回のビルドには数分かかる場合があります（Frontendのビルドが含まれるため）。
