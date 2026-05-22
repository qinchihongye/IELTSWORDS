import React, { useMemo } from 'react';
import MarkdownIt from 'markdown-it';
import katex from 'katex';
import 'katex/dist/katex.min.css';
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

// Helper to detect if a string looks like math/LaTeX
const looksLikeMath = (str) => {
  const trimmed = str.trim();
  if (trimmed.startsWith('$') && trimmed.endsWith('$') && trimmed.length > 2) {
    return true;
  }
  if (/\\(?:[a-zA-Z]+|[,;!])/.test(trimmed)) {
    return true;
  }
  if (/\^/.test(trimmed)) {
    return true;
  }
  if (/\b[a-zA-Z]_[a-zA-Z0-9]\b/.test(trimmed) || /_[0-9]+/.test(trimmed) || /_\{.*?\}/.test(trimmed)) {
    return true;
  }
  return false;
};

const defaultCodeInline = MARKDOWN.renderer.rules.code_inline
  || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

MARKDOWN.renderer.rules.code_inline = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const content = token.content;

  if (looksLikeMath(content)) {
    try {
      const cleanContent = content.replace(/^\$/, '').replace(/\$$/, '');
      return katex.renderToString(cleanContent, { displayMode: false, throwOnError: false });
    } catch (e) {
      console.error('KaTeX inline rule error:', e);
    }
  }
  return defaultCodeInline(tokens, idx, options, env, self);
};

const defaultFence = MARKDOWN.renderer.rules.fence
  || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

MARKDOWN.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const lang = (token.info || '').trim().toLowerCase();
  const content = token.content;

  const isMathBlock = lang === 'math' || lang === 'latex' || looksLikeMath(content) || /\\(?:frac|sqrt|pm|int|sum|alpha|beta|gamma|theta|omega|pi|partial|nabla|infty|times|div|approx|neq|le|ge|rightarrow|leftarrow|to|bar|hat|tilde)/.test(content);

  if (isMathBlock) {
    try {
      return katex.renderToString(content.trim(), { displayMode: true, throwOnError: false });
    } catch (e) {
      console.error('KaTeX block rule error:', e);
    }
  }
  return defaultFence(tokens, idx, options, env, self);
};

const BLOCK_LABEL_PATTERN = /^(?:例句|示例|Example|Sentence|译文|翻译|释义|Translation|Meaning|用法|提示|说明|Note|Usage)[：:]/i;
const EXAMPLE_START_PATTERN = /^(?:例句|示例|Example|Sentence)[：:]/i;
const TABLE_ALIGNMENT_PATTERN = /^:?-{3,}:?$/;
const SOURCE_SECTION_HEADING_PATTERN = /^(?:#{1,6}\s*)?(?:\*\*)?\s*(?:来源|参考来源|资料来源|Sources|References|Source)\s*(?:[：:])?\s*(?:\*\*)?\s*$/i;
const SOURCE_SECTION_EVIDENCE_PATTERN = /(?:\[\d+\]|\]\(|https?:\/\/|^\s*\d+\.\s+)/m;

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
  text = text.replace(/^(\s*(?:[-+]|\*(?!\*)))(\S)/gm, '$1 $2');
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

const splitSourceSection = (content = '') => {
  const lines = String(content || '').split('\n');

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (!SOURCE_SECTION_HEADING_PATTERN.test(line)) {
      continue;
    }

    const sourceLines = lines.slice(index + 1);
    const sourceMarkdown = sourceLines.join('\n').trim();
    if (!sourceMarkdown || !SOURCE_SECTION_EVIDENCE_PATTERN.test(sourceMarkdown)) {
      continue;
    }

    return {
      body: lines.slice(0, index).join('\n').trim(),
      sources: sourceMarkdown,
    };
  }

  return {
    body: content,
    sources: '',
  };
};

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
    if (!content) return '';

    const blockMath = [];
    const inlineMath = [];

    // 1. Extract block math ($$ ... $$)
    let processed = content.replace(/\$\$([\s\S]*?)\$\$/g, (match, equation) => {
      blockMath.push(equation.trim());
      return `@@@BLOCK_MATH_${blockMath.length - 1}@@@`;
    });

    // 2. Extract inline math ($ ... $)
    processed = processed.replace(/\$([^\s$](?:[^$]*?[^\s$])?)\$/g, (match, equation) => {
      const trimmed = equation.trim();
      // Skip if it looks like a currency range, e.g. "10-" or "10 "
      if (/^\d+[\s-]*$/.test(trimmed)) {
        return match;
      }
      inlineMath.push(trimmed);
      return `@@@INLINE_MATH_${inlineMath.length - 1}@@@`;
    });

    // 3. Prepare and render Markdown
    const prepared = prepareMarkdown(processed);
    const { body, sources } = splitSourceSection(prepared);

    const restoreMath = (renderedHtml) => {
      let htmlWithMath = renderedHtml.replace(/<p>\s*@@@BLOCK_MATH_(\d+)@@@\s*<\/p>/g, (match, index) => {
        const equation = blockMath[parseInt(index, 10)];
        try {
          return katex.renderToString(equation, { displayMode: true, throwOnError: false });
        } catch (e) {
          console.error('KaTeX block error:', e);
          return `<div class="katex-error">$$ ${equation} $$</div>`;
        }
      });

      htmlWithMath = htmlWithMath.replace(/@@@BLOCK_MATH_(\d+)@@@/g, (match, index) => {
        const equation = blockMath[parseInt(index, 10)];
        try {
          return katex.renderToString(equation, { displayMode: true, throwOnError: false });
        } catch (e) {
          console.error('KaTeX block error:', e);
          return `<div class="katex-error">$$ ${equation} $$</div>`;
        }
      });

      return htmlWithMath.replace(/@@@INLINE_MATH_(\d+)@@@/g, (match, index) => {
        const equation = inlineMath[parseInt(index, 10)];
        try {
          return katex.renderToString(equation, { displayMode: false, throwOnError: false });
        } catch (e) {
          console.error('KaTeX inline error:', e);
          return `<span class="katex-error">$ ${equation} $</span>`;
        }
      });
    };

    const renderMarkdown = (markdownText) => restoreMath(markdownText ? MARKDOWN.render(markdownText) : '');
    const bodyHtml = renderMarkdown(body);
    const sourcesHtml = renderMarkdown(sources);

    if (!sourcesHtml) {
      return bodyHtml;
    }

    return `${bodyHtml}<details class="ai-markdown__sources"><summary><span>来源</span></summary><div class="ai-markdown__sources-body">${sourcesHtml}</div></details>`;
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
