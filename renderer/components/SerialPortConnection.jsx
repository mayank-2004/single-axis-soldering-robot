import React, { useCallback, useEffect, useState } from 'react'
import styles from './SerialPortConnection.module.css'

export default function SerialPortConnection({
  isConnected = false,
  isConnecting = false,
  currentPort = null,
  availablePorts = [],
  onRefreshPorts,
  onConnect,
  onDisconnect,
  connectionError = null,
  isReceivingData = false,
  lastDataReceived = null,
  dataCount = 0,
}) {
  const [selectedPort, setSelectedPort] = useState('')
  const [baudRate, setBaudRate] = useState('115200')
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    if (currentPort) {
      setSelectedPort(currentPort)
    }
  }, [currentPort])

  const handleRefreshPorts = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await onRefreshPorts()
    } finally {
      setIsRefreshing(false)
    }
  }, [onRefreshPorts])

  const handleConnect = useCallback(() => {
    if (!selectedPort) {
      return
    }
    onConnect({
      portPath: selectedPort,
      config: {
        baudRate: parseInt(baudRate, 10),
      },
    })
  }, [selectedPort, baudRate, onConnect])

  const handleDisconnect = useCallback(() => {
    onDisconnect()
  }, [onDisconnect])

  useEffect(() => {
    handleRefreshPorts()
  }, [handleRefreshPorts])

  return (
    <article className={styles.connectionCard} aria-label="Serial port connection">
      <header className={styles.connectionHeader}>
        <h2 className={styles.connectionTitle}>Hardware Connection</h2>
        <span className={styles.connectionSubtitle}>
          Connect to soldering robot via serial port
        </span>
      </header>

      <div className={styles.connectionContent}>
        {connectionError && (
          <div className={styles.errorMessage} role="alert">
            <span className={styles.errorIcon}>⚠</span>
            <span>{connectionError}</span>
          </div>
        )}

        <div className={styles.statusIndicator}>
          <div
            className={[
              styles.statusDot,
              isConnected ? styles.statusDotConnected : styles.statusDotDisconnected,
              isConnected && isReceivingData ? styles.statusDotReceiving : '',
            ].join(' ')}
            aria-hidden
          />
          <div className={styles.statusInfo}>
            <span className={styles.statusText}>
              {isConnecting
                ? 'Connecting...'
                : isConnected
                  ? `Connected to ${currentPort || 'Arduino Mega 2560'}`
                  : 'Disconnected'}
            </span>
            {isConnected && (
              <div className={styles.dataStatus}>
                {isReceivingData ? (
                  <>
                    <span className={styles.dataIndicator}>
                      <span className={styles.dataDot} /> Receiving data from Arduino
                    </span>
                    {dataCount > 0 && (
                      <span className={styles.dataCount}>
                        {dataCount.toLocaleString()} updates received
                      </span>
                    )}
                  </>
                ) : (
                  <span className={styles.dataIndicatorInactive}>
                    ⚠ Waiting for Arduino data...
                  </span>
                )}
                {lastDataReceived && (
                  <span className={styles.lastUpdate}>
                    Last update: {new Date(lastDataReceived).toLocaleTimeString()}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className={styles.portSelection}>
          <label className={styles.label} htmlFor="port-select">
            Serial Port
          </label>
          <div className={styles.portSelectWrapper}>
            <select
              id="port-select"
              className={styles.portSelect}
              value={selectedPort}
              onChange={(e) => setSelectedPort(e.target.value)}
              disabled={isConnected || isConnecting}
            >
              <option value="">Select a port...</option>
              {availablePorts.map((port) => (
                <option key={port.path} value={port.path}>
                  {port.friendlyName || port.path} {port.manufacturer ? `(${port.manufacturer})` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={styles.refreshButton}
              onClick={handleRefreshPorts}
              disabled={isRefreshing || isConnecting}
              aria-label="Refresh port list"
            >
              {isRefreshing ? '⟳' : '↻'}
            </button>
          </div>
        </div>

        <div className={styles.baudRateSelection}>
          <label className={styles.label} htmlFor="baud-rate">
            Baud Rate
          </label>
          <select
            id="baud-rate"
            className={styles.baudRateSelect}
            value={baudRate}
            onChange={(e) => setBaudRate(e.target.value)}
            disabled={isConnected || isConnecting}
          >
            <option value="9600">9600</option>
            <option value="19200">19200</option>
            <option value="38400">38400</option>
            <option value="57600">57600</option>
            <option value="115200">115200</option>
            <option value="230400">230400</option>
            <option value="460800">460800</option>
          </select>
        </div>

        <div className={styles.connectionActions}>
          {isConnected ? (
            <button
              type="button"
              className={styles.disconnectButton}
              onClick={handleDisconnect}
              disabled={isConnecting}
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              className={styles.connectButton}
              onClick={handleConnect}
              disabled={!selectedPort || isConnecting || isRefreshing}
            >
              {isConnecting ? 'Connecting...' : 'Connect'}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

