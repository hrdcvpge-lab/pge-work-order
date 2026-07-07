import type { ReactElement, SVGProps } from 'react'

type IconName =
  | 'plus'
  | 'calendar'
  | 'clock'
  | 'box'
  | 'user'
  | 'machine'
  | 'arrowRight'
  | 'play'
  | 'check'
  | 'x'
  | 'history'
  | 'filter'
  | 'close'
  | 'clipboard'
  | 'alert'
  | 'chevron'

type Props = SVGProps<SVGSVGElement> & { name: IconName }

const paths: Record<IconName, ReactElement> = {
  plus: <><path d="M12 5v14M5 12h14" /></>,
  calendar: <><rect x="3.5" y="5.5" width="17" height="15" rx="2" /><path d="M7.5 3.5v4M16.5 3.5v4M3.5 10h17" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.2 2" /></>,
  box: <><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="M4 7v10l8 4 8-4V7M12 11v10" /></>,
  user: <><circle cx="12" cy="8" r="3.2" /><path d="M5.5 20c.8-3.6 3.1-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /></>,
  machine: <><path d="M5 19V6h9v13M14 11h5v8M7.5 9h4M7.5 13h4M3 19h18" /></>,
  arrowRight: <><path d="M4 12h15M14 6l6 6-6 6" /></>,
  play: <><path d="m9 6 8 6-8 6V6Z" /></>,
  check: <><path d="m5 12 4.2 4.2L19 6.7" /></>,
  x: <><path d="m6 6 12 12M18 6 6 18" /></>,
  history: <><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5" /><path d="M4 4v4.5h4.5M12 7v5l3.5 2" /></>,
  filter: <><path d="M4 6h16M7 12h10M10 18h4" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  clipboard: <><rect x="5" y="5" width="14" height="16" rx="2" /><path d="M9 5V4a3 3 0 0 1 6 0v1M9 10h6M9 14h6" /></>,
  alert: <><path d="m12 3 9 16H3l9-16Z" /><path d="M12 9v4M12 16h.01" /></>,
  chevron: <><path d="m8 10 4 4 4-4" /></>,
}

export function Icon({ name, ...props }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {paths[name]}
    </svg>
  )
}
