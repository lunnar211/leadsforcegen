import Link from "next/link";
import Reveal from "@/components/Reveal";
import ContactForm from "./ContactForm";

export const metadata = {
  title: "Contact",
  description:
    "Contact LeadsForceGen — support, billing, data removal and partnerships. Email dipeshkarki8292@gmail.com; we usually reply within 1–2 business days.",
};

export default function Contact() {
  return (
    <Reveal className="mx-auto max-w-3xl px-4 py-12 text-muted">
      <h1 className="text-2xl font-bold text-fg">Contact LeadsForceGen</h1>
      <div className="mt-6 space-y-4 text-sm leading-6">
        <p>
          Questions about your account, a search, an export or a payment? Want a business removed
          from our results? Write to us — a real person reads every message.
        </p>
        <p>
          <strong className="text-fg">Email:</strong>{" "}
          <a className="font-semibold text-accent-text underline" href="mailto:dipeshkarki8292@gmail.com">
            dipeshkarki8292@gmail.com
          </a>
        </p>
        <p>
          <strong className="text-fg">Response time:</strong> we usually reply within 1–2 business
          days (Monday–Friday). Billing questions about a Pro subscription are answered first.
        </p>
        <h2 className="pt-2 text-lg font-bold text-fg">What to contact us about</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-fg">Support</strong> — problems with search, exports, login or your
            account, and questions about plans.
          </li>
          <li>
            <strong className="text-fg">Billing</strong> — Pro subscription charges, refunds, payment
            confirmations and manual payment proof.
          </li>
          <li>
            <strong className="text-fg">Data removal</strong> — you run a business and do not want it
            listed. You can also remove it yourself in seconds on the{" "}
            <Link className="font-semibold text-accent-text underline" href="/unsubscribe">
              remove a business
            </Link>{" "}
            page, no email needed.
          </li>
          <li>
            <strong className="text-fg">Partnerships and press</strong> — integrations, data questions
            and media enquiries.
          </li>
        </ul>
        <h2 className="pt-2 text-lg font-bold text-fg">Send us a message</h2>
        <p>
          Fill in the form and it will open your email app with the message ready to send from your
          own address.
        </p>
        <ContactForm />
      </div>
    </Reveal>
  );
}
