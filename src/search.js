const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
const corpusCache = new WeakMap();

const STOP_WORDS = new Set([
  '的', '了', '我', '你', '他', '她', '它', '我们', '你们', '他们', '自己', '这个', '这种', '那个',
  '一个', '什么', '怎么', '怎样', '如何', '为什么', '应该', '可以', '能不能', '是否', '总是', '一直',
  '却', '就', '又', '再', '里', '中', '上', '下', '都', '也', '很', '还', '把', '被', '让', '给',
  '和', '与', '或', '但', '但是', '因为', '所以', '如果', '这样', '那样', '现在', '最近', '觉得',
]);

const SYNONYM_GROUPS = [
  {
    triggers: ['团队', '协作', '分工', '配合', '同事', '下属', '领导', '管理', '组织', '氛围', '真话', '意见', '反馈', '冲突', '关系'],
    terms: ['批评', '自我批评', '团结', '意见', '自由主义', '作风', '群众', '民主', '讨论', '领导方法'],
  },
  {
    triggers: ['重点', '优先', '效率', '忙', '事情多', '千头万绪', '时间', '做不完', '主次', '关键', '重要', '繁琐'],
    terms: ['主要矛盾', '中心工作', '矛盾', '全局', '统筹', '抓主要'],
  },
  {
    triggers: ['开始', '拖延', '行动', '执行', '尝试', '落地', '试错', '迟迟', '不敢', '空想', '计划'],
    terms: ['实践', '行动', '认识', '变革', '经验', '实行', '干'],
  },
  {
    triggers: ['学习', '读书', '知识', '方法', '能力', '成长', '考试', '进步', '理论'],
    terms: ['学习', '应用', '理论', '研究', '精通', '读书', '调查'],
  },
  {
    triggers: ['用户', '客户', '需求', '他人', '关系', '家庭', '服务', '孩子', '父母', '朋友', '沟通'],
    terms: ['群众', '切身利益', '关心', '生活', '人民', '需要'],
  },
  {
    triggers: ['困难', '低谷', '挫折', '迷茫', '压力', '坚持', '长期', '失败', '焦虑', '信心', '勇气'],
    terms: ['困难', '持久', '长期', '坚持', '光明', '勇气', '主动', '条件'],
  },
  {
    triggers: ['调查', '调研', '信息', '数据', '决策', '情况', '复盘', '事实', '依据', '盲目'],
    terms: ['调查', '研究', '实际', '实事求是', '发言权', '事实', '情况'],
  },
  {
    triggers: ['经验', '照搬', '环境', '变化', '条件', '具体', '职业', '转行', '选择'],
    terms: ['特点', '发展', '具体', '条件', '分析', '实际'],
  },
];

function prepare(corpus) {
  if (corpusCache.has(corpus)) return corpusCache.get(corpus);
  const entries = corpus.map((document) => ({
    document,
    title: `${document.title}${document.section || ''}`.toLowerCase(),
    theme: (document.theme || '').toLowerCase(),
    keywords: (document.keywords || []).map((word) => word.toLowerCase()),
    text: `${document.title}${document.section || ''}${document.excerpt}${document.content?.join('') || ''}`.toLowerCase(),
  }));
  corpusCache.set(corpus, entries);
  return entries;
}

function queryTerms(query) {
  const normalized = query.toLowerCase().trim();
  const weights = new Map();
  const add = (term, weight) => {
    if (term.length < 2 || STOP_WORDS.has(term)) return;
    weights.set(term, Math.max(weights.get(term) || 0, weight));
  };

  for (const part of segmenter.segment(normalized)) {
    if (part.isWordLike && /[\u4e00-\u9fff]/.test(part.segment)) add(part.segment, 1);
  }
  for (const word of normalized.match(/[a-z0-9]{2,}/g) || []) add(word, 1);

  SYNONYM_GROUPS.forEach((group) => {
    if (group.triggers.some((trigger) => normalized.includes(trigger))) {
      group.terms.forEach((term) => add(term, 0.52));
    }
  });
  return weights;
}

function countOccurrences(text, term) {
  let count = 0;
  let position = text.indexOf(term);
  while (position !== -1 && count < 12) {
    count += 1;
    position = text.indexOf(term, position + term.length);
  }
  return count;
}

function bestParagraph(content, weightedTerms) {
  if (!content?.length) return null;
  let best = { paragraph: content[0], score: 0 };
  content.forEach((paragraph) => {
    const lower = paragraph.toLowerCase();
    let score = 0;
    weightedTerms.forEach(({ term, weight }) => {
      if (lower.includes(term)) score += weight;
    });
    if (score > best.score) best = { paragraph, score, term: weightedTerms.find(({ term }) => lower.includes(term))?.term };
  });
  return best.score ? best : null;
}

function clipSnippet(paragraph, term, length = 190) {
  if (paragraph.length <= length) return paragraph;
  const at = term ? paragraph.indexOf(term) : -1;
  const start = Math.max(0, Math.min(at - 45, paragraph.length - length));
  return `${start > 0 ? '…' : ''}${paragraph.slice(start, start + length)}${start + length < paragraph.length ? '…' : ''}`;
}

export function retrieve(query, limit = 3, corpus) {
  const terms = queryTerms(query);
  if (!terms.size) return [];
  const entries = prepare(corpus);
  const documentFrequency = new Map();
  terms.forEach((_, term) => {
    documentFrequency.set(term, entries.reduce((count, entry) => count + (entry.text.includes(term) ? 1 : 0), 0));
  });

  const weightedTerms = [...terms].map(([term, weight]) => ({ term, weight, idf: Math.log(1 + entries.length / (1 + documentFrequency.get(term))) }));

  return entries
    .map(({ document, title, theme, keywords, text }) => {
      let score = 0;
      weightedTerms.forEach(({ term, weight, idf }) => {
        const keywordHit = keywords.includes(term);
        const titleHit = title.includes(term);
        const themeHit = theme.includes(term);
        const frequency = countOccurrences(text, term);
        if (!keywordHit && !titleHit && !themeHit && !frequency) return;
        if (keywordHit) score += weight * (18 + idf * 2);
        if (titleHit) score += weight * (9 + idf * 1.6);
        if (themeHit) score += weight * (7 + idf);
        if (frequency) score += weight * (weight < 1 ? 0.58 : 1) * idf * (1 + Math.log2(frequency));
      });
      return { document, score };
    })
    .filter(({ score }) => score >= 8)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ document, score }) => {
      const match = bestParagraph(document.content, weightedTerms);
      return {
        ...document,
        excerpt: document.answer ? document.excerpt : (match ? clipSnippet(match.paragraph, match.term) : document.excerpt),
        relevance: score,
      };
    });
}
