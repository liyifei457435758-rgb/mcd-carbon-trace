/**
 * Zero-dependency interaction adapters inspired by React Bits patterns.
 *
 * The site is intentionally still a static HTML/CSS/ES module build, so we
 * keep the same interaction grammar without shipping a React runtime:
 * CountUp, SpotlightCard, TiltedCard and AnimatedContent.
 */

export function animateNumber(element, target, {
  duration = 620,
  format = (value) => String(Math.round(value)),
} = {}) {
  if (!element) return;
  const previous = Number(element.dataset.animFrame || 0);
  if (previous) cancelAnimationFrame(previous);
  const from = Number(element.dataset.value || 0);
  const started = performance.now();
  const tick = (now) => {
    const progress = Math.min(1, (now - started) / duration);
    const eased = 1 - Math.pow(1 - progress, 4);
    const value = from + (target - from) * eased;
    element.textContent = format(value);
    element.dataset.value = String(value);
    if (progress < 1) {
      element.dataset.animFrame = String(requestAnimationFrame(tick));
    } else {
      element.dataset.animFrame = "";
      element.dataset.value = String(target);
      element.textContent = format(target);
    }
  };
  element.dataset.animFrame = String(requestAnimationFrame(tick));
}

export function attachSpotlight(element) {
  if (!element || element.dataset.spotlightReady) return;
  element.dataset.spotlightReady = "true";
  element.addEventListener("pointermove", (event) => {
    const rect = element.getBoundingClientRect();
    element.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
    element.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
  });
  element.addEventListener("pointerleave", () => {
    element.style.setProperty("--spot-x", "50%");
    element.style.setProperty("--spot-y", "20%");
  });
}

export function attachTilt(element, strength = 3.5) {
  if (!element || element.dataset.tiltReady) return;
  element.dataset.tiltReady = "true";
  element.addEventListener("pointermove", (event) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = element.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    element.style.setProperty("--rx", `${-y * strength}deg`);
    element.style.setProperty("--ry", `${x * strength}deg`);
  });
  element.addEventListener("pointerleave", () => {
    element.style.setProperty("--rx", "0deg");
    element.style.setProperty("--ry", "0deg");
  });
}

export function observeAnimatedContent(root = document) {
  const items = root.querySelectorAll("[data-reveal]");
  if (!items.length || !("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("is-visible"));
    return;
  }
  const observer = new IntersectionObserver((entries, instance) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      instance.unobserve(entry.target);
    });
  }, { threshold: 0.14, rootMargin: "0px 0px -8%" });
  items.forEach((item) => observer.observe(item));
}

