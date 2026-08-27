import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

/**
 * Last line of defence. A render crash must never leave a blank page — the
 * operator needs something readable and a way back.
 */
export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // No payloads, no tokens — just what is needed to find the component.
    console.error('[cms] render error', error.message, info.componentStack)
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-card border border-line bg-surface p-6 text-center">
          <p className="font-display text-lg font-bold text-text">GoGo CMS</p>
          <p className="mt-2 text-sm text-text-muted">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => window.location.assign('/')}
            className="mt-4 inline-flex min-h-11 items-center rounded-compact bg-coral px-4 text-sm font-semibold text-text-on-accent"
          >
            GoGo CMS
          </button>
        </div>
      </div>
    )
  }
}
