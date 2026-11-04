'use client';
import { AnimatePresence, motion } from 'motion/react';
import { MessageCircle, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { play } from '@/lib/sound';
import { useRoomStore } from '@/store/room';
import { useUI } from '@/store/ui';
import { Avatar } from './Avatar';
import { Sheet } from './Sheet';

/** Floating bubble on the right edge with an unread badge. */
export function ChatBubble() {
  const unread = useUI((s) => s.unread);
  const open = useUI((s) => s.open);
  return (
    <motion.button
      aria-label={unread ? `Open chat, ${unread} unread` : 'Open chat'}
      onClick={() => open('chat')}
      whileTap={{ scale: 0.92 }}
      className="fixed right-0 top-[30%] z-30 grid h-12 w-10 place-items-center rounded-l-2xl border border-r-0 border-gold/50 bg-panel/90 pl-1 text-gold shadow-[0_6px_24px_rgba(0,0,0,.5)] backdrop-blur"
      data-testid="chat-bubble"
    >
      <MessageCircle size={20} />
      <AnimatePresence>
        {unread > 0 && (
          <motion.span
            key={unread}
            initial={{ scale: 0.4 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="absolute -left-2 -top-1.5 grid min-h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white"
            data-testid="chat-unread"
          >
            {unread > 9 ? '9+' : unread}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

/** Slide-down banner for a new message while the chat is closed. */
export function ChatBanner() {
  const banner = useUI((s) => s.banner);
  const open = useUI((s) => s.open);
  const clear = useUI((s) => s.clearBanner);
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(clear, 4800);
    return () => clearTimeout(t);
  }, [banner, clear]);
  return (
    <AnimatePresence>
      {banner && (
        <motion.button
          key={banner.id}
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          onClick={() => open('chat')}
          className="fixed inset-x-3 top-3 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-gold/50 bg-panel/95 px-3 py-2.5 text-left shadow-[0_10px_40px_rgba(0,0,0,.6)] backdrop-blur"
          role="status"
          data-testid="chat-banner"
        >
          <Avatar name={banner.name} size={32} />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-gold-soft">{banner.name}</span>
            <span className="block truncate text-sm text-paper">{banner.body}</span>
          </span>
          <span className="rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold uppercase text-ink">Reply</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

export function ChatSheet({ code }: { code: string }) {
  const sheet = useUI((s) => s.sheet);
  const close = useUI((s) => s.close);
  const messages = useUI((s) => s.messages);
  const myId = useUI((s) => s.myPlayerId);
  const addMessage = useUI((s) => s.addMessage);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const open = sheet === 'chat';

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: 'end' });
  }, [open, messages.length]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setErr(null);
    try {
      const m = await api.sendChat(code, body);
      addMessage(m);
      setText('');
      play('click');
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Could not send.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet open={open} onClose={close} title="Table chat" side="right" testId="chat-sheet">
      <div className="flex h-[calc(100dvh-8rem)] flex-col">
        <div className="flex-1 space-y-2 overflow-y-auto pr-1" data-testid="chat-list">
          {messages.length === 0 && <p className="mt-6 text-center text-sm text-muted">No messages yet. Say something!</p>}
          {messages.map((m) => {
            const mine = m.pid === myId;
            return (
              <div key={m.id} className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                {!mine && <Avatar name={m.name} size={26} />}
                <div className={`max-w-[78%] rounded-2xl px-3 py-1.5 text-sm ${mine ? 'rounded-br-sm bg-gold text-ink' : 'rounded-bl-sm bg-panel-2 text-paper'}`}>
                  {!mine && <p className="text-[10px] font-semibold text-gold-soft">{m.name}</p>}
                  <p className="break-words" data-testid="chat-msg">{m.body}</p>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
        {err && <p role="alert" className="mt-1 text-xs text-danger">{err}</p>}
        <form onSubmit={submit} className="mt-2 flex gap-2">
          <input
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 200))}
            placeholder="Message the table…"
            maxLength={200}
            enterKeyHint="send"
            data-testid="chat-input"
          />
          <button className="btn btn-gold !px-3" disabled={sending || !text.trim()} aria-label="Send" data-testid="chat-send"><Send size={18} /></button>
        </form>
      </div>
    </Sheet>
  );
}

export function useChatReady() {
  return useRoomStore((s) => s.phase === 'ready');
}
