# Arduino Code Detailed Explanation

## Overview

This Arduino sketch controls a single-axis soldering machine's Z-axis (vertical movement). It communicates with an Electron app via JSON commands over Serial (USB) at 115200 baud.

---

## 1. Code Structure

### Main Components:

```
setup() → Initializes hardware pins, sensors, serial communication
   ↓
loop() → Main execution loop (runs continuously)
   ├── handleButtonControls() → Physical button inputs
   ├── readSensors() → Read temperature, position, etc.
   ├── sendMachineState() → Send JSON status to app (every 100ms)
   └── processCommands() → Parse and execute JSON commands from app
```

### Key Global Variables:

- **`zPosition`**: Current Z-axis position in mm (0.00mm = home at top)
- **`zStepsPerMm`**: Steps per millimeter (default: 204.1) - calibration value
- **`isMoving`**: Flag indicating if machine is currently moving
- **`currentZStepDelay`**: Speed control (microseconds between steps)

---

## 2. JSON Command Parsing Process

### Step-by-Step Flow:

#### **Step 1: Receive Command from Serial**
```cpp
if (Serial.available() > 0) {
    String command = Serial.readStringUntil('\n');
    command.trim();
}
```
- Waits for data on Serial port
- Reads until newline character (`\n`)
- Trims whitespace

**Example received string:**
```
{"command":"jog","axis":"z","distance":-5,"speed":80}\n
```

#### **Step 2: Detect JSON Format**
```cpp
if (command.startsWith("{")) {
    // This is a JSON command
}
```
- Checks if command starts with `{` (JSON object)

#### **Step 3: Parse JSON**
```cpp
StaticJsonDocument<512> cmdDoc;  // Allocate 512 bytes for JSON
DeserializationError error = deserializeJson(cmdDoc, command);
```
- Uses **ArduinoJson** library to parse JSON string
- Creates a JSON document object (`cmdDoc`)
- If parsing fails, error is logged and function returns

**Parsed JSON structure:**
```json
{
  "command": "jog",
  "axis": "z",
  "distance": -5,
  "speed": 80
}
```

#### **Step 4: Extract Command Type**
```cpp
String cmd = cmdDoc["command"] | "";
```
- Extracts `"command"` field from JSON
- `| ""` provides default empty string if field missing

#### **Step 5: Execute Based on Command Type**
```cpp
if (cmd == "jog") {
    // Handle jog command
}
else if (cmd == "home") {
    // Handle home command
}
// ... etc
```

---

## 3. Jog Command Execution (Detailed Example)

### Example Command:
```json
{"command":"jog","axis":"z","distance":-5,"speed":80}
```

### Execution Flow:

#### **A. Extract Parameters**
```cpp
String axis = cmdDoc["axis"] | "";           // "z"
float distance = cmdDoc["distance"] | 0;      // -5.0
float speedValue = cmdDoc["speed"] | 0;       // 80
```

#### **B. Convert Speed to Delay**
```cpp
if (speedValue > 0 && speedValue <= 100) {
    // Interpret as percentage (1-100%)
    speedDelay = Z_STEP_DELAY_MAX - ((speedValue - 1) / 99) * (MAX - MIN);
}
```
- **Speed 80%** → Converts to microseconds delay
- Lower delay = faster movement
- Formula maps 1-100% to delay range (100-2000 microseconds)

**Example:**
- Speed 80% → ~440 microseconds delay
- Speed 50% → ~1050 microseconds delay
- Speed 20% → ~1640 microseconds delay

#### **C. Call Movement Function**
```cpp
if (axis == "z" || axis == "Z") {
    moveZAxisByDistance(distance);  // distance = -5.0
}
```

---

## 4. Movement Execution (`moveZAxisByDistance`)

### Function: `moveZAxisByDistance(float distanceMm)`

#### **Step 1: Determine Direction**
```cpp
bool moveUp = distanceMm > 0;
```
- **Positive distance** (e.g., +5mm) = Move UP (towards home/0.00mm)
- **Negative distance** (e.g., -5mm) = Move DOWN (away from home, negative values)

#### **Step 2: Safety Checks**
```cpp
// Cannot move down if at bottom limit
if (!moveUp && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MIN_PIN)) {
    return;  // Stop - already at bottom
}

// Cannot move up if already at home
if (moveUp && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MAX_PIN)) {
    zPosition = Z_HOME_POSITION;  // Ensure at home
    return;
}
```

#### **Step 3: Calculate Target Position**
```cpp
float target = zPosition + distanceMm;
```
**Example:**
- Current position: `-10.0mm`
- Distance: `-5.0mm` (downward)
- Target: `-10.0 + (-5.0) = -15.0mm`

#### **Step 4: Clamp Target (Safety)**
```cpp
if (target > Z_HOME_POSITION) {  // Cannot exceed 0.00mm
    target = Z_HOME_POSITION;
}
```

#### **Step 5: Calculate Steps to Move**
```cpp
float actualDistance = target - zPosition;  // -5.0mm
float stepsFloat = fabsf(actualDistance * zStepsPerMm);
// stepsFloat = 5.0 * 204.1 = 1020.5 steps
```

**Precision Handling:**
```cpp
if (actualDistance < 0) { // Downward movement
    stepsToMove = ceilf(stepsFloat);  // Round UP (1021 steps)
} else { // Upward movement
    stepsToMove = roundf(stepsFloat); // Round to nearest
}
```
- **Downward**: Uses `ceilf()` to ensure at least commanded distance
- **Upward**: Uses `roundf()` for normal rounding

**Why?** Mechanical losses cause downward movements to be slightly less than commanded. Rounding up compensates.

#### **Step 6: Execute Movement**
```cpp
isMoving = true;
applyZMovement(stepsToMove, actualDistance > 0);
isMoving = false;
```

---

## 5. Stepper Motor Control (`applyZMovement`)

### Function: `applyZMovement(long steps, bool moveUp)`

#### **Step 1: Set Direction Pin**
```cpp
digitalWrite(STEPPER_Z_DIR_PIN, moveUp ? HIGH : LOW);
```
- **HIGH** = Move UP (towards home/0.00mm)
- **LOW** = Move DOWN (away from home)

#### **Step 2: Pulse Stepper Motor**
```cpp
long stepsCompleted = 0;
while (stepsCompleted < steps) {
    // Check limit switches during movement
    if (!moveUp && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MIN_PIN)) {
        break;  // Hit bottom limit - stop
    }
    if (moveUp && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MAX_PIN)) {
        zPosition = Z_HOME_POSITION;  // Reached home
        break;
    }
    
    pulseZStep();  // Send one step pulse
    stepsCompleted++;
}
```

#### **Step 3: Pulse Function (`pulseZStep`)**
```cpp
void pulseZStep(unsigned int stepDelayUs = 0) {
    unsigned int delay = (stepDelayUs > 0) ? stepDelayUs : currentZStepDelay;
    digitalWrite(STEPPER_Z_STEP_PIN, HIGH);  // Step pin HIGH
    delayMicroseconds(delay);                 // Wait
    digitalWrite(STEPPER_Z_STEP_PIN, LOW);   // Step pin LOW
    delayMicroseconds(delay);                 // Wait
}
```

**How Stepper Motor Works:**
1. **STEP pin** goes HIGH → Motor moves one step
2. **Delay** controls speed (shorter delay = faster)
3. **STEP pin** goes LOW → Prepares for next step
4. **DIR pin** determines direction (HIGH = up, LOW = down)

**Example for 5mm downward movement:**
- Steps needed: 1021 steps
- Delay: 440 microseconds (80% speed)
- Total time: 1021 × 440μs × 2 = ~0.9 seconds

#### **Step 4: Update Position**
```cpp
float deltaMm = (static_cast<float>(stepsCompleted) / zStepsPerMm) * (moveUp ? 1.0f : -1.0f);
zPosition = zPosition + deltaMm;
```

**Example:**
- Steps completed: 1021
- Steps per mm: 204.1
- Direction: Downward (negative)
- Delta: `(1021 / 204.1) * (-1) = -5.00mm`
- New position: `-10.0 + (-5.0) = -15.0mm`

**Why `static_cast<float>`?**
- Ensures float division (not integer division)
- Maintains precision: `1021 / 204.1 = 5.00` (not `5`)

---

## 6. Home Command Execution

### Command:
```json
{"command":"home","speed":80}
```

### Function: `homeZAxis(unsigned int stepDelayUs)`

#### **Step 1: Calculate Maximum Steps**
```cpp
const long maxSteps = static_cast<long>(Z_MAX_POSITION * zStepsPerMm) + 200;
// maxSteps = 40.0 * 204.1 + 200 = 8364 steps
```
- Safety limit: Maximum possible steps from bottom to top

#### **Step 2: Set Direction (Always UP)**
```cpp
digitalWrite(STEPPER_Z_DIR_PIN, HIGH);  // Always move up
```

#### **Step 3: Move Until Limit Switch**
```cpp
long stepsTaken = 0;
while (!isLimitSwitchTriggered(LIMIT_SWITCH_Z_MAX_PIN) && stepsTaken < maxSteps) {
    pulseZStep();
    stepsTaken++;
}
```
- Continuously pulses stepper motor
- Stops when **Z_MAX limit switch** is triggered (home position)
- Safety: Stops if `maxSteps` reached (prevents infinite loop)

#### **Step 4: Reset Position**
```cpp
zPosition = Z_HOME_POSITION;  // 0.00mm
isMoving = false;
```

---

## 7. Position Tracking System

### Coordinate System:
- **Home Position**: `0.00mm` (at Z_MAX limit switch - top)
- **Downward Movement**: Negative values (e.g., `-5.0mm`, `-10.0mm`)
- **Upward Movement**: Positive values (towards 0.00mm)

### Position Updates:
1. **After Movement**: Position updated based on steps completed
2. **After Homing**: Position reset to `0.00mm`
3. **Limit Switch Hit**: Position clamped to appropriate limit

### Example Position Flow:
```
Start: 0.00mm (home)
  ↓ Jog -5mm
Position: -5.00mm
  ↓ Jog -10mm
Position: -15.00mm
  ↓ Home command
Position: 0.00mm (home)
```

---

## 8. Speed Control System

### Speed Input Formats:

#### **Format 1: Percentage (1-100)**
```json
{"command":"jog","axis":"z","distance":-5,"speed":80}
```
- **80** = 80% speed
- Converted to delay: `~440 microseconds`

#### **Format 2: Direct Delay (microseconds)**
```json
{"command":"jog","axis":"z","distance":-5,"speed":500}
```
- **500** = 500 microseconds delay (if > 100)

### Speed Range:
- **Minimum delay**: 100μs (fastest - 100% speed)
- **Maximum delay**: 2000μs (slowest - 1% speed)
- **Default delay**: 300μs

### Speed Formula:
```cpp
delay = MAX - ((speed - 1) / 99) * (MAX - MIN)
```
- Maps 1-100% to 2000-100μs range
- Linear mapping

---

## 9. Complete Command Flow Example

### User Action: Jog 5mm Downward at 80% Speed

#### **1. Electron App Sends:**
```json
{"command":"jog","axis":"z","distance":-5,"speed":80}
```

#### **2. Arduino Receives:**
- Serial buffer receives JSON string
- `processCommands()` called in `loop()`

#### **3. JSON Parsed:**
- `cmdDoc["command"]` = `"jog"`
- `cmdDoc["axis"]` = `"z"`
- `cmdDoc["distance"]` = `-5.0`
- `cmdDoc["speed"]` = `80.0`

#### **4. Speed Converted:**
- 80% → ~440 microseconds delay

#### **5. Movement Calculated:**
- Current position: `-10.0mm`
- Target: `-10.0 + (-5.0) = -15.0mm`
- Steps: `5.0 × 204.1 = 1020.5` → `ceil(1020.5) = 1021 steps`

#### **6. Stepper Motor Pulsed:**
- Direction: LOW (downward)
- 1021 pulses at 440μs delay each
- Total time: ~0.9 seconds

#### **7. Position Updated:**
- Steps completed: 1021
- Delta: `(1021 / 204.1) × (-1) = -5.00mm`
- New position: `-15.00mm`

#### **8. Status Sent Back:**
```json
{"pos":{"z":-15.0,"moving":false},"temp":{...},...}
```

---

## 10. Safety Features

### Limit Switches:
- **Z_MAX (Pin 3)**: Home position (top) - INPUT_PULLUP, LOW when triggered
- **Z_MIN (Pin 2)**: Bottom limit - INPUT_PULLUP, LOW when triggered

### Safety Checks:
1. **Before Movement**: Check if already at limit
2. **During Movement**: Stop if limit switch triggered
3. **Position Clamping**: Cannot exceed 0.00mm (home)

### Error Handling:
- JSON parse errors logged
- Unknown commands logged
- Invalid parameters rejected
- Movement aborted if limit switch hit

---

## 11. Calibration System

### Command:
```json
{"command":"calibrate","commanded":5.0,"actual":4.89}
```

### Auto-Calculation:
```cpp
float correctionFactor = commanded / actual;  // 5.0 / 4.89 = 1.0225
zStepsPerMm = zStepsPerMm * correctionFactor;
// 204.1 × 1.0225 = 208.7 steps/mm
```

**Purpose:** Adjusts `zStepsPerMm` based on actual measurements to improve precision.

---

## Summary

1. **JSON Received** → Parsed using ArduinoJson library
2. **Command Extracted** → Command type determines action
3. **Parameters Extracted** → Distance, speed, axis, etc.
4. **Movement Calculated** → Distance converted to steps
5. **Stepper Pulsed** → Motor moves exact number of steps
6. **Position Updated** → Based on steps completed
7. **Status Sent** → JSON response sent to app

The entire system is **synchronous** - commands block until movement completes, ensuring precise control.

