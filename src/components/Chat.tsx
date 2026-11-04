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

/** Chat button in the header, with an unread badge. */
export function ChatButton() {
  const unread = useUI((s) => s.unread);
  const open = useUI((s) => s.open);
  return (
    <button
      aria-label={unread ? `Open chat, ${unread} unread` : 'Open chat'}
      onClick={() => open('chat')}
      className={`medallion-sm relative grid h-8 w-8 place-items-center text-gold-soft ${unread ? 'animate-[pulse_1.6s_ease-in-out_infinite]' : ''}`}
      data-testid="chat-bubble"
    >
      <MessageCircle size={15} />
      <AnimatePresence>
        {unread > 0 && (
          <motion.span key={unread} initial={{ scale: 0.4 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute -right-1.5 -top-1.5 grid min-h-[18px] min-w-[18px] place-items-center rounded-full bg-maroon px-1 text-[10px] font-bold text-gold-soft ring-1 ring-gold" data-testid="chat-unread">
            {unread > 9 ? '9+' : unread}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
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
          className="mh-panel-strong fixed inset-x-3 top-2 z-50 mx-auto flex max-w-sm items-center gap-3 px-3 py-2 text-left"
          role="status"
          data-testid="chat-banner"
        >
          <Avatar name={banner.name} size={32} />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-gold-soft">{banner.name}</span>
            <span className="block truncate text-sm text-paper">{banner.body}</span>
          </span>
          <span className="tag-gold rounded-full px-2 py-0.5 text-[10px] font-bold uppercase">Reply</span>
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
      <div className="flex h-[calc(var(--app-h)-8rem)] flex-col">
        <div className="flex-1 space-y-2 overflow-y-auto pr-1" data-testid="chat-list">
          {messages.length === 0 && <p className="mt-6 text-center text-sm text-muted">No messages yet. Say something!</p>}
          {messages.map((m) => {
            const mine = m.pid === myId;
            return (
              <div key={m.id} className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                {!mine && <Avatar name={m.name} size={26} />}
                <div className={`max-w-[78%] rounded-2xl px-3 py-1.5 text-sm ${mine ? 'tag-gold rounded-br-sm' : 'rounded-bl-sm bg-[#21170d] text-paper ring-1 ring-line'}`}>
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
