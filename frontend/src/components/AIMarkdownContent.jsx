import React, { useMemo } from 'react';

const COLORS = {
  default: {
    text: '#1f2937',
    muted: '#64748b',
    codeBg: 'rgba(15, 23, 42, 0.06)',
    codeBorder: 'rgba(148, 163, 184, 0.2)',
    codeText: '#0f172a',
    exampleBg: 'rgba(99, 102, 241, 0.06)',
    exampleBorder: 'rgba(99, 102, 241, 0.16)',
    exampleTitle: '#4338ca',
    quoteBg: 'rgba(15, 23, 42, 0.03)',
    quoteBorder: 'rgba(99, 102, 241, 0.22)',
    tableHeadBg: 'rgba(15, 23, 42, 0.04)',
    tableBorder: 'rgba(148, 163, 184, 0.2)',
  },
  subtle: {
    text: '#334155',
    muted: '#64748b',
    codeBg: 'rgba(255, 255, 255, 0.72)',
    codeBorder: 'rgba(148, 163, 184, 0.18)',
    codeText: '#0f172a',
    exampleBg: 'rgba(255, 255, 255, 0.78)',
    exampleBorder: 'rgba(148, 163, 184, 0.22)',
    exampleTitle: '#4f46e5',
    quoteBg: 'rgba(255, 255, 255, 0.75)',
    quoteBorder: 'rgba(99, 102, 241, 0.18)',
    tableHeadBg: 'rgba(255, 255, 255, 0.76)',
    tableBorder: 'rgba(148, 163, 184, 0.18)',
  },
};

const COMMON_CODE_LANGUAGES = [
  'typescript',
  'javascript',
  'python',
  'markdown',
  'tsx',
  'jsx',
  'json',
  'yaml',
  'bash',
  'shell',
  'html',
  'css',
  'sql',
  'java',
  'rust',
  'php',
  'text',
  'ts',
  'js',
  'md',
  'yml',
  'xml',
  'cpp',
  'c',
  'go',
  'sh',
];

const INLINE_PATTERN = /(`[^`]+`|\*\*[^*]+\*\*|~~[^~]+~~|\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\]\((https?:\/\/[^)]+)\))/g;
const TABLE_ALIGN_PATTERN = /^:?-{3,}:?$/;

const isCodeFence = (line = '') => line.trim().startsWith('```');
const isHorizontalRule = (line = '') => /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim());
const isHeading = (line = '') => /^\s*#{1,6}(?:\s+|$)/.test(line);
const isUnorderedListItem = (line = '') => /^\s*[-*+]\s+/.test(line);
const isOrderedListItem = (line = '') => /^\s*\d+\.\s+/.test(line);
const isListItem = (line = '') => isUnorderedListItem(line) || isOrderedListItem(line);
const isBlockquoteLine = (line = '') => /^\s*>\s?/.test(line);

const extractLabelValue = (line, labels) => {
  for (const label of labels) {
    const prefix = `${label}:`;
    const fullWidthPrefix = `${label}：`;
    if (line.startsWith(prefix)) {
      return line.slice(prefix.length).trim();
    }
    if (line.startsWith(fullWidthPrefix)) {
      return line.slice(fullWidthPrefix.length).trim();
    }
  }
  return null;
};

const parseExampleBlock = (text) => {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return null;
  }

  const sentence = lines
    .map((line) => extractLabelValue(line, ['例句', '示例', 'Example', 'Sentence']))
    .find(Boolean);

  if (!sentence) {
    return null;
  }

  const translation = lines
    .map((line) => extractLabelValue(line, ['译文', '翻译', '释义', 'Translation', 'Meaning']))
    .find(Boolean);

  const note = lines
    .map((line) => extractLabelValue(line, ['用法', '提示', '说明', 'Note', 'Usage']))
    .find(Boolean);

  const extras = lines.filter((line) => (
    !extractLabelValue(line, ['例句', '示例', 'Example', 'Sentence'])
    && !extractLabelValue(line, ['译文', '翻译', '释义', 'Translation', 'Meaning'])
    && !extractLabelValue(line, ['用法', '提示', '说明', 'Note', 'Usage'])
  ));

  return {
    type: 'example',
    sentence,
    translation: translation || '',
    note: note || extras.join('\n'),
  };
};

const extractTableCells = (line = '') => (
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
);

const getTableAlignment = (cell = '') => {
  const value = cell.trim();
  if (value.startsWith(':') && value.endsWith(':')) {
    return 'center';
  }
  if (value.endsWith(':')) {
    return 'right';
  }
  return 'left';
};

const isTableAlignmentLine = (line = '') => {
  const cells = extractTableCells(line);
  return cells.length > 0 && cells.every((cell) => TABLE_ALIGN_PATTERN.test(cell));
};

const isTableRow = (line = '') => {
  const trimmed = line.trim();
  if (!trimmed.includes('|') || isTableAlignmentLine(trimmed)) {
    return false;
  }
  return extractTableCells(trimmed).length >= 2;
};

const normalizeTextSegment = (segment = '') => {
  let text = segment;

  text = text.replace(/[ \t]+\n/g, '\n');
  text = text.replace(/([^\n])\s+(-{3,}|\*{3,}|_{3,})(?=\s|$)/g, '$1\n$2');
  text = text.replace(/([^\n])\s*(#{1,6})(?=\S)/g, '$1\n$2 ');
  text = text.replace(/^(\s*#{1,6})(\S)/gm, '$1 $2');
  text = text.replace(/([^\n])\s*(>\s*)(?=\S)/g, '$1\n> ');
  text = text.replace(/([^\n])(\|(?:[^|\n]*\|){2,}[^|\n]*)/g, '$1\n$2');
  text = text.replace(/([^\n])(\d+\.)(?=\S)/g, '$1\n$2 ');
  text = text.replace(/^(\s*\d+\.)(\S)/gm, '$1 $2');
  text = text.replace(/([^\n])(-)(?=[^\s-])/g, (match, prev, _marker, offset, fullText) => {
    const next = fullText[offset + match.length] || '';
    if (/[A-Za-z0-9]/.test(prev) && /[A-Za-z0-9]/.test(next)) {
      return match;
    }
    return `${prev}\n- `;
  });
  text = text.replace(/^(\s*[-*+])(\S)/gm, '$1 $2');
  return text.replace(/\n{3,}/g, '\n\n');
};

const normalizeMarkdownContent = (content = '') => {
  let text = content.replace(/\r\n/g, '\n').trim();
  if (!text) {
    return '';
  }

  text = text.replace(/([^\n])```/g, '$1\n```');
  COMMON_CODE_LANGUAGES.forEach((language) => {
    const pattern = new RegExp(`\`\`\`${language}(?=\\S)`, 'gi');
    text = text.replace(pattern, (match) => `${match}\n`);
  });

  const segments = text
    .split(/(```[\s\S]*?```)/g)
    .filter(Boolean)
    .map((segment) => (segment.startsWith('```') ? segment : normalizeTextSegment(segment)));

  return segments.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

const parseFenceInfo = (raw = '') => {
  const value = raw.trim();
  if (!value) {
    return { language: '', initialCode: '' };
  }

  const lowerValue = value.toLowerCase();
  for (const language of COMMON_CODE_LANGUAGES) {
    if (!lowerValue.startsWith(language)) {
      continue;
    }

    const rest = value.slice(language.length);
    if (!rest.trim()) {
      return { language, initialCode: '' };
    }

    return {
      language,
      initialCode: rest.trimStart(),
    };
  }

  if (/^[A-Za-z0-9_+-]+$/.test(value)) {
    return { language: value, initialCode: '' };
  }

  return { language: '', initialCode: value };
};

const parseBlocks = (content = '') => {
  const normalizedContent = normalizeMarkdownContent(content);
  const lines = normalizedContent.split('\n');
  const blocks = [];
  let index = 0;

  const collectParagraph = () => {
    const paragraphLines = [];
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) {
        break;
      }
      if (
        isCodeFence(line)
        || isHeading(line)
        || isListItem(line)
        || isHorizontalRule(line)
        || isBlockquoteLine(line)
        || (isTableRow(line) && isTableAlignmentLine(lines[index + 1] || ''))
      ) {
        break;
      }
      paragraphLines.push(line);
      index += 1;
    }

    const text = paragraphLines.join('\n').trim();
    if (!text) {
      return;
    }

    const exampleBlock = parseExampleBlock(text);
    blocks.push(exampleBlock || { type: 'paragraph', text });
  };

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (isHorizontalRule(line)) {
      blocks.push({ type: 'hr' });
      index += 1;
      continue;
    }

    if (isCodeFence(line)) {
      const trimmed = line.trim();
      const { language, initialCode } = parseFenceInfo(trimmed.slice(3));
      index += 1;

      const codeLines = [];
      if (initialCode) {
        codeLines.push(initialCode);
      }

      while (index < lines.length) {
        const currentLine = lines[index];
        const fenceIndex = currentLine.indexOf('```');
        if (fenceIndex >= 0) {
          const beforeFence = currentLine.slice(0, fenceIndex);
          if (beforeFence) {
            codeLines.push(beforeFence);
          }
          index += 1;
          break;
        }

        codeLines.push(currentLine);
        index += 1;
      }

      blocks.push({
        type: 'code',
        language,
        code: codeLines.join('\n'),
      });
      continue;
    }

    if (isHeading(line)) {
      const trimmed = line.trim();
      const level = Math.min(6, trimmed.match(/^#+/)?.[0]?.length || 1);
      blocks.push({
        type: 'heading',
        level,
        text: trimmed.replace(/^#{1,6}\s*/, ''),
      });
      index += 1;
      continue;
    }

    if (isBlockquoteLine(line)) {
      const quoteLines = [];
      while (index < lines.length && isBlockquoteLine(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      blocks.push({
        type: 'blockquote',
        text: quoteLines.join('\n').trim(),
      });
      continue;
    }

    if (isTableRow(line) && isTableAlignmentLine(lines[index + 1] || '')) {
      const header = extractTableCells(line);
      const alignments = extractTableCells(lines[index + 1]).map(getTableAlignment);
      index += 2;

      const rows = [];
      while (index < lines.length && isTableRow(lines[index])) {
        rows.push(extractTableCells(lines[index]));
        index += 1;
      }

      blocks.push({
        type: 'table',
        header,
        alignments,
        rows,
      });
      continue;
    }

    if (isListItem(line)) {
      const ordered = isOrderedListItem(line);
      const items = [];
      while (index < lines.length) {
        const currentLine = lines[index];
        if (!currentLine.trim()) {
          index += 1;
          break;
        }

        const currentMatches = ordered ? isOrderedListItem(currentLine) : isUnorderedListItem(currentLine);
        if (!currentMatches) {
          break;
        }

        items.push(currentLine.replace(ordered ? /^\s*\d+\.\s+/ : /^\s*[-*+]\s+/, '').trim());
        index += 1;
      }

      blocks.push({
        type: 'list',
        ordered,
        items,
      });
      continue;
    }

    collectParagraph();
  }

  return blocks;
};

const renderInline = (text, tone, keyPrefix) => {
  const parts = [];
  let lastIndex = 0;

  text.replace(INLINE_PATTERN, (match, _capture, _linkCapture, offset) => {
    if (offset > lastIndex) {
      parts.push(text.slice(lastIndex, offset));
    }

    if (match.startsWith('`') && match.endsWith('`')) {
      parts.push(
        <code
          key={`${keyPrefix}_code_${offset}`}
          style={{
            padding: '1px 6px',
            borderRadius: 6,
            background: COLORS[tone].codeBg,
            border: `1px solid ${COLORS[tone].codeBorder}`,
            color: COLORS[tone].codeText,
            fontSize: 13,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}
        >
          {match.slice(1, -1)}
        </code>
      );
    } else if (match.startsWith('**') && match.endsWith('**')) {
      parts.push(
        <strong key={`${keyPrefix}_strong_${offset}`}>
          {match.slice(2, -2)}
        </strong>
      );
    } else if (match.startsWith('~~') && match.endsWith('~~')) {
      parts.push(
        <del key={`${keyPrefix}_del_${offset}`}>
          {match.slice(2, -2)}
        </del>
      );
    } else if (
      (match.startsWith('*') && match.endsWith('*'))
      || (match.startsWith('_') && match.endsWith('_'))
    ) {
      parts.push(
        <em key={`${keyPrefix}_em_${offset}`}>
          {match.slice(1, -1)}
        </em>
      );
    } else {
      const linkMatch = match.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
      if (linkMatch) {
        parts.push(
          <a
            key={`${keyPrefix}_link_${offset}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
            style={{
              color: '#2563eb',
              textDecoration: 'underline',
              textUnderlineOffset: 2,
            }}
          >
            {linkMatch[1]}
          </a>
        );
      } else {
        parts.push(match);
      }
    }

    lastIndex = offset + match.length;
    return match;
  });

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length ? parts : [text];
};

const renderParagraphLines = (text, tone, keyPrefix) => text.split('\n').flatMap((line, index, array) => {
  const nodes = renderInline(line, tone, `${keyPrefix}_${index}`);
  if (index === array.length - 1) {
    return nodes;
  }
  return [...nodes, <br key={`${keyPrefix}_br_${index}`} />];
});

const AIMarkdownContent = ({ content = '', tone = 'default' }) => {
  const blocks = useMemo(() => parseBlocks(content), [content]);
  const colorTone = COLORS[tone] ? tone : 'default';

  return (
    <div style={{ display: 'grid', gap: 10, color: COLORS[colorTone].text, whiteSpace: 'normal' }}>
      {blocks.map((block, index) => {
        if (block.type === 'hr') {
          return (
            <div
              key={`hr_${index}`}
              style={{
                height: 1,
                background: COLORS[colorTone].tableBorder,
                margin: '4px 0',
              }}
            />
          );
        }

        if (block.type === 'heading') {
          const fontSize = block.level === 1 ? 18 : block.level === 2 ? 16 : block.level === 3 ? 15 : 14;
          return (
            <div
              key={`heading_${index}`}
              style={{
                fontSize,
                fontWeight: 700,
                color: COLORS[colorTone].text,
                lineHeight: 1.5,
              }}
            >
              {renderInline(block.text, colorTone, `heading_${index}`)}
            </div>
          );
        }

        if (block.type === 'code') {
          return (
            <div
              key={`code_${index}`}
              style={{
                borderRadius: 12,
                overflow: 'hidden',
                border: `1px solid ${COLORS[colorTone].codeBorder}`,
                background: COLORS[colorTone].codeBg,
              }}
            >
              {block.language && (
                <div
                  style={{
                    padding: '8px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: COLORS[colorTone].muted,
                    borderBottom: `1px solid ${COLORS[colorTone].codeBorder}`,
                  }}
                >
                  {block.language}
                </div>
              )}
              <pre
                style={{
                  margin: 0,
                  padding: '12px 14px',
                  overflowX: 'auto',
                  fontSize: 13,
                  lineHeight: 1.65,
                  color: COLORS[colorTone].codeText,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {block.code}
              </pre>
            </div>
          );
        }

        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul';
          return (
            <ListTag
              key={`list_${index}`}
              style={{
                margin: 0,
                paddingInlineStart: block.ordered ? 20 : 18,
                display: 'grid',
                gap: 6,
                color: COLORS[colorTone].text,
              }}
            >
              {block.items.map((item, itemIndex) => (
                <li key={`list_${index}_${itemIndex}`} style={{ lineHeight: 1.75 }}>
                  {renderParagraphLines(item, colorTone, `list_${index}_${itemIndex}`)}
                </li>
              ))}
            </ListTag>
          );
        }

        if (block.type === 'blockquote') {
          return (
            <div
              key={`blockquote_${index}`}
              style={{
                borderLeft: `3px solid ${COLORS[colorTone].quoteBorder}`,
                padding: '10px 12px',
                borderRadius: 10,
                background: COLORS[colorTone].quoteBg,
                color: COLORS[colorTone].text,
                lineHeight: 1.75,
              }}
            >
              {renderParagraphLines(block.text, colorTone, `blockquote_${index}`)}
            </div>
          );
        }

        if (block.type === 'table') {
          return (
            <div
              key={`table_${index}`}
              style={{
                overflowX: 'auto',
                borderRadius: 12,
                border: `1px solid ${COLORS[colorTone].tableBorder}`,
                background: 'rgba(255, 255, 255, 0.36)',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: COLORS[colorTone].tableHeadBg }}>
                    {block.header.map((cell, cellIndex) => (
                      <th
                        key={`table_head_${index}_${cellIndex}`}
                        style={{
                          padding: '10px 12px',
                          textAlign: block.alignments[cellIndex] || 'left',
                          borderBottom: `1px solid ${COLORS[colorTone].tableBorder}`,
                          color: COLORS[colorTone].text,
                          fontWeight: 700,
                        }}
                      >
                        {renderParagraphLines(cell, colorTone, `table_head_${index}_${cellIndex}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`table_row_${index}_${rowIndex}`}>
                      {block.header.map((_, cellIndex) => (
                        <td
                          key={`table_cell_${index}_${rowIndex}_${cellIndex}`}
                          style={{
                            padding: '10px 12px',
                            textAlign: block.alignments[cellIndex] || 'left',
                            borderBottom: rowIndex === block.rows.length - 1 ? 'none' : `1px solid ${COLORS[colorTone].tableBorder}`,
                            color: COLORS[colorTone].text,
                            verticalAlign: 'top',
                          }}
                        >
                          {renderParagraphLines(row[cellIndex] || '', colorTone, `table_cell_${index}_${rowIndex}_${cellIndex}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === 'example') {
          return (
            <div
              key={`example_${index}`}
              style={{
                borderRadius: 14,
                padding: '12px 14px',
                background: COLORS[colorTone].exampleBg,
                border: `1px solid ${COLORS[colorTone].exampleBorder}`,
                display: 'grid',
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: COLORS[colorTone].exampleTitle }}>
                例句卡片
              </div>
              <div style={{ lineHeight: 1.75, color: COLORS[colorTone].text }}>
                {renderParagraphLines(block.sentence, colorTone, `example_sentence_${index}`)}
              </div>
              {block.translation && (
                <div style={{ fontSize: 13, lineHeight: 1.7, color: COLORS[colorTone].muted }}>
                  {renderParagraphLines(block.translation, colorTone, `example_translation_${index}`)}
                </div>
              )}
              {block.note && (
                <div style={{ fontSize: 12, lineHeight: 1.65, color: COLORS[colorTone].muted }}>
                  {renderParagraphLines(block.note, colorTone, `example_note_${index}`)}
                </div>
              )}
            </div>
          );
        }

        return (
          <div
            key={`paragraph_${index}`}
            style={{
              lineHeight: 1.8,
              color: COLORS[colorTone].text,
              fontSize: 14,
            }}
          >
            {renderParagraphLines(block.text, colorTone, `paragraph_${index}`)}
          </div>
        );
      })}
    </div>
  );
};

export default AIMarkdownContent;
