export function focusPanelHeading(heading: HTMLElement | null) {
  if (!heading?.getClientRects().length) return;
  const panel = heading.closest<HTMLElement>('.case-controls');
  if (panel) panel.scrollTop = 0;
  heading.focus({ preventScroll: true });
  panel?.scrollIntoView({ block: 'start' });
  heading.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
