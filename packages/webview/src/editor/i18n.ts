/**
 * i18n (Internationalization) Module
 * Provides localized strings for Japanese, English, and Chinese
 *
 * Language detection priority:
 * 1. VS Code's display language (from document.documentElement.lang)
 * 2. navigator.language (browser default)
 * 3. Fallback to 'en'
 */

export type Locale = 'en' | 'ja' | 'zh';

export interface Translations {
  placeholder: {
    paragraph: string;
    heading: string;
  };
  findWidget: {
    findPlaceholder: string;
    replacePlaceholder: string;
    toggleReplace: string;
    matchCase: string;
    wholeWord: string;
    regex: string;
    selection: string;
    preserveCase: string;
    findPrevious: string;
    findNext: string;
    close: string;
    replace: string;
    replaceAll: string;
    status: {
      invalidRegex: string;
      noSelection: string;
      enterSearchTerm: string;
      noMatches: string;
      noMatchesToReplace: string;
      preserveCaseDisabled: string;
    };
  };
  floatingMenu: {
    trigger: string;
    heading1: string;
    heading2: string;
    heading3: string;
    bulletList: string;
    orderedList: string;
    codeBlock: string;
    blockquote: string;
    table: string;
    horizontalRule: string;
    nestedPage: string;
  };
  slashCommand: {
    heading1: string;
    heading1Desc: string;
    heading2: string;
    heading2Desc: string;
    heading3: string;
    heading3Desc: string;
    bulletList: string;
    bulletListDesc: string;
    orderedList: string;
    orderedListDesc: string;
    codeBlock: string;
    codeBlockDesc: string;
    blockquote: string;
    blockquoteDesc: string;
    table: string;
    tableDesc: string;
    horizontalRule: string;
    horizontalRuleDesc: string;
  };
  blockHandles: {
    addBlockBelow: string;
    dragHandle: string;
    delete: string;
    duplicate: string;
    copy: string;
    indent: string;
    outdent: string;
    plainText: string;
    done: string;
    convertTo: string;
    paragraph: string;
    heading1: string;
    heading2: string;
    heading3: string;
    bulletList: string;
    orderedList: string;
    codeBlock: string;
    blockquote: string;
  };
  tableControls: {
    addRow: string;
    addColumn: string;
    addRowBefore: string;
    addRowAfter: string;
    addColumnBefore: string;
    addColumnAfter: string;
    dragRow: string;
    dragColumn: string;
  };
  nestedPage: {
    defaultTitle: string;
  };
  preview: {
    show: string;
    edit: string;
  };
}

// English translations (default)
const en: Translations = {
  placeholder: {
    paragraph: "Type '/' to select block type",
    heading: 'Heading...',
  },
  findWidget: {
    findPlaceholder: 'Find',
    replacePlaceholder: 'Replace',
    toggleReplace: 'Toggle Replace',
    matchCase: 'Match Case',
    wholeWord: 'Match Whole Word',
    regex: 'Use Regular Expression',
    selection: 'Find in Selection',
    preserveCase: 'Preserve Case',
    findPrevious: 'Find Previous',
    findNext: 'Find Next',
    close: 'Close',
    replace: 'Replace',
    replaceAll: 'Replace All',
    status: {
      invalidRegex: 'Invalid regular expression',
      noSelection: 'No selection to search within',
      enterSearchTerm: 'Enter a search term',
      noMatches: 'No matches',
      noMatchesToReplace: 'No matches to replace',
      preserveCaseDisabled: 'Preserve case is disabled for regex',
    },
  },
  floatingMenu: {
    trigger: "Insert block (Type '/' to select block type)",
    heading1: 'Heading 1',
    heading2: 'Heading 2',
    heading3: 'Heading 3',
    bulletList: 'Bullet list',
    orderedList: 'Numbered list',
    codeBlock: 'Code block',
    blockquote: 'Quote',
    table: 'Table',
    horizontalRule: 'Divider',
    nestedPage: 'Nested page',
  },
  slashCommand: {
    heading1: 'Heading 1',
    heading1Desc: 'Large heading',
    heading2: 'Heading 2',
    heading2Desc: 'Medium heading',
    heading3: 'Heading 3',
    heading3Desc: 'Small heading',
    bulletList: 'Bullet list',
    bulletListDesc: 'Create a bullet list',
    orderedList: 'Numbered list',
    orderedListDesc: 'Create a numbered list',
    codeBlock: 'Code block',
    codeBlockDesc: 'Insert code block',
    blockquote: 'Quote',
    blockquoteDesc: 'Insert quote block',
    table: 'Table',
    tableDesc: 'Insert 3x3 table',
    horizontalRule: 'Divider',
    horizontalRuleDesc: 'Insert divider line',
  },
  blockHandles: {
    addBlockBelow: 'Add block below',
    dragHandle: 'Drag to move / click for menu',
    delete: 'Delete',
    duplicate: 'Duplicate',
    copy: 'Copy',
    indent: 'Indent',
    outdent: 'Outdent',
    plainText: 'Edit as plain text',
    done: 'Done',
    convertTo: 'Convert to',
    paragraph: 'Text',
    heading1: 'Heading 1',
    heading2: 'Heading 2',
    heading3: 'Heading 3',
    bulletList: 'Bullet list',
    orderedList: 'Numbered list',
    codeBlock: 'Code',
    blockquote: 'Quote',
  },
  tableControls: {
    addRow: 'Add row',
    addColumn: 'Add column',
    addRowBefore: 'Add row above',
    addRowAfter: 'Add row below',
    addColumnBefore: 'Add column left',
    addColumnAfter: 'Add column right',
    dragRow: 'Drag to move row',
    dragColumn: 'Drag to move column',
  },
  nestedPage: {
    defaultTitle: 'New Page',
  },
  preview: {
    show: 'Preview',
    edit: 'Edit',
  },
};

// Japanese translations
const ja: Translations = {
  placeholder: {
    paragraph: "'/' でブロックタイプを選択",
    heading: '見出しを入力...',
  },
  findWidget: {
    findPlaceholder: '検索',
    replacePlaceholder: '置換',
    toggleReplace: '置換の切り替え',
    matchCase: '大文字と小文字を区別',
    wholeWord: '単語単位で検索',
    regex: '正規表現を使用',
    selection: '選択範囲内を検索',
    preserveCase: '大文字小文字を保持',
    findPrevious: '前を検索',
    findNext: '次を検索',
    close: '閉じる',
    replace: '置換',
    replaceAll: 'すべて置換',
    status: {
      invalidRegex: '無効な正規表現です',
      noSelection: '選択範囲がありません',
      enterSearchTerm: '検索語を入力してください',
      noMatches: '一致がありません',
      noMatchesToReplace: '置換する一致がありません',
      preserveCaseDisabled: '正規表現では大文字小文字の保持は無効です',
    },
  },
  floatingMenu: {
    trigger: "ブロックを挿入 ('/' でブロックタイプを選択)",
    heading1: '見出し1',
    heading2: '見出し2',
    heading3: '見出し3',
    bulletList: '箇条書きリスト',
    orderedList: '番号付きリスト',
    codeBlock: 'コードブロック',
    blockquote: '引用',
    table: 'テーブル',
    horizontalRule: '区切り線',
    nestedPage: 'ネストページ',
  },
  slashCommand: {
    heading1: '見出し1',
    heading1Desc: '大きな見出し',
    heading2: '見出し2',
    heading2Desc: '中サイズの見出し',
    heading3: '見出し3',
    heading3Desc: '小さな見出し',
    bulletList: '箇条書きリスト',
    bulletListDesc: '箇条書きリストを作成',
    orderedList: '番号付きリスト',
    orderedListDesc: '番号付きリストを作成',
    codeBlock: 'コードブロック',
    codeBlockDesc: 'コードブロックを挿入',
    blockquote: '引用',
    blockquoteDesc: '引用ブロックを挿入',
    table: 'テーブル',
    tableDesc: '3x3 テーブルを挿入',
    horizontalRule: '区切り線',
    horizontalRuleDesc: '区切り線を挿入',
  },
  blockHandles: {
    addBlockBelow: '下にブロックを追加',
    dragHandle: 'ドラッグで移動 / クリックでメニュー',
    delete: '削除',
    duplicate: '複製',
    copy: 'コピー',
    indent: 'インデント',
    outdent: 'インデント解除',
    plainText: 'プレーンテキストで編集',
    done: '完了',
    convertTo: '変換',
    paragraph: 'テキスト',
    heading1: '見出し1',
    heading2: '見出し2',
    heading3: '見出し3',
    bulletList: '箇条書き',
    orderedList: '番号リスト',
    codeBlock: 'コード',
    blockquote: '引用',
  },
  tableControls: {
    addRow: '行を追加',
    addColumn: '列を追加',
    addRowBefore: '上に行を追加',
    addRowAfter: '下に行を追加',
    addColumnBefore: '左に列を追加',
    addColumnAfter: '右に列を追加',
    dragRow: 'ドラッグで行を移動',
    dragColumn: 'ドラッグで列を移動',
  },
  nestedPage: {
    defaultTitle: '新規ページ',
  },
  preview: {
    show: 'プレビュー',
    edit: '編集',
  },
};

// Chinese translations
const zh: Translations = {
  placeholder: {
    paragraph: "输入 '/' 选择块类型",
    heading: '输入标题...',
  },
  findWidget: {
    findPlaceholder: '查找',
    replacePlaceholder: '替换',
    toggleReplace: '切换替换',
    matchCase: '区分大小写',
    wholeWord: '匹配整个单词',
    regex: '使用正则表达式',
    selection: '在选区中查找',
    preserveCase: '保持大小写',
    findPrevious: '查找上一个',
    findNext: '查找下一个',
    close: '关闭',
    replace: '替换',
    replaceAll: '全部替换',
    status: {
      invalidRegex: '正则表达式无效',
      noSelection: '没有可搜索的选区',
      enterSearchTerm: '请输入搜索词',
      noMatches: '没有匹配项',
      noMatchesToReplace: '没有可替换的匹配项',
      preserveCaseDisabled: '正则表达式下无法保持大小写',
    },
  },
  floatingMenu: {
    trigger: "插入块 (输入 '/' 选择块类型)",
    heading1: '一级标题',
    heading2: '二级标题',
    heading3: '三级标题',
    bulletList: '无序列表',
    orderedList: '有序列表',
    codeBlock: '代码块',
    blockquote: '引用',
    table: '表格',
    horizontalRule: '分割线',
    nestedPage: '嵌套页面',
  },
  slashCommand: {
    heading1: '一级标题',
    heading1Desc: '大标题',
    heading2: '二级标题',
    heading2Desc: '中标题',
    heading3: '三级标题',
    heading3Desc: '小标题',
    bulletList: '无序列表',
    bulletListDesc: '创建无序列表',
    orderedList: '有序列表',
    orderedListDesc: '创建有序列表',
    codeBlock: '代码块',
    codeBlockDesc: '插入代码块',
    blockquote: '引用',
    blockquoteDesc: '插入引用块',
    table: '表格',
    tableDesc: '插入 3x3 表格',
    horizontalRule: '分割线',
    horizontalRuleDesc: '插入分割线',
  },
  blockHandles: {
    addBlockBelow: '在下方添加块',
    dragHandle: '拖动移动 / 点击菜单',
    delete: '删除',
    duplicate: '复制副本',
    copy: '复制',
    indent: '增加缩进',
    outdent: '减少缩进',
    plainText: '纯文本编辑',
    done: '完成',
    convertTo: '转换为',
    paragraph: '文本',
    heading1: '一级标题',
    heading2: '二级标题',
    heading3: '三级标题',
    bulletList: '无序列表',
    orderedList: '有序列表',
    codeBlock: '代码',
    blockquote: '引用',
  },
  tableControls: {
    addRow: '添加行',
    addColumn: '添加列',
    addRowBefore: '在上方添加行',
    addRowAfter: '在下方添加行',
    addColumnBefore: '在左侧添加列',
    addColumnAfter: '在右侧添加列',
    dragRow: '拖动以移动行',
    dragColumn: '拖动以移动列',
  },
  nestedPage: {
    defaultTitle: '新建页面',
  },
  preview: {
    show: '预览',
    edit: '编辑',
  },
};

const translations: Record<string, Translations> = { en, ja, zh };

// Detect user's locale
function detectLocale(): Locale {
  // Try VS Code's locale
  const htmlLang = document.documentElement.lang;
  if (htmlLang) {
    const lang = htmlLang.split('-')[0].toLowerCase();
    if (lang === 'ja') {return 'ja';}
    if (lang === 'zh') {return 'zh';}
  }

  // Try navigator.language
  const navLang = navigator.language;
  if (navLang) {
    const lang = navLang.split('-')[0].toLowerCase();
    if (lang === 'ja') {return 'ja';}
    if (lang === 'zh') {return 'zh';}
  }

  return 'en';
}

let currentLocale: Locale | null = null;

export function getLocale(): Locale {
  if (!currentLocale) {
    currentLocale = detectLocale();
  }
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function t(): Translations {
  return translations[getLocale()] || translations.en;
}
