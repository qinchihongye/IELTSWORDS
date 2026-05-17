export function formatChapterTitle(chapterNo, chapterName) {
  if (!chapterNo && !chapterName) {
    return '';
  }

  if (!chapterNo) {
    return chapterName || '';
  }

  if (!chapterName) {
    return `第 ${chapterNo} 章`;
  }

  return `第 ${chapterNo} 章 ${chapterName}`;
}

const WORD_STATUS_META = {
  unlearned: {
    label: '未掌握',
    background: '#ece7de',
    color: '#6f665b',
  },
  learning: {
    label: '有印象',
    background: '#f8ecd7',
    color: '#9b6c1c',
  },
  mastered: {
    label: '已掌握',
    background: '#e3efe2',
    color: '#4d7650',
  },
};

export function getWordStatusMeta(status = 'unlearned') {
  return WORD_STATUS_META[status] || WORD_STATUS_META.unlearned;
}

function extractGroupOrder(groupId) {
  const match = String(groupId || '').match(/(\d+)$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export function sortGroupsByGroupId(groups) {
  return [...groups].sort((a, b) => {
    const orderDelta = extractGroupOrder(a.groupId) - extractGroupOrder(b.groupId);
    if (orderDelta !== 0) {
      return orderDelta;
    }
    return String(a.groupId).localeCompare(String(b.groupId));
  });
}
