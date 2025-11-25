# Arduino Communication Flow - How JSON Commands Work

This document explains the complete flow of how JSON commands are sent from the Electron app to Arduino and how Arduino processes them to control the machine hardware.

## Complete Communication Flow

### 1. App Sends JSON Command

**Location:** `SolderingHardware.js` → `_sendArduinoJsonCommand()`

**Example - Enable Heater:**
```javascript
await this._sendArduinoJsonCommand({
  command: 'heater',
  enable: true
})
```

**What happens:**
1. Method is called in `SolderingHardware.js`
2. Calls `SerialPortManager.sendJsonCommand()`
3. JSON is stringified: `{"command":"heater","enable":true}`
4. Newline is added: `{"command":"heater","enable":true}\n`
5. Written to serial port via `port.write()`

---

### 2. Serial Port Transmission

**Location:** `SerialPortManager.js` → `sendJsonCommand()`

**Code:**
```javascript
const jsonCommand = JSON.stringify(commandObj)
this.port.write(`${jsonCommand}\n`, (error) => {
  // Command sent via USB/Serial connection
})
```

**Physical Transmission:**
- Data travels via USB cable (or Serial connection)
- Baud rate: 115200 (configured in both app and Arduino)
- Format: ASCII text (JSON string) + newline character

---

### 3. Arduino Receives Data

**Location:** `ARDUINO_SKETCH_EXAMPLE.ino` → `processCommands()` function

**Arduino Code:**
```cpp
void processCommands() {
  // Check if data is available on Serial port
  if (Serial.available() > 0) {
    // Read until newline character (\n)
    String command = Serial.readStringUntil('\n');
    command.trim();  // Remove whitespace
    
    // Now command contains: {"command":"heater","enable":true}
  }
}
```

**What happens:**
1. Arduino's `loop()` function calls `processCommands()` continuously
2. `Serial.available()` checks if data is waiting
3. `Serial.readStringUntil('\n')` reads the entire JSON string
4. String is stored in `command` variable

---

### 4. Arduino Parses JSON

**Location:** `ARDUINO_SKETCH_EXAMPLE.ino` → `processCommands()` → JSON parsing

**Arduino Code:**
```cpp
// Check if it's JSON format (starts with {)
if (command.startsWith("{")) {
  // Create JSON document (512 bytes max)
  StaticJsonDocument<512> cmdDoc;
  
  // Parse JSON string into document
  DeserializationError error = deserializeJson(cmdDoc, command);
  
  if (!error) {
    // Extract command type
    String cmd = cmdDoc["command"] | "";
    
    // Check command type
    if (cmd == "heater") {
      // Extract enable parameter
      heaterEnabled = cmdDoc["enable"] | heaterEnabled;
      
      // Now execute the command
      // TODO: Enable/disable heater
    }
  }
}
```

**What happens:**
1. Checks if string starts with `{` (JSON format)
2. Creates JSON document buffer (512 bytes)
3. Parses JSON string into structured data
4. Extracts `command` field: `"heater"`
5. Extracts `enable` field: `true`
6. Stores in variable: `heaterEnabled = true`

---

### 5. Arduino Executes Command (Hardware Control)

**Location:** `ARDUINO_SKETCH_EXAMPLE.ino` → After parsing, execute hardware control

**Example - Heater Control Implementation:**

```cpp
if (cmd == "heater") {
  heaterEnabled = cmdDoc["enable"] | heaterEnabled;
  
  // ACTUAL HARDWARE CONTROL
  if (heaterEnabled) {
    // Enable heater (e.g., turn on relay, set PWM, etc.)
    digitalWrite(HEATER_PIN, HIGH);  // Turn on relay
    // OR
    analogWrite(HEATER_PWM_PIN, 255);  // Set PWM to max (if using PWM)
  } else {
    // Disable heater
    digitalWrite(HEATER_PIN, LOW);  // Turn off relay
    // OR
    analogWrite(HEATER_PWM_PIN, 0);  // Set PWM to 0
  }
}
```

**Example - Movement Control Implementation:**

```cpp
if (cmd == "move") {
  float z = cmdDoc["z"] | zPosition;
  zPosition = z;
  isMoving = true;
  
  // ACTUAL HARDWARE CONTROL - Move stepper motor
  moveStepperToPosition(z);  // Custom function to move stepper
}

void moveStepperToPosition(float targetZ) {
  // Calculate steps needed
  float currentZ = readEncoderPosition();  // Get current position
  float distance = targetZ - currentZ;
  int steps = (int)(distance * STEPS_PER_MM);
  
  // Set direction
  if (steps > 0) {
    digitalWrite(STEPPER_Z_DIR, HIGH);  // Move up
  } else {
    digitalWrite(STEPPER_Z_DIR, LOW);   // Move down
    steps = -steps;  // Make positive
  }
  
  // Move stepper motor
  for (int i = 0; i < steps; i++) {
    digitalWrite(STEPPER_Z_STEP, HIGH);
    delayMicroseconds(500);  // Step pulse width
    digitalWrite(STEPPER_Z_STEP, LOW);
    delayMicroseconds(500);  // Step delay (controls speed)
  }
  
  isMoving = false;
  zPosition = targetZ;  // Update position
}
```

---

## Complete Example: Heater Enable Flow

### Step-by-Step Flow:

1. **User Action:**
   - User clicks "Enable Heater" button in UI

2. **Frontend (React):**
   ```javascript
   handleToggleHeater() {
     window.ipc.send('tip:heater:set', { enabled: true })
   }
   ```

3. **IPC Handler (Main Process):**
   ```javascript
   registerIpcListener('tip:heater:set', (event, payload) => {
     hardware.setHeaterEnabled(payload.enabled)
   })
   ```

4. **Hardware Controller:**
   ```javascript
   setHeaterEnabled(enabled) {
     this.state.tip.heaterEnabled = Boolean(enabled)
     await this._sendArduinoJsonCommand({
       command: 'heater',
       enable: Boolean(enabled)
     })
   }
   ```

5. **Serial Port Manager:**
   ```javascript
   async sendJsonCommand(commandObj) {
     const jsonCommand = JSON.stringify(commandObj)  // {"command":"heater","enable":true}
     this.port.write(`${jsonCommand}\n`)  // Send via USB
   }
   ```

6. **Arduino Receives:**
   ```cpp
   void processCommands() {
     if (Serial.available() > 0) {
       String command = Serial.readStringUntil('\n');
       // command = "{\"command\":\"heater\",\"enable\":true}"
     }
   }
   ```

7. **Arduino Parses:**
   ```cpp
   StaticJsonDocument<512> cmdDoc;
   deserializeJson(cmdDoc, command);
   String cmd = cmdDoc["command"];  // "heater"
   bool enable = cmdDoc["enable"];   // true
   ```

8. **Arduino Executes:**
   ```cpp
   if (cmd == "heater") {
     heaterEnabled = enable;
     
     // CONTROL ACTUAL HARDWARE
     if (heaterEnabled) {
       digitalWrite(HEATER_RELAY_PIN, HIGH);  // Turn on heater relay
       // OR control PWM for temperature regulation
       analogWrite(HEATER_PWM_PIN, 200);  // Set heater power
     } else {
       digitalWrite(HEATER_RELAY_PIN, LOW);   // Turn off heater
       analogWrite(HEATER_PWM_PIN, 0);
     }
   }
   ```

9. **Arduino Sends Status Back:**
   ```cpp
   void sendMachineState() {
     // ... create JSON ...
     temp["heater"] = heaterEnabled;  // Include heater state
     serializeJson(doc, Serial);      // Send back to app
     Serial.println();
   }
   ```

10. **App Receives Status:**
    - Arduino sends JSON: `{"temp":{"heater":true,...},...}`
    - App parses and updates UI
    - User sees heater is now enabled

---

## Hardware Control Implementation Examples

### 1. Stepper Motor Control (Z-axis Movement)

```cpp
// Pin definitions
#define STEPPER_Z_STEP 2
#define STEPPER_Z_DIR 3
#define STEPS_PER_MM 200  // Adjust based on your motor/lead screw

void moveZAxis(float targetZ) {
  float currentZ = zPosition;
  float distance = targetZ - currentZ;
  int steps = (int)(distance * STEPS_PER_MM);
  
  // Set direction
  digitalWrite(STEPPER_Z_DIR, steps > 0 ? HIGH : LOW);
  steps = abs(steps);
  
  // Move motor
  for (int i = 0; i < steps; i++) {
    digitalWrite(STEPPER_Z_STEP, HIGH);
    delayMicroseconds(500);
    digitalWrite(STEPPER_Z_STEP, LOW);
    delayMicroseconds(500);
  }
  
  zPosition = targetZ;
  isMoving = false;
}
```

### 2. Heater Control (Relay or PWM)

```cpp
// Option 1: Simple relay control
#define HEATER_RELAY_PIN 4

void setHeater(bool enabled) {
  digitalWrite(HEATER_RELAY_PIN, enabled ? HIGH : LOW);
}

// Option 2: PWM control for temperature regulation
#define HEATER_PWM_PIN 5

void setHeaterPower(int power) {  // 0-255
  analogWrite(HEATER_PWM_PIN, power);
}
```

### 3. Wire Feed Stepper Control

```cpp
#define WIRE_FEED_STEP 6
#define WIRE_FEED_DIR 7
#define WIRE_STEPS_PER_MM 8

void feedWire(float length) {
  int steps = (int)(length * WIRE_STEPS_PER_MM);
  
  digitalWrite(WIRE_FEED_DIR, HIGH);  // Feed direction
  
  for (int i = 0; i < steps; i++) {
    digitalWrite(WIRE_FEED_STEP, HIGH);
    delayMicroseconds(200);
    digitalWrite(WIRE_FEED_STEP, LOW);
    delayMicroseconds(200);
  }
}
```

### 4. Fan Control (PWM)

```cpp
#define FAN_MACHINE_PIN 8
#define FAN_TIP_PIN 9

void setFan(String fanType, int speed) {  // speed: 0-100
  int pwmValue = map(speed, 0, 100, 0, 255);
  
  if (fanType == "machine") {
    analogWrite(FAN_MACHINE_PIN, pwmValue);
  } else if (fanType == "tip") {
    analogWrite(FAN_TIP_PIN, pwmValue);
  }
}
```

### 5. Fume Extractor Control

```cpp
#define FUME_EXTRACTOR_PIN 10

void setFumeExtractor(bool enabled, int speed) {
  if (enabled) {
    int pwmValue = map(speed, 0, 100, 0, 255);
    analogWrite(FUME_EXTRACTOR_PIN, pwmValue);
  } else {
    analogWrite(FUME_EXTRACTOR_PIN, 0);
  }
}
```

---

## Complete Arduino Implementation Example

Here's how the `processCommands()` function should be fully implemented:

```cpp
void processCommands() {
  if (Serial.available() > 0) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    
    if (command.length() == 0) return;
    
    if (command.startsWith("{")) {
      StaticJsonDocument<512> cmdDoc;
      DeserializationError error = deserializeJson(cmdDoc, command);
      
      if (!error) {
        String cmd = cmdDoc["command"] | "";
        
        // Movement commands
        if (cmd == "move") {
          float z = cmdDoc["z"] | zPosition;
          moveZAxis(z);  // Execute hardware movement
        }
        else if (cmd == "jog") {
          String axis = cmdDoc["axis"] | "";
          float distance = cmdDoc["distance"] | 0;
          if (axis == "z" || axis == "Z") {
            moveZAxis(zPosition + distance);
          }
        }
        else if (cmd == "home") {
          moveZAxis(0.0);  // Move to zero position
        }
        
        // Temperature and heater
        else if (cmd == "temp") {
          targetTemperature = cmdDoc["target"] | targetTemperature;
          // Update PID controller setpoint
        }
        else if (cmd == "heater") {
          heaterEnabled = cmdDoc["enable"] | heaterEnabled;
          setHeater(heaterEnabled);  // Control hardware
        }
        
        // Wire feed
        else if (cmd == "feed") {
          float length = cmdDoc["length"] | 0;
          feedWire(length);  // Execute wire feed
        }
        
        // Fans
        else if (cmd == "fan") {
          bool machine = cmdDoc["machine"] | false;
          bool tip = cmdDoc["tip"] | false;
          setFan("machine", machine ? 100 : 0);
          setFan("tip", tip ? 100 : 0);
        }
        
        // Fume extractor
        else if (cmd == "fume") {
          bool enabled = cmdDoc["enabled"] | false;
          int speed = cmdDoc["speed"] | 80;
          setFumeExtractor(enabled, speed);
        }
        
        // Flux mist
        else if (cmd == "fluxmist") {
          if (cmdDoc["dispense"]) {
            int duration = cmdDoc["duration"] | 500;
            int flowRate = cmdDoc["flowRate"] | 50;
            dispenseFluxMist(duration, flowRate);
          }
        }
        
        // Air breeze
        else if (cmd == "airbreeze") {
          if (cmdDoc["activate"]) {
            int duration = cmdDoc["duration"] | 2000;
            int intensity = cmdDoc["intensity"] | 60;
            activateAirBreeze(duration, intensity);
          } else if (cmdDoc.containsKey("enabled")) {
            setAirBreeze(cmdDoc["enabled"], cmdDoc["intensity"] | 60);
          }
        }
        
        // Air jet
        else if (cmd == "airjet") {
          if (cmdDoc["activate"]) {
            int duration = cmdDoc["duration"] | 200;
            int pressure = cmdDoc["pressure"] | 80;
            activateAirJet(duration, pressure);
          } else if (cmdDoc.containsKey("enabled")) {
            setAirJet(cmdDoc["enabled"], cmdDoc["pressure"] | 80);
          }
        }
      }
    }
  }
}
```

---

## Summary

**Complete Flow:**
1. **App** → Creates JSON object → Stringifies → Sends via Serial
2. **Serial/USB** → Transmits data at 115200 baud
3. **Arduino** → Receives string → Parses JSON → Extracts command
4. **Arduino** → Executes hardware control (digitalWrite, analogWrite, stepper control)
5. **Hardware** → Physical action (motor moves, relay turns on, etc.)
6. **Arduino** → Reads sensors → Sends status back to app
7. **App** → Receives status → Updates UI

**Key Points:**
- All communication is **bidirectional** (app ↔ Arduino)
- Commands are **JSON format** for easy parsing
- Arduino controls **actual hardware** (pins, motors, relays)
- Status is **continuously sent** from Arduino to app
- No G-code is used - pure JSON communication

