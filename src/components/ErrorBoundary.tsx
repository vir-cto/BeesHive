import { Component, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  /** Area name rendered in the fallback panel (e.g. "Tables", "Waiter Panel"). */
  label: string
  /**
   * Changing this value clears the captured error. Pass the active tab id so
   * switching menus always renders the next panel instead of a stale failure.
   */
  resetKey?: string | number
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Render-error containment.
 *
 * Without a boundary, any runtime error inside a page/portal unmounts the whole
 * React tree and the user is left staring at a blank white screen (the reported
 * "clicking Tables or any other menu makes the app go blank" bug). This keeps
 * the failure inside the affected content area and always renders an actionable
 * panel with a retry / reload escape hatch.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error) {
    if (import.meta.env.DEV) console.error(`[ErrorBoundary] "${this.props.label}" crashed:`, error)
  }

  componentDidUpdate(prev: ErrorBoundaryProps) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="box-border w-full max-w-full wrap-break-word rounded-2xl border border-red-200 bg-red-50 p-4 sm:p-6">
          <h2 className="text-base font-bold text-red-700 sm:text-lg">
            Something went wrong in “{this.props.label}”
          </h2>
          <p className="mt-2 break-all font-mono text-xs text-red-600">
            {this.state.error.message}
          </p>
          <p className="mt-3 text-sm text-red-600">
            The rest of the app keeps working. Try this section again, or reload the page.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => this.setState({ error: null })}
              className="rounded-lg bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-600"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50"
            >
              Reload page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
