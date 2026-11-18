import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Reveal from "@/components/Reveal";
import { posts, postBySlug, readingMinutes, type Block } from "@/lib/blog";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://leadsforcegen.vercel.app";

export function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }));
}

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const post = postBySlug(slug);
  if (!post) return {};
  const url = `${SITE_URL}/blog/${post.slug}`;
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: url },
    openGraph: { title: post.title, description: post.description, url, type: "article", siteName: "LeadsForceGen" },
    twitter: { card: "summary", title: post.title, description: post.description },
  };
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function renderBlock(block: Block, i: number) {
  if ("h" in block) {
    return (
      <h2 key={i} className="pt-4 text-lg font-bold text-fg">
        {block.h}
      </h2>
    );
  }
  if ("list" in block) {
    return (
      <ul key={i} className="list-disc space-y-2 pl-5">
        {block.list.map((item, j) => (
          <li key={j}>{item}</li>
        ))}
      </ul>
    );
  }
  return <p key={i}>{block.p}</p>;
}

export default async function BlogPost({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const post = postBySlug(slug);
  if (!post) notFound();

  const url = `${SITE_URL}/blog/${post.slug}`;
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: { "@type": "Organization", name: "LeadsForceGen", url: SITE_URL },
    publisher: { "@type": "Organization", name: "LeadsForceGen", url: SITE_URL },
    mainEntityOfPage: url,
  };

  return (
    <Reveal className="mx-auto max-w-3xl px-4 py-12 text-muted">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <p className="text-sm">
        <Link className="font-semibold text-accent-text underline" href="/blog">
          ← All guides
        </Link>
      </p>
      <h1 className="mt-3 text-2xl font-bold text-fg">{post.title}</h1>
      <p className="mt-2 text-xs text-muted">
        {formatDate(post.date)} · {readingMinutes(post)} min read · LeadsForceGen
      </p>
      <div className="mt-6 space-y-4 text-sm leading-6">{post.body.map(renderBlock)}</div>
      <div className="mt-10 rounded-xl border border-border bg-surface p-5">
        <p className="text-sm font-bold text-fg">Try it with LeadsForceGen</p>
        <p className="mt-1 text-sm leading-6">
          Search any industry and city and get verified businesses with phone, email, website and
          source — ready to export. Free: 30 leads a day.
        </p>
        <p className="mt-3">
          <Link href="/signup" className="btn-primary">
            Start free
          </Link>
        </p>
      </div>
      <p className="mt-8 text-sm leading-6">
        More guides:{" "}
        <Link className="font-semibold text-accent-text underline" href="/blog">
          back to all guides
        </Link>
        .
      </p>
    </Reveal>
  );
}
