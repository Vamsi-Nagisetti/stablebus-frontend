import LegalPage from '@/features/legal/LegalPage';
const sections = [
  {
    "heading": "1. Agreement",
    "body": "This User Agreement applies when you create or use a StableBus account. By using the account features, you agree to follow this agreement and the StableBus Terms & Conditions and Privacy Policy."
  },
  {
    "heading": "2. Account security",
    "body": "Your mobile number is used to authenticate access through one-time passwords. Do not share OTPs. Notify StableBus promptly if you suspect unauthorised account access."
  },
  {
    "heading": "3. Accurate details",
    "body": "You agree to provide accurate account, passenger and contact information and to update it when it changes. You are responsible for checking passenger names, age, gender, journey date and selected seats before confirming a booking."
  },
  {
    "heading": "4. Saved passengers",
    "body": "Saved passenger details are provided for convenience. You are responsible for having permission to provide another person's information and for keeping saved information accurate."
  },
  {
    "heading": "5. Bookings and payments",
    "body": "Bookings are subject to operator availability, fare rules, payment verification and successful ticket issuance. The applicable booking confirmation and cancellation rules are described in the Terms & Conditions."
  },
  {
    "heading": "6. Acceptable use",
    "body": "You must not use the account for unlawful activity, impersonation, fraud, abusive communications, unauthorised automation or interference with StableBus systems."
  },
  {
    "heading": "7. Suspension and closure",
    "body": "StableBus may restrict access where reasonably necessary for security, fraud prevention, legal compliance or material breach. Users may request account closure through the published support channel, subject to applicable retention obligations."
  },
  {
    "heading": "8. Updates and contact",
    "body": "This agreement may be updated from time to time. Continued use after an effective update constitutes acceptance where permitted by law. Contact StableBus through the official support details for account-related questions."
  }
];
export default function Screen() { return <LegalPage title='User Agreement' sections={sections} />; }
