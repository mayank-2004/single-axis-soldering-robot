# Z-Axis Head Speed Control - Complete Guide

## Overview

The Z-axis head speed controls how fast the soldering head moves up and down. Speed is controlled through a **percentage-based system** (1-100%) that gets converted to **step delays** (microseconds between stepper pulses) in the Arduino firmware.

---

## Speed Control Flow

### 1. **Speed Storage (App State)**

**Location:** `SolderingHardware.js` → `this.state.zAxisSpeed`

```javascript
this.state = {
  zAxisSpeed: 90, // Default: 90% speed (1-100%)
  // ... other state
}
```

- **Default Value:** 90% (moderate speed)
- **Range:** 1% (slowest) to 100% (fastest)
- **Storage:** Persists during app session (not saved to disk)

---

### 2. **Speed Usage in Commands**

When any movement command is sent, the current speed percentage is automatically included:

#### **Jog Command:**
```javascript
// Location: SolderingHardware.js → jog() method
await this._sendArduinoJsonCommand({
  command: 'jog',
  axis: 'z',
  distance: -5.0,  // Move down 5mm
  speed: this.state.zAxisSpeed  // ← Current speed (e.g., 90)
})
```

#### **Home Command:**
```javascript
// Location: SolderingHardware.js → home() method
await this._sendArduinoJsonCommand({
  command: 'home',
  speed: this.state.zAxisSpeed  // ← Current speed
})
```

---

### 3. **Arduino Speed Processing**

**Location:** `ARDUINO_SKETCH_EXAMPLE.ino` → `processCommands()`

#### **Step 1: Receive Speed Parameter**
```cpp
if (cmdDoc.containsKey("speed")) {
  float speedValue = cmdDoc["speed"] | 0;  // e.g., 90
  // Process speed...
}
```

#### **Step 2: Convert Percentage to Step Delay**

**Formula:**
```cpp
delay = MAX - ((speed - 1) / 99) * (MAX - MIN)
```

**Constants:**
- `Z_STEP_DELAY_MIN = 100` microseconds (fastest - 100%)
- `Z_STEP_DELAY_MAX = 2000` microseconds (slowest - 1%)
- `Z_STEPS_PER_MM = 204.1` steps per millimeter

**Example Calculations:**

| Speed % | Calculation | Step Delay (μs) | Actual Speed (mm/s) |
|---------|-------------|-----------------|---------------------|
| 100% | 2000 - ((100-1)/99) × 1900 | 100 | ~49.0 mm/s |
| 90% | 2000 - ((90-1)/99) × 1900 | 292 | ~16.8 mm/s |
| 50% | 2000 - ((50-1)/99) × 1900 | 1050 | ~4.7 mm/s |
| 1% | 2000 - ((1-1)/99) × 1900 | 2000 | ~2.5 mm/s |

**Code:**
```cpp
if (speedValue > 0 && speedValue <= 100) {
  speedDelay = Z_STEP_DELAY_MAX - 
    static_cast<unsigned int>(((speedValue - 1.0f) / 99.0f) * 
    (Z_STEP_DELAY_MAX - Z_STEP_DELAY_MIN));
}
```

#### **Step 3: Apply Delay to Movement**

**Location:** `ARDUINO_SKETCH_EXAMPLE.ino` → `moveZAxisByDistance()`

```cpp
void moveZAxisByDistance(float distanceMm, unsigned int stepDelayUs = 0) {
  // Use provided delay, or fall back to currentZStepDelay
  unsigned int delay = (stepDelayUs > 0) ? stepDelayUs : currentZStepDelay;
  
  // Calculate steps needed
  long steps = static_cast<long>(abs(distanceMm) * zStepsPerMm);
  
  // Move with delay between each step
  for (long i = 0; i < steps; i++) {
    pulseZStep(delay);  // ← Delay controls speed
    // Check limit switches...
  }
}
```

---

### 4. **Stepper Motor Pulse Control**

**Location:** `ARDUINO_SKETCH_EXAMPLE.ino` → `pulseZStep()`

```cpp
void pulseZStep(unsigned int delayUs) {
  // Generate step pulse
  digitalWrite(STEPPER_Z_STEP_PIN, HIGH);
  delayMicroseconds(delayUs / 2);  // Half delay
  digitalWrite(STEPPER_Z_STEP_PIN, LOW);
  delayMicroseconds(delayUs / 2);  // Half delay
}
```

**How it works:**
- **Lower delay** (e.g., 100μs) = **Faster pulses** = **Faster movement**
- **Higher delay** (e.g., 2000μs) = **Slower pulses** = **Slower movement**

---

## Speed Setting Methods

### **Method 1: Programmatic Setting (Current Implementation)**

**Location:** `SolderingHardware.js` → `setZAxisSpeed()`

```javascript
setZAxisSpeed(speed) {
  const speedValue = Math.max(1, Math.min(100, Number(speed) || 50))
  this.state.zAxisSpeed = speedValue
  
  // Update LCD display
  this._updateZAxisSpeedDisplay()
  
  // Send to Arduino
  if (this.mode === 'hardware' && this.serialManager && this.connected) {
    this._sendArduinoJsonCommand({
      command: 'setspeed',
      speed: speedValue
    })
  }
}
```

**Usage:**
- Currently **not exposed in UI**
- Can be called programmatically
- Updates Arduino's `currentZStepDelay` for future movements

### **Method 2: Per-Command Speed (Current Implementation)**

Each movement command can include its own speed:

```javascript
// Jog command with speed
await this._sendArduinoJsonCommand({
  command: 'jog',
  axis: 'z',
  distance: -5.0,
  speed: 80  // 80% speed for this movement only
})
```

**Current Behavior:**
- All jog commands use `this.state.zAxisSpeed` (default: 90%)
- Speed is sent with every command
- Arduino can override with per-command speed if provided

---

## Speed Display in LCD

**Location:** `SolderingHardware.js` → `_updateZAxisSpeedDisplay()`

The LCD displays the **calculated actual speed** in mm/s:

```javascript
_calculateZAxisSpeedMmPerSecond(speedPercent) {
  const Z_STEP_DELAY_MIN = 100
  const Z_STEP_DELAY_MAX = 2000
  const Z_STEPS_PER_MM = 204.1
  
  // Convert percentage to delay
  const stepDelayUs = Z_STEP_DELAY_MAX - 
    ((speedPercent - 1) / 99) * (Z_STEP_DELAY_MAX - Z_STEP_DELAY_MIN)
  
  // Calculate actual speed
  const speedMmPerSecond = (1000000 / stepDelayUs) / Z_STEPS_PER_MM
  
  return speedMmPerSecond
}
```

**LCD Display:**
- Shows: `Speed: 16.8 mm/s` (for 90% speed)
- Updates automatically when speed changes
- Reflects actual movement speed, not percentage

---

## Complete Command Flow Example

### **User Action: Click "Jog Down 5mm"**

#### **1. Frontend (ManualMovementControl.jsx)**
```javascript
onJog('z', -1, 5.0)  // Axis: z, Direction: down, Distance: 5mm
```

#### **2. Frontend Handler (home.jsx)**
```javascript
handleJog('z', -1, 5.0)
  ↓
window.ipc.send('axis:jog', { axis: 'z', distance: -5.0 })
```

#### **3. IPC Handler (robotController.js)**
```javascript
registerIpcListener('axis:jog', async (event, payload) => {
  const result = await hardware.jog(payload.axis, payload.distance)
})
```

#### **4. Hardware Layer (SolderingHardware.js)**
```javascript
jog('z', -5.0)
  ↓
this.state.zAxisSpeed  // Get current speed: 90
  ↓
_sendArduinoJsonCommand({
  command: 'jog',
  axis: 'z',
  distance: -5.0,
  speed: 90  // ← Speed included
})
```

#### **5. Serial Transmission**
```
{"command":"jog","axis":"z","distance":-5.0,"speed":90}\n
```

#### **6. Arduino Receives & Parses**
```cpp
processCommands() {
  // Parse JSON
  String axis = "z"
  float distance = -5.0
  float speedValue = 90.0
  
  // Convert speed to delay
  speedDelay = 2000 - ((90 - 1) / 99) * 1900
  speedDelay = 292 microseconds
  
  // Execute movement
  moveZAxisByDistance(-5.0, 292)
}
```

#### **7. Movement Execution**
```cpp
moveZAxisByDistance(-5.0, 292) {
  // Calculate steps: 5.0 × 204.1 = 1020.5 → 1021 steps
  
  for (int i = 0; i < 1021; i++) {
    pulseZStep(292);  // 292μs delay between each step
    // Check limit switches...
  }
  
  // Total time: 1021 × 292μs = ~298ms
  // Actual speed: 5mm / 0.298s = ~16.8 mm/s ✓
}
```

---

## Speed Control Summary

### **Current Implementation:**

1. **Speed Storage:**
   - Stored as percentage (1-100%) in `SolderingHardware.state.zAxisSpeed`
   - Default: 90%
   - Not exposed in UI (no speed slider/control)

2. **Speed Application:**
   - Automatically included with every movement command
   - Arduino converts percentage to step delay
   - Step delay controls pulse frequency

3. **Speed Display:**
   - LCD shows calculated actual speed in mm/s
   - Updates when speed changes
   - Formula: `(1,000,000 / stepDelay_us) / stepsPerMm`

### **Speed Range:**

| Percentage | Step Delay | Actual Speed | Use Case |
|------------|------------|--------------|----------|
| 100% | 100μs | ~49.0 mm/s | Fast positioning |
| 90% (default) | 292μs | ~16.8 mm/s | Normal operation |
| 50% | 1050μs | ~4.7 mm/s | Precise positioning |
| 1% | 2000μs | ~2.5 mm/s | Very slow, careful movement |

---

## How to Change Speed (Programmatic)

### **Option 1: Set Default Speed**
```javascript
// In SolderingHardware.js constructor or initialization
this.state.zAxisSpeed = 80  // Set to 80%
```

### **Option 2: Call setZAxisSpeed()**
```javascript
// From anywhere in the app
hardware.setZAxisSpeed(75)  // Set to 75%
```

### **Option 3: Per-Command Speed**
```javascript
// Override speed for specific movement
await this._sendArduinoJsonCommand({
  command: 'jog',
  axis: 'z',
  distance: -5.0,
  speed: 50  // Use 50% for this movement only
})
```

---

## Notes

1. **No UI Control:** Currently, there's no user interface to change speed. It's set programmatically.

2. **Speed Persistence:** Speed is stored in memory only. It resets to default (90%) on app restart.

3. **Arduino Speed Setting:** The `setspeed` command updates Arduino's `currentZStepDelay`, which is used as fallback if no speed is provided in movement commands.

4. **Speed Calculation:** The actual speed depends on:
   - Step delay (from percentage)
   - Steps per millimeter (calibration value: 204.1)
   - Lead screw pitch
   - Microstepping settings

5. **Safety:** Lower speeds (higher delays) are safer for:
   - Precise positioning
   - Avoiding crashes
   - Testing and calibration

---

## Future Enhancement Ideas

1. **Add Speed Control UI:**
   - Speed slider in ManualMovementControl component
   - Range: 1-100%
   - Real-time display of calculated mm/s

2. **Speed Profiles:**
   - Preset speeds: "Fast", "Normal", "Slow", "Precise"
   - Custom speed settings
   - Save/load speed profiles

3. **Adaptive Speed:**
   - Slower speed near limit switches
   - Faster speed for long movements
   - Speed ramping (acceleration/deceleration)

4. **Speed Persistence:**
   - Save speed preference to local storage
   - Remember last used speed

---

## Technical Details

### **Speed Conversion Formula:**

**Percentage → Step Delay:**
```
delay = MAX - ((speed - 1) / 99) * (MAX - MIN)
```

**Step Delay → Actual Speed:**
```
speed_mm_per_second = (1,000,000 / delay_us) / steps_per_mm
```

### **Arduino Constants:**
- `Z_STEP_DELAY_MIN = 100` microseconds
- `Z_STEP_DELAY_MAX = 2000` microseconds
- `Z_STEPS_PER_MM = 204.1` steps/mm

### **Hardware:**
- Stepper motor: DM542/2DM542 driver
- Control: STEP pin (pin 48) + DIR pin (pin 46)
- Method: `tone()` function for hardware PWM (if implemented)
- Or: `digitalWrite()` + `delayMicroseconds()` for standard control

---

## Summary

**Speed Control Flow:**
```
User Action (Jog)
  ↓
App State (zAxisSpeed: 90%)
  ↓
JSON Command ({command: "jog", speed: 90})
  ↓
Arduino Conversion (90% → 292μs delay)
  ↓
Stepper Pulses (292μs between pulses)
  ↓
Head Movement (~16.8 mm/s)
```

**Key Points:**
- Speed is percentage-based (1-100%)
- Automatically included with movement commands
- Converted to step delay in Arduino
- LCD displays calculated actual speed
- No UI control currently (programmatic only)

