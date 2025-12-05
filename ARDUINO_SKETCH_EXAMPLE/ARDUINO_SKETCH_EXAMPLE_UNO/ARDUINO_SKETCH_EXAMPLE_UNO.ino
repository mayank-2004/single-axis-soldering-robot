/*
 * Arduino UNO Sketch for Single Axis Soldering Machine
 * MODIFIED VERSION for Arduino Uno compatibility
 * 
 * IMPORTANT: This version uses different pin numbers than Mega 2560 version
 * 
 * Pin Changes:
 * - STEPPER_Z_STEP_PIN: 48 → 4
 * - STEPPER_Z_DIR_PIN: 46 → 5
 * - BUTTON_UP_PIN: 39 → 10
 * - BUTTON_DOWN_PIN: 37 → 11
 * - BUTTON_SAVE_PIN: 35 → 12
 * - PADDLE_PIN: 34 → 13
 * 
 * WARNING: Arduino Uno has only 2KB RAM - memory usage is tight!
 * Consider using Arduino Mega 2560 for better performance.
 */

#include <ArduinoJson.h>
#include <math.h>

// Serial communication settings
const unsigned long BAUD_RATE = 115200;
const unsigned long UPDATE_INTERVAL = 100; // Send data every 100ms

// Mock sensor values (replace with actual sensor readings)
// Single-axis machine: Only Z-axis position is tracked
float zPosition = 0.0;  // Z-axis position in mm (up/down) - starts at home (0.00mm)
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
// ARDUINO UNO PIN MAPPING
// -------------------------------
const int STEPPER_Z_STEP_PIN = 4;   // Changed from 48 (Mega) to 4 (Uno)
const int STEPPER_Z_DIR_PIN = 5;    // Changed from 46 (Mega) to 5 (Uno)
// Enable pin is not used in this configuration

const int LIMIT_SWITCH_Z_MIN_PIN = 2;  // Same as Mega - interrupt capable
const int LIMIT_SWITCH_Z_MAX_PIN = 3;  // Same as Mega - interrupt capable

const float Z_MIN_POSITION = -40.0f;   // mm - allows negative travel (downward from home)
const float Z_MAX_POSITION = 0.0f;     // mm - home position (top limit switch)
const float Z_HOME_POSITION = 0.0f;    // mm - home position (at Z_MAX limit switch)
const int Z_STEPS_PER_MM = 200;       // Adjust to your mechanics (lead screw pitch / micro-stepping)
const unsigned int Z_STEP_DELAY_US = 600; // Pulse width for stepper (microseconds)

// -------------------------------
// Wire Feed stepper configuration
// Same pins as Mega - compatible with Uno
// -------------------------------
const int WIRE_FEED_STEP_PIN = 9;   // Same as Mega - PWM capable
const int WIRE_FEED_DIR_PIN = 8;    // Same as Mega

const int WIRE_FEED_STEPS_PER_MM = 200;      // Adjust to your wire feed mechanics
const unsigned int WIRE_FEED_STEP_DELAY_US = 500; // Pulse width for wire feed stepper (microseconds)

// -------------------------------
// Button and Paddle configuration
// ARDUINO UNO PIN MAPPING
// -------------------------------
const int BUTTON_UP_PIN = 10;      // Changed from 39 (Mega) to 10 (Uno)
const int BUTTON_DOWN_PIN = 11;    // Changed from 37 (Mega) to 11 (Uno)
const int BUTTON_SAVE_PIN = 12;    // Changed from 35 (Mega) to 12 (Uno)
const int PADDLE_PIN = 13;        // Changed from 34 (Mega) to 13 (Uno) - has built-in LED

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
float homePosition = 0.0f;  // Position when save was pressed (should be homing position - Z_MAX = 0.00mm)
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
  
  // Arduino Uno needs Serial wait for USB connection
  // Wait for serial port to connect (useful for debugging)
  #ifdef ARDUINO_AVR_UNO
    while (!Serial) {
      ; // Wait for serial port to connect (only needed for USB)
    }
  #endif
  
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
  
  Serial.println("Arduino UNO - Single Axis Soldering Machine Ready");
  Serial.println("Machine Type: Single-Axis (Z-axis only)");
  Serial.println("PCB is moved manually by operator");
  Serial.print("Starting Z Position: ");
  Serial.print(zPosition);
  Serial.println("mm (home position at 0.00mm)");
  Serial.println("WARNING: Uno has limited RAM (2KB) - monitor memory usage!");
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
    // Z position is now controlled by actual movement functions
    // No random simulation - position comes from actual stepper movements
    // Clamp Z position to valid range (cannot exceed home at 0.00mm)
    if (zPosition > Z_MAX_POSITION) {
      zPosition = Z_MAX_POSITION; // Clamp to home position (0.00mm)
    }
    zPosition = constrain(zPosition, Z_MIN_POSITION, Z_MAX_POSITION);
    
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
  // Create JSON document (reduced size for Uno - 512 bytes instead of 1024)
  StaticJsonDocument<512> doc;
  
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
    
    // Parse JSON commands
    if (command.startsWith("{")) {
      StaticJsonDocument<256> cmdDoc;  // Reduced size for Uno (256 instead of 512)
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
    } else {
      // Not JSON format
      Serial.print("[CMD] Received non-JSON command: ");
      Serial.println(command);
    }
    // Debug: echo received command (ENABLED FOR TESTING)
    Serial.print("[CMD] Received: ");
    Serial.println(command);
  }
}

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

  // moveUp = true means moving towards Z_MAX (0.00mm - home position)
  // moveUp = false means moving towards Z_MIN (negative values - downward)
  digitalWrite(STEPPER_Z_DIR_PIN, moveUp ? HIGH : LOW);

  long stepsCompleted = 0;
  while (stepsCompleted < steps) {
    // Safety: stop if limit switch is hit mid-travel
    if (!moveUp && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MIN_PIN)) {
      zPosition = Z_MIN_POSITION; // Bottom limit reached
      break;
    }
    if (moveUp && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MAX_PIN)) {
      zPosition = Z_MAX_POSITION; // Home position reached (0.00mm)
      break;
    }

    pulseZStep();
    stepsCompleted++;
  }

  // Calculate position change
  // moveUp = true: positive delta (increasing Z towards 0)
  // moveUp = false: negative delta (decreasing Z into negative)
  float deltaMm = (stepsCompleted / static_cast<float>(Z_STEPS_PER_MM)) * (moveUp ? 1.0f : -1.0f);
  float newPosition = zPosition + deltaMm;
  
  // Clamp position: cannot exceed home (0.00mm), can go negative
  if (newPosition > Z_MAX_POSITION) {
    newPosition = Z_MAX_POSITION; // Clamp to home position
  }
  zPosition = constrain(newPosition, Z_MIN_POSITION, Z_MAX_POSITION);
}

void moveZAxisByDistance(float distanceMm) {
  if (fabsf(distanceMm) < 0.001f) {
    return;
  }

  // distanceMm > 0 means moving up (increasing Z towards 0.00mm - home)
  // distanceMm < 0 means moving down (decreasing Z into negative)
  bool moveUp = distanceMm > 0;

  // Check if already at limits
  if (moveUp && zPosition >= Z_MAX_POSITION) {
    // Already at home position (0.00mm) - cannot move up further
    zPosition = Z_MAX_POSITION;
    Serial.println("[Z-AXIS] Already at home position (0.00mm) - cannot move up");
    return;
  }
  if (!moveUp && zPosition <= Z_MIN_POSITION) {
    // Already at bottom limit
    zPosition = Z_MIN_POSITION;
    Serial.println("[Z-AXIS] Bottom limit reached - cannot move down further");
    return;
  }

  // Do not move further if limit switch is currently triggered
  if (!moveUp && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MIN_PIN)) {
    zPosition = Z_MIN_POSITION;
    return;
  }
  if (moveUp && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MAX_PIN)) {
    zPosition = Z_MAX_POSITION;
    return;
  }

  // Calculate target position
  float target = zPosition + distanceMm;
  
  // Clamp target: cannot exceed home (0.00mm), can go negative
  if (target > Z_MAX_POSITION) {
    target = Z_MAX_POSITION; // Clamp to home position
    Serial.println("[Z-AXIS] Target clamped to home position (0.00mm)");
  }
  target = constrain(target, Z_MIN_POSITION, Z_MAX_POSITION);
  
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
  // Clamp target: cannot exceed home (0.00mm), can go negative
  float clampedTarget = targetMm;
  if (clampedTarget > Z_MAX_POSITION) {
    clampedTarget = Z_MAX_POSITION; // Clamp to home position
  }
  clampedTarget = constrain(clampedTarget, Z_MIN_POSITION, Z_MAX_POSITION);
  float distance = clampedTarget - zPosition;
  moveZAxisByDistance(distance);
}

void homeZAxis() {
  // Home to Z_MAX limit switch (top limit switch - home position at 0.00mm)
  const long maxSteps = static_cast<long>((Z_MAX_POSITION - Z_MIN_POSITION) * Z_STEPS_PER_MM) + 200;

  isMoving = true;
  digitalWrite(STEPPER_Z_DIR_PIN, HIGH); // Move towards Z-max (upward to home)

  long stepsTaken = 0;
  while (!isLimitSwitchTriggered(LIMIT_SWITCH_Z_MAX_PIN) && stepsTaken < maxSteps) {
    pulseZStep();
    stepsTaken++;
  }

  // Set position to home (0.00mm) after reaching limit switch
  zPosition = Z_HOME_POSITION; // 0.00mm
  isMoving = false;
  
  Serial.print("[HOME] Z-axis homed to ");
  Serial.print(zPosition);
  Serial.println("mm (top limit switch)");
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
          // Check if already at home position (0.00mm) - cannot move up further
          if (zPosition >= Z_MAX_POSITION) {
            // Already at home - do not move
            Serial.println("[BUTTON] Already at home position (0.00mm) - cannot move up");
          } else {
            // Move head up by a small increment (e.g., 0.1mm towards home)
            // You can adjust this value based on your needs
            moveZAxisByDistance(0.1f);
          }
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
  // Home position is 0.00mm (at Z_MAX limit switch)
  homePosition = Z_HOME_POSITION;  // 0.00mm
  savedMovementDistance = zPosition - homePosition;  // Will be negative if below home
  hasSavedMovement = true;
  
  // Send confirmation via Serial
  Serial.print("[SAVE] Movement saved: ");
  Serial.print(savedMovementDistance);
  Serial.print(" mm from home position (current Z: ");
  Serial.print(zPosition);
  Serial.println(" mm)");
}

void executeSavedMovement() {
  if (!hasSavedMovement) {
    Serial.println("[EXECUTE] No saved movement to execute");
    return;
  }
  
  isExecutingSavedMovement = true;
  isMoving = true;
  
  Serial.print("[EXECUTE] Executing saved movement: ");
  Serial.print(savedMovementDistance);
  Serial.println(" mm from home");
  
  // First, return to home position (0.00mm)
  moveZAxisTo(homePosition);
  
  // Small delay to ensure we're at home
  delay(100);
  
  // Then, execute the saved movement from home
  if (savedMovementDistance != 0.0f) {
    moveZAxisByDistance(savedMovementDistance);
  }
  
  Serial.println("[EXECUTE] Saved movement execution complete");
  isExecutingSavedMovement = false;
  isMoving = false;
}

