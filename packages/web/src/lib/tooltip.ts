/**
 * Lightweight tooltip action: `use:tooltip={"text"}` or
 * `use:tooltip={{ text, truncatedOnly, placement }}`.
 *
 * - Shows on hover AND keyboard focus (accessible), hides on leave/blur/Escape.
 * - `truncatedOnly` only shows when the node's text is actually clipped — ideal
 *   for ellipsised Beleg names, where the tooltip reveals the full name.
 * - The bubble is appended to <body> and positioned fixed, so it never gets
 *   clipped by a panel's overflow. Styling lives in app.css (.tooltip-pop).
 */
export type TooltipOpts =
  | string
  | { text?: string; truncatedOnly?: boolean; placement?: "top" | "bottom" }
  | undefined
  | null;

type Norm = { text: string; truncatedOnly: boolean; placement: "top" | "bottom" };

function norm(opts: TooltipOpts): Norm {
  if (typeof opts === "string") return { text: opts, truncatedOnly: false, placement: "top" };
  return {
    text: opts?.text ?? "",
    truncatedOnly: opts?.truncatedOnly ?? false,
    placement: opts?.placement ?? "top",
  };
}

export function tooltip(node: HTMLElement, opts: TooltipOpts) {
  let cur = norm(opts);
  let tip: HTMLDivElement | null = null;

  const isTruncated = () => node.scrollWidth > node.clientWidth + 1;

  function place() {
    if (!tip) return;
    const r = node.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const gap = 8;
    let top = cur.placement === "bottom" ? r.bottom + gap : r.top - t.height - gap;
    if (top < 4) top = r.bottom + gap; // flip down if no room above
    let left = r.left + r.width / 2 - t.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - t.width - 8));
    tip.style.top = `${Math.round(top)}px`;
    tip.style.left = `${Math.round(left)}px`;
  }

  function show() {
    if (tip || !cur.text) return;
    if (cur.truncatedOnly && !isTruncated()) return;
    tip = document.createElement("div");
    tip.className = "tooltip-pop";
    tip.setAttribute("role", "tooltip");
    tip.textContent = cur.text;
    document.body.appendChild(tip);
    place();
  }

  function hide() {
    tip?.remove();
    tip = null;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") hide();
  }

  node.addEventListener("mouseenter", show);
  node.addEventListener("mouseleave", hide);
  node.addEventListener("focus", show);
  node.addEventListener("blur", hide);
  node.addEventListener("keydown", onKey);

  return {
    update(next: TooltipOpts) {
      cur = norm(next);
      if (tip) {
        if (!cur.text) hide();
        else {
          tip.textContent = cur.text;
          place();
        }
      }
    },
    destroy() {
      hide();
      node.removeEventListener("mouseenter", show);
      node.removeEventListener("mouseleave", hide);
      node.removeEventListener("focus", show);
      node.removeEventListener("blur", hide);
      node.removeEventListener("keydown", onKey);
    },
  };
}
