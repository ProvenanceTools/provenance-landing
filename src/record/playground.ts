import { GENESIS, hashEvent } from './chain-hash';
import { lineCol, offsetOf, type EventKind, type SessionEvent } from './session';

const START = `def greet(name):
    # Type anything here. Then try pasting something,
    # or click outside the editor and come back.
    return "hello, " + name
`;

/** The smallest edit that turns `a` into `b`: [start, removed length, inserted text]. */
export function diff(a: string, b: string): [number, number, string] {
  let p = 0;
  const max = Math.min(a.length, b.length);
  while (p < max && a.charCodeAt(p) === b.charCodeAt(p)) p++;
  let s = 0;
  while (s < max - p && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s++;
  return [p, a.length - p - s, b.slice(p, b.length - s)];
}

interface Row {
  event: SessionEvent;
  hash: string;
}

/**
 * A tiny recorder that runs on the page: the visitor's edits, pastes and focus
 * changes become hash-chained events, shown as they happen. Nothing is sent
 * anywhere; it all lives in this tab.
 */
export class Playground {
  private readonly events: SessionEvent[] = [];
  private readonly rows: Row[] = [];
  private prev = START;
  private prevHash = GENESIS;
  private queue: Promise<void> = Promise.resolve();
  private readonly t0 = performance.now();
  private pasteNext: number | null = null;
  private replaying = false;
  private releaseTab = false;
  private readonly abort = new AbortController();

  constructor(
    private readonly input: HTMLTextAreaElement,
    private readonly log: HTMLOListElement,
    private readonly status: HTMLElement,
    private readonly replayButton: HTMLButtonElement,
  ) {
    input.value = START;
    const opts = { signal: this.abort.signal };
    this.record('session.start', { assignment_id: 'scratch', editor: 'this page' });
    this.record('doc.open', { path: 'scratch.py', lines: START.split('\n').length - 1 });

    input.addEventListener(
      'paste',
      (e) => {
        this.pasteNext = e.clipboardData?.getData('text/plain').length ?? null;
      },
      opts,
    );
    input.addEventListener('input', () => this.onInput(), opts);
    input.addEventListener('focus', () => this.record('focus.change', { focused: true }), opts);
    input.addEventListener(
      'blur',
      () => {
        this.releaseTab = false;
        this.record('focus.change', { focused: false });
      },
      opts,
    );
    input.addEventListener(
      'keydown',
      (e) => {
        // A real editor indents with Tab and keeps focus in the editor. Escape hands Tab
        // back to the page, so the editor is never a keyboard trap.
        if (e.key === 'Escape') this.releaseTab = true;
        else if (e.key === 'Tab' && this.releaseTab) this.releaseTab = false;
        else if (e.key === 'Tab' && !e.shiftKey) {
          e.preventDefault();
          const { selectionStart: a, selectionEnd: b } = input;
          input.setRangeText('    ', a, b, 'end');
          this.onInput();
        }
      },
      opts,
    );
    replayButton.addEventListener('click', () => void this.replay(), opts);
    input.addEventListener('pointerdown', () => (this.demoCancelled = true), opts);
    input.addEventListener('keydown', () => (this.demoCancelled = true), opts);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          void this.demo();
        }
      },
      { threshold: 0.6 },
    );
    io.observe(input);
    this.abort.signal.addEventListener('abort', () => io.disconnect());
  }

  private demoCancelled = false;

  /** Until the visitor takes over, the editor types a line by itself. */
  private async demo(): Promise<void> {
    const line = '\n\nprint(greet("Ada"))';
    await new Promise((r) => setTimeout(r, 700));
    for (const ch of line) {
      if (this.demoCancelled || this.replaying) return;
      const end = this.input.value.length;
      this.input.setRangeText(ch, end, end, 'end');
      this.onInput();
      await new Promise((r) => setTimeout(r, ch === '\n' ? 320 : 70 + Math.random() * 110));
    }
  }

  private onInput(): void {
    if (this.replaying) return;
    const next = this.input.value;
    const [start, removed, inserted] = diff(this.prev, next);
    if (!removed && !inserted) return;
    const [l0, c0] = lineCol(this.prev, start);
    const [l1, c1] = lineCol(this.prev, start + removed);
    const lines = inserted.split('\n').length;
    // Two of the recorder's paste signals: the paste itself, or one large insertion.
    const isPaste = this.pasteNext !== null || inserted.length >= 24;
    this.pasteNext = null;
    if (isPaste && inserted) {
      this.record('paste', {
        path: 'scratch.py',
        range: [l0, c0, l1, c1],
        length: inserted.length,
        lines,
        content: inserted,
      });
    } else {
      this.record('doc.change', {
        path: 'scratch.py',
        range: [l0, c0, l1, c1],
        text: inserted,
        source: 'typing',
      });
    }
    this.prev = next;
  }

  private record(kind: EventKind, data: Record<string, unknown>): void {
    const t = Math.round(performance.now() - this.t0);
    const event: SessionEvent = {
      seq: this.events.length,
      t,
      wall: new Date().toISOString(),
      kind,
      data,
    };
    this.events.push(event);
    // Hashing is async; a queue keeps the chain in order.
    this.queue = this.queue.then(async () => {
      const hash = await hashEvent(event, this.prevHash);
      this.prevHash = hash;
      this.rows.push({ event, hash });
      this.paint(event, hash);
    });
  }

  private paint(event: SessionEvent, hash: string): void {
    const li = document.createElement('li');
    const d = event.data;
    let snip = '';
    if (event.kind === 'doc.change') snip = d.text ? ` +${JSON.stringify(d.text)}` : ' (delete)';
    if (event.kind === 'paste')
      snip = ` ${d.length} chars, ${d.lines} line${d.lines === 1 ? '' : 's'}`;
    if (event.kind === 'focus.change')
      snip = d.focused ? ' back in the editor' : ' left the editor';
    li.innerHTML = `<span>${String(event.seq).padStart(3, '0')}</span><span class="k"></span><span class="h">${hash.slice(0, 8)}</span>`;
    const k = li.querySelector('.k')!;
    k.append(event.kind);
    if (snip) {
      const i = document.createElement('i');
      i.textContent = snip;
      k.append(i);
    }
    if (event.kind === 'paste') li.classList.add('is-paste');
    this.append(li);
    if (event.kind === 'paste') {
      const note = document.createElement('li');
      note.className = 'is-note';
      note.textContent =
        Number(d.length) >= 40
          ? 'A paste this size gets a second look from a person.'
          : 'Small pastes are normal.';
      this.append(note);
    }
    this.status.textContent = `${this.rows.length} event${this.rows.length === 1 ? '' : 's'}`;
  }

  private append(li: HTMLLIElement): void {
    this.log.append(li);
    while (this.log.children.length > 40) this.log.firstElementChild?.remove();
  }

  /** Plays the visitor's own edits back into the editor, the way a reviewer sees them. */
  private async replay(): Promise<void> {
    if (this.replaying) return;
    this.replaying = true;
    this.replayButton.disabled = true;
    this.input.readOnly = true;
    let text = START;
    this.input.value = text;
    let last = 0;
    for (const e of this.events) {
      if (e.kind !== 'doc.change' && e.kind !== 'paste') continue;
      const wait = Math.min(140, Math.max(16, (e.t - last) / 4));
      last = e.t;
      await new Promise((r) => setTimeout(r, wait));
      const [l0, c0, l1, c1] = e.data.range as number[];
      const a = offsetOf(text, l0!, c0!);
      const b = offsetOf(text, l1!, c1!);
      const insert = String(e.kind === 'paste' ? e.data.content : e.data.text);
      text = text.slice(0, a) + insert + text.slice(b);
      this.input.value = text;
    }
    this.input.readOnly = false;
    this.replayButton.disabled = false;
    this.replaying = false;
  }

  dispose(): void {
    this.abort.abort();
  }
}
