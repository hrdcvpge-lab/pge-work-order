import type { ReactNode, SVGProps } from 'react'

type IconName =
  | 'dashboard'
  | 'list'
  | 'station'
  | 'boxes'
  | 'chart'
  | 'plus'
  | 'search'
  | 'arrow'
  | 'close'
  | 'clock'
  | 'warning'
  | 'check'
  | 'play'
  | 'pause'
  | 'more'
  | 'calendar'
  | 'user'
  | 'printer'
  | 'package'
  | 'image'
  | 'upload'

type Props = SVGProps<SVGSVGElement> & { name: IconName }

export function Icon({ name, ...props }: Props) {
  const base = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...props,
  }

  const paths: Record<IconName, ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    list: <><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></>,
    station: <><path d="M4 19h16M6 19V9h12v10M8 9V5h8v4M9 13h.01M15 13h.01"/></>,
    boxes: <><path d="m12 3 8 4.2v9.6L12 21l-8-4.2V7.2L12 3Z"/><path d="m4 7.2 8 4.3 8-4.3M12 11.5V21"/></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    search: <><circle cx="11" cy="11" r="6"/><path d="m20 20-4.2-4.2"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    clock: <><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></>,
    warning: <><path d="m12 3 9 16H3L12 3Z"/><path d="M12 9v4M12 16h.01"/></>,
    check: <><path d="m5 12 4 4L19 6"/></>,
    play: <><path d="m8 5 11 7-11 7V5Z"/></>,
    pause: <><path d="M9 5v14M15 5v14"/></>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    calendar: <><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></>,
    user: <><circle cx="12" cy="8" r="3"/><path d="M5 21c.8-4 3.2-6 7-6s6.2 2 7 6"/></>,
    printer: <><path d="M6 9V4h12v5M6 17H4V10h16v7h-2"/><path d="M7 14h10v6H7z"/></>,
    package: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5.2-5 3.3 3 2.1-2 4.4 4"/></>,
    upload: <><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></>,
  }

  return <svg {...base}>{paths[name]}</svg>
}
