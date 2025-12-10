import { EventEmitter } from 'events'

/**
 * ArduinoDataHandler - Parses and processes data from Arduino Mega 2560
 * Expects JSON format from Arduino with machine state data
 */
export default class ArduinoDataHandler extends EventEmitter {
  constructor() {
    super()
    this.lastUpdateTime = Date.now()
  }

  /**
   * Parse incoming data line from Arduino
   * Expected format: JSON string with machine state
   * Example: {"pos":{"x":120,"y":45,"z":3.2,"moving":false},"temp":{"target":345,"current":310,"heater":true},...}
   */
  parseArduinoData(dataLine) {
    try {
      // Try to parse as JSON
      const data = JSON.parse(dataLine.trim())
      return this.processArduinoData(data)
    } catch (error) {
      // If not JSON, try to parse as custom format (comma-separated, etc.)
      console.warn('[ArduinoDataHandler] Failed to parse as JSON, trying custom format:', dataLine)
      return this.parseCustomFormat(dataLine)
    }
  }

  /**
   * Process parsed Arduino JSON data
   * Returns null if data is invalid/noise
   */
  processArduinoData(data) {
    // Validate that data is actually from Arduino (has at least one known field)
    if (!data || typeof data !== 'object') {
      return null
    }

    // Check if this looks like actual Arduino data (has at least one recognized field)
    const hasValidData =
      (data.pos && typeof data.pos === 'object') ||
      (data.temp && typeof data.temp === 'object') ||
      (data.wire && typeof data.wire === 'object') ||
      (data.spool && typeof data.spool === 'object') ||
      (data.flux && typeof data.flux === 'object') ||
      (data.fans && typeof data.fans === 'object') ||
      (data.fume && typeof data.fume === 'object') ||
      (data.fluxMist && typeof data.fluxMist === 'object') ||
      (data.airBreeze && typeof data.airBreeze === 'object') ||
      (data.airJet && typeof data.airJet === 'object') ||
      (data.seq && typeof data.seq === 'object') ||
      (typeof data.height === 'number')

    // If no valid Arduino fields found, this is probably noise/invalid data
    if (!hasValidData) {
      return null
    }

    const updates = {}

    // Position data (single-axis: only Z-axis)
    if (data.pos) {
      updates.position = {
        z: parseFloat(data.pos.z) || 0,
        isMoving: Boolean(data.pos.moving),
      }
    }

    // Temperature data
    if (data.temp) {
      updates.temperature = {
        target: parseFloat(data.temp.target) || 0,
        current: parseFloat(data.temp.current) || 0,
        heaterEnabled: Boolean(data.temp.heater),
      }
    }

    // Wire feed data
    if (data.wire) {
      updates.wireFeed = {
        status: String(data.wire.status || 'idle'),
        feedRate: parseFloat(data.wire.feedRate) || 0,
        wireBreak: Boolean(data.wire.break),
      }
    }

    // Spool data
    if (data.spool) {
      updates.spool = {
        weight: parseFloat(data.spool.weight) || 0,
        wireLength: parseFloat(data.spool.wireLength) || 0,
        wireDiameter: parseFloat(data.spool.diameter) || 0.5,
        remainingPercentage: parseFloat(data.spool.remaining) || 100,
        isFeeding: Boolean(data.spool.feeding),
      }
    }

    // Flux data
    if (data.flux) {
      updates.flux = {
        percentage: parseFloat(data.flux.percentage) || 100,
        remainingMl: parseFloat(data.flux.ml) || 0,
      }
    }

    // Fan states
    if (data.fans) {
      updates.fans = {
        machine: Boolean(data.fans.machine),
        tip: Boolean(data.fans.tip),
      }
    }

    // Fume extractor
    if (data.fume) {
      updates.fumeExtractor = {
        enabled: Boolean(data.fume.enabled),
        speed: parseFloat(data.fume.speed) || 0,
      }
    }

    // Flux mist
    if (data.fluxMist) {
      updates.fluxMist = {
        enabled: Boolean(data.fluxMist.enabled),
        isDispensing: Boolean(data.fluxMist.dispensing),
        flowRate: parseFloat(data.fluxMist.flowRate) || 0,
      }
    }

    // Air breeze
    if (data.airBreeze) {
      updates.airBreeze = {
        enabled: Boolean(data.airBreeze.enabled),
        isActive: Boolean(data.airBreeze.active),
        intensity: parseFloat(data.airBreeze.intensity) || 0,
      }
    }

    // Air jet pressure
    if (data.airJet) {
      updates.airJetPressure = {
        enabled: Boolean(data.airJet.enabled),
        isActive: Boolean(data.airJet.active),
        pressure: parseFloat(data.airJet.pressure) || 0,
      }
    }

    // Sequence data
    if (data.seq) {
      updates.sequence = {
        stage: String(data.seq.stage || 'idle'),
        isActive: Boolean(data.seq.active),
        currentPad: parseInt(data.seq.pad, 10) || 0,
        totalPads: parseInt(data.seq.total, 10) || 0,
        progress: parseFloat(data.seq.progress) || 0,
        error: data.seq.error || null,
      }
    }

    // Component height
    if (data.height !== undefined && data.height !== null) {
      updates.componentHeight = parseFloat(data.height) || 0
    }

    // Add timestamp
    updates.timestamp = Date.now()
    this.lastUpdateTime = updates.timestamp

    return updates
  }

  /**
   * Parse custom format (comma-separated or other formats)
   * Example: "X:120.0,Y:45.3,Z:3.2,TEMP:310.0,HEATER:1"
   */
  parseCustomFormat(dataLine) {
    const updates = {}

    try {
      // Handle comma-separated key:value pairs
      const pairs = dataLine.split(',')

      for (const pair of pairs) {
        const [key, value] = pair.split(':').map(s => s.trim())

        switch (key.toUpperCase()) {
          // Single-axis machine: Only Z position (X and Y ignored)
          case 'Z':
            if (!updates.position) updates.position = {}
            updates.position.z = parseFloat(value) || 0
            break
          case 'X':
          case 'Y':
            // X and Y positions ignored (PCB moved manually)
            break
          case 'MOVING':
            if (!updates.position) updates.position = {}
            updates.position.isMoving = Boolean(parseInt(value, 10))
            break
          case 'TEMP':
          case 'TEMPERATURE':
            if (!updates.temperature) updates.temperature = {}
            updates.temperature.current = parseFloat(value) || 0
            break
          case 'TEMP_TARGET':
            if (!updates.temperature) updates.temperature = {}
            updates.temperature.target = parseFloat(value) || 0
            break
          case 'HEATER':
            if (!updates.temperature) updates.temperature = {}
            updates.temperature.heaterEnabled = Boolean(parseInt(value, 10))
            break
          // Add more custom format parsers as needed
        }
      }

      if (Object.keys(updates).length > 0) {
        updates.timestamp = Date.now()
        return updates
      }
    } catch (error) {
      console.error('[ArduinoDataHandler] Error parsing custom format:', error)
    }

    return null
  }

  /**
   * Request data from Arduino (send command to request status)
   */
  requestStatus() {
    // This will be called to request data from Arduino
    // The actual command sending is handled by SerialPortManager
    return 'STATUS\n'  // Command to request status
  }

  /**
   * Format command to send to Arduino
   */
  formatCommand(command, params = {}) {
    // Format command for Arduino
    // Example: "MOVE X:120 Y:45" or JSON command
    if (Object.keys(params).length > 0) {
      return JSON.stringify({ command, ...params }) + '\n'
    }
    return `${command}\n`
  }
}


