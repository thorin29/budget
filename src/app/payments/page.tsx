/** Payments: what's coming up, and what each payment does before it's made (src/server/payments.ts). */

import { paymentsView } from "@/server/payments";
import { PaymentsBoard } from "./board";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  return <PaymentsBoard v={await paymentsView()} />;
}
