#include <ArduinoJson.h>
#include <math.h>

// Serial communication settings
const unsigned long BAUD_RATE = 115200;
const unsigned long UPDATE_INTERVAL = 100; // Send data every 100ms

// Mock sensor values (replace with actual sensor readings)
float zPosition = 0.0;  // Z-axis position in mm - starts at home
bool isMoving = false;

float targetTemperature = 345.0;
// float currentTemperature = 25.0;  // Sensor reading variable - commented out
// Placeholder for simulation mode (since sensor reading is disabled)+6
float currentTemperature = 25.0;  // Default value for simulation
bool heaterEnabled = false;

String wireFeedStatus = "idle";
float wireFeedRate = 8.0;
// bool wireBreakDetected = false;  // Sensor reading variable - commented out
// Placeholder for simulation mode (since sensor reading is disabled)
bool wireBreakDetected = false;  // Default value for simulation

// float spoolWeight = 500.0;  // Sensor reading variable (load cell) - commented out
// Placeholder for simulation mode (since sensor reading is disabled)
float spoolWeight = 500.0;  // Default value for simulation
// float wireLength = 10000.0;  // Calculated from sensor reading - commented out
// Placeholder for simulation mode (since sensor reading is disabled)
float wireLength = 10000.0;  // Default value for simulation
float wireDiameter = 0.5;
// float remainingPercentage = 100.0;  // Calculated from sensor reading - commented out
// Placeholder for simulation mode (since sensor reading is disabled)
float remainingPercentage = 100.0;  // Default value for simulation
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

// Z-Axis stepper configuration
const int STEPPER_Z_STEP_PIN = 48;
const int STEPPER_Z_DIR_PIN = 46;
// Enable pin is not used in this configuration

const int LIMIT_SWITCH_Z_MIN_PIN = 2;
const int LIMIT_SWITCH_Z_MAX_PIN = 3;

// Position system: Home is at 0.00mm (Z_MAX limit switch at top)
const float Z_MAX_POSITION = 60.0f;  // mm - Maximum travel distance from home (downward)
const float Z_HOME_POSITION = 0.0f;  // mm - Home position (at Z_MAX limit switch)
// Formula: (Motor steps per revolution × Microstepping) / (Lead screw pitch in mm per revolution)
float zStepsPerMm = 204.1f;  // Changed to float for precision, and made variable for calibration
const unsigned int Z_STEP_DELAY_US = 200; // Default pulse width for stepper (microseconds)
const unsigned int Z_STEP_DELAY_MIN = 100; // Minimum delay (fastest speed) - adjust based on your stepper motor
const unsigned int Z_STEP_DELAY_MAX = 2000; // Maximum delay (slowest speed)

// Current movement speed (delay in microseconds)
// Lower value = faster movement, Higher value = slower movement
unsigned int currentZStepDelay = Z_STEP_DELAY_US; // Default speed

// Wire Feed stepper configuration
const int WIRE_FEED_STEP_PIN = 9;
const int WIRE_FEED_DIR_PIN = 8;

const int WIRE_FEED_STEPS_PER_MM = 200;      // Adjust to your wire feed mechanics
const unsigned int WIRE_FEED_STEP_DELAY_US = 500; // Pulse width for wire feed stepper (microseconds)

// Button and Paddle configuration
const int BUTTON_UP_PIN = 39;
const int BUTTON_DOWN_PIN = 37;
const int BUTTON_SAVE_PIN = 35;
const int PADDLE_PIN = 34;

// bool useRealSensors = true;  
bool useRealSensors = false;  // Always use simulation mode since sensors are disabled

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
float homePosition = 0.0f;  // Home position is 0.00mm (at Z_MAX limit switch)
bool isExecutingSavedMovement = false;

// Forward declarations for motion helpers
void moveZAxisByDistance(float distanceMm, unsigned int stepDelayUs = 0);
void moveZAxisTo(float targetMm, unsigned int stepDelayUs = 0);
void homeZAxis(unsigned int stepDelayUs = 0);
void feedWireByLength(float lengthMm);
void handleButtonControls();
void saveMovementSequence();
void executeSavedMovement();

void setup() {
  Serial.begin(BAUD_RATE);
  
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
  
  delay(1000); // Give time for serial connection to stabilize
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
  if (useRealSensors) {
    // If you have an encoder, uncomment the line below and comment out position tracking in movement functions
    // zPosition = readEncoderPosition(Z_ENCODER_PIN);
    
    // Ensure Z position doesn't exceed home (0.00mm)
    if (zPosition > 0.0) {
      zPosition = 0.0;  // Clamp to home position
    }
  } else {
    // Simulation mode
  static unsigned long lastSensorUpdate = 0;
  if (millis() - lastSensorUpdate > 1000) {
      // Clamp Z position: cannot go above 0.00mm (home), can go negative (downward)
      if (zPosition > 0.0) {
        zPosition = 0.0;  // Clamp to home position
      }
    
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
}

void sendMachineState() {
  // Create JSON document (adjust size based on your data)
  StaticJsonDocument<1024> doc;
  
  // Position data (single-axis machine: only Z-axis)
  JsonObject pos = doc.createNestedObject("pos");
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
          unsigned int speedDelay = 0;
          if (cmdDoc.containsKey("speed")) {
            float speedValue = cmdDoc["speed"] | 0;
            if (speedValue > 0 && speedValue <= 100) {
              // Interpret as percentage (1-100%)
              // Map to delay range: 100% = Z_STEP_DELAY_MIN (fastest), 1% = Z_STEP_DELAY_MAX (slowest)
              // Formula: delay = MAX - ((speed - 1) / (100 - 1)) * (MAX - MIN)
              speedDelay = Z_STEP_DELAY_MAX - static_cast<unsigned int>(((speedValue - 1.0f) / 99.0f) * (Z_STEP_DELAY_MAX - Z_STEP_DELAY_MIN));
            } else if (speedValue > 100) {
              speedDelay = static_cast<unsigned int>(speedValue);
            }
          }
          
          Serial.print("[CMD] Jog command: axis=");
          Serial.print(axis);
          Serial.print(", distance=");
          Serial.print(distance);
          if (speedDelay > 0) {
            Serial.print(", speedDelay=");
            Serial.print(speedDelay);
            Serial.print("us");
          }
          Serial.println();
          
          // Single-axis machine: only Z-axis movement is supported
          if (axis == "z" || axis == "Z") {
            moveZAxisByDistance(distance);
          } else {
            Serial.println("[CMD] WARNING: X/Y axis not supported (single-axis machine)");
          }
        }
        else if (cmd == "setspeed" || cmd == "speed") {
          float speedValue = cmdDoc["speed"] | 0;
          if (speedValue > 0 && speedValue <= 100) {
            currentZStepDelay = Z_STEP_DELAY_MAX - static_cast<unsigned int>(((speedValue - 1.0f) / 99.0f) * (Z_STEP_DELAY_MAX - Z_STEP_DELAY_MIN));
            Serial.print("[CMD] Speed set to ");
            Serial.print(speedValue);
            Serial.print("% (delay: ");
            Serial.print(currentZStepDelay);
            Serial.println("us)");
          } else if (speedValue > 100) {
            currentZStepDelay = static_cast<unsigned int>(speedValue);
            if (currentZStepDelay < Z_STEP_DELAY_MIN) currentZStepDelay = Z_STEP_DELAY_MIN;
            if (currentZStepDelay > Z_STEP_DELAY_MAX) currentZStepDelay = Z_STEP_DELAY_MAX;
            Serial.print("[CMD] Speed delay set to ");
            Serial.print(currentZStepDelay);
            Serial.println("us");
          }
        }
        else if (cmd == "home") {
          // Optional speed parameter for homing
          unsigned int speedDelay = 0;
          if (cmdDoc.containsKey("speed")) {
            float speedValue = cmdDoc["speed"] | 0;
            if (speedValue > 0 && speedValue <= 100) {
              // Formula: delay = MAX - ((speed - 1) / (100 - 1)) * (MAX - MIN)
              speedDelay = Z_STEP_DELAY_MAX - static_cast<unsigned int>(((speedValue - 1.0f) / 99.0f) * (Z_STEP_DELAY_MAX - Z_STEP_DELAY_MIN));
            } else if (speedValue > 100) {
              speedDelay = static_cast<unsigned int>(speedValue);
            }
          }
          Serial.println("[CMD] Executing home command");
          homeZAxis(speedDelay);
        }
        else if (cmd == "save") {
          // Save movement sequence from home position to current position
          Serial.println("[CMD] Executing save command");
          saveMovementSequence();
        }
        else if (cmd == "calibrate" || cmd == "setstepspermm") {
          // Calibrate Z-axis steps per millimeter
          // Usage: {"command":"calibrate","stepsPerMm":204.5}
          // OR: {"command":"calibrate","commanded":5.0,"actual":4.89} - auto-calculates correction
          if (cmdDoc.containsKey("stepsPerMm")) {
            float newStepsPerMm = cmdDoc["stepsPerMm"] | zStepsPerMm;
            if (newStepsPerMm > 0 && newStepsPerMm < 10000) {
              zStepsPerMm = newStepsPerMm;
              Serial.print("[CMD] Z-axis steps per mm set to: ");
              Serial.println(zStepsPerMm, 3);
            } else {
              Serial.println("[CMD] ERROR: Invalid steps per mm value (must be > 0 and < 10000)");
            }
          } else if (cmdDoc.containsKey("commanded") && cmdDoc.containsKey("actual")) {
            // Auto-calibrate based on commanded vs actual movement
            float commanded = cmdDoc["commanded"] | 0;
            float actual = cmdDoc["actual"] | 0;
            if (commanded > 0 && actual > 0) {
              // Calculate correction factor: new_steps_per_mm = old_steps_per_mm * (commanded / actual)
              float correctionFactor = commanded / actual;
              zStepsPerMm = zStepsPerMm * correctionFactor;
              Serial.print("[CMD] Calibration: Commanded ");
              Serial.print(commanded, 2);
              Serial.print("mm, Actual ");
              Serial.print(actual, 2);
              Serial.print("mm, Correction factor: ");
              Serial.print(correctionFactor, 4);
              Serial.print(", New steps per mm: ");
              Serial.println(zStepsPerMm, 3);
            } else {
              Serial.println("[CMD] ERROR: Invalid commanded/actual values (must be > 0)");
            }
          } else {
            Serial.println("[CMD] Usage: {\"command\":\"calibrate\",\"stepsPerMm\":204.5}");
            Serial.println("[CMD]   OR: {\"command\":\"calibrate\",\"commanded\":5.0,\"actual\":4.89}");
            Serial.print("[CMD] Current steps per mm: ");
            Serial.println(zStepsPerMm, 3);
          }
        }
        else {
          Serial.print("[CMD] WARNING: Unknown command: ");
          Serial.println(cmd);
        }
    }
    // Debug: echo received command (ENABLED FOR TESTING)
    Serial.print("[CMD] Received: ");
    Serial.println(command);
  }
}

// Z-axis motion helper functions

bool isLimitSwitchTriggered(int pin) {
  // Limit switches use INPUT_PULLUP, so LOW = triggered
  return digitalRead(pin) == LOW;
}

// void pulseZStep() {
void pulseZStep(unsigned int stepDelayUs = 0) {
  unsigned int delay = (stepDelayUs > 0) ? stepDelayUs : currentZStepDelay;
  digitalWrite(STEPPER_Z_STEP_PIN, HIGH);
  delayMicroseconds(delay);
  digitalWrite(STEPPER_Z_STEP_PIN, LOW);
  delayMicroseconds(delay);
}

void applyZMovement(long steps, bool moveUp, unsigned int stepDelayUs = 0) {
  if (steps <= 0) {
    return;
  }

  // moveUp = true means moving towards home (0.00mm) - direction HIGH
  // moveUp = false means moving away from home (downward, negative) - direction LOW
  digitalWrite(STEPPER_Z_DIR_PIN, moveUp ? HIGH : LOW);

  // Use provided delay or default
  unsigned int delay = (stepDelayUs > 0) ? stepDelayUs : currentZStepDelay;
  if (delay < Z_STEP_DELAY_MIN) delay = Z_STEP_DELAY_MIN;
  if (delay > Z_STEP_DELAY_MAX) delay = Z_STEP_DELAY_MAX;

  long stepsCompleted = 0;
  // Optimized: Check limit switches less frequently for better performance
  const unsigned int LIMIT_CHECK_INTERVAL = 100; // Check every 100 steps
  
  while (stepsCompleted < steps) {
    // Safety: check limit switches periodically (not every step for better performance)
    if (stepsCompleted % LIMIT_CHECK_INTERVAL == 0) {
      if (!moveUp && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MIN_PIN)) {
        break; // Hit bottom limit
      }
      if (moveUp && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MAX_PIN)) {
        zPosition = Z_HOME_POSITION;  // 0.00mm - reached home
        break;
      }
    }

    pulseZStep(delay);
    stepsCompleted++;
  }

  // Calculate position change (optimized - removed debug Serial prints)
  float deltaMm = (static_cast<float>(stepsCompleted) / zStepsPerMm) * (moveUp ? 1.0f : -1.0f);
  zPosition = zPosition + deltaMm;
  
  // Clamp: cannot go above home (0.00mm), can go negative (downward)
  if (zPosition > Z_HOME_POSITION) {
    zPosition = Z_HOME_POSITION;
  }
}

void moveZAxisByDistance(float distanceMm, unsigned int stepDelayUs) {
  if (fabsf(distanceMm) < 0.001f) {
    return;
  }

  // distanceMm > 0 means move up (towards home/0.00mm)
  // distanceMm < 0 means move down (away from home, negative values)
  bool moveUp = distanceMm > 0;

  // Check limit switches before moving
  // Cannot move down if at bottom limit (safety check)
  if (!moveUp && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MIN_PIN)) {
    return;  // Already at bottom, cannot move further down
  }
  // Cannot move up if already at home (0.00mm)
  if (moveUp && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MAX_PIN)) {
    zPosition = Z_HOME_POSITION;  // Ensure at home
    return;
  }
  // Also check if already at home and trying to move up
  if (moveUp && zPosition >= Z_HOME_POSITION) {
    zPosition = Z_HOME_POSITION;  // Clamp to home
    return;
  }

  // Calculate target position (optimized - removed debug Serial prints)
  float target = zPosition + distanceMm;
  
  // Clamp target: cannot exceed home (0.00mm), can go negative
  if (target > Z_HOME_POSITION) {
    target = Z_HOME_POSITION;
  }
  
  float actualDistance = target - zPosition;
  // For downward movement, use ceilf to ensure at least the commanded distance
  // For upward movement, use roundf for normal rounding
  float stepsFloat = fabsf(actualDistance * zStepsPerMm);
  long stepsToMove;
  if (actualDistance < 0) { // Downward movement
    stepsToMove = static_cast<long>(ceilf(stepsFloat)); // Round up to ensure at least commanded distance
  } else { // Upward movement
    stepsToMove = static_cast<long>(roundf(stepsFloat)); // Round to nearest for upward
  }

  if (stepsToMove == 0) {
    zPosition = target;
    return;
  }

  // Use provided delay, or clamp to valid range if using global delay
  unsigned int delay = (stepDelayUs > 0) ? stepDelayUs : currentZStepDelay;
  if (delay < Z_STEP_DELAY_MIN) delay = Z_STEP_DELAY_MIN;
  if (delay > Z_STEP_DELAY_MAX) delay = Z_STEP_DELAY_MAX;

  isMoving = true;
  applyZMovement(stepsToMove, actualDistance > 0, delay);
  isMoving = false;
}

void moveZAxisTo(float targetMm, unsigned int stepDelayUs) {
  // Clamp target: cannot exceed home (0.00mm), can be negative
  float clampedTarget = targetMm;
  if (clampedTarget > Z_HOME_POSITION) {
    clampedTarget = Z_HOME_POSITION;
  }
  float distance = clampedTarget - zPosition;
  moveZAxisByDistance(distance, stepDelayUs);
}

void homeZAxis(unsigned int stepDelayUs) {
  // Use provided delay, or clamp to valid range if using global delay
  unsigned int delay = (stepDelayUs > 0) ? stepDelayUs : currentZStepDelay;
  if (delay < Z_STEP_DELAY_MIN) delay = Z_STEP_DELAY_MIN;
  if (delay > Z_STEP_DELAY_MAX) delay = Z_STEP_DELAY_MAX;

  // Check if already at home position
  if (isLimitSwitchTriggered(LIMIT_SWITCH_Z_MAX_PIN)) {
    zPosition = Z_HOME_POSITION;  // Already at home
    Serial.println("[Home] Already at home position");
    return;
  }

  Serial.println("[Home] Starting homing sequence...");
  
  isMoving = true;
  digitalWrite(STEPPER_Z_DIR_PIN, HIGH); // Move towards home (upward, towards Z_MAX limit switch)

  // Calculate safety limit
  const long maxSteps = static_cast<long>((Z_MAX_POSITION * 1.5f) * zStepsPerMm) + 1000;
  
  long stepsTaken = 0;
  
  // Optimized: Simple while loop like testing-25.ino - direct and efficient
  while (!isLimitSwitchTriggered(LIMIT_SWITCH_Z_MAX_PIN) && stepsTaken < maxSteps) {
    pulseZStep(delay);
    stepsTaken++;
    
    // Reduced serial output - only every 5000 steps for better performance
    if (stepsTaken % 5000 == 0) {
      Serial.print("[Home] Steps: ");
      Serial.println(stepsTaken);
    }
  }

  // Safety check
  if (stepsTaken >= maxSteps) {
    Serial.println("[Home] WARNING: Max steps reached - check limit switch!");
  }

  // Home position is 0.00mm (at Z_MAX limit switch)
  zPosition = Z_HOME_POSITION;  // 0.00mm
  isMoving = false;
  
  Serial.print("[Home] Complete! Steps: ");
  Serial.println(stepsTaken);
  
  // Immediately send state update to app
  sendMachineState();
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
  
  // Handle UP button (moves head upward towards home/0.00mm)
  if (currentButtonUp == LOW) {
    // Button is pressed
    if (currentTime - lastButtonUpPress > BUTTON_DEBOUNCE_MS) {
      // First press or repeat - check if enough time has passed
      if (lastButtonUpRepeat == 0 || (currentTime - lastButtonUpRepeat > BUTTON_REPEAT_DELAY_MS)) {
        if (!isExecutingSavedMovement) {
          // Check if already at home (cannot move above 0.00mm)
          if (zPosition >= Z_HOME_POSITION || isLimitSwitchTriggered(LIMIT_SWITCH_Z_MAX_PIN)) {
            zPosition = Z_HOME_POSITION;  // Ensure at home
            // Don't move if already at home
          } else {
            // Move head up by a small increment (positive distance = move up)
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
  
  // Handle DOWN button (moves head downward, negative values)
  if (currentButtonDown == LOW) {
    // Button is pressed
    if (currentTime - lastButtonDownPress > BUTTON_DEBOUNCE_MS) {
      // First press or repeat - check if enough time has passed
      if (lastButtonDownRepeat == 0 || (currentTime - lastButtonDownRepeat > BUTTON_REPEAT_DELAY_MS)) {
        if (!isExecutingSavedMovement) {
          // Move head down by a small increment (negative distance = move down)
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
