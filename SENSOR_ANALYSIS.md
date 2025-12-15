# Sensor Reading Code Analysis

## Overview: Are Sensors Necessary?

**Short Answer:** It depends on your machine setup. Some sensors are **critical** for safety, others are **optional** for monitoring.

---

## Sensor Categories

### 🔴 **CRITICAL Sensors** (Required for Safe Operation)

#### 1. **Limit Switches** (Pins 2 & 3)
- **Z_MIN_PIN (Pin 2)**: Bottom limit switch
- **Z_MAX_PIN (Pin 3)**: Top limit switch (home position)

**Why Critical:**
- **Safety**: Prevents machine from crashing into physical limits
- **Homing**: Z_MAX switch defines home position (0.00mm)
- **Movement Control**: Stops movement when triggered

**How It Works:**
```cpp
// During movement, continuously checks limit switches
if (!moveUp && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MIN_PIN)) {
    break;  // Stop immediately if bottom limit hit
}
if (moveUp && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MAX_PIN)) {
    zPosition = Z_HOME_POSITION;  // Reached home
    break;
}
```

**Response to Machine:**
- **Input**: Physical switch pressed → Arduino reads LOW signal
- **Action**: Arduino **STOPS** stepper motor immediately
- **Result**: Machine movement halted, position updated

**Status:** ✅ **MUST BE CONNECTED** - Your machine uses these!

---

### 🟡 **OPTIONAL Sensors** (For Monitoring/Features)

#### 2. **Z-Axis Encoder** (Pin A0)
**Current Status:** ❌ **NOT USED** (commented out)

```cpp
// Line 243: Currently commented out
// zPosition = readEncoderPosition(Z_ENCODER_PIN);
```

**Why Not Used:**
- Position is tracked via **step counting** instead
- More reliable for stepper motors (no encoder needed)
- Current system: `zPosition = stepsCompleted / zStepsPerMm`

**If You Want to Use It:**
- Uncomment line 243
- Comment out position tracking in movement functions
- Provides **absolute position** (independent of step counting)

**Necessity:** ❌ **NOT NECESSARY** - Step counting works fine

---

#### 3. **Thermocouple** (MAX6675 - Pins 10, 13, 12)
**Purpose:** Measure soldering iron tip temperature

**Current Usage:**
```cpp
currentTemperature = readThermocouple(THERMOCOUPLE_CS_PIN, THERMOCOUPLE_SCK_PIN, THERMOCOUPLE_SO_PIN);
```

**How It Responds:**
- **Input**: Temperature sensor reads actual tip temperature
- **Action**: Arduino controls heater via PWM (Pin 5)
- **Control Logic:**
  ```cpp
  if (heaterEnabled && currentTemperature < targetTemperature) {
      analogWrite(HEATER_PIN, 255);  // Turn heater ON
  } else {
      analogWrite(HEATER_PIN, 0);    // Turn heater OFF
  }
  ```

**Response to Machine:**
- **Arduino → Machine**: Controls heater power (PWM signal)
- **Machine → Arduino**: Temperature reading sent to app
- **App Display**: Shows current temperature in UI

**Necessity:** 🟡 **OPTIONAL** - Only needed if you have temperature control

---

#### 4. **Load Cell** (HX711 - Pins A1, A2)
**Purpose:** Measure wire spool weight to calculate remaining wire

**Current Usage:**
```cpp
spoolWeight = readLoadCell(LOAD_CELL_DT_PIN, LOAD_CELL_SCK_PIN);
// Calculates wire length and remaining percentage
wireLength = wireWeight / WIRE_DENSITY_G_PER_MM;
remainingPercentage = (wireLength / 10000.0) * 100.0;
```

**How It Responds:**
- **Input**: Weight sensor measures spool weight
- **Calculation**: Arduino calculates remaining wire length
- **Output**: Sent to app for display

**Response to Machine:**
- **Machine → Arduino**: Weight reading
- **Arduino → App**: Wire length and percentage
- **App Display**: Shows remaining wire percentage

**Necessity:** 🟡 **OPTIONAL** - Only for wire monitoring feature

---

#### 5. **Wire Break Sensor** (Pin 4)
**Purpose:** Detect if solder wire breaks during feeding

**Current Usage:**
```cpp
wireBreakDetected = digitalRead(WIRE_BREAK_SENSOR_PIN) == LOW;
```

**How It Responds:**
- **Input**: Digital sensor detects wire break (LOW = broken)
- **Action**: Stops wire feeding if break detected
- **Interrupt Handler:**
  ```cpp
  void handleWireBreak() {
      if (digitalRead(WIRE_BREAK_SENSOR_PIN) == LOW) {
          wireBreakDetected = true;
          if (isWireFeeding) {
              isWireFeeding = false;  // Stop feeding
              wireFeedStatus = "error";
          }
      }
  }
  ```

**Response to Machine:**
- **Machine → Arduino**: Wire break signal (LOW)
- **Arduino → Machine**: Stops wire feed stepper motor
- **Arduino → App**: Sends error status

**Necessity:** 🟡 **OPTIONAL** - Only if you have wire feed system

---

## Sensor Reading Flow

### Current Implementation:

```
loop() {
    readSensors() {
        if (useRealSensors == true) {
            // Read actual hardware sensors
            currentTemperature = readThermocouple(...);
            spoolWeight = readLoadCell(...);
            wireBreakDetected = digitalRead(...);
        } else {
            // Simulation mode (fake data)
            // Temperature simulates heating/cooling
            // Movement simulates completion
        }
    }
    
    sendMachineState() {
        // Send ALL sensor data to app via JSON
        // Every 100ms
    }
}
```

### Sensor Data Flow:

```
Physical Sensor → Arduino Pin → readSensor() → Variable → JSON → Electron App
```

**Example:**
```
Thermocouple → Pin 10,13,12 → readThermocouple() → currentTemperature → 
JSON {"temp":{"current":345.0}} → App displays temperature
```

---

## Which Sensors Are Actually Used?

### ✅ **Currently Active:**
1. **Limit Switches** (Pins 2, 3) - ✅ **CRITICAL**
   - Used for: Movement safety, homing, position limits
   - **Affects machine movement**: YES (stops movement)

### ❌ **Currently Inactive (but code exists):**
2. **Z-Axis Encoder** (Pin A0) - ❌ Not used (commented out)
3. **Thermocouple** (Pins 10,13,12) - 🟡 Read but may not be connected
4. **Load Cell** (Pins A1,A2) - 🟡 Read but may not be connected
5. **Wire Break Sensor** (Pin 4) - 🟡 Read but may not be connected

---

## How Sensors Respond to Machine Movement

### **Limit Switches (Active):**

**During Movement:**
```
Machine Head Moving Down
    ↓
Hits Bottom Limit Switch (Pin 2)
    ↓
Arduino reads LOW signal
    ↓
STOPS stepper motor immediately
    ↓
Updates position
    ↓
Sends status to app: {"pos":{"z":-40.0,"moving":false}}
```

**During Homing:**
```
Home Command Received
    ↓
Stepper moves UP continuously
    ↓
Hits Top Limit Switch (Pin 3)
    ↓
Arduino reads LOW signal
    ↓
STOPS stepper motor
    ↓
Sets position to 0.00mm
    ↓
Sends status: {"pos":{"z":0.0,"moving":false}}
```

### **Other Sensors (Monitoring Only):**

**Temperature Sensor:**
```
Thermocouple Reads 345°C
    ↓
Arduino stores in currentTemperature
    ↓
Controls heater (if enabled)
    ↓
Sends to app: {"temp":{"current":345.0}}
    ↓
App displays temperature
    ↓
NO DIRECT EFFECT on Z-axis movement
```

**Load Cell:**
```
Spool Weight = 450g
    ↓
Arduino calculates wire length
    ↓
Sends to app: {"spool":{"weight":450,"remaining":85.5}}
    ↓
App displays wire percentage
    ↓
NO EFFECT on movement
```

---

## Can You Remove Sensor Code?

### **Safe to Remove:**
- ❌ **Z-Axis Encoder** - Already not used
- 🟡 **Thermocouple** - If you don't have temperature control
- 🟡 **Load Cell** - If you don't need wire monitoring
- 🟡 **Wire Break Sensor** - If you don't have wire feed

### **MUST KEEP:**
- ✅ **Limit Switches** - Critical for safety and homing

---

## Recommendation

### **For Your Current Setup (Z-axis movement only):**

**Minimum Required:**
```cpp
// Keep these sensors:
✅ LIMIT_SWITCH_Z_MIN_PIN (Pin 2) - Bottom limit
✅ LIMIT_SWITCH_Z_MAX_PIN (Pin 3) - Top limit (home)

// You can remove/comment out:
❌ Z_ENCODER_PIN - Not used anyway
🟡 Thermocouple - Only if no temperature control
🟡 Load Cell - Only if no wire monitoring
🟡 Wire Break Sensor - Only if no wire feed
```

### **Simplified Code Option:**

If you only need Z-axis movement, you can:
1. Set `useRealSensors = false` (line 114)
2. Comment out sensor reading functions
3. Keep limit switch code (it's separate from `readSensors()`)

**Limit switches are checked directly in movement functions**, not in `readSensors()`, so they'll still work!

---

## Summary

| Sensor | Necessity | Affects Movement? | Current Status |
|--------|-----------|-------------------|----------------|
| **Limit Switches** | ✅ **CRITICAL** | ✅ YES (stops movement) | ✅ Active |
| **Z-Axis Encoder** | ❌ Not needed | ❌ No | ❌ Not used |
| **Thermocouple** | 🟡 Optional | ❌ No (controls heater only) | 🟡 May not be connected |
| **Load Cell** | 🟡 Optional | ❌ No | 🟡 May not be connected |
| **Wire Break** | 🟡 Optional | ❌ No (stops wire feed only) | 🟡 May not be connected |

**Bottom Line:** 
- **Limit switches are ESSENTIAL** - Keep them!
- **Other sensors are optional** - Remove if not connected
- **Sensor reading code doesn't affect Z-axis movement** - It's just for monitoring/display

