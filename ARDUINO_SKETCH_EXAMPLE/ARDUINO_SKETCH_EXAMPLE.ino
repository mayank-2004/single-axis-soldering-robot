 /*
 * Arduino Mega 2560 Sketch for Single Axis Soldering Machine
 * Sends machine state data as JSON to Electron/Nextron app
 * 
 * Machine Specifications:
 * - Single-Axis Machine: Only Z-axis (up/down) movement
 * - Z Axis: Up-Down head movement for applying solder paste on PCB pads
 * - PCB is moved manually by operator (no X/Y axis control)
 * 
 * Install ArduinoJson library: Tools -> Manage Libraries -> Search "ArduinoJson" -> Install
 */

#include <ArduinoJson.h>
#include <math.h>

// Serial communication settings
const unsigned long BAUD_RATE = 115200;
const unsigned long UPDATE_INTERVAL = 100; // Send data every 100ms

// Mock sensor values (replace with actual sensor readings)
// Single-axis machine: Only Z-axis position is tracked
float zPosition = 3.2;  // Z-axis position in mm (up/down)
bool isMoving = false;

float targetTemperature = 345.0;
float currentTemperature = 25.0;
bool heaterEnabled = false;

String wireFeedStatus = "idle";
float wireFeedRate = 8.0;
bool wireBreakDetected = false;

float spoolWeight = 500.0;
float wireLength = 10000.0;
float wireDiameter = 0.5;
float remainingPercentage = 100.0;
bool isWireFeeding = false;

float fluxPercentage = 82.0;
float fluxMl = 68.0;

bool fanMachine = false;
bool fanTip = false;

bool fumeExtractorEnabled = false;
float fumeExtractorSpeed = 80.0;

bool fluxMistEnabled = false;
bool fluxMistDispensing = false;
float fluxMistFlowRate = 50.0;

bool airBreezeEnabled = false;
bool airBreezeActive = false;
float airBreezeIntensity = 60.0;

bool airJetEnabled = false;
bool airJetActive = false;
float airJetPressure = 80.0;

String sequenceStage = "idle";
bool sequenceActive = false;
int currentPad = 0;
int totalPads = 0;
float sequenceProgress = 0.0;
String sequenceError = "";  // Empty string means no error (will send null in JSON)

float componentHeight = 5;

// -------------------------------
// Z-Axis stepper configuration
// -------------------------------
const int STEPPER_Z_STEP_PIN = 48;
const int STEPPER_Z_DIR_PIN = 46;
// Enable pin is not used in this configuration

const int LIMIT_SWITCH_Z_MIN_PIN = 2;
const int LIMIT_SWITCH_Z_MAX_PIN = 3;

const float Z_MIN_POSITION = 0.0f;   // mm
const float Z_MAX_POSITION = 20.0f;  // mm
const int Z_STEPS_PER_MM = 200;      // Adjust to your mechanics (lead screw pitch / micro-stepping)
const unsigned int Z_STEP_DELAY_US = 600; // Pulse width for stepper (microseconds)

// -------------------------------
// Wire Feed stepper configuration
// -------------------------------
const int WIRE_FEED_STEP_PIN = 9;
const int WIRE_FEED_DIR_PIN = 8;
// Enable pin is not used in this configuration

const int WIRE_FEED_STEPS_PER_MM = 200;      // Adjust to your wire feed mechanics
const unsigned int WIRE_FEED_STEP_DELAY_US = 500; // Pulse width for wire feed stepper (microseconds)

// -------------------------------
// Button and Paddle configuration
// -------------------------------
const int BUTTON_UP_PIN = 39;
const int BUTTON_DOWN_PIN = 37;
const int BUTTON_SAVE_PIN = 35;
const int PADDLE_PIN = 34;

// Button debouncing and continuous movement
const unsigned long BUTTON_DEBOUNCE_MS = 50;
const unsigned long BUTTON_REPEAT_DELAY_MS = 100; // Delay between movements when button held
unsigned long lastButtonUpPress = 0;
unsigned long lastButtonDownPress = 0;
unsigned long lastButtonSavePress = 0;
unsigned long lastPaddlePress = 0;
unsigned long lastButtonUpRepeat = 0;
unsigned long lastButtonDownRepeat = 0;
bool lastButtonUpState = HIGH;
bool lastButtonDownState = HIGH;
bool lastButtonSaveState = HIGH;
bool lastPaddleState = HIGH;

// Movement recording and playback
float savedMovementDistance = 0.0f;  // Saved movement distance from home position
bool hasSavedMovement = false;
float homePosition = 20.0f;  // Position when save was pressed (should be homing position - Z_MAX)
bool isExecutingSavedMovement = false;

// Forward declarations for motion helpers
void moveZAxisByDistance(float distanceMm);
void moveZAxisTo(float targetMm);
void homeZAxis();
void feedWireByLength(float lengthMm);
void handleButtonControls();
void saveMovementSequence();
void executeSavedMovement();


void setup() {
  Serial.begin(BAUD_RATE);
  
  // Note: Arduino Mega 2560 doesn't need "while (!Serial)" wait
  // It will work even if no USB connection is present
  // Only use this wait if you need USB connection for debugging
  
  // Initialize sensors, motors, actuators here
  // Z-axis stepper motor pins
  pinMode(STEPPER_Z_STEP_PIN, OUTPUT);
  pinMode(STEPPER_Z_DIR_PIN, OUTPUT);
  pinMode(LIMIT_SWITCH_Z_MIN_PIN, INPUT_PULLUP);
  pinMode(LIMIT_SWITCH_Z_MAX_PIN, INPUT_PULLUP);

  digitalWrite(STEPPER_Z_STEP_PIN, LOW);
  digitalWrite(STEPPER_Z_DIR_PIN, LOW);

  // Wire feed stepper motor pins
  pinMode(WIRE_FEED_STEP_PIN, OUTPUT);
  pinMode(WIRE_FEED_DIR_PIN, OUTPUT);

  digitalWrite(WIRE_FEED_STEP_PIN, LOW);
  digitalWrite(WIRE_FEED_DIR_PIN, LOW);

  // Button and paddle pins (INPUT_PULLUP - buttons connect to ground when pressed)
  pinMode(BUTTON_UP_PIN, INPUT_PULLUP);
  pinMode(BUTTON_DOWN_PIN, INPUT_PULLUP);
  pinMode(BUTTON_SAVE_PIN, INPUT_PULLUP);
  pinMode(PADDLE_PIN, INPUT_PULLUP);

  // Initialize button states
  lastButtonUpState = digitalRead(BUTTON_UP_PIN);
  lastButtonDownState = digitalRead(BUTTON_DOWN_PIN);
  lastButtonSaveState = digitalRead(BUTTON_SAVE_PIN);
  lastPaddleState = digitalRead(PADDLE_PIN);

  // pinMode(HEATER_PIN, OUTPUT);
  // attachInterrupt(digitalPinToInterrupt(WIRE_BREAK_SENSOR), handleWireBreak, CHANGE);
  
  delay(1000); // Give time for serial connection to stabilize
  
  Serial.println("Arduino Mega 2560 - Single Axis Soldering Machine Ready");
  Serial.println("Machine Type: Single-Axis (Z-axis only)");
  Serial.println("PCB is moved manually by operator");
  Serial.print("Starting Z Position: ");
  Serial.print(zPosition);
  Serial.println("mm");
}

void loop() {
  // Handle button controls (up, down, save, paddle)
  handleButtonControls();
  
  // Read sensors and update values
  readSensors();
  
  // Send JSON data to Electron app
  sendMachineState();
  
  // Process incoming commands from app
  processCommands();
  
  delay(UPDATE_INTERVAL);
}

void readSensors() {
  // TODO: Replace with actual sensor readings
  
  // Example sensor reading functions:
  // zPosition = readEncoderPosition(Z_ENCODER);  // Only Z-axis (single-axis machine)
  // currentTemperature = readThermocouple(THERMOCOUPLE_PIN);
  // spoolWeight = readLoadCell(LOAD_CELL_PIN);
  // wireBreakDetected = digitalRead(WIRE_BREAK_SENSOR) == LOW;
  
  // Simulate sensor reading (remove in production)
  static unsigned long lastSensorUpdate = 0;
  if (millis() - lastSensorUpdate > 1000) {
    // Simulate small Z-axis changes for testing
    zPosition += random(-5, 5) / 100.0;
    // Clamp Z position to reasonable range (0-20mm)
    zPosition = constrain(zPosition, 0.0, 20.0);
    
    // Simulate temperature rising/cooling
    if (heaterEnabled && currentTemperature < targetTemperature) {
      currentTemperature += 1.0;  // Heat up at 1°C per second
      if (currentTemperature > targetTemperature) {
        currentTemperature = targetTemperature;  // Don't overshoot
      }
    } else if (!heaterEnabled && currentTemperature > 25.0) {
      currentTemperature -= 0.5;  // Cool down at 0.5°C per second
      if (currentTemperature < 25.0) {
        currentTemperature = 25.0;  // Room temperature minimum
      }
    }
    
    // Simulate movement completing
    if (isMoving) {
      static unsigned long movementStartTime = 0;
      if (movementStartTime == 0) {
        movementStartTime = millis();
      }
      // Simulate movement takes 500ms
      if (millis() - movementStartTime > 500) {
        isMoving = false;
        movementStartTime = 0;
      }
    }
    
    // Simulate wire feeding completing
    if (isWireFeeding) {
      static unsigned long feedStartTime = 0;
      if (feedStartTime == 0) {
        feedStartTime = millis();
      }
      // Simulate wire feed takes 2 seconds
      if (millis() - feedStartTime > 2000) {
        isWireFeeding = false;
        wireFeedStatus = "idle";
        feedStartTime = 0;
      }
    }
    
    lastSensorUpdate = millis();
  }
}

void sendMachineState() {
  // Create JSON document (adjust size based on your data)
  StaticJsonDocument<1024> doc;
  
  // Position data (single-axis machine: only Z-axis)
  JsonObject pos = doc.createNestedObject("pos");
  // Single-axis machine: only Z position is sent
  // X and Y are not controlled (PCB moved manually)
  pos["z"] = zPosition;
  pos["moving"] = isMoving;
  
  // Temperature data
  JsonObject temp = doc.createNestedObject("temp");
  temp["target"] = targetTemperature;
  temp["current"] = currentTemperature;
  temp["heater"] = heaterEnabled;
  
  // Wire feed data
  JsonObject wire = doc.createNestedObject("wire");
  wire["status"] = wireFeedStatus;
  wire["feedRate"] = wireFeedRate;
  wire["break"] = wireBreakDetected;
  
  // Spool data
  JsonObject spool = doc.createNestedObject("spool");
  spool["weight"] = spoolWeight;
  spool["wireLength"] = wireLength;
  spool["diameter"] = wireDiameter;
  spool["remaining"] = remainingPercentage;
  spool["feeding"] = isWireFeeding;
  
  // Flux data
  JsonObject flux = doc.createNestedObject("flux");
  flux["percentage"] = fluxPercentage;
  flux["ml"] = fluxMl;
  
  // Fan states
  JsonObject fans = doc.createNestedObject("fans");
  fans["machine"] = fanMachine;
  fans["tip"] = fanTip;
  
  // Fume extractor
  JsonObject fume = doc.createNestedObject("fume");
  fume["enabled"] = fumeExtractorEnabled;
  fume["speed"] = fumeExtractorSpeed;
  
  // Flux mist
  JsonObject fluxMist = doc.createNestedObject("fluxMist");
  fluxMist["enabled"] = fluxMistEnabled;
  fluxMist["dispensing"] = fluxMistDispensing;
  fluxMist["flowRate"] = fluxMistFlowRate;
  
  // Air breeze
  JsonObject airBreeze = doc.createNestedObject("airBreeze");
  airBreeze["enabled"] = airBreezeEnabled;
  airBreeze["active"] = airBreezeActive;
  airBreeze["intensity"] = airBreezeIntensity;
  
  // Air jet pressure
  JsonObject airJet = doc.createNestedObject("airJet");
  airJet["enabled"] = airJetEnabled;
  airJet["active"] = airJetActive;
  airJet["pressure"] = airJetPressure;
  
  // Sequence data
  JsonObject seq = doc.createNestedObject("seq");
  seq["stage"] = sequenceStage;
  seq["active"] = sequenceActive;
  seq["pad"] = currentPad;
  seq["total"] = totalPads;
  seq["progress"] = sequenceProgress;
  // Send null if no error, otherwise send error message
  if (sequenceError.length() > 0) {
    seq["error"] = sequenceError;
  } else {
    seq["error"] = nullptr;  // Send null for no error (JSON null)
  }
  
  // Component height
  doc["height"] = componentHeight;
  
  // Serialize JSON and send via Serial
  serializeJson(doc, Serial);
  Serial.println(); // Important: Send newline after JSON
}

void processCommands() {
  // Process incoming commands from Electron app
  if (Serial.available() > 0) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    
    // Skip if empty
    if (command.length() == 0) {
      return;
    }
    
    // TODO: Parse and execute commands from app
    // Expected command formats:
    // 1. JSON format: {"command":"move","x":120,"y":45,"z":5}
    // 2. Simple format: "MOVE X:120 Y:45 Z:5"
    // 3. Temperature: "TEMP:345" or {"command":"temp","target":345}
    // 4. Heater: "HEATER:1" or {"command":"heater","enable":true}
    // 5. Wire feed: {"command":"feed","length":10.5}
    // 6. Enable/Disable components: {"command":"fan","machine":true}
    
    // Parse JSON commands
    if (command.startsWith("{")) {
      StaticJsonDocument<512> cmdDoc;
      DeserializationError error = deserializeJson(cmdDoc, command);
      
      if (error) {
        Serial.print("[CMD] JSON Parse Error: ");
        Serial.println(error.c_str());
        return;
      }
      
      // JSON parsed successfully
      String cmd = cmdDoc["command"] | "";
      Serial.print("[CMD] Parsed command: ");
      Serial.println(cmd);
        
        if (cmd == "move") {
          // Move to absolute position (single-axis: only Z movement)
          float z = cmdDoc["z"] | zPosition;
          Serial.print("[CMD] Executing move command: z=");
          Serial.println(z);
          moveZAxisTo(z);
        }
        else if (cmd == "temp" || cmd == "temperature") {
          targetTemperature = cmdDoc["target"] | targetTemperature;
          Serial.print("[CMD] Set target temperature: ");
          Serial.println(targetTemperature);
          // TODO: Update heater target temperature
        }
        else if (cmd == "heater") {
          heaterEnabled = cmdDoc["enable"] | heaterEnabled;
          Serial.print("[CMD] Heater ");
          Serial.println(heaterEnabled ? "ENABLED" : "DISABLED");
          // TODO: Enable/disable heater
        }
        else if (cmd == "feed" || cmd == "wirefeed") {
          float length = cmdDoc["length"] | 0;
          if (length > 0) {
            wireFeedStatus = "feeding";
            isWireFeeding = true;
            feedWireByLength(length);
            // After feeding, update status
            wireFeedStatus = "idle";
            isWireFeeding = false;
          }
        }
        else if (cmd == "fan") {
          fanMachine = cmdDoc["machine"] | fanMachine;
          fanTip = cmdDoc["tip"] | fanTip;
          // TODO: Control fans
        }
        else if (cmd == "fume") {
          fumeExtractorEnabled = cmdDoc["enabled"] | fumeExtractorEnabled;
          fumeExtractorSpeed = cmdDoc["speed"] | fumeExtractorSpeed;
          // TODO: Control fume extractor
        }
        else if (cmd == "fluxmist") {
          fluxMistEnabled = cmdDoc["enabled"] | fluxMistEnabled;
          fluxMistFlowRate = cmdDoc["flowRate"] | fluxMistFlowRate;
          if (cmdDoc["dispense"]) {
            fluxMistDispensing = true;
            // TODO: Start flux mist dispensing
          }
        }
        else if (cmd == "airbreeze") {
          airBreezeEnabled = cmdDoc["enabled"] | airBreezeEnabled;
          airBreezeIntensity = cmdDoc["intensity"] | airBreezeIntensity;
          if (cmdDoc["activate"]) {
            airBreezeActive = true;
            // TODO: Activate air breeze
          }
        }
        else if (cmd == "airjet") {
          airJetEnabled = cmdDoc["enabled"] | airJetEnabled;
          airJetPressure = cmdDoc["pressure"] | airJetPressure;
          if (cmdDoc["activate"]) {
            airJetActive = true;
            // TODO: Activate air jet
          }
        }
        else if (cmd == "jog") {
          // Manual movement commands (single-axis: only Z-axis)
          String axis = cmdDoc["axis"] | "";
          float distance = cmdDoc["distance"] | 0;
          
          Serial.print("[CMD] Jog command: axis=");
          Serial.print(axis);
          Serial.print(", distance=");
          Serial.println(distance);
          
          // Single-axis machine: only Z-axis movement is supported
          if (axis == "z" || axis == "Z") {
            moveZAxisByDistance(distance);
          } else {
            // X and Y axes are not supported (PCB moved manually)
            Serial.println("[CMD] WARNING: X/Y axis not supported (single-axis machine)");
            // Ignore the command
          }
        }
        else if (cmd == "home") {
          Serial.println("[CMD] Executing home command");
          homeZAxis();
        }
        else if (cmd == "save") {
          // Save movement sequence from home position to current position
          Serial.println("[CMD] Executing save command");
          saveMovementSequence();
        }
        else {
          Serial.print("[CMD] WARNING: Unknown command: ");
          Serial.println(cmd);
        }
    }
    // For simple text commands (future implementation)
    // else if (command.startsWith("MOVE")) { ... }
    // else if (command.startsWith("TEMP:")) { ... }
    
    // Debug: echo received command (ENABLED FOR TESTING)
    Serial.print("[CMD] Received: ");
    Serial.println(command);
  }
}

// Helper functions for sensor reading (implement based on your hardware)
/*
float readEncoderPosition(int encoderPin) {
  // Read encoder position
  return 0.0;
}

float readThermocouple(int pin) {
  // Read thermocouple temperature
  // Example with MAX6675 or similar
  return 25.0;
}

float readLoadCell(int pin) {
  // Read load cell weight (HX711 or similar)
  return 0.0;
}

void handleWireBreak() {
  // Interrupt handler for wire break detection
  wireBreakDetected = true;
}
*/

// ----------------------------------
// Z-axis motion helper functions
// ----------------------------------

bool isLimitSwitchTriggered(int pin) {
  // Limit switches use INPUT_PULLUP, so LOW = triggered
  return digitalRead(pin) == LOW;
}

void pulseZStep() {
  digitalWrite(STEPPER_Z_STEP_PIN, HIGH);
  delayMicroseconds(Z_STEP_DELAY_US);
  digitalWrite(STEPPER_Z_STEP_PIN, LOW);
  delayMicroseconds(Z_STEP_DELAY_US);
}

void applyZMovement(long steps, bool moveUp) {
  if (steps <= 0) {
    return;
  }

  digitalWrite(STEPPER_Z_DIR_PIN, moveUp ? HIGH : LOW);

  long stepsCompleted = 0;
  while (stepsCompleted < steps) {
    // Safety: stop if limit switch is hit mid-travel
    if (!moveUp && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MIN_PIN)) {
      zPosition = Z_MIN_POSITION;
      break;
    }
    if (moveUp && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MAX_PIN)) {
      zPosition = Z_MAX_POSITION;
      break;
    }

    pulseZStep();
    stepsCompleted++;
  }

  float deltaMm = (stepsCompleted / static_cast<float>(Z_STEPS_PER_MM)) * (moveUp ? 1.0f : -1.0f);
  zPosition = constrain(zPosition + deltaMm, Z_MIN_POSITION, Z_MAX_POSITION);
}

void moveZAxisByDistance(float distanceMm) {
  if (fabsf(distanceMm) < 0.001f) {
    return;
  }

  bool moveUp = distanceMm > 0;

  // Do not move further if limit switch is currently triggered
  if (!moveUp && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MIN_PIN)) {
    zPosition = Z_MIN_POSITION;
    return;
  }
  if (moveUp && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MAX_PIN)) {
    zPosition = Z_MAX_POSITION;
    return;
  }

  float target = constrain(zPosition + distanceMm, Z_MIN_POSITION, Z_MAX_POSITION);
  float actualDistance = target - zPosition;
  long stepsToMove = labs(static_cast<long>(actualDistance * Z_STEPS_PER_MM));

  if (stepsToMove == 0) {
    zPosition = target;
    return;
  }

  isMoving = true;
  applyZMovement(stepsToMove, actualDistance > 0);
  isMoving = false;
}

void moveZAxisTo(float targetMm) {
  float clampedTarget = constrain(targetMm, Z_MIN_POSITION, Z_MAX_POSITION);
  float distance = clampedTarget - zPosition;
  moveZAxisByDistance(distance);
}

void homeZAxis() {
  const long maxSteps = static_cast<long>((Z_MAX_POSITION - Z_MIN_POSITION) * Z_STEPS_PER_MM) + 200;

  isMoving = true;
  digitalWrite(STEPPER_Z_DIR_PIN, HIGH); // Move towards Z-max (upward)

  long stepsTaken = 0;
  while (!isLimitSwitchTriggered(LIMIT_SWITCH_Z_MAX_PIN) && stepsTaken < maxSteps) {
    pulseZStep();
    stepsTaken++;
  }

  zPosition = Z_MAX_POSITION;
  isMoving = false;
}

// ----------------------------------
// Wire feed helper functions
// ----------------------------------

void pulseWireFeedStep() {
  digitalWrite(WIRE_FEED_STEP_PIN, HIGH);
  delayMicroseconds(WIRE_FEED_STEP_DELAY_US);
  digitalWrite(WIRE_FEED_STEP_PIN, LOW);
  delayMicroseconds(WIRE_FEED_STEP_DELAY_US);
}

void feedWireByLength(float lengthMm) {
  if (lengthMm <= 0) {
    return;
  }

  // Set direction: HIGH = feed wire out, LOW = retract (if needed)
  // Assuming HIGH = feed out (forward direction)
  digitalWrite(WIRE_FEED_DIR_PIN, HIGH);

  // Calculate number of steps needed
  long stepsToMove = static_cast<long>(lengthMm * WIRE_FEED_STEPS_PER_MM);

  if (stepsToMove <= 0) {
    return;
  }

  // Feed wire by pulsing the stepper motor
  for (long i = 0; i < stepsToMove; i++) {
    pulseWireFeedStep();
    
    // Optional: Add small delay between steps for smoother operation
    // This can be adjusted based on your feed rate requirements
    // delayMicroseconds(100); // Uncomment if needed
  }
}

// ----------------------------------
// Button control functions
// ----------------------------------

void handleButtonControls() {
  // Read current button states (LOW = pressed, HIGH = not pressed with INPUT_PULLUP)
  bool currentButtonUp = digitalRead(BUTTON_UP_PIN);
  bool currentButtonDown = digitalRead(BUTTON_DOWN_PIN);
  bool currentButtonSave = digitalRead(BUTTON_SAVE_PIN);
  bool currentPaddle = digitalRead(PADDLE_PIN);
  
  unsigned long currentTime = millis();
  
  // Handle UP button (moves head upward continuously while pressed)
  if (currentButtonUp == LOW) {
    // Button is pressed
    if (currentTime - lastButtonUpPress > BUTTON_DEBOUNCE_MS) {
      // First press or repeat - check if enough time has passed
      if (lastButtonUpRepeat == 0 || (currentTime - lastButtonUpRepeat > BUTTON_REPEAT_DELAY_MS)) {
        if (!isExecutingSavedMovement) {
          // Move head up by a small increment (e.g., 0.1mm)
          // You can adjust this value based on your needs
          moveZAxisByDistance(0.1f);
          lastButtonUpRepeat = currentTime;
        }
      }
    }
  } else {
    // Button released - reset repeat timer
    if (lastButtonUpState == LOW) {
      lastButtonUpRepeat = 0;
      lastButtonUpPress = 0; // Reset debounce timer
    }
  }
  lastButtonUpState = currentButtonUp;
  
  // Handle DOWN button (moves head downward continuously while pressed)
  if (currentButtonDown == LOW) {
    // Button is pressed
    if (currentTime - lastButtonDownPress > BUTTON_DEBOUNCE_MS) {
      // First press or repeat - check if enough time has passed
      if (lastButtonDownRepeat == 0 || (currentTime - lastButtonDownRepeat > BUTTON_REPEAT_DELAY_MS)) {
        if (!isExecutingSavedMovement) {
          // Move head down by a small increment (e.g., 0.1mm)
          moveZAxisByDistance(-0.1f);
          lastButtonDownRepeat = currentTime;
        }
      }
    }
  } else {
    // Button released - reset repeat timer
    if (lastButtonDownState == LOW) {
      lastButtonDownRepeat = 0;
      lastButtonDownPress = 0; // Reset debounce timer
    }
  }
  lastButtonDownState = currentButtonDown;
  
  // Handle SAVE button (saves movement sequence from home position)
  if (currentButtonSave == LOW && lastButtonSaveState == HIGH) {
    // Button just pressed (falling edge)
    if (currentTime - lastButtonSavePress > BUTTON_DEBOUNCE_MS) {
      saveMovementSequence();
      lastButtonSavePress = currentTime;
    }
  }
  lastButtonSaveState = currentButtonSave;
  
  // Handle PADDLE (executes saved movement sequence)
  if (currentPaddle == LOW && lastPaddleState == HIGH) {
    // Paddle just pressed (falling edge)
    if (currentTime - lastPaddlePress > BUTTON_DEBOUNCE_MS) {
      if (hasSavedMovement && !isMoving && !isExecutingSavedMovement) {
        executeSavedMovement();
      }
      lastPaddlePress = currentTime;
    }
  }
  lastPaddleState = currentPaddle;
}

void saveMovementSequence() {
  // Save the movement from home position to current position
  // The home position should be set when the machine is homed (Z_MAX_POSITION)
  homePosition = Z_MAX_POSITION;  // Home is at Z_MAX
  savedMovementDistance = zPosition - homePosition;
  hasSavedMovement = true;
  
  // Send confirmation via Serial
  Serial.print("Movement saved: ");
  Serial.print(savedMovementDistance);
  Serial.print(" mm from home position (current Z: ");
  Serial.print(zPosition);
  Serial.println(" mm)");
}

void executeSavedMovement() {
  if (!hasSavedMovement) {
    Serial.println("No saved movement to execute");
    return;
  }
  
  isExecutingSavedMovement = true;
  isMoving = true;
  
  Serial.print("Executing saved movement: ");
  Serial.print(savedMovementDistance);
  Serial.println(" mm from home");
  
  // First, return to home position
  moveZAxisTo(homePosition);
  
  // Small delay to ensure we're at home
  delay(100);
  
  // Then, execute the saved movement from home
  if (savedMovementDistance != 0.0f) {
    moveZAxisByDistance(savedMovementDistance);
  }
  
  Serial.println("Saved movement execution complete");
  isExecutingSavedMovement = false;
  isMoving = false;
}
