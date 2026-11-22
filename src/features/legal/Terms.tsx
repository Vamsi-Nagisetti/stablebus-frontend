import LegalPage from '@/features/legal/LegalPage';
const sections = [
  {
    "heading": "1. About StableBus",
    "body": "StableBus is a bus-ticket discovery and booking platform. It enables users to search for bus services and, where available, make bookings through third-party bus operators and service providers. StableBus may act as a booking intermediary and is not itself the bus operator unless expressly stated."
  },
  {
    "heading": "2. Eligibility and account",
    "body": "You must provide accurate information and be legally capable of entering into a binding contract. You are responsible for keeping your login credentials and one-time passwords confidential and for activity carried out through your account."
  },
  {
    "heading": "3. Search, fares and availability",
    "body": "Bus schedules, seat availability, fares, boarding points, dropping points and amenities are supplied by operators or integration partners and may change without notice. A search result or selected seat is not a confirmed ticket. A booking is confirmed only when StableBus displays a confirmed status and/or a valid ticket or PNR is issued."
  },
  {
    "heading": "4. Payments",
    "body": "Payments are processed through third-party payment service providers. StableBus does not store full card credentials. A payment authorisation, debit or payment success message alone does not guarantee ticket issuance. If payment succeeds but ticketing fails or remains pending, the transaction will be handled through the applicable verification and reconciliation process."
  },
  {
    "heading": "5. Operator responsibility",
    "body": "The bus operator is responsible for operating the service, vehicle, staff, safety, punctuality, boarding, route, facilities and performance of the journey. Operator policies may apply in addition to these terms."
  },
  {
    "heading": "6. Cancellation and refunds",
    "body": "Cancellation eligibility, charges, deadlines and refund amounts depend on the operator's rules and the provider's confirmed cancellation response. A cancellation request is not complete until the provider confirms it. Refunds, where due, are processed to the original payment method or as otherwise permitted by law and payment-provider rules. Processing times may vary."
  },
  {
    "heading": "7. User conduct and information",
    "body": "You must provide correct passenger details, arrive at the boarding point on time, carry required identification and comply with operator instructions. You must not misuse the app, interfere with its operation, submit false information or attempt unauthorised access."
  },
  {
    "heading": "8. Service availability and changes",
    "body": "We may update, suspend or discontinue features for maintenance, security, legal or operational reasons. We will take reasonable steps to communicate material changes where required."
  },
  {
    "heading": "9. Liability",
    "body": "Nothing in these terms excludes liability that cannot lawfully be excluded under Indian law. Subject to that limitation, StableBus is not responsible for acts or omissions of independent bus operators, third-party payment providers or connectivity providers. Any liability of StableBus will be determined under applicable law."
  },
  {
    "heading": "10. Grievances and contact",
    "body": "For booking assistance, cancellation questions or complaints, use the Help & Support contact details published in the app or on the official StableBus website. The final published version should identify the legal entity, registered address and grievance officer/contact as required by applicable law."
  },
  {
    "heading": "11. Governing law",
    "body": "These terms are intended to be governed by the laws of India. The competent courts and dispute-resolution process must be specified by StableBus after legal review."
  }
];
export default function Screen() { return <LegalPage title='Terms & Conditions' sections={sections} />; }
