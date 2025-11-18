import React from 'react'
import styles from './GCodeMonitor.module.css'

export default function GCodeMonitor({ commands = [], isConnected = false }) {
  const scrollRef = React.useRef(null)

  // Auto-scroll to bottom when new commands arrive
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [commands])

  const clearCommands = React.useCallback(() => {
    if (typeof window !== 'undefined' && window.ipc?.send) {
      window.ipc.send('gcode:clear')
    }
  }, [])

  return (
    <article className={styles.monitorCard} aria-label="G-code command monitor">
      <header className={styles.monitorHeader}>
        <div className={styles.monitorHeaderInfo}>
          <h2 className={styles.monitorTitle}>G-code Monitor</h2>
          <span className={styles.monitorSubtitle}>
            {isConnected ? 'Live command execution' : 'Not connected'}
          </span>
        </div>
        <div className={styles.monitorActions}>
          <button
            type="button"
            className={styles.clearButton}
            onClick={clearCommands}
            disabled={commands.length === 0}
            aria-label="Clear command history"
          >
            Clear
          </button>
        </div>
      </header>

      <div className={styles.monitorContent}>
        {!isConnected && (
          <div className={styles.disconnectedMessage}>
            <span>Connect to hardware to see G-code commands</span>
          </div>
        )}

        {isConnected && commands.length === 0 && (
          <div className={styles.emptyMessage}>
            <span>No commands executed yet</span>
          </div>
        )}

        {commands.length > 0 && (
          <div className={styles.commandList} ref={scrollRef}>
            {commands.map((cmd, index) => (
              <div
                key={cmd.id || index}
                className={[
                  styles.commandItem,
                  cmd.status === 'error' ? styles.commandError : '',
                  cmd.status === 'sent' ? styles.commandSent : '',
                  cmd.status === 'received' ? styles.commandReceived : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className={styles.commandMeta}>
                  <span className={styles.commandTime}>
                    {cmd.timestamp
                      ? new Date(cmd.timestamp).toLocaleTimeString()
                      : '--:--:--'}
                  </span>
                  {cmd.status && (
                    <span className={styles.commandStatus}>
                      {cmd.status === 'sent' ? '→' : cmd.status === 'received' ? '←' : '⚠'}
                    </span>
                  )}
                </div>
                <div className={styles.commandCode}>
                  <code className={styles.gcode}>{cmd.command}</code>
                </div>
                {cmd.response && (
                  <div className={styles.commandResponse}>
                    <span className={styles.responseLabel}>Response:</span>
                    <code className={styles.responseCode}>{cmd.response}</code>
                  </div>
                )}
                {cmd.error && (
                  <div className={styles.commandError}>
                    <span className={styles.errorLabel}>Error:</span>
                    <span className={styles.errorMessage}>{cmd.error}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {commands.length > 0 && (
        <div className={styles.monitorFooter}>
          <span className={styles.commandCount}>
            {commands.length} command{commands.length !== 1 ? 's' : ''} executed
          </span>
        </div>
      )}
    </article>
  )
}

