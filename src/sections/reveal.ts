import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, SplitText);

const EASE = 'expo.out';

/**
 * Entrances below the hero (the hero animates in CSS, so it never waits on script).
 * Headlines rise line by line out of a mask; supporting copy fades up. Skipped
 * under reduced motion, where the CSS leaves everything visible.
 */
export function setupReveals(): () => void {
  const ctx = gsap.context(() => {
    // Headlines.
    document.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
      const inHow = Boolean(el.closest('.how'));
      SplitText.create(el, {
        type: 'lines',
        mask: 'lines',
        linesClass: 'line',
        autoSplit: true,
        onSplit(self) {
          el.style.visibility = 'visible';
          if (inHow) return; // the pinned chapter crossfades its copy as a whole
          return gsap.from(self.lines, {
            yPercent: 130, // clears the mask, which reaches 0.2em below the line
            duration: 1.25,
            ease: EASE,
            stagger: 0.085,
            scrollTrigger: { trigger: el, start: 'top 86%', once: true },
          });
        },
      });
    });

    // Supporting copy.
    document.querySelectorAll<HTMLElement>('[data-fade]').forEach((el) => {
      gsap.fromTo(
        el,
        { opacity: 0, y: 26 },
        {
          opacity: 1,
          y: 0,
          duration: 1.3,
          ease: EASE,
          scrollTrigger: { trigger: el, start: 'top 90%', once: true },
        },
      );
    });

    // Course names, one after another.
    gsap.fromTo(
      '[data-course]',
      { opacity: 0, yPercent: 55 },
      {
        opacity: 1,
        yPercent: 0,
        duration: 1.2,
        ease: EASE,
        stagger: 0.07,
        scrollTrigger: { trigger: '.proof__courses', start: 'top 84%', once: true },
      },
    );
  });

  return () => ctx.revert();
}
