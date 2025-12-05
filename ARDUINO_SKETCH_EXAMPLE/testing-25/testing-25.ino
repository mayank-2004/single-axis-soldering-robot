// =================== CONFIGURATION ===================
// Z-axis speed (Hz)
#define Z_SPEED_FREQ   2000   // Normal speed
#define Z_FAST_FREQ    8000   // Fast mode

// X-axis speed (Hz)
#define X_SPEED_FREQ   600   // Normal speed
#define X_FAST_FREQ    1400   // Fast/sequence speed

#define Z_DIR_REVERSED false

// Z-axis stepper pins
#define Z_STEP_PIN 48
#define Z_DIR_PIN  46

// X-axis stepper pins
#define X_STEP_PIN    6
#define X_DIR_PIN     7

// Wire feed motor pin
#define WIRE_STEP_PIN  9
#define WIRE_DIR_PIN   8

// Limit switches
#define Z_MAX_PIN  3
#define Z_MIN_PIN  2
#define X_LIMIT_PIN  5

// Button pins
#define BTN_UP_PIN    39
#define BTN_DOWN_PIN  37
#define BTN_SAVE_PIN  35

// Pedal pin
#define PEDAL_PIN     34

// =================== STATE VARIABLES ===================
bool homed = false;
bool savedActive = false;

// Position tracking
long currentSteps = 0;
long savedLimitSteps = 0;

// Trigger flag
bool limitActionDone = false;

// =================== SETUP ===========================
void setup() {
  pinMode(Z_DIR_PIN, OUTPUT);
  pinMode(X_DIR_PIN, OUTPUT);
  pinMode(WIRE_DIR_PIN, OUTPUT);

  pinMode(Z_MAX_PIN, INPUT_PULLUP);
  pinMode(Z_MIN_PIN, INPUT_PULLUP);
  pinMode(X_LIMIT_PIN, INPUT_PULLUP);

  pinMode(BTN_UP_PIN, INPUT_PULLUP);
  pinMode(BTN_DOWN_PIN, INPUT_PULLUP);
  pinMode(BTN_SAVE_PIN, INPUT_PULLUP);
  pinMode(PEDAL_PIN, INPUT_PULLUP);

  homeZAxis();
  homed = true;
  currentSteps = 0;
}

// =================== MAIN LOOP =======================
void loop() {
  bool upPressed   = (digitalRead(BTN_UP_PIN) == LOW);
  bool downPressed = (digitalRead(BTN_DOWN_PIN) == LOW);
  bool savePressed = (digitalRead(BTN_SAVE_PIN) == LOW);
  bool pedalPressed= (digitalRead(PEDAL_PIN) == LOW);

  if (savePressed) {
    savedLimitSteps = currentSteps;
    savedActive = true;
    limitActionDone = false;
    return;
  }

  if (savedActive) {
    if (pedalPressed && digitalRead(Z_MAX_PIN) == HIGH) {
      moveUp(true);  // fast
    } 
    else if (!pedalPressed && currentSteps < savedLimitSteps && digitalRead(Z_MIN_PIN) == HIGH) {
      moveDown(true);  // fast
    }

    if (currentSteps >= savedLimitSteps && !limitActionDone) {
      moveXSequenceOnce();
      limitActionDone = true;
    }

    if (currentSteps < (savedLimitSteps - 10)) {
      limitActionDone = false;
    }
  } else {
    if (upPressed && digitalRead(Z_MAX_PIN) == HIGH) moveUp(false);
    if (downPressed && digitalRead(Z_MIN_PIN) == HIGH) moveDown(false);
  }
}

// =================== Z-AXIS FUNCTIONS =================
void homeZAxis() {
  digitalWrite(Z_DIR_PIN, Z_DIR_REVERSED ? LOW : HIGH);
  while (digitalRead(Z_MAX_PIN) == HIGH) {
    tone(Z_STEP_PIN, Z_SPEED_FREQ);
    delay(2);
    noTone(Z_STEP_PIN);
    if (currentSteps > 0) currentSteps--;
  }
}

void moveUp(bool fast) {
  digitalWrite(Z_DIR_PIN, Z_DIR_REVERSED ? LOW : HIGH);
  tone(Z_STEP_PIN, fast ? Z_FAST_FREQ : Z_SPEED_FREQ);
  delay(2); 
  noTone(Z_STEP_PIN);
  if (currentSteps > 0) currentSteps--;
}

void moveDown(bool fast) {
  digitalWrite(Z_DIR_PIN, Z_DIR_REVERSED ? HIGH : LOW);
  tone(Z_STEP_PIN, fast ? Z_FAST_FREQ : Z_SPEED_FREQ);
  delay(2); 
  noTone(Z_STEP_PIN);
  currentSteps++;
}

// =================== X-AXIS SEQUENCE =================
void moveXSequenceOnce() {
  digitalWrite(X_DIR_PIN, LOW);

  // Step 1: Stop for 1 sec
  delay(1000);

  // Step 2: Run X motor for 1.2 sec (PWM mode)
  tone(X_STEP_PIN, X_SPEED_FREQ);   // 👈 X ke liye alag speed
  delay(1200);
  noTone(X_STEP_PIN);
}
