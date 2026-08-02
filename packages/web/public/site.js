/* Behaviour for the generated marketing pages. The Svelte tool at /app/ brings
   its own; this is only the header menu plus the same anonymous page-view
   counter, for pages that ship no bundle at all.

   Deliberately a plain script in public/: these pages should stay useful with
   the network flaky and the bundle absent. */
(function () {
  "use strict";

  /* -- header menu --------------------------------------------------------- */

  var pill = document.querySelector(".header-pill");
  var burger = pill && pill.querySelector(".header-pill-hamburger");

  function setMenu(open) {
    if (!pill || !burger) return;
    pill.setAttribute("data-menu-open", open ? "true" : "false");
    burger.setAttribute("aria-expanded", open ? "true" : "false");
  }

  if (burger) {
    burger.addEventListener("click", function () {
      setMenu(pill.getAttribute("data-menu-open") !== "true");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setMenu(false);
    });
    // A click anywhere outside the header dismisses the menu.
    document.addEventListener("click", function (e) {
      if (!pill.contains(e.target)) setMenu(false);
    });
    // Following a link inside the menu should close it (same-page anchors would
    // otherwise leave it hanging open over the content).
    pill.querySelectorAll(".header-pill-dropdown a").forEach(function (a) {
      a.addEventListener("click", function () {
        setMenu(false);
      });
    });
  }

  /* -- anonymous, cookieless page views ------------------------------------ */

  // Only on the live site — never on localhost, previews or forks. The site id
  // is not a secret; it ships in the client script either way.
  var host = location.hostname;
  var onProd = host === "belegabgleich.de" || /\.belegabgleich\.de$/.test(host);
  if (onProd) {
    var s = document.createElement("script");
    s.src = "https://analytics-2.needle.tools/api/script.js";
    s.defer = true;
    s.setAttribute("data-site-id", "ed99aaf8d576");
    document.head.appendChild(s);
  }
})();
