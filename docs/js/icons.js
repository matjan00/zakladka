// One stroke icon set (24px grid, 1.75 stroke, round caps). icon('name', size?)
const P = {
  home: '<path d="M3.5 12.5c0-4 3.8-6.2 8.5-6.2s8.5 2.2 8.5 6.2z"/><path d="M12 6.3V3.5M12 12.5V19M7.5 20.5h9M16.5 12.5v2.5"/>', // the banker's lamp
  shelf: '<path d="M4 4.5h3.2v14H4zM8.8 6.5H12v12H8.8zM13.4 5.2l3-.8 3.4 13.3-3 .8z"/><path d="M3 20.5h18"/>',
  timer: '<circle cx="12" cy="13.5" r="7"/><path d="M12 13.5V10M9.5 3h5M18.5 7l1.2-1.2"/>',
  quote: '<path d="M5 18.5c0-5 1.2-9.3 6-11.5M14 18.5c0-5 1.2-9.3 6-11.5"/><path d="M5 18.5h4.6v-4.6H5zM14 18.5h4.6v-4.6H14z"/>',
  stats: '<path d="M4 20.5h16M7 17V11M12 17V6M17 17v-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  back: '<path d="M15 5 8 12l7 7"/>',
  chev: '<path d="m9 5 7 7-7 7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  barcode: '<path d="M4 6v12M7 6v12M10.5 6v12M13 6v12M16.5 6v12M20 6v12"/><path d="M2.5 4h3M18.5 4h3M2.5 20h3M18.5 20h3" opacity=".6"/>',
  edit: '<path d="M5 19h3.5L19 8.5 15.5 5 5 15.5z"/><path d="m13.5 7 3.5 3.5"/>',
  trash: '<path d="M5 7h14M10 7V4.8h4V7M7 7l.8 12.2h8.4L17 7"/>',
  camera: '<path d="M4 8.5h3.2L9 6h6l1.8 2.5H20V19H4z"/><circle cx="12" cy="13.2" r="3.3"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  grid: '<path d="M4.5 4.5h6v6.5h-6zM13.5 4.5h6v6.5h-6zM4.5 13.5h6V20h-6zM13.5 13.5h6V20h-6z"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.5M4.5 12h.5M4.5 17.5h.5"/>',
  spines: '<path d="M5 4h3v16H5zM9.5 7h3v13h-3zM14 5h3v15h-3z"/><path d="M3.5 20h17"/>',
  sort: '<path d="M7 5v14M4 16l3 3 3-3M17 19V5M14 8l3-3 3 3"/>',
  tag: '<path d="M4 4h7.5l8.5 8.5-7.5 7.5L4 11.5z"/><circle cx="8" cy="8" r="1.2"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  book: '<path d="M4 5.5c2.8-1 5.5-.8 8 .8 2.5-1.6 5.2-1.8 8-.8V19c-2.8-1-5.5-.8-8 .8-2.5-1.6-5.2-1.8-8-.8z"/><path d="M12 6.3v13.5"/>',
  compass: '<circle cx="12" cy="12" r="8"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  library: '<path d="M3.5 9 12 4l8.5 5M5 9.5V18M9.7 9.5V18M14.3 9.5V18M19 9.5V18M3.5 20h17"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z"/>',
  more: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
  external: '<path d="M13.5 4.5H19.5V10.5M19 5l-8 8M10 6H5v13h13v-5"/>',
  install: '<path d="M7.5 3.5h9v17h-9z"/><path d="M12 8v6.5M9.5 12l2.5 2.5 2.5-2.5"/>',
  refresh: '<path d="M19 12a7 7 0 1 1-2.1-5M19 4.5V8h-3.5"/>',
};
export function icon(name, size = 24, cls = '') {
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}
