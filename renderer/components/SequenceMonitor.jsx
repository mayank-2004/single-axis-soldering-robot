import React from 'react'
import styles from './SequenceMonitor.module.css'

export default function SequenceMonitor({ sequenceState }) {
  const { stage, isActive, lastCompleted } = sequenceState || {}

  return (
    <article className={styles.controlCard} aria-label="Soldering sequence overview">
      <header className={styles.controlHeader}>
        <h2 className={styles.controlTitle}>Sequence Monitor</h2>
        <span className={styles.controlSubtitle}>Track X/Y/Z operations during soldering</span>
      </header>
      <div className={styles.sequenceGrid}>
        <div className={styles.sequenceItem}>
          <span className={styles.sequenceLabel}>Current stage</span>
          <span className={styles.sequenceValue}>{stage ?? 'idle'}</span>
        </div>
        <div className={styles.sequenceItem}>
          <span className={styles.sequenceLabel}>Active</span>
          <span className={styles.sequenceValue}>{isActive ? 'Yes' : 'No'}</span>
        </div>
        <div className={styles.sequenceItem}>
          <span className={styles.sequenceLabel}>Last completed</span>
          <span className={styles.sequenceValue}>{lastCompleted ?? '--'}</span>
        </div>
      </div>
    </article>
  )
}

