import type { ReactNode } from 'react'
import { Icon } from './Icon'

type ModalProps = {
  title: string
  subtitle?: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
}

export function Modal({ title, subtitle, children, onClose, wide = false }: ModalProps) {
  return (
    <div className="modal-layer" role="presentation">
      <section
        className={`modal-card${wide ? ' modal-card--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal-card__header">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button className="icon-button" type="button" aria-label="Tutup" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        {children}
      </section>
    </div>
  )
}
