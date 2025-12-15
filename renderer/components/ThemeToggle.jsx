import React from 'react'
import { useTheme } from '../contexts/ThemeContext'
import styles from './ThemeToggle.module.css'

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme, isLight } = useTheme()

  return (
    <button
      type="button"
      className={`${styles.themeToggle} ${className}`}
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      aria-pressed={isLight}
      title={`Current theme: ${theme === 'dark' ? 'Dark' : 'Light'}`}
    >
      <span className={styles.themeToggleIcon}>
        {theme === 'dark' ? '🌙' : '☀️'}
      </span>
      <span className={styles.themeToggleLabel}>
        {theme === 'dark' ? 'Dark' : 'Light'}
      </span>
    </button>
  )
}

