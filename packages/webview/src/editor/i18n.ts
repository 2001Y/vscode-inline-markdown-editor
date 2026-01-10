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
    delete: string;
    duplicate: string;
    copy: string;
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
}

// English translations (default)
const en: Translations = {
  placeholder: {
    paragraph: "Type '/' for commands...",
    heading: 'Heading...',
  },
  floatingMenu: {
    trigger: "Insert block (Type '/' for commands)",
    heading1: 'Heading 1',
    heading2: 'Heading 2',
    heading3: 'Heading 3',
    bulletList: 'Bullet list',
    orderedList: 'Numbered list',
    codeBlock: 'Code block',
    blockquote: 'Quote',
    table: 'Table',
    horizontalRule: 'Divider',
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
    delete: 'Delete',
    duplicate: 'Duplicate',
    copy: 'Copy',
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
};

// Japanese translations
const ja: Translations = {
  placeholder: {
    paragraph: "'/' でコマンドメニュー...",
    heading: '見出しを入力...',
  },
  floatingMenu: {
    trigger: "ブロックを挿入 ('/' でコマンド)",
    heading1: '見出し1',
    heading2: '見出し2',
    heading3: '見出し3',
    bulletList: '箇条書きリスト',
    orderedList: '番号付きリスト',
    codeBlock: 'コードブロック',
    blockquote: '引用',
    table: 'テーブル',
    horizontalRule: '区切り線',
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
    delete: '削除',
    duplicate: '複製',
    copy: 'コピー',
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
};

// Chinese translations
const zh: Translations = {
  placeholder: {
    paragraph: "输入 '/' 打开命令菜单...",
    heading: '输入标题...',
  },
  floatingMenu: {
    trigger: "插入块 (输入 '/' 打开命令)",
    heading1: '一级标题',
    heading2: '二级标题',
    heading3: '三级标题',
    bulletList: '无序列表',
    orderedList: '有序列表',
    codeBlock: '代码块',
    blockquote: '引用',
    table: '表格',
    horizontalRule: '分割线',
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
    delete: '删除',
    duplicate: '复制副本',
    copy: '复制',
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
};

const translations: Record<string, Translations> = { en, ja, zh };

// Detect user's locale
function detectLocale(): Locale {
  // Try VS Code's locale
  const htmlLang = document.documentElement.lang;
  if (htmlLang) {
    const lang = htmlLang.split('-')[0].toLowerCase();
    if (lang === 'ja') return 'ja';
    if (lang === 'zh') return 'zh';
  }

  // Try navigator.language
  const navLang = navigator.language;
  if (navLang) {
    const lang = navLang.split('-')[0].toLowerCase();
    if (lang === 'ja') return 'ja';
    if (lang === 'zh') return 'zh';
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
