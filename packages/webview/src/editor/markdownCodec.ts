/**
 * Role: Markdown <-> Tiptap document conversion
 * Responsibility: Parse Markdown to Tiptap JSON, serialize Tiptap JSON to Markdown
 * Invariant: Conversion should preserve content semantics; unknown elements become RAW blocks
 */

import { Editor } from '@tiptap/core';

export interface MarkdownCodec {
  parse(markdown: string): Record<string, unknown>;
  serialize(editor: Editor): string;
}

export function createMarkdownCodec(): MarkdownCodec {
  return {
    parse(markdown: string): Record<string, unknown> {
      const lines = markdown.split('\n');
      const content: Record<string, unknown>[] = [];
      let i = 0;

      while (i < lines.length) {
        const line = lines[i];

        if (line.startsWith('# ')) {
          content.push({
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: line.slice(2) }],
          });
          i++;
        } else if (line.startsWith('## ')) {
          content.push({
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: line.slice(3) }],
          });
          i++;
        } else if (line.startsWith('### ')) {
          content.push({
            type: 'heading',
            attrs: { level: 3 },
            content: [{ type: 'text', text: line.slice(4) }],
          });
          i++;
        } else if (line.startsWith('#### ')) {
          content.push({
            type: 'heading',
            attrs: { level: 4 },
            content: [{ type: 'text', text: line.slice(5) }],
          });
          i++;
        } else if (line.startsWith('##### ')) {
          content.push({
            type: 'heading',
            attrs: { level: 5 },
            content: [{ type: 'text', text: line.slice(6) }],
          });
          i++;
        } else if (line.startsWith('###### ')) {
          content.push({
            type: 'heading',
            attrs: { level: 6 },
            content: [{ type: 'text', text: line.slice(7) }],
          });
          i++;
        } else if (line.startsWith('```')) {
          const language = line.slice(3).trim();
          const codeLines: string[] = [];
          i++;
          while (i < lines.length && !lines[i].startsWith('```')) {
            codeLines.push(lines[i]);
            i++;
          }
          content.push({
            type: 'codeBlock',
            attrs: { language: language || null },
            content: codeLines.length > 0 ? [{ type: 'text', text: codeLines.join('\n') }] : [],
          });
          i++;
        } else if (line.startsWith('---') || line.startsWith('***') || line.startsWith('___')) {
          content.push({ type: 'horizontalRule' });
          i++;
        } else if (line.startsWith('> ')) {
          const quoteLines: string[] = [];
          while (i < lines.length && lines[i].startsWith('> ')) {
            quoteLines.push(lines[i].slice(2));
            i++;
          }
          content.push({
            type: 'blockquote',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: quoteLines.join('\n') }],
              },
            ],
          });
        } else if (line.match(/^(\*|-|\d+\.)\s/)) {
          const listItems: Record<string, unknown>[] = [];
          const isOrdered = /^\d+\./.test(line);
          while (i < lines.length && lines[i].match(/^(\*|-|\d+\.)\s/)) {
            const itemText = lines[i].replace(/^(\*|-|\d+\.)\s/, '');
            listItems.push({
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: itemText }],
                },
              ],
            });
            i++;
          }
          content.push({
            type: isOrdered ? 'orderedList' : 'bulletList',
            content: listItems,
          });
        } else if (line.trim() === '') {
          i++;
        } else {
          const paragraphContent = parseInlineContent(line);
          content.push({
            type: 'paragraph',
            content: paragraphContent,
          });
          i++;
        }
      }

      if (content.length === 0) {
        content.push({
          type: 'paragraph',
          content: [],
        });
      }

      return {
        type: 'doc',
        content,
      };
    },

    serialize(editor: Editor): string {
      const json = editor.getJSON();
      return serializeNode(json);
    },
  };
}

function parseInlineContent(text: string): Record<string, unknown>[] {
  const content: Record<string, unknown>[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) {
      content.push({
        type: 'text',
        marks: [{ type: 'bold' }],
        text: boldMatch[1],
      });
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    const italicMatch = remaining.match(/^\*(.+?)\*/);
    if (italicMatch) {
      content.push({
        type: 'text',
        marks: [{ type: 'italic' }],
        text: italicMatch[1],
      });
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    const codeMatch = remaining.match(/^`(.+?)`/);
    if (codeMatch) {
      content.push({
        type: 'text',
        marks: [{ type: 'code' }],
        text: codeMatch[1],
      });
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    const linkMatch = remaining.match(/^\[(.+?)\]\((.+?)\)/);
    if (linkMatch) {
      content.push({
        type: 'text',
        marks: [{ type: 'link', attrs: { href: linkMatch[2] } }],
        text: linkMatch[1],
      });
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    const imageMatch = remaining.match(/^!\[(.+?)\]\((.+?)\)/);
    if (imageMatch) {
      content.push({
        type: 'image',
        attrs: { src: imageMatch[2], alt: imageMatch[1] },
      });
      remaining = remaining.slice(imageMatch[0].length);
      continue;
    }

    const nextSpecial = remaining.search(/(\*\*|\*|`|\[|!\[)/);
    if (nextSpecial === -1) {
      if (remaining.length > 0) {
        content.push({ type: 'text', text: remaining });
      }
      break;
    } else if (nextSpecial === 0) {
      content.push({ type: 'text', text: remaining[0] });
      remaining = remaining.slice(1);
    } else {
      content.push({ type: 'text', text: remaining.slice(0, nextSpecial) });
      remaining = remaining.slice(nextSpecial);
    }
  }

  if (content.length === 0) {
    return [];
  }

  return content;
}

function serializeNode(node: Record<string, unknown>): string {
  const type = node.type as string;
  const content = node.content as Record<string, unknown>[] | undefined;
  const attrs = node.attrs as Record<string, unknown> | undefined;

  switch (type) {
    case 'doc':
      return content?.map(serializeNode).join('\n\n') || '';

    case 'paragraph':
      return content?.map(serializeInline).join('') || '';

    case 'heading': {
      const level = (attrs?.level as number) || 1;
      const prefix = '#'.repeat(level) + ' ';
      const text = content?.map(serializeInline).join('') || '';
      return prefix + text;
    }

    case 'codeBlock': {
      const language = (attrs?.language as string) || '';
      const code = content?.map((n) => (n.text as string) || '').join('') || '';
      return '```' + language + '\n' + code + '\n```';
    }

    case 'blockquote': {
      const inner = content?.map(serializeNode).join('\n') || '';
      return inner.split('\n').map((line) => '> ' + line).join('\n');
    }

    case 'bulletList':
      return content?.map((item) => {
        const itemContent = (item.content as Record<string, unknown>[])
          ?.map(serializeNode)
          .join('') || '';
        return '- ' + itemContent;
      }).join('\n') || '';

    case 'orderedList':
      return content?.map((item, index) => {
        const itemContent = (item.content as Record<string, unknown>[])
          ?.map(serializeNode)
          .join('') || '';
        return `${index + 1}. ` + itemContent;
      }).join('\n') || '';

    case 'listItem':
      return content?.map(serializeNode).join('') || '';

    case 'horizontalRule':
      return '---';

    case 'image': {
      const src = (attrs?.src as string) || '';
      const alt = (attrs?.alt as string) || '';
      return `![${alt}](${src})`;
    }

    case 'hardBreak':
      return '  \n';

    default:
      return content?.map(serializeNode).join('') || '';
  }
}

function serializeInline(node: Record<string, unknown>): string {
  const type = node.type as string;
  const text = node.text as string | undefined;
  const marks = node.marks as Record<string, unknown>[] | undefined;
  const attrs = node.attrs as Record<string, unknown> | undefined;

  if (type === 'image') {
    const src = (attrs?.src as string) || '';
    const alt = (attrs?.alt as string) || '';
    return `![${alt}](${src})`;
  }

  if (type === 'hardBreak') {
    return '  \n';
  }

  if (!text) {
    return '';
  }

  let result = text;

  if (marks) {
    for (const mark of marks) {
      const markType = mark.type as string;
      switch (markType) {
        case 'bold':
          result = `**${result}**`;
          break;
        case 'italic':
          result = `*${result}*`;
          break;
        case 'code':
          result = `\`${result}\``;
          break;
        case 'link': {
          const href = (mark.attrs as Record<string, unknown>)?.href as string || '';
          result = `[${result}](${href})`;
          break;
        }
        case 'strike':
          result = `~~${result}~~`;
          break;
      }
    }
  }

  return result;
}
