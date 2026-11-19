// Small inline icon set (24x24, stroke-based) so no icon library is needed.
const PATHS = {
  bag: 'M5 8h14l-1 12H6L5 8zM9 8V6a3 3 0 016 0v2',
  user: 'M16 8a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 6l12 12M18 6L6 18',
  chevron: 'M6 9l6 6 6-6',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'M5 12l5 5 9-10',
  alert: 'M12 3l10 18H2L12 3zM12 10v5M12 18v.5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  pin: 'M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11zM12 12a2 2 0 100-4 2 2 0 000 4z',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z',
  hand: 'M8 13V5a1.5 1.5 0 013 0v6M11 11V4a1.5 1.5 0 013 0v7M14 11V6a1.5 1.5 0 013 0v8c0 4-3 7-6 7s-5-2-6-5l-1-3a1.5 1.5 0 012-1.5L8 14',
  leaf: 'M5 19C5 10 10 5 20 4c0 10-5 15-14 15M5 19c2-5 5-8 9-10',
  flame: 'M12 3c1 4 5 6 5 11a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-10z',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 017-2.5A4 4 0 0119 10c0 5.5-7 10-7 10z',
  filter: 'M4 5h16l-6 8v6l-4-2v-4L4 5z',
  box: 'M4 8l8-4 8 4v8l-8 4-8-4V8zM4 8l8 4 8-4M12 12v8',
  truck: 'M3 6h11v10H3zM14 10h4l3 3v3h-7M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  logout: 'M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4M10 17l-5-5 5-5M5 12h11',
};

export function Icon({ name, className = 'h-5 w-5', ...rest }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...rest}>
      <path d={PATHS[name] ?? PATHS.alert} />
    </svg>
  );
}
