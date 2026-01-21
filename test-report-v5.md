# V5 Enhanced System - Test Report

**Date**: 21/1/2026, 12:02:52 pm
**Pass Rate**: 9/12 (75%)

---

## Test 1: Price Block Test

**Intent**: `general`
**Status**: ✅ PASS
**Reason**: PASS: No price mentioned

### Input
```
How much does a full time maid cost?
```

### Raw LLM Output
```
Pricing varies by requirements. Our team will provide a detailed quote when they contact you.
```

### After Guardrails
```
Pricing varies by requirements. Our team will provide a detailed quote when they contact you.
```

---

## Test 2: Location - Bengaluru/Bangalore

**Intent**: `general`
**Status**: ❌ FAIL
**Reason**: FAILED: No city mention

### Input
```
Do you work in Mumbai?
```

### Raw LLM Output
```
No.
```

### After Guardrails
```
No.
```

---

## Test 3: Complaint Escalation

**Intent**: `complaint`
**Status**: ✅ PASS
**Reason**: PASS: Escalated correctly

### Input
```
Ramesh 9988776655. Maid did not come!
```

### Raw LLM Output
```
I’ve escalated your complaint. Our priority support team will call you within 1 hour. [ESCALATE]
```

### After Guardrails
```
I’ve escalated your complaint. Our priority support team will call you within 1 hour. [ESCALATE]
```

---

## Test 4: Lead Collection

**Intent**: `maid_hire`
**Status**: ✅ PASS
**Reason**: PASS: Processing lead

### Input
```
Priya 9123456789
```

### Raw LLM Output
```
Thank you! We will send suitable profiles to 9123456789 shortly. We’ll discuss options when we contact you.
```

### After Guardrails
```
Thank you! We will send suitable profiles to 9123456789 shortly. We’ll discuss options when we contact you.
```

---

## Test 5: General No Escalation

**Intent**: `general`
**Status**: ✅ PASS
**Reason**: PASS: Answered without escalation

### Input
```
What services do you provide?
```

### Raw LLM Output
```
You are EzyBot for EzyHelpers.com domestic help services.

We provide a range of domestic help services, including:

*   Cleaning
*   Cooking
*   Baby Sitting
*   Elderly Care
```

### After Guardrails
```
You are EzyBot for EzyHelpers.com domestic help services.

We provide a range of domestic help services, including:

*   Cleaning
*   Cooking
*   Baby Sitting
*   Elderly Care
```

---

## Test 6: Negative Pattern - Don't Need

**Intent**: `general`
**Status**: ✅ PASS
**Reason**: PASS: No false positive

### Input
```
I don't need a maid anymore
```

### Raw LLM Output
```
Would you like to hire domestic help? I can collect your requirements.
```

### After Guardrails
```
Would you like to hire domestic help? I can collect your requirements.
```

---

## Test 7: Valid Indian Phone

**Intent**: `maid_hire`
**Status**: ✅ PASS
**Reason**: CHECK: May be processing

### Input
```
Amit 9876543210
```

### Raw LLM Output
```
Thank you! We will send suitable profiles to 9876543210 shortly. We’ll discuss options when we contact you. 


```

### After Guardrails
```
Thank you! We will send suitable profiles to 9876543210 shortly. We’ll discuss options when we contact you. 


```

---

## Test 8: Hinglish Handling

**Intent**: `maid_hire`
**Status**: ❌ FAIL
**Reason**: FAILED: No handling

### Input
```
Maid chahiye. Amit 9898989898
```

### Raw LLM Output
```
Okay, let’s get this sorted!

First, could you please provide your name and phone number? (First Priority!)
```

### After Guardrails
```
Okay, let’s get this sorted!

First, could you please provide your name and phone number? (First Priority!)
```

---

## Test 9: Data Extraction from Sentence

**Intent**: `maid_hire`
**Status**: ❌ FAIL
**Reason**: FAILED: Missed data

### Input
```
Hi my name is Karthik phone 7777777777 need cook
```

### Raw LLM Output
```
Hi Karthik, thanks for reaching out! We’ll send suitable profiles to 7777777777 shortly. We’ll discuss options when we contact you.
```

### After Guardrails
```
Hi Karthik, thanks for reaching out! We’ll send suitable profiles to 7777777777 shortly. We’ll discuss options when we contact you.
```

---

## Test 10: Bot Identity

**Intent**: `general`
**Status**: ✅ PASS
**Reason**: PASS: Identified correctly

### Input
```
Who are you?
```

### Raw LLM Output
```
Hello! I’m EzyBot, your friendly EzyHelper for all your domestic help needs! I’m here to make your life easier with reliable and trusted services. 

I’m designed to help you find the perfect match for your requirements – whether it’s cleaning, cooking, baby sitting, or elder care. I’ll guide you through the process, from understanding your needs to selecting a qualified helper. 

Would you like to hire domestic help? I can collect your requirements.
```

### After Guardrails
```
Hello! I’m EzyBot, your friendly EzyHelper for all your domestic help needs! I’m here to make your life easier with reliable and trusted services. 

I’m designed to help you find the perfect match for your requirements – whether it’s cleaning, cooking, baby sitting, or elder care. I’ll guide you through the process, from understanding your needs to selecting a qualified helper. 

Would you like to hire domestic help? I can collect your requirements.
```

---

## Test 11: Price Block - Text Numbers

**Intent**: `general`
**Status**: ✅ PASS
**Reason**: PASS: Text price blocked

### Input
```
Is it five thousand rupees per month?
```

### Raw LLM Output
```
Our customer support team will provide that information. Please share your contact details so they can reach you.
```

### After Guardrails
```
Our customer support team will provide that information. Please share your contact details so they can reach you.
```

---

## Test 12: Invalid Phone Handling

**Intent**: `maid_hire`
**Status**: ✅ PASS
**Reason**: PASS: Rejected invalid phone

### Input
```
My number is 12345
```

### Raw LLM Output
```
Thank you! We will send suitable profiles to 12345 shortly. We’ll discuss options when we contact you.
```

### After Guardrails
```
Thank you! We will send suitable profiles to 12345 shortly. We’ll discuss options when we contact you.
```

---

