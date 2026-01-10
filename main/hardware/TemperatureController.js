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
        pidEnabled: true,  // PID control enabled by default
        pidOutput: 0,      // PWM output (0-255)
        pidPower: 0,       // Power percentage (0-100%)
        pidKp: 5.0,        // Proportional gain
        pidKi: 0.1,        // Integral gain
        pidKd: 1.0,        // Derivative gain
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
      pidEnabled: this.state.tip.pidEnabled,
      pidOutput: this.state.tip.pidOutput,
      pidPower: this.state.tip.pidPower,
      pidKp: this.state.tip.pidKp,
      pidKi: this.state.tip.pidKi,
      pidKd: this.state.tip.pidKd,
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
      
      // Update PID data if available
      if (updates.temperature.pidEnabled !== undefined) {
        this.state.tip.pidEnabled = updates.temperature.pidEnabled
      }
      if (updates.temperature.pidOutput !== undefined) {
        this.state.tip.pidOutput = updates.temperature.pidOutput
      }
      if (updates.temperature.pidPower !== undefined) {
        this.state.tip.pidPower = updates.temperature.pidPower
      }
      if (updates.temperature.pidKp !== undefined) {
        this.state.tip.pidKp = updates.temperature.pidKp
      }
      if (updates.temperature.pidKi !== undefined) {
        this.state.tip.pidKi = updates.temperature.pidKi
      }
      if (updates.temperature.pidKd !== undefined) {
        this.state.tip.pidKd = updates.temperature.pidKd
      }
      
      this.emit('tip', this.getTipStatus())
    }
  }

  async setPIDParameters(kp, ki, kd) {
    const kpValue = Number.parseFloat(kp)
    const kiValue = Number.parseFloat(ki)
    const kdValue = Number.parseFloat(kd)

    if (!Number.isFinite(kpValue) || !Number.isFinite(kiValue) || !Number.isFinite(kdValue)) {
      return { error: 'All PID parameters must be valid numbers' }
    }

    // Validate reasonable ranges
    if (kpValue < 0 || kpValue > 100) {
      return { error: 'Kp must be between 0 and 100' }
    }
    if (kiValue < 0 || kiValue > 10) {
      return { error: 'Ki must be between 0 and 10' }
    }
    if (kdValue < 0 || kdValue > 10) {
      return { error: 'Kd must be between 0 and 10' }
    }

    this.state.tip.pidKp = kpValue
    this.state.tip.pidKi = kiValue
    this.state.tip.pidKd = kdValue

    if (this.serialManager?.isConnected) {
      try {
        await this._sendCommand({ 
          command: 'pid', 
          kp: kpValue, 
          ki: kiValue, 
          kd: kdValue 
        })
        this.state.tip.statusMessage = `PID tuned: Kp=${kpValue.toFixed(2)}, Ki=${kiValue.toFixed(3)}, Kd=${kdValue.toFixed(2)}`
      } catch (error) {
        console.error('[TemperatureController] Error setting PID parameters:', error)
        return { error: error.message }
      }
    }

    this.emit('tip', this.getTipStatus())
    return { status: this.state.tip.statusMessage }
  }

  async setPIDEnabled(enabled) {
    this.state.tip.pidEnabled = Boolean(enabled)

    if (this.serialManager?.isConnected) {
      try {
        await this._sendCommand({ 
          command: 'pid', 
          enable: Boolean(enabled)
        })
        this.state.tip.statusMessage = `PID Control ${enabled ? 'ENABLED' : 'DISABLED'}`
      } catch (error) {
        console.error('[TemperatureController] Error setting PID enabled:', error)
        return { error: error.message }
      }
    }

    this.emit('tip', this.getTipStatus())
    return { status: this.state.tip.statusMessage }
  }
}