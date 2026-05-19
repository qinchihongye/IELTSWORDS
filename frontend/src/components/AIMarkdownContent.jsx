import React, { useMemo } from 'react';
import MarkdownIt from 'markdown-it';
import './AIMarkdownContent.css';

const MARKDOWN = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
});

const defaultLinkOpen = MARKDOWN.renderer.rules.link_open
  || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

MARKDOWN.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  token.attrSet('target', '_blank');
  token.attrSet('rel', 'noreferrer noopener');
  return defaultLinkOpen(tokens, idx, options, env, self);
};

MARKDOWN.renderer.rules.table_open = () => '<div class="ai-markdown__table-wrap"><table>';
MARKDOWN.renderer.rules.table_close = () => '</table></div>';

const BLOCK_LABEL_PATTERN = /^(?:例句|示例|Example|Sentence|译文|翻译|释义|Translation|Meaning|用法|提示|说明|Note|Usage)[：:]/i;
const EXAMPLE_START_PATTERN = /^(?:例句|示例|Example|Sentence)[：:]/i;
const TABLE_ALIGNMENT_PATTERN = /^:?-{3,}:?$/;

const extractTableCells = (line = '') => (
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
);

const isTableAlignmentLine = (line = '') => {
  const cells = extractTableCells(line);
  return cells.length > 0 && cells.every((cell) => TABLE_ALIGNMENT_PATTERN.test(cell));
};

const isTableRow = (line = '') => {
  const trimmed = line.trim();
  if (!trimmed.includes('|') || isTableAlignmentLine(trimmed)) {
    return false;
  }
  return extractTableCells(trimmed).length >= 2;
};

const addTableSpacing = (content = '') => {
  const lines = content.split('\n');
  const output = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const previousLine = output[output.length - 1] || '';
    const nextLine = lines[index + 1]?.trim() || '';
    const startsTable = isTableRow(trimmed) && isTableAlignmentLine(nextLine);

    if (startsTable && previousLine.trim()) {
      output.push('');
    }

    output.push(line);

    const currentIsTablePart = isTableRow(trimmed) || isTableAlignmentLine(trimmed);
    const nextIsTablePart = isTableRow(nextLine) || isTableAlignmentLine(nextLine);

    if (currentIsTablePart && !nextIsTablePart && nextLine) {
      output.push('');
    }
  });

  return output.join('\n').replace(/\n{3,}/g, '\n\n');
};

const normalizeMarkdown = (content = '') => {
  let text = String(content || '').replace(/\r\n/g, '\n').trim();

  if (!text) {
    return '';
  }

  text = text.replace(/＃/g, '#').replace(/＞/g, '>');
  text = text.replace(/[ \t]+\n/g, '\n');
  text = text.replace(/([^\n])```/g, '$1\n```');
  text = text.replace(/([^\n])\s*(#{1,6})(?=[^#\s])/g, '$1\n$2 ');
  text = text.replace(/^(\s*#{1,6})(?=[^#\s])/gm, '$1 ');
  text = text.replace(/([^\n])\s*(>\s*)(?=\S)/g, '$1\n> ');
  text = text.replace(/^(\s*)(?:[•●▪◦‣]\s*){2,}/gm, '$1- ');
  text = text.replace(/([^\n])\s+[•●▪◦‣]\s+/g, '$1\n- ');
  text = text.replace(/^(\s*)[•●▪◦‣]\s+/gm, '$1- ');
  text = text.replace(/^(\s*\d+)\)\s+/gm, '$1. ');
  text = text.replace(/^(\s*[-*+])(\S)/gm, '$1 $2');
  text = text.replace(/^(\s*\d+\.)(\S)/gm, '$1 $2');
  text = addTableSpacing(text);
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
};

const normalizeExampleBlocks = (content = '') => {
  const blocks = content.split(/\n{2,}/);

  return blocks
    .map((block) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      if (!lines.length || !lines.some((line) => EXAMPLE_START_PATTERN.test(line))) {
        return block;
      }

      const isExampleBlock = lines.every((line) => BLOCK_LABEL_PATTERN.test(line));
      if (!isExampleBlock) {
        return block;
      }

      return ['> **例句卡片**', ...lines.map((line) => `> ${line}`)].join('\n');
    })
    .join('\n\n');
};

const prepareMarkdown = (content = '') => normalizeExampleBlocks(normalizeMarkdown(content));

const toneVars = {
  default: {
    text: '#1f2937',
    muted: '#64748b',
    border: 'rgba(148, 163, 184, 0.18)',
    panel: 'rgba(255, 255, 255, 0.84)',
    panelStrong: 'rgba(248, 250, 252, 0.96)',
    codeBg: 'rgba(15, 23, 42, 0.06)',
    codeBorder: 'rgba(148, 163, 184, 0.22)',
    quoteBg: 'rgba(99, 102, 241, 0.06)',
    quoteBorder: 'rgba(99, 102, 241, 0.22)',
    tableHead: 'rgba(15, 23, 42, 0.04)',
  },
  subtle: {
    text: '#334155',
    muted: '#64748b',
    border: 'rgba(148, 163, 184, 0.18)',
    panel: 'rgba(255, 255, 255, 0.78)',
    panelStrong: 'rgba(255, 255, 255, 0.9)',
    codeBg: 'rgba(255, 255, 255, 0.74)',
    codeBorder: 'rgba(148, 163, 184, 0.2)',
    quoteBg: 'rgba(255, 255, 255, 0.84)',
    quoteBorder: 'rgba(99, 102, 241, 0.18)',
    tableHead: 'rgba(255, 255, 255, 0.8)',
  },
};

const AIMarkdownContent = ({ content = '', tone = 'default', compact = false }) => {
  const colorTone = toneVars[tone] ? tone : 'default';

  const html = useMemo(() => {
    const prepared = prepareMarkdown(content);
    return prepared ? MARKDOWN.render(prepared) : '';
  }, [content]);

  if (!html) {
    return null;
  }

  return (
    <div
      className={`ai-markdown ai-markdown--${colorTone}${compact ? ' ai-markdown--compact' : ''}`}
      style={{
        '--ai-md-text': toneVars[colorTone].text,
        '--ai-md-muted': toneVars[colorTone].muted,
        '--ai-md-border': toneVars[colorTone].border,
        '--ai-md-panel': toneVars[colorTone].panel,
        '--ai-md-panel-strong': toneVars[colorTone].panelStrong,
        '--ai-md-code-bg': toneVars[colorTone].codeBg,
        '--ai-md-code-border': toneVars[colorTone].codeBorder,
        '--ai-md-quote-bg': toneVars[colorTone].quoteBg,
        '--ai-md-quote-border': toneVars[colorTone].quoteBorder,
        '--ai-md-table-head': toneVars[colorTone].tableHead,
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export default AIMarkdownContent;
