import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp, BookMarked, BookOpen, Check, ChevronRight, Copy, Download,
  ExternalLink, FileText, History, Library, Menu, MessageCircle,
  Plus, Search, Settings2, Share2, Sparkles, ThumbsDown, ThumbsUp, X,
} from 'lucide-react';
import { passages, suggestedQuestions } from './data';
import { retrieve } from './search';

function loadHistory() {
  try { return JSON.parse(localStorage.getItem('maoxuan-history') || '[]'); }
  catch { return []; }
}

function makeConversation(question, sources, mode = '简明') {
  const primary = sources[0];
  return {
    id: Date.now().toString(),
    title: question,
    updatedAt: Date.now(),
    messages: [
      { role: 'user', content: question },
      primary ? {
        role: 'assistant',
        content: primary.summary || `从《${primary.title}》中，找到了与你的问题相关的原文。`,
        paragraphs: primary.answer || ['以下内容直接检索自文献原文。建议结合写作背景与你的具体处境阅读，不把历史结论简单套用到当下。'],
        action: primary.action ? (mode === '深入' ? `${primary.action} 完成后，再把结果与最初判断对照一次。` : primary.action) : null,
        sources,
      } : {
        role: 'assistant',
        content: '现有文献中，还没有找到足够贴近这个问题的内容。',
        paragraphs: ['我不想用不相关的原文勉强作答。你可以补充具体处境，或换一个更明确的说法，例如“如何确定工作优先级”。', '当前版本使用本地文献进行关键词检索，问题只会在你的浏览器中处理。'],
        sources: [],
      },
    ],
  };
}

function Brand({ compact = false }) {
  return <div className={`brand ${compact ? 'compact' : ''}`}>
    <div className="seal" aria-hidden="true">毛<span>选</span></div>
    {!compact && <div><strong>遇事不决问毛选</strong><small>从经典中，寻找现实答案</small></div>}
  </div>;
}

function SourceCard({ source, index, onClick }) {
  return <button className="source-card" onClick={() => onClick(source)}>
    <div className="source-top"><span className="source-index">{String(index + 1).padStart(2, '0')}</span><span>{source.theme}</span><ExternalLink size={13} /></div>
    <h3>《{source.title}》</h3>
    <p>{source.excerpt}</p>
    <div className="source-meta">毛泽东选集 · {source.volume}<span>{source.year} 年</span></div>
  </button>;
}

function App() {
  const [view, setView] = useState('chat');
  const [documents, setDocuments] = useState(passages);
  const [libraryReady, setLibraryReady] = useState(false);
  const [libraryError, setLibraryError] = useState(false);
  const [visibleCount, setVisibleCount] = useState(30);
  const [conversation, setConversation] = useState(null);
  const [history, setHistory] = useState(loadHistory);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [selectedSource, setSelectedSource] = useState(null);
  const [bookmarks, setBookmarks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('maoxuan-bookmarks') || '[]'); } catch { return []; }
  });
  const [toast, setToast] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [volume, setVolume] = useState('全部');
  const [mode, setMode] = useState('简明');
  const [sourceCount, setSourceCount] = useState(3);
  const [feedback, setFeedback] = useState({});
  const textareaRef = useRef(null);
  const endRef = useRef(null);
  const requestRef = useRef(0);

  useEffect(() => {
    fetch('/data/library.json')
      .then((response) => {
        if (!response.ok) throw new Error('文献加载失败');
        return response.json();
      })
      .then((library) => {
        setDocuments(library.documents.map((document) => {
          const curated = passages.find((passage) => passage.title === document.title);
          return curated ? { ...document, ...curated, content: document.content, section: document.section } : document;
        }));
        setLibraryReady(true);
      })
      .catch(() => {
        setLibraryError(true);
        notify('完整文献未载入，当前显示精读选文');
      });
  }, []);
  useEffect(() => { localStorage.setItem('maoxuan-history', JSON.stringify(history)); }, [history]);
  useEffect(() => { localStorage.setItem('maoxuan-bookmarks', JSON.stringify(bookmarks)); }, [bookmarks]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2400);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [conversation, thinking]);
  useEffect(() => {
    const handler = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') { event.preventDefault(); setSearchOpen(true); }
      if (event.key === 'Escape') { setSearchOpen(false); setSettingsOpen(false); setSelectedSource(null); setSidebarOpen(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const notify = (message) => setToast(message);
  const go = (next) => { setView(next); setSidebarOpen(false); setQuery(''); };
  const newChat = () => { requestRef.current += 1; setThinking(false); setConversation(null); setInput(''); go('chat'); setTimeout(() => textareaRef.current?.focus(), 0); };

  const ask = (question = input) => {
    const clean = question.trim();
    if (!clean || thinking) return;
    setView('chat');
    setInput('');
    setConversation({ id: 'pending', messages: [{ role: 'user', content: clean }] });
    setThinking(true);
    const sources = retrieve(clean, sourceCount, documents);
    const next = makeConversation(clean, sources, mode);
    const requestId = ++requestRef.current;
    setTimeout(() => {
      if (requestId !== requestRef.current) return;
      setConversation(next);
      setHistory((items) => [next, ...items.filter((item) => item.id !== next.id)].slice(0, 20));
      setThinking(false);
    }, 850);
  };

  const openHistory = (item) => { requestRef.current += 1; setThinking(false); setConversation(item); go('chat'); };
  const toggleBookmark = (id) => {
    const saved = bookmarks.includes(id);
    setBookmarks((items) => saved ? items.filter((item) => item !== id) : [...items, id]);
    notify(saved ? '已取消收藏' : '已加入收藏');
  };
  const copyText = async (text, message) => {
    try { await navigator.clipboard.writeText(text); notify(message); }
    catch { notify('复制失败，请手动选择文本'); }
  };
  const share = () => copyText(window.location.href, '应用链接已复制');
  const exportChat = () => {
    if (!conversation) return;
    const text = conversation.messages.map((m) => `${m.role === 'user' ? '我的问题' : '回答'}\n${m.content}\n${m.paragraphs?.join('\n') || ''}${m.action ? `\n试着这样做：${m.action}` : ''}`).join('\n\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${conversation.title.slice(0, 20)}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify('对话已导出');
  };

  const shownSources = conversation?.messages.findLast((m) => m.role === 'assistant')?.sources || [];
  const libraryResults = documents.filter((p) => (volume === '全部' || p.volume === volume) && `${p.title}${p.theme}${p.excerpt}${(p.keywords || []).join('')}${p.content?.join('') || ''}`.includes(query));
  const searchResults = documents.filter((p) => `${p.title}${p.theme}${p.excerpt}${p.content?.join('') || ''}`.includes(query)).slice(0, 5);
  const visibleDocuments = libraryResults.slice(0, visibleCount);

  return <div className="app-shell">
    {sidebarOpen && <button className="scrim" aria-label="关闭导航" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
      <div className="sidebar-head"><Brand /><button className="icon-button mobile-close" onClick={() => setSidebarOpen(false)} aria-label="关闭导航"><X size={19} /></button></div>
      <button className="new-chat" onClick={newChat}><Plus size={17} /><span>开启新对话</span></button>
      <nav className="main-nav" aria-label="主导航">
        <button className={view === 'chat' ? 'active' : ''} onClick={() => go('chat')}><MessageCircle size={17} />问一问<span className="nav-mark" /></button>
        <button className={view === 'library' ? 'active' : ''} onClick={() => go('library')}><Library size={17} />知识库<span className="count">{documents.length}</span></button>
        <button className={view === 'saved' ? 'active' : ''} onClick={() => go('saved')}><BookMarked size={17} />我的收藏<span className="count">{bookmarks.length}</span></button>
      </nav>
      <div className="history-section">
        <div className="section-label"><span>最近对话</span><History size={13} /></div>
        {history.length ? history.slice(0, 6).map((item) => <button className={`history-item ${conversation?.id === item.id ? 'current' : ''}`} key={item.id} onClick={() => openHistory(item)}>{item.title}</button>) : <p className="history-empty">每一次认真提问，<br />都会在这里留下足迹。</p>}
      </div>
      <div className="sidebar-bottom">
        <button className="settings-link" onClick={() => setSettingsOpen(true)}><Settings2 size={17} />回答设置<ChevronRight size={15} /></button>
        <div className="collection-note"><span className="tiny-seal">集</span><div><strong>毛泽东选集</strong><small>毛泽东选集 · 本地知识库</small></div><Check size={14} /></div>
      </div>
    </aside>

    <main className="main-panel">
      <header className="topbar">
        <div className="topbar-left"><button className="icon-button menu-button" onClick={() => setSidebarOpen(true)} aria-label="打开导航"><Menu size={20} /></button><div className="mobile-brand"><Brand compact /></div><span className="breadcrumb">{view === 'chat' ? (conversation ? '对话' : '新对话') : view === 'library' ? '知识库' : '我的收藏'}</span>{view === 'chat' && <span className="status-dot">{libraryReady ? '七卷文献已就绪' : libraryError ? '精读选文已就绪' : '正在载入文献'}</span>}</div>
        <div className="top-actions"><button className="search-trigger" onClick={() => setSearchOpen(true)}><Search size={15} /><span>搜索选文</span><kbd>⌘ K</kbd></button><button className="icon-button" onClick={share} aria-label="分享应用"><Share2 size={17} /></button><button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="回答设置"><Settings2 size={17} /></button></div>
      </header>

      {view === 'chat' && <div className={`chat-layout ${conversation ? 'has-messages' : ''}`}>
        <section className="conversation" aria-label="对话区">
          {!conversation ? <div className="welcome">
            <div className="welcome-symbol"><span>问</span><i /></div>
            <p className="eyebrow">阅读经典 · 观照现实</p>
            <h1>把问题，放回实际里。</h1>
            <p className="welcome-copy">说说你正在面对的事。我们一起从《毛泽东选集》中<br className="desktop-break" />寻找方法，不寻找标准答案。</p>
            <div className="suggestions">
              {suggestedQuestions.map((item) => <button key={item.label} onClick={() => ask(item.text)}><span className="suggestion-label">{item.label}</span><span>{item.text}</span><ArrowUp size={16} /></button>)}
            </div>
            <p className="welcome-footnote"><BookOpen size={13} />{libraryReady ? `已收录 7 卷 · ${documents.length} 篇文献` : `已收录 ${documents.length} 篇精读选文`}</p>
          </div> : <div className="messages">
            <div className="date-divider"><span>今天</span></div>
            {conversation.messages.map((message, index) => message.role === 'user' ? <div className="user-message" key={index}><span>你</span><p>{message.content}</p></div> : <article className="assistant-message" key={index}>
              <div className="assistant-label"><span className="mini-seal">毛</span><strong>毛选助手</strong><span>据文作答</span></div>
              <h2>{message.content}</h2>
              {message.sources[0] && !message.sources[0].answer && <blockquote className="grounded-quote"><span>文中所言</span><p>{message.sources[0].excerpt}</p><button onClick={() => setSelectedSource(message.sources[0])}>阅读《{message.sources[0].title}》全文</button></blockquote>}
              {message.paragraphs?.map((paragraph, pIndex) => <p key={pIndex}>{paragraph}{pIndex === 0 && message.sources[0] && <button className="inline-cite" onClick={() => setSelectedSource(message.sources[0])}>1</button>}</p>)}
              {message.action && <div className="action-note"><Sparkles size={17} /><div><strong>不妨从这里开始</strong><p>{message.action}</p></div></div>}
              {message.sources.length > 0 && <div className="message-sources"><span>参考原文</span>{message.sources.map((source, sIndex) => <button key={source.id} onClick={() => setSelectedSource(source)}>{sIndex + 1} · {source.title}</button>)}</div>}
              <div className="message-actions">
                <button onClick={() => copyText(`${message.content}\n${message.paragraphs?.join('\n')}`, '回答已复制')} aria-label="复制回答"><Copy size={15} /></button>
                <button className={feedback[index] === 'up' ? 'selected' : ''} onClick={() => { setFeedback((f) => ({ ...f, [index]: 'up' })); notify('谢谢你的反馈'); }} aria-label="回答有帮助"><ThumbsUp size={15} /></button>
                <button className={feedback[index] === 'down' ? 'selected' : ''} onClick={() => { setFeedback((f) => ({ ...f, [index]: 'down' })); notify('已记录，我们会改进检索'); }} aria-label="回答没帮助"><ThumbsDown size={15} /></button>
                <button onClick={exportChat} aria-label="导出对话"><Download size={15} /></button>
              </div>
            </article>)}
            {thinking && <div className="thinking"><span className="mini-seal">毛</span><div><i /><i /><i /></div><span>正在翻阅选文，寻找相关段落…</span></div>}
            <div ref={endRef} />
          </div>}

          <div className="composer-wrap">
            <form className={`composer ${thinking ? 'is-thinking' : ''}`} onSubmit={(event) => { event.preventDefault(); ask(); }}>
              <textarea ref={textareaRef} rows={1} value={input} maxLength={500} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); }
              }} placeholder="写下你正面临的问题…" aria-label="你的问题" />
              <div className="composer-bottom"><span><BookOpen size={13} />毛泽东选集 · 一至七卷</span><div><span className="input-hint">Enter 发送</span><button className="send-button" type="submit" disabled={!input.trim() || thinking} aria-label="发送问题"><ArrowUp size={19} /></button></div></div>
            </form>
            <p className="disclaimer">回答由本地文献检索生成，请结合实际情况独立思考。</p>
          </div>
        </section>

        <aside className="context-panel">
          {shownSources.length ? <>
            <div className="context-heading"><span>回答依据</span><span>{shownSources.length} 篇选文</span></div>
            <p className="context-intro">每个观点，都有来处。</p>
            <div className="source-list">{shownSources.map((source, index) => <SourceCard key={source.id} source={source} index={index} onClick={setSelectedSource} />)}</div>
            <div className="retrieval-note"><span className="pulse-dot" />本地检索完成<span>{mode}模式</span></div>
          </> : <div className="daily-reading">
            <div className="context-heading"><span>今日一读</span><BookOpen size={15} /></div>
            <div className="quote-mark">“</div>
            <blockquote>读书是学习，<br />使用也是学习，<br />而且是更重要的学习。</blockquote>
            <p className="quote-source">《毛泽东选集》第一卷<br />中国革命战争的战略问题</p>
            <div className="reading-divider"><span>✦</span></div>
            <div className="reading-tip"><span>阅读，不止于阅读</span><p>从一个真实的问题出发，<br />把书中的方法带回生活。</p></div>
            <button className="text-link" onClick={() => go('library')}>去知识库看看<ArrowUp size={14} /></button>
          </div>}
        </aside>
      </div>}

      {view === 'library' && <section className="library-page">
        <div className="page-heading"><p className="eyebrow">原典为据 · 温故知新</p><h1>知识库</h1><p>不只是一座书架，也是一套理解现实的方法。</p></div>
        <div className="library-tools"><label className="library-search"><Search size={18} /><input value={query} onChange={(e) => { setQuery(e.target.value); setVisibleCount(30); }} placeholder="搜索篇目、主题或原文" /></label><div className="volume-filters">{['全部', '第一卷', '第二卷', '第三卷', '第四卷', '第五卷', '第六卷', '第七卷'].map((item) => <button key={item} className={volume === item ? 'active' : ''} onClick={() => { setVolume(item); setVisibleCount(30); }}>{item}</button>)}</div></div>
        <div className="library-summary"><span>{libraryResults.length} 篇选文</span><span>点击篇目，阅读原文与解题思路</span></div>
        <div className="document-list">{visibleDocuments.map((passage) => <article className="document-row" key={passage.id}>
          <button className="document-main" onClick={() => setSelectedSource(passage)}><span className="document-volume">{passage.volume}</span><div><h2>{passage.title}<span>{passage.year}</span></h2><p>{passage.excerpt}</p><div className="document-tags"><span>{passage.theme}</span>{(passage.keywords || []).slice(0, 2).map((word) => <span key={word}>{word}</span>)}</div></div><ChevronRight size={18} /></button>
          <button className={`bookmark-button ${bookmarks.includes(passage.id) ? 'saved' : ''}`} onClick={() => toggleBookmark(passage.id)} aria-label={bookmarks.includes(passage.id) ? '取消收藏' : '收藏选文'}><BookMarked size={17} /></button>
        </article>)}</div>
        {visibleCount < libraryResults.length && <button className="load-more" onClick={() => setVisibleCount((count) => count + 30)}>再显示 30 篇<span>已显示 {Math.min(visibleCount, libraryResults.length)} / {libraryResults.length}</span></button>}
        {!libraryResults.length && <div className="empty-state"><Search size={28} /><h2>没有找到相关选文</h2><p>换一个关键词，或清除卷次筛选再试试。</p><button onClick={() => { setQuery(''); setVolume('全部'); }}>查看全部选文</button></div>}
      </section>}

      {view === 'saved' && <section className="library-page saved-page">
        <div className="page-heading"><p className="eyebrow">留下思想的刻度</p><h1>我的收藏</h1><p>把值得重读的文字，留在手边。</p></div>
        {bookmarks.length ? <div className="document-list">{documents.filter((p) => bookmarks.includes(p.id)).map((passage) => <article className="document-row" key={passage.id}><button className="document-main" onClick={() => setSelectedSource(passage)}><span className="document-volume">{passage.volume}</span><div><h2>{passage.title}<span>{passage.year}</span></h2><p>{passage.excerpt}</p><div className="document-tags"><span>{passage.theme}</span></div></div><ChevronRight size={18} /></button><button className="bookmark-button saved" onClick={() => toggleBookmark(passage.id)} aria-label="取消收藏"><BookMarked size={17} /></button></article>)}</div> : <div className="empty-state"><BookMarked size={30} /><h2>还没有收藏选文</h2><p>在知识库中点击书签，把有启发的段落留在这里。</p><button onClick={() => go('library')}>去知识库看看</button></div>}
      </section>}
    </main>

    {selectedSource && <div className="modal-layer" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedSource(null); }}><section className={`source-modal ${selectedSource.content ? 'full-document' : ''}`} role="dialog" aria-modal="true" aria-labelledby="source-title">
      <div className="modal-top"><span>{selectedSource.content ? '全文阅读' : '原文出处'}</span><button className="icon-button" onClick={() => setSelectedSource(null)} aria-label="关闭原文"><X size={19} /></button></div>
      <div className="source-volume">毛泽东选集 · {selectedSource.volume}</div><h2 id="source-title">{selectedSource.title}</h2><p className="source-year">{selectedSource.year}{selectedSource.year && ' · '}{selectedSource.theme}{selectedSource.section ? ` · ${selectedSource.section}` : ''}</p>
      <div className={`original-text ${selectedSource.content ? 'full-text' : ''}`}><span>{selectedSource.content ? '文献正文' : '原文选段'}</span>{selectedSource.content ? selectedSource.content.map((paragraph, index) => <p key={index}>{paragraph}</p>) : <p>{selectedSource.excerpt}</p>}</div>
      {selectedSource.answer && <div className="source-reading"><h3>带给当下的启发</h3><p>{selectedSource.summary}</p><p>{selectedSource.answer[0]}</p></div>}
      <div className="modal-actions"><button className={bookmarks.includes(selectedSource.id) ? 'is-saved' : ''} onClick={() => toggleBookmark(selectedSource.id)}><BookMarked size={16} />{bookmarks.includes(selectedSource.id) ? '已收藏' : '收藏选文'}</button><button onClick={() => copyText(`《${selectedSource.title}》：\n${selectedSource.content?.join('\n') || selectedSource.excerpt}`, '原文已复制')}><Copy size={16} />复制原文</button></div>
      <p className="source-footnote"><FileText size={13} />{selectedSource.content ? '正文由用户提供的 EPUB 导入，阅读时请注意版本差异。' : '当前为节选内容，完整阅读请参照正式出版版本。'}</p>
    </section></div>}

    {settingsOpen && <div className="modal-layer" onMouseDown={(e) => { if (e.target === e.currentTarget) setSettingsOpen(false); }}><section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div className="modal-top"><div><span>按你的方式阅读</span><h2 id="settings-title">回答设置</h2></div><button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="关闭设置"><X size={19} /></button></div><label>回答详略<div className="segmented">{['简明', '深入'].map((item) => <button key={item} className={mode === item ? 'active' : ''} onClick={() => setMode(item)}>{item}<small>{item === '简明' ? '直指方法' : '多一步复盘'}</small></button>)}</div></label><label>每次引用选文<div className="stepper"><button onClick={() => setSourceCount(Math.max(1, sourceCount - 1))}>−</button><strong>{sourceCount} 篇</strong><button onClick={() => setSourceCount(Math.min(3, sourceCount + 1))}>＋</button></div></label><div className="settings-info"><BookOpen size={17} /><p>当前使用浏览器内的关键词检索，不上传你的问题。知识库已导入 {documents.length} 篇文献，支持全文检索与阅读。</p></div><button className="primary-button" onClick={() => { setSettingsOpen(false); notify('回答设置已保存'); }}>完成</button></section></div>}

    {searchOpen && <div className="modal-layer search-layer" onMouseDown={(e) => { if (e.target === e.currentTarget) setSearchOpen(false); }}><section className="search-modal" role="dialog" aria-modal="true"><div className="global-search"><Search size={20} /><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索篇目、主题或原文…" /><button onClick={() => setSearchOpen(false)}>ESC</button></div><div className="search-results"><span className="section-label">选文</span>{searchResults.length ? searchResults.map((source) => <button key={source.id} onClick={() => { setSelectedSource(source); setSearchOpen(false); setQuery(''); }}><FileText size={17} /><div><strong>{source.title}</strong><small>{source.volume} · {source.theme}</small></div><ChevronRight size={16} /></button>) : <p>没有匹配的选文，试试“实践”或“团队”。</p>}</div></section></div>}

    {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
  </div>;
}

export default App;
