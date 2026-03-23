import { Globe, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { ReactElement } from 'react'

interface BrowserSecurityIndicatorProps {
  isSecure: boolean
  securityLabel: string | null
}

export default function BrowserSecurityIndicator({
  isSecure,
  securityLabel,
}: BrowserSecurityIndicatorProps): ReactElement {
  const label = securityLabel ?? 'Not secure'
  const Icon = securityLabel === 'Certificate error'
    ? ShieldAlert
    : isSecure
      ? ShieldCheck
      : Globe

  return (
    <div
      className={`browser-security-indicator ${isSecure ? 'browser-security-indicator-secure' : 'browser-security-indicator-warning'}`}
      title={label}
      aria-label={label}
    >
      <Icon size={13} />
      <span>{label}</span>
    </div>
  )
}
