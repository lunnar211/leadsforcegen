"use client";
import { useState } from "react";

// No server endpoint exists for contact messages, so the form opens the
// visitor's own email app with a prefilled message. It never claims the
// message was sent — sending happens in the visitor's mail client.
const EMAIL = "dipeshkarki8292@gmail.com";

export default function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", topic: "Support", message: "" });
  const [note, setNote] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.message.trim()) {
      setNote("Please write your message first.");
      return;
    }
    const subject = encodeURIComponent(`[LeadsForceGen] ${form.topic} — ${form.name.trim() || "Website contact"}`);
    const body = encodeURIComponent(
      `Name: ${form.name}\nEmail: ${form.email}\nTopic: ${form.topic}\n\n${form.message}`,
    );
    setNote("Opening your email app — your message is sent from your own email address.");
    window.location.href = `mailto:${EMAIL}?subject=${subject}&body=${body}`;
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      <label className="label" htmlFor="contact-name">Your name</label>
      <input
        id="contact-name"
        className="input"
        placeholder="Your name"
        autoComplete="name"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <label className="label" htmlFor="contact-email">Your email</label>
      <input
        id="contact-email"
        className="input"
        placeholder="you@example.com"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
      />
      <label className="label" htmlFor="contact-topic">What is this about?</label>
      <select
        id="contact-topic"
        className="input"
        value={form.topic}
        onChange={(e) => setForm({ ...form, topic: e.target.value })}
      >
        <option>Support</option>
        <option>Billing</option>
        <option>Data removal</option>
        <option>Partnership or press</option>
        <option>Other</option>
      </select>
      <label className="label" htmlFor="contact-message">Message</label>
      <textarea
        id="contact-message"
        className="input min-h-[140px]"
        placeholder="How can we help?"
        value={form.message}
        onChange={(e) => setForm({ ...form, message: e.target.value })}
      />
      <button type="submit" className="btn-primary btn-block">Open your email app to send</button>
      {note && (
        <p className="text-sm text-fg" role="status">{note}</p>
      )}
      <p className="text-xs leading-5 text-muted">
        The form opens your own email app with the message ready to send. We never see your message
        unless you send it, and we never share your email address with anyone.
      </p>
    </form>
  );
}
