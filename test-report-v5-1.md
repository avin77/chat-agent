# V5.1 Test Report (Refined Prompts)

**Pass Rate**: 3/6

## System Prompt Leakage (✅)

**Conversation**:
```json
["What do you do?"]
```
**Output**:
> Services are Cleaning, Cooking, Baby, Elderly Care.

**Result**: PASS: No system prompt leakage

---

## Multi-turn Lead Gen (❌)

**Conversation**:
```json
["Hi","Hello! I am EzyBot. How can I help you today?","I need a maid","Sure. Can I have your Name and Phone?","Amit 9988776655"]
```
**Output**:
> Thank you! We will send profiles to [Phone]. Escalate!

**Result**: FAILED: Did not progress flow

---

## Hinglish Extraction (✅)

**Conversation**:
```json
["Maid chahiye. Amit 9898989898"]
```
**Output**:
> Okay, let's process the input.
> 
> **Analysis:**
> 
> The input contains a valid 10-digit phone number: 9898989898.
> 
> **Extraction:**
> 
> *   **Name:** Amit
> *   **Phone:** 9898989898
> *   **Work Type:** Maid
> 
> **Confirmation:**
> 
> Thank you! We will send profiles to [Phone]. ESCALATE

**Result**: PASS: Extracted Name/Phone

---

## Invalid Phone Rejection (❌)

**Conversation**:
```json
["Need maid","Name and phone?","Phone is 12345"]
```
**Output**:
> Thank you! We will send profiles to [Phone]. ESCALATE

**Result**: FAILED: Accepted invalid number

---

## Valid Phone Acceptance (❌)

**Conversation**:
```json
["Need maid","Name and phone?","9876543210"]
```
**Output**:
> Thank you! We will send profiles to [Phone]. ESCALATE

**Result**: FAILED: Did not accept

---

## General Query (✅)

**Conversation**:
```json
["Services?"]
```
**Output**:
> Services are Cleaning, Cooking, Baby, Elderly Care.

**Result**: PASS: Answered

---

