/**
 * Japanese interface strings.
 *
 * A file-backed locale: a flat {key: string} map layered over English. Any key
 * absent here falls back to the English string, which is why a locale does not
 * have to be complete to be useful — and why the picker labels this one
 * "partial" rather than letting the user find out by hitting an English
 * sentence in the middle of a Japanese pane.
 *
 * Adding another language is exactly this: copy the file, translate, and add
 * one line to LOCALES in ../i18n.js. No pane changes.
 *
 * Covered here: the chrome and the panes an annotator reads constantly —
 * toolbar, pane titles, the annotation tree, the assistant, the dialogue,
 * settings. Not covered: the long-tail error and log messages.
 */

export default {
  /* common */
  'common.close': '閉じる',
  'common.save': '保存',
  'common.cancel': 'キャンセル',
  'common.connect': '接続',
  'common.disconnect': '切断',
  'common.select': '選択',
  'common.none': '（なし）',
  'common.notLoaded': '文書が読み込まれていません',
  'common.loading': '読み込み中…',

  /* toolbar */
  'app.title': 'AI アノテーション作業台',
  'toolbar.format': '形式',
  'toolbar.document': '文書',
  'toolbar.import': '読み込み ▾',
  'toolbar.export': '書き出し ▾',
  'toolbar.studio': '形式ジェネレーター',
  'toolbar.mode': 'モード',
  'toolbar.log': 'ログ',
  'toolbar.settings': '設定',
  'toolbar.lang': '言語',
  'toolbar.langTitle': '表示言語を切り替える',
  'lang.partial': '一部のみ翻訳。残りは英語で表示されます',
  'mode.replay': 'replay（記録の再生 / デモ）',
  'mode.live': 'live（モデルを実際に呼ぶ）',
  'menu.localFile': 'ローカルファイル（.json / .txt / .umr）',
  'menu.sampleLabel': 'テスト用：Drive からの未注釈ファイル読み込みを模擬',
  'menu.sampleEn': 'サンプル文書（英語・未注釈）',
  'menu.sampleZh': 'サンプル文書（中国語・未注釈）',
  'menu.sampleWiki': 'Wikipedia サンプル（英語・未注釈）',
  'menu.exportDoc': '注釈 JSON を書き出す',
  'menu.exportProposals': 'skill 更新提案を書き出す',

  /* panes */
  'pane.source': '原文',
  'pane.annotated': '注釈済み',
  'pane.assistant': 'AI アシスタント',
  'pane.sourceGloss': '',
  'pane.annotatedGloss': '',
  'pane.assistantGloss': 'skill call',
  'pane.chat': '対話 · 根拠のすり合わせ',
  'panes.legend': '凡例',
  'panes.serialHint': '直列：一段ずつ展開します。未実行の行をクリックして注釈してください',
  'panes.parallelHint': '並列：スキルは独立しているので、どの順でも実行できます',
  'panes.artifactView': '成果ビュー',
  'panes.treeTitle': '注釈ツリー（各ノード = skill 呼び出し 1 回）',
  'panes.sentenceDone': '✓ この文は完了',
  'panes.callCount': '{n} 回の呼び出し',
  'panes.sentences': '文',
  'prov.replay': '実験記録の再生',
  'prov.imported': '読み込み済み · 未注釈',
  'prov.authored': 'サンプルデータ',

  /* coverage back-check */
  'cov.title': 'カバー率の逆検証',
  'cov.summary': 'カバー {covered} / 妥当な省略 {dropped} / 欠落 {lost}',
  'cov.lostIntro': 'どのノードにも対応していない原文中の内容語：',
  'cov.flagTitle': 'この手順が扱っていない語：{lost}',

  /* tree */
  'kind.discourse': '談話関係（最初の手順）',
  'kind.clause': '節',
  'kind.np': '名詞句',
  'kind.special': '固有表現',
  'kind.atomic': '原子概念',
  'kind.reentrancy': '共参照の解消',
  'kind.doc_level': '文書レベル注釈',
  'tree.empty': 'この文にはまだ skill 呼び出しがありません',
  'tree.pending': '未実行',
  'tree.running': '実行中…',
  'tree.blocked': '別の手順が実行中です。お待ちください',
  'tree.clickToRun': 'クリックで {skill} を実行',
  'tree.edited': '人手で修正済み',
  'tree.atomicHint': '（コードで判定。モデル呼び出しなし）',
  'tree.srcRule': 'コードの規則で判定。モデルは呼んでいません',
  'tree.runFailed': '注釈に失敗しました：{err}',

  /* assistant */
  'assist.empty': '中央のツリーで「未実行」の行をクリックして注釈するか、完了したノードをクリックして入力・出力・根拠を確認してください。',
  'assist.noResult': 'この手順にはまだ結果がありません。',
  'assist.skillFile': 'スキル定義：{file}',
  'assist.span': '対象範囲 (span)',
  'assist.input': '入力 (input)',
  'assist.output': '出力 (output)',
  'assist.outputEdited': ' — 人手で修正済み',
  'assist.rationale': 'モデルの判断根拠 (rationale)',
  'assist.srcRule': 'コードの規則（モデル呼び出しなし）',
  'assist.editSection': '人手で修正',
  'assist.saveEdit': '修正を保存',
  'assist.revert': '元に戻す',
  'assist.reverted': 'モデルの出力に戻しました',
  'assist.jsonError': 'JSON の解析に失敗しました：',

  /* human edits */
  'edits.tabPenman': 'Penman',
  'edits.tabJson': 'JSON',
  'edits.savedShown': '保存しました —— 右の「注釈済み」に反映されています',
  'edits.applied': '人手の修正を採用しました：{skill} · {span}',
  'edits.reverted': 'モデルの出力に戻しました：{skill} · {span}',

  /* chat */
  'chat.scopeNode': '対象：',
  'chat.scopeGeneral': 'ノード未選択 — 文書全体についての対話です',
  'chat.emptyNode': 'このノードにはまだ対話がありません。判断を変えるべき理由を書いてください。モデルの根拠と突き合わせて skill 更新提案を作ります。',
  'chat.send': '送信',
  'chat.otherThreads': '他のノードの対話：',
  'chat.applyToSkill': 'スキルファイルに適用',
  'chat.exportMd': '.md で書き出す',

  /* settings */
  'settings.title': '設定',
  'settings.apiKeys': 'API キー',
  'settings.apiKey': 'API キー',
  'settings.model': 'モデル',
  'settings.githubToken': 'Personal Access Token',
  'settings.driveTitle': 'Google Drive',
  'settings.savedDrive': 'Drive の設定を保存しました',
  'settings.savedGithub': 'GitHub トークンを保存しました',
};
