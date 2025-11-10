import React from 'react'
import Head from 'next/head'
import LcdDisplay from '../components/LcdDisplay'
import styles from './home.module.css'

const initialCalibration = [
  { label: 'X Axis', value: '120.00 → 132.50', unit: 'mm' },
  { label: 'Y Axis', value: '045.30 → 048.10', unit: 'mm' },
  { label: 'Z Axis', value: '003.20 → 000.00', unit: 'mm' },
  { label: 'Feed Rate', value: '12.0', unit: 'mm/s' },
  { label: 'Flow Rate', value: '1.0', unit: 'mm³/s' },
  { label: 'Tip Temp', value: '345', unit: '°C' },
]

export default function HomePage() {
  const [calibration, setCalibration] = React.useState(initialCalibration)
  const [localTime, setLocalTime] = React.useState('')

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.ipc) return undefined

    const handleCalibration = (payload) => {
      if (Array.isArray(payload)) {
        setCalibration(payload)
        return
      }

      if (payload && typeof payload === 'object') {
        setCalibration((current) =>
          current.map((entry) => ({
            ...entry,
            value: payload[entry.label] ?? entry.value,
          }))
        )
      }
    }

    window.ipc.on?.('calibration:update', handleCalibration)

    return () => {
      window.ipc.off?.('calibration:update', handleCalibration)
    }
  }, [])

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const updateClock = () => {
      setLocalTime(new Date().toLocaleTimeString())
    }

    updateClock()
    const interval = window?.setInterval(updateClock, 1000)

    return () => {
      if (interval) {
        window.clearInterval(interval)
      }
    }
  }, [])

  return (
    <React.Fragment>
      <Head>
        <title>Single Axis Soldering Robot</title>
      </Head>
      <main className={styles.page} role="main">
        <header className={styles.pageHeader}>
          <h1 className={styles.heading}>Single Axis Soldering Robot Console</h1>
          <p className={styles.subtitle}>
            Track axis calibration, solder flow, and thermal data from the virtual LCD
            that mirrors your hardware display.
          </p>
        </header>

        <section className={styles.lcdSection} aria-label="Robot calibration panel">
          <LcdDisplay
            readings={calibration}
            footer={
              <React.Fragment>
                <span>Mode: Calibration</span>
                <span>{localTime || '--:--:--'}</span>
              </React.Fragment>
            }
          />
        </section>
      </main>
    </React.Fragment>
  )
}
