import LegalPage from '@/features/legal/LegalPage';
const sections = [
  {
    "heading": "1. Scope",
    "body": "This policy describes how StableBus may collect, use, disclose, store and protect personal information when you use the app, website or support services."
  },
  {
    "heading": "2. Information we collect",
    "body": "Depending on your use of the service, information may include mobile number, account identifiers, passenger names, age, gender, date of birth where provided, journey and booking details, contact email, payment transaction references, device and app diagnostics, and communications with support."
  },
  {
    "heading": "3. Why we use information",
    "body": "We use information to create and secure accounts, provide bus search and booking services, issue tickets, process payments and cancellations, provide customer support, prevent fraud, maintain records, improve reliability and comply with legal obligations."
  },
  {
    "heading": "4. Sharing",
    "body": "Information may be shared with bus operators and booking/API partners to fulfil bookings; payment providers to process transactions; messaging or email providers to deliver service communications; infrastructure and security vendors; and government or law-enforcement authorities where legally required. We do not state that passenger information is sold."
  },
  {
    "heading": "5. Permissions and device data",
    "body": "If enabled, app permissions such as notifications may be used to send booking updates and service messages. You can manage device permissions through your operating-system settings. The final policy must list any analytics, crash-reporting, advertising or location SDKs actually used by the production app."
  },
  {
    "heading": "6. Retention",
    "body": "We retain information for as long as needed to provide services, resolve disputes, maintain financial and booking records, meet legal obligations and enforce agreements. Specific retention periods should be documented and approved before publication."
  },
  {
    "heading": "7. Security",
    "body": "We use reasonable technical and organisational safeguards designed to protect information. No electronic system or transmission can be guaranteed completely secure."
  },
  {
    "heading": "8. Your choices and rights",
    "body": "Subject to applicable law, you may request access, correction, deletion or grievance redressal for personal information. Some records may need to be retained for legal, accounting, fraud-prevention or dispute purposes. Account deletion requests must be handled through the official support process until an in-app deletion endpoint is available."
  },
  {
    "heading": "9. Children",
    "body": "The app is not intended to be used independently by children where parental consent is required. A parent or lawful guardian should provide passenger information for a child and ensure it is accurate."
  },
  {
    "heading": "10. Changes and contact",
    "body": "We may update this policy when our practices or legal obligations change. The final policy must include the data fiduciary/entity name, contact details and grievance contact required under applicable Indian data-protection law."
  }
];
export default function Screen() { return <LegalPage title='Privacy Policy' sections={sections} />; }
