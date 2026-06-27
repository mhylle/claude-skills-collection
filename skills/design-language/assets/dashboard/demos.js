/*
 * demos.js — small, dependency-free interactivity for motion.html & imagery.html.
 *
 * No libraries, no build step, offline-safe. It reads the live CSS custom
 * properties (--motion-*) at runtime so the demos always animate with the
 * language's *current* tokens, not hardcoded values. It also honours
 * prefers-reduced-motion. Everything is wired up by data-attributes so the
 * generated HTML stays declarative.
 */
(function () {
  "use strict";

  var prefersReduced = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  /* Read a CSS custom property off :root (e.g. "--motion-duration-base"). */
  function tokenValue(name) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
  }

  /* ----- Motion demo: replay a transition using the live --motion-* tokens. */
  function initMotionReplays() {
    var triggers = document.querySelectorAll("[data-motion-replay]");
    triggers.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var targetSel = btn.getAttribute("data-motion-replay");
        var target = document.querySelector(targetSel);
        if (!target) return;
        // Toggle the .is-animated class off then on to re-trigger the CSS
        // transition. The transition itself is defined in the page using the
        // motion tokens, so this just drives it.
        target.classList.remove("is-animated");
        // force reflow so the browser registers the removal
        void target.offsetWidth;
        target.classList.add("is-animated");
      });
    });
  }

  /* ----- Motion readout: show the current token values so the page is honest. */
  function initMotionReadout() {
    var nodes = document.querySelectorAll("[data-token-readout]");
    nodes.forEach(function (node) {
      var name = node.getAttribute("data-token-readout");
      node.textContent = tokenValue(name) || "(unset)";
    });
  }

  /* ----- Imagery treatment switcher.
   * A toolbar of buttons each carries data-imagery="<treatment>"; clicking sets
   * that treatment class on the gallery so the user can flip between the
   * imagery-dimension approaches (grid / masonry / collage / parallax / cloud).
   */
  function initImagerySwitcher() {
    var galleries = document.querySelectorAll("[data-imagery-gallery]");
    galleries.forEach(function (gallery) {
      var toolbar = gallery.previousElementSibling;
      if (!toolbar || !toolbar.matches("[data-imagery-toolbar]")) {
        // also allow the toolbar to be found anywhere referencing this gallery
        toolbar = document.querySelector(
          '[data-imagery-toolbar][data-for="' + gallery.id + '"]'
        );
      }
      if (!toolbar) return;

      var buttons = toolbar.querySelectorAll("[data-imagery]");
      function apply(treatment) {
        // strip any prior treatment-* class
        gallery.className = gallery.className
          .split(/\s+/)
          .filter(function (c) {
            return c.indexOf("treatment-") !== 0;
          })
          .join(" ");
        gallery.classList.add("treatment-" + treatment);
        buttons.forEach(function (b) {
          var on = b.getAttribute("data-imagery") === treatment;
          b.setAttribute("aria-pressed", on ? "true" : "false");
        });
        // The 3D cloud treatment uses a slow auto-rotate; pause it under
        // reduced-motion to respect the user's OS preference.
        if (treatment === "cloud" && prefersReduced) {
          gallery.classList.add("treatment-cloud--static");
        } else {
          gallery.classList.remove("treatment-cloud--static");
        }
      }

      buttons.forEach(function (b) {
        b.addEventListener("click", function () {
          apply(b.getAttribute("data-imagery"));
        });
      });

      // initial treatment: first button or "grid"
      var initial = buttons.length ? buttons[0].getAttribute("data-imagery") : "grid";
      apply(initial);
    });
  }

  function init() {
    initMotionReplays();
    initMotionReadout();
    initImagerySwitcher();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
