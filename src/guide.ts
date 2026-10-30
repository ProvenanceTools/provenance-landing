/**
 * The guide page: one of four topics is open at a time, chosen by the address
 * (#installation, #troubleshooting, #instructors, #administration). Installation and
 * Troubleshooting also take an editor (#installation/neovim). The head script has already
 * set data-topic and data-ide on <html> so the right text is there from the first frame;
 * this keeps them in step with the address afterwards and adds the small conveniences.
 */

const TOPICS = ['installation', 'troubleshooting', 'instructors', 'administration'] as const;
const EDITORS = ['vscode', 'jetbrains', 'neovim'] as const;
type Topic = (typeof TOPICS)[number];
type Editor = (typeof EDITORS)[number];

const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const isTopic = (v: string | undefined): v is Topic => TOPICS.includes(v as Topic);
const isEditor = (v: string | undefined): v is Editor => EDITORS.includes(v as Editor);

function current(): { topic: Topic; ide: Editor } {
  return {
    topic: root.getAttribute('data-topic') as Topic,
    ide: root.getAttribute('data-ide') as Editor,
  };
}

/** Read the address. An editor that is not in it keeps the one already chosen. */
function fromAddress(): { topic: Topic; ide: Editor; section: string } {
  const [t, e] = location.hash.slice(1).split('/');
  const now = current();
  return {
    topic: isTopic(t) ? t : 'installation',
    ide: isEditor(e) ? e : now.ide,
    // Anything else after the topic names a place inside it, e.g. #administration/manifest.
    section: e && !isEditor(e) ? e : '',
  };
}

/** Bring a named place inside the open topic into view. Returns false if there is none. */
function revealSection(topic: Topic, section: string): boolean {
  if (!section) return false;
  const el = document.querySelector<HTMLElement>(
    `.gd-panel[data-topic="${topic}"] [data-section="${CSS.escape(section)}"]`,
  );
  if (!el) return false;
  el.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  return true;
}

function apply(topic: Topic, ide: Editor): void {
  root.setAttribute('data-topic', topic);
  root.setAttribute('data-ide', ide);

  document.querySelectorAll<HTMLElement>('[data-topic-link]').forEach((a) => {
    if (a.dataset.topicLink === topic) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.querySelectorAll<HTMLElement>('[data-ide-tab]').forEach((b) => {
    const on = b.dataset.ideTab === ide;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  const panel = document.querySelector<HTMLElement>(`.gd-panel[data-topic="${topic}"]`);
  document.title = `${panel?.dataset.title ?? 'Guide'} · Provenance guide`;
}

/** When the topic changes, bring the top of the new text into view under the sticky bar. */
function revealTop(topic: Topic): void {
  const panel = document.querySelector<HTMLElement>(`.gd-panel[data-topic="${topic}"]`);
  const bar = document.querySelector<HTMLElement>('.gd-topics');
  if (!panel || !bar) return;
  const top = panel.getBoundingClientRect().top + scrollY - bar.offsetHeight;
  if (scrollY > top) scrollTo({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' });
}

// The address changed: a topic link, the back and forward buttons, or a typed link.
let shown = current().topic;
addEventListener('hashchange', () => {
  const next = fromAddress();
  apply(next.topic, next.ide);
  if (!revealSection(next.topic, next.section) && next.topic !== shown) revealTop(next.topic);
  shown = next.topic;
});

// Editor switch. It changes the address in place (no new history entry): choosing an editor
// is a setting, not a place you navigate to.
function chooseEditor(ide: Editor): void {
  const { topic } = current();
  apply(topic, ide);
  if (topic === 'installation' || topic === 'troubleshooting') {
    history.replaceState(null, '', `#${topic}/${ide}`);
  }
}
document.querySelectorAll<HTMLElement>('[data-ide-tabs]').forEach((tabs) => {
  const buttons = [...tabs.querySelectorAll<HTMLButtonElement>('[data-ide-tab]')];
  buttons.forEach((b, i) => {
    b.addEventListener('click', () => chooseEditor(b.dataset.ideTab as Editor));
    b.addEventListener('keydown', (e) => {
      const k = e.key;
      const to =
        k === 'ArrowRight'
          ? i + 1
          : k === 'ArrowLeft'
            ? i - 1
            : k === 'Home'
              ? 0
              : k === 'End'
                ? buttons.length - 1
                : -1;
      if (to < 0) return;
      e.preventDefault();
      const next = buttons[(to + buttons.length) % buttons.length]!;
      chooseEditor(next.dataset.ideTab as Editor);
      next.focus();
    });
  });
});

// Copy buttons on the commands the official documentation gives.
document.querySelectorAll<HTMLElement>('pre[data-copy]').forEach((pre) => {
  const wrap = document.createElement('div');
  wrap.className = 'gd-codewrap';
  pre.replaceWith(wrap);
  wrap.append(pre);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'gd-copy';
  btn.textContent = 'Copy';
  btn.setAttribute('aria-label', 'Copy command');
  let timer = 0;
  btn.addEventListener('click', async () => {
    const text = pre.textContent ?? '';
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'Copied';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(pre);
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      btn.textContent = 'Press ⌘C';
    }
    clearTimeout(timer);
    timer = window.setTimeout(() => (btn.textContent = 'Copy'), 1800);
  });
  wrap.append(btn);
});

const start = fromAddress();
apply(start.topic, start.ide);
// A link straight to a place inside a topic: wait a frame so the topic has laid out.
if (start.section) requestAnimationFrame(() => revealSection(start.topic, start.section));
