'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isLoggedIn, getCurrentEmail, logout } from './lib/auth';
type Message = {
  id: string;
  role: 'user' | 'tutor';
  content: string;
  time: string;
};

type Persona = {
  id: string;
  name: string;
  subject: string;
  color: string;
  initial: string;
  greeting: string;
};

const personas: Persona[] = [
  { id: 'liz', name: 'Liz', subject: '通用助教', color: '#C98A3E', initial: 'L', greeting: '嗨,我是 Liz。今天想聊点什么?可以是作业、论文思路,或者随便什么问题。' },
  { id: 'summer', name: 'Summer', subject: '论文顾问', color: '#3E7CC9', initial: 'S', greeting: '我是 Summer,专门帮你捋论文逻辑和结构。想先聊聊你的选题吗?' },
  { id: 'mimi', name: 'Mimi', subject: '代码陪练', color: '#8A5FC9', initial: 'M', greeting: '我是 Mimi,遇到 bug 或者想 review 代码都可以找我。' },
];

function nowTime() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

const themes = {
  light: {
    pageBg: '#F6F5F1',
    panelBg: '#FBFAF7',
    border: '#E3E0D6',
    text: '#1F2937',
    textMuted: '#8A8578',
    inputBg: '#FFFFFF',
    aiBubbleBg: '#FFFFFF',
    aiBubbleText: '#1F2937',
    userBubbleBg: '#1F2937',
    userBubbleText: '#FFFFFF',
    hoverBg: 'rgba(255,255,255,0.6)',
  },
  dark: {
    pageBg: '#15171C',
    panelBg: '#1B1E24',
    border: '#2A2E37',
    text: '#EDECE7',
    textMuted: '#8B8F98',
    inputBg: '#22252C',
    aiBubbleBg: '#22252C',
    aiBubbleText: '#EDECE7',
    userBubbleBg: '#EDECE7',
    userBubbleText: '#15171C',
    hoverBg: 'rgba(255,255,255,0.05)',
  },
};

export default function ChatPage() {
  const router = useRouter();
  const [checkedAuth, setCheckedAuth] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push('/login');
    } else {
      setCheckedAuth(true);
    }
  }, [router]);
  const [isDark, setIsDark] = useState(false);
  const t = isDark ? themes.dark : themes.light;

  const [selectedId, setSelectedId] = useState(personas[0].id);
  const [conversations, setConversations] = useState<Record<string, Message[]>>(() => {
    const initial: Record<string, Message[]> = {};
    personas.forEach((p) => {
      initial[p.id] = [{ id: `${p.id}-greeting`, role: 'tutor', content: p.greeting, time: '10:00' }];
    });
    return initial;
  });
  const [typingMap, setTypingMap] = useState<Record<string, boolean>>({});
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activePersona = personas.find((p) => p.id === selectedId)!;
  const messages = conversations[selectedId] ?? [];
  const isTyping = !!typingMap[selectedId];

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, selectedId]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [input]);

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isTyping) return;

    const personaId = selectedId;
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: trimmed, time: nowTime() };

    setConversations((prev) => ({ ...prev, [personaId]: [...(prev[personaId] ?? []), userMsg] }));
    setInput('');
    setTypingMap((prev) => ({ ...prev, [personaId]: true }));
    textareaRef.current?.focus();

    setTimeout(() => {
      const tutorMsg: Message = {
        id: crypto.randomUUID(),
        role: 'tutor',
        content: '(这是一条模拟回复,后续会接上真实的对话接口)',
        time: nowTime(),
      };
      setConversations((prev) => ({ ...prev, [personaId]: [...(prev[personaId] ?? []), tutorMsg] }));
      setTypingMap((prev) => ({ ...prev, [personaId]: false }));
    }, 900);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }
if (!checkedAuth) {
    return null;
  }
    return (
    <div className="flex h-screen transition-colors" style={{ backgroundColor: t.pageBg }}>
      {/* 左侧:角色列表 */}
      <aside className="flex w-64 shrink-0 flex-col border-r transition-colors" style={{ borderColor: t.border, backgroundColor: t.panelBg }}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: t.border }}>
          <h2 className="font-serif text-sm font-semibold" style={{ color: t.text }}>我的角色</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsDark((v) => !v)}
              className="rounded-full px-2 py-1 text-xs transition"
              style={{ color: t.textMuted, backgroundColor: t.hoverBg }}
              title="切换深色模式"
            >
              {isDark ? '☀️' : '🌙'}
            </button>
            <button
              onClick={() => {
                logout();
                router.push('/login');
              }}
              className="rounded-full px-2 py-1 text-xs transition"
              style={{ color: t.textMuted, backgroundColor: t.hoverBg }}
              title="退出登录"
            >
              退出
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-1 p-2">
          {personas.map((p) => {
            const active = p.id === selectedId;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition"
                style={{
                  backgroundColor: active ? t.inputBg : 'transparent',
                  borderLeft: active ? `3px solid ${p.color}` : '3px solid transparent',
                }}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-serif text-sm font-semibold text-white" style={{ backgroundColor: p.color }}>
                  {p.initial}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" style={{ color: t.text }}>{p.name}</p>
                  <p className="truncate text-xs" style={{ color: t.textMuted }}>{p.subject}</p>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* 右侧:对话区 */}
      <div className="flex flex-1 flex-col">
        <header className="flex items-center gap-3 border-b px-6 py-4 transition-colors" style={{ borderColor: t.border, backgroundColor: t.panelBg }}>
          <div className="flex h-10 w-10 items-center justify-center rounded-full font-serif text-lg font-semibold text-white" style={{ backgroundColor: activePersona.color }}>
            {activePersona.initial}
          </div>
          <div>
            <h1 className="font-serif text-lg font-semibold" style={{ color: t.text }}>{activePersona.name}</h1>
            <p className="text-xs" style={{ color: t.textMuted }}>{activePersona.subject} · 随时在线</p>
          </div>
        </header>

        <div className="custom-scroll flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`group flex items-end gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: msg.role === 'user' ? t.text : activePersona.color, color: msg.role === 'user' ? t.pageBg : '#fff' }}
                >
                  {msg.role === 'user' ? '我' : activePersona.initial}
                </div>
                <div className={`flex max-w-[70%] flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div
                    className="rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
                    style={{
                      backgroundColor: msg.role === 'user' ? t.userBubbleBg : t.aiBubbleBg,
                      color: msg.role === 'user' ? t.userBubbleText : t.aiBubbleText,
                      borderTop: msg.role === 'tutor' ? `1px solid ${t.border}` : 'none',
                      borderRight: msg.role === 'tutor' ? `1px solid ${t.border}` : 'none',
                      borderBottom: msg.role === 'tutor' ? `1px solid ${t.border}` : 'none',
                      borderLeft: msg.role === 'tutor' ? `4px solid ${activePersona.color}` : 'none',
                    }}
                    >
                    {msg.content}
                  </div>
                  <span
                    className="mt-1 px-1 text-[10px] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                    style={{ color: t.textMuted }}
                  >
                    {msg.time}
                  </span>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex items-end gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ backgroundColor: activePersona.color }}>
                  {activePersona.initial}
                </div>
                <div className="flex gap-1 rounded-2xl px-4 py-3" style={{ backgroundColor: t.aiBubbleBg, border: `1px solid ${t.border}` }}>
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:-0.3s]" style={{ backgroundColor: activePersona.color }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:-0.15s]" style={{ backgroundColor: activePersona.color }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full" style={{ backgroundColor: activePersona.color }} />
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </div>

        <div className="border-t px-6 py-4 transition-colors" style={{ borderColor: t.border, backgroundColor: t.panelBg }}>
          <div className="mx-auto flex max-w-2xl items-end gap-3">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息,按 Enter 发送..."
              rows={1}
              className="custom-scroll flex-1 resize-none overflow-y-auto rounded-xl border px-4 py-2.5 text-sm outline-none transition focus:ring-2"
              style={{
                backgroundColor: t.inputBg,
                color: t.text,
                borderColor: t.border,
                ['--tw-ring-color' as any]: `${activePersona.color}55`,
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
              className="rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed"
              style={{
                backgroundColor: !input.trim() || isTyping ? t.border : activePersona.color,
                color: !input.trim() || isTyping ? t.textMuted : '#fff',
              }}
            >
              发送
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}