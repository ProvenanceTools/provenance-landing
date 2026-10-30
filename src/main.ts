import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { detect } from './capabilities';
import { Playground } from './record/playground';
import { buildPastedSession, buildSession } from './record/session';
import { mountCohort } from './sections/cohort';
import { mountEvening } from './sections/evening';
import { mountField } from './sections/field';
import { mountHistories } from './sections/histories';
import { mountEmboss, signalPattern } from './sections/outline';
import { setupReveals } from './sections/reveal';
import { mountSuite } from './sections/suite';

gsap.registerPlugin(ScrollTrigger);

const $ = <T extends Element>(s: string) => document.querySelector<T>(s);

/**
 * Three pages share this script (overview, students, instructors), so every
 * section is optional: each one mounts only if it is on the page. Scrolling is
 * the browser's own; nothing is pinned or driven by scroll position.
 */
function boot(): void {
  const reduced = detect().reducedMotion;
  const disposers: (() => void)[] = [];

  // 2D graphics.
  const emboss = $<HTMLElement>('.emboss');
  if (emboss) mountEmboss(emboss);
  const pattern = $<HTMLElement>('[data-pattern]');
  if (pattern) pattern.style.backgroundImage = signalPattern('#fc9313', '#fdb515');
  const cohort = $<HTMLElement>('[data-cohort]');
  if (cohort) disposers.push(mountCohort(cohort, $<HTMLElement>('[data-count]'), { reduced }));
  const suite = $<HTMLElement>('[data-suite]');
  if (suite) disposers.push(mountSuite(suite, { reduced }));
  const field = $<HTMLElement>('[data-field]');
  if (field) disposers.push(mountField(field));
  const flag = $<HTMLElement>('[data-flag]');
  if (flag) disposers.push(demoteFlag(flag, reduced));

  // The try-it editor.
  const input = $<HTMLTextAreaElement>('[data-input]');
  if (input) {
    const playground = new Playground(
      input,
      $<HTMLOListElement>('[data-log]')!,
      $<HTMLElement>('[data-log-status]')!,
      $<HTMLButtonElement>('.playground [data-replay]')!,
    );
    disposers.push(() => playground.dispose());
  }

  // The record: an illustrative session, hash-chained in the browser.
  const historiesEl = $<HTMLElement>('.histories');
  const eveningEl = $<HTMLElement>('[data-evening-plot]');
  if (historiesEl || eveningEl) {
    const session = buildSession();
    if (historiesEl) {
      const histories = mountHistories(historiesEl, session, buildPastedSession(), { reduced });
      disposers.push(() => histories.dispose());
    }
    if (eveningEl) {
      disposers.push(mountEvening(eveningEl, $<HTMLElement>('[data-evening-axis]')!, session));
      revealEvening($<HTMLElement>('.evening')!, reduced);
    }
  }

  if (!reduced) disposers.push(setupReveals());

  window.addEventListener('pagehide', () => disposers.forEach((d) => d()), { once: true });
}

/** The annotated evening draws itself left to right as it scrolls up into view. */
function revealEvening(el: HTMLElement, reduced: boolean): void {
  if (reduced) {
    el.style.setProperty('--reveal', '1');
    return;
  }
  ScrollTrigger.create({
    trigger: el,
    start: 'top bottom',
    end: 'top 62%',
    onUpdate: (self) => el.style.setProperty('--reveal', self.progress.toFixed(4)),
  });
}

/** A paste flag that turns out to be the student's own code, demoted in place. */
function demoteFlag(el: HTMLElement, reduced: boolean): () => void {
  const level = el.querySelector<HTMLElement>('[data-flag-level]')!;
  const text = el.querySelector<HTMLElement>('[data-flag-text]')!;
  let timer = 0;
  const demote = () => {
    text.style.opacity = '0';
    timer = window.setTimeout(
      () => {
        level.textContent = 'info';
        text.textContent = 'Code moved within trails.py';
        text.style.opacity = '1';
        el.classList.add('is-moved');
      },
      reduced ? 0 : 280,
    );
  };
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        timer = window.setTimeout(demote, reduced ? 0 : 1100);
      }
    },
    { threshold: 1 },
  );
  io.observe(el);
  return () => {
    io.disconnect();
    clearTimeout(timer);
  };
}

boot();
