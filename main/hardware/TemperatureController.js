import { EventEmitter } from 'events'

export default class TemperatureController extends EventEmitter {
  constructor(serialManager) {
    super()
    this.serialManager = serialManager
    this.ambientTipTemp = 45
    
    this.state = {
      tip: {
        target: 290,
        heaterEnabled: false,
        current: 290,
        statusMessage: 'Heater disabled',
      }
    }
  }

  async setTipTarget(target) {
    const numeric = Number.parseFloat(target)
    if (!Number.isFinite(numeric) || numeric <= 0) {
      const error = 'Target temperature must be positive.'
      this.state.tip.statusMessage = error
      this.emit('tip', this.getTipStatus())
      return { error }
    }

    this.state.tip.target = numeric
    this.state.tip.statusMessage = `Target set to ${numeric.toFixed(0)}°C`

    if (this.serialManager?.isConnected) {
      try {
        await this._sendCommand({ command: 'temp', target: numeric })
      } catch (error) {
        console.error('[TemperatureController] Error setting temperature:', error)
      }
    }

    this.emit('tip', this.getTipStatus())
    return { status: this.state.tip.statusMessage }
  }

  async setHeaterEnabled(enabled) {
    this.state.tip.heaterEnabled = Boolean(enabled)
    this.state.tip.statusMessage = this.state.tip.heaterEnabled ? 'Heater enabled' : 'Heater disabled'

    if (this.serialManager?.isConnected) {
      try {
        await this._sendCommand({ command: 'heater', enable: Boolean(enabled) })
      } catch (error) {
        console.error('[TemperatureController] Error setting heater:', error)
      }
    }

    this.emit('tip', this.getTipStatus())
    return { status: this.state.tip.statusMessage }
  }

  getTipStatus() {
    return {
      target: this.state.tip.target,
      heater: this.state.tip.heaterEnabled,
      status: this.state.tip.statusMessage,
      current: Number(this.state.tip.current.toFixed(1)),
    }
  }

  simulateTemperature() {
    const { heaterEnabled, target, current } = this.state.tip
    const desired = heaterEnabled ? target : this.ambientTipTemp
    const delta = desired - current

    if (Math.abs(delta) < 0.5) {
      if (heaterEnabled) {
        this.state.tip.statusMessage = `Holding at ${current.toFixed(0)}°C`
        this.emit('tip', this.getTipStatus())
      }
      return
    }

    const step = Math.max(0.2, Math.min(6, Math.abs(delta) / 5))
    this.state.tip.current = current + Math.sign(delta) * step

    if (heaterEnabled) {
      this.state.tip.statusMessage = `Heating to ${target.toFixed(0)}°C`
    } else {
      this.state.tip.statusMessage = `Cooling to ${this.ambientTipTemp.toFixed(0)}°C`
    }

    this.emit('tip', this.getTipStatus())
  }

  async _sendCommand(commandObj) {
    if (this.serialManager?.sendJsonCommand) {
      await this.serialManager.sendJsonCommand(commandObj)
    }
  }

  handleArduinoData(updates) {
    if (updates.temperature) {
      this.state.tip.target = updates.temperature.target ?? this.state.tip.target
      this.state.tip.current = updates.temperature.current ?? this.state.tip.current
      this.state.tip.heaterEnabled = updates.temperature.heaterEnabled ?? this.state.tip.heaterEnabled
      this.emit('tip', this.getTipStatus())
    }
  }
}