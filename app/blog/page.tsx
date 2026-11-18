import Link from "next/link";
import Reveal from "@/components/Reveal";
import { posts, readingMinutes } from "@/lib/blog";

export const metadata = {
  title: "Blog — Lead Generation Guides",
  description:
    "Practical, original guides to finding business leads, writing cold emails that get replies, checking email addresses, deliverability and responsible outreach.",
};

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function BlogIndex() {
  return (
    <Reveal className="mx-auto max-w-3xl px-4 py-12 text-muted">
      <h1 className="text-2xl font-bold text-fg">Lead Generation Guides</h1>
      <p className="mt-3 text-sm leading-6">
        Practical guides to finding real businesses, reaching them well, and doing it responsibly —
        written by the LeadsForceGen team from how the tool actually works.
      </p>
      <ul className="mt-8 space-y-6">
        {posts.map((post) => (
          <li key={post.slug} className="border-b border-border pb-6">
            <p className="text-xs text-muted">
              {formatDate(post.date)} · {readingMinutes(post)} min read
            </p>
            <h2 className="mt-1 text-lg font-bold text-fg">
              <Link className="hover:text-accent-text" href={`/blog/${post.slug}`}>
                {post.title}
              </Link>
            </h2>
            <p className="mt-1 text-sm leading-6">{post.description}</p>
            <Link className="mt-2 inline-block text-sm font-semibold text-accent-text underline" href={`/blog/${post.slug}`}>
              Read the guide
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-sm leading-6">
        Want to try the tool these guides describe?{" "}
        <Link className="font-semibold text-accent-text underline" href="/signup">
          Create a free account
        </Link>{" "}
        — 30 leads a day, no card needed.
      </p>
    </Reveal>
  );
}
