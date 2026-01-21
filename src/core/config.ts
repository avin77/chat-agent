
// src/core/config.ts

export const ASSISTANT_NAME = "EzyHelper Support";

export const USER_ROLES = {
  CUSTOMER: "customer",
  HELPER: "helper",
  EXISTING: "existing",
} as const;

export const INTENTS = {
  NEW_CUSTOMER: "new_customer_inquiry",
  NEW_HELPER: "new_helper_registration",
  COMPLAINT: "complaint",
  GENERAL: "general_query",
} as const;

export const QUESTION_FLOWS = {
  [INTENTS.NEW_CUSTOMER]: [
    { field: "full_name", question: "May I have your full name?" },
    { field: "phone", question: "Can you please share your phone number?" },
    { field: "address", question: "Where are you located (User Address)?" },
    { field: "family_members", question: "How many members are in your family?" },
    { field: "house_size", question: "What is your house size (e.g., 2 BHK, 3 BHK)?" },
    { field: "work_type", question: "What kind of work are you looking for (e.g., Cooking, Cleaning)?" },
    { field: "duration_months", question: "How many months are you looking to hire for?" },
    { field: "language_pref", question: "Do you have any language preference for the helper?" },
  ],
  [INTENTS.NEW_HELPER]: [
    { field: "full_name", question: "What is your full name?" },
    { field: "phone", question: "What is your phone number?" },
    { field: "city", question: "Which city/area do you want to work in?" },
    { field: "skills", question: "What kind of work can you do? (Cooking, Cleaning, Babysitting)" },
  ],
  [INTENTS.COMPLAINT]: [
    { field: "full_name", question: "Can I have your name to check our records?" },
    { field: "phone", question: "Please share your registered phone number." },
    { field: "issue_description", question: "Please describe your issue in detail. We are here to listen." },
  ],
};
